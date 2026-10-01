"""
Online access for NOOB AI (optional, free): a Cloudflare Tunnel gives the NOOB App a secure web address such
as https://ai.nooob.xyz, so it opens from phones anywhere and from the "NOOB AI" button in the NOOB social app.

One-time setup: double-click "Setup online access.bat" (or run:  python noob_tunnel.py setup).
After that the NOOB server starts the tunnel by itself every time it starts.

Everything stays inside this folder: tools/cloudflared.exe and tunnel.yml (both kept out of GitHub).
The Cloudflare login and tunnel keys are saved by cloudflared in your user folder (.cloudflared).
"""

import os
import re
import subprocess
import sys
import threading
import time
import urllib.request
from collections import namedtuple

HERE = os.path.dirname(os.path.abspath(__file__))
CLOUDFLARED = os.path.join(HERE, "tools", "cloudflared.exe")
CONFIG = os.path.join(HERE, "tunnel.yml")
LOG_FILE = os.path.join(HERE, "noob_tunnel.log")
DOWNLOAD_URL = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
TUNNEL_NAME = "noob-ai"
HIDDEN = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0


def configured():
    return os.path.exists(CONFIG) and os.path.exists(CLOUDFLARED)


def public_url():
    """The https address from tunnel.yml, or '' when online access is not set up."""
    if not os.path.exists(CONFIG):
        return ""
    match = re.search(r"hostname:\s*(\S+)", open(CONFIG, encoding="utf-8").read())
    return f"https://{match.group(1)}" if match else ""


# ------------------------------ self-healing tunnel ------------------------------
# cloudflared is a single subprocess with no retry of its own. Starting it the moment Windows logs
# in or Wi-Fi reconnects — exactly when NOOB starts — is also the moment DNS is most likely not
# ready yet, which makes cloudflared give up and exit for good ("NOOB is sleeping" until someone
# manually restarts the whole server). _watchdog relaunches it within a few seconds instead.
_Running = namedtuple("_Running", "process started_at")
_current = None
_state_lock = threading.Lock()
_shutting_down = False


def _spawn():
    out = open(LOG_FILE, "a", encoding="utf-8")
    process = subprocess.Popen([CLOUDFLARED, "tunnel", "--no-autoupdate", "--config", CONFIG, "run"],
                               stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT, creationflags=HIDDEN)
    return _Running(process, time.monotonic())


def _watchdog(log):
    global _current
    backoff = 5
    while True:
        running = _current
        running.process.wait()
        with _state_lock:
            if _shutting_down or _current is not running:
                return                                              # a deliberate stop, not a crash
        stayed_up = time.monotonic() - running.started_at
        backoff = 5 if stayed_up > 30 else min(backoff * 2, 60)     # a real crash-loop backs off; a one-off doesn't
        log(f"Online access dropped — reconnecting in {backoff}s...")
        time.sleep(backoff)
        with _state_lock:
            if _shutting_down:
                return
            _current = _spawn()
        log(f"Online access on: {public_url()}")


class _Handle:
    """Stands in for the raw subprocess so stop_everything()'s tunnel.poll()/.terminate() keep
    working unchanged, even though the actual cloudflared process underneath can be replaced
    by the watchdog at any time."""
    def poll(self):
        return _current.process.poll() if _current else 0

    def terminate(self):
        global _shutting_down
        _shutting_down = True
        with _state_lock:
            if _current:
                try:
                    _current.process.terminate()
                except Exception:
                    pass


def start(log):
    """Starts the tunnel in the background (called by the NOOB server) and keeps it reconnected
    for as long as the server runs. Returns a handle with .poll()/.terminate(), or None."""
    if not configured():
        return None
    global _current
    _current = _spawn()
    log(f"Online access on: {public_url()}")
    threading.Thread(target=_watchdog, args=(log,), daemon=True).start()
    return _Handle()


# ------------------------------ one-time setup ------------------------------
def run(*args):
    result = subprocess.run([CLOUDFLARED, *args], capture_output=True, text=True)
    return result.returncode, (result.stdout or "") + (result.stderr or "")


def setup(hostname):
    if not os.path.exists(CLOUDFLARED):
        print("Downloading cloudflared from Cloudflare (about 60 MB)...")
        os.makedirs(os.path.dirname(CLOUDFLARED), exist_ok=True)
        urllib.request.urlretrieve(DOWNLOAD_URL, CLOUDFLARED + ".part")
        os.replace(CLOUDFLARED + ".part", CLOUDFLARED)

    cert = os.path.join(os.path.expanduser("~"), ".cloudflared", "cert.pem")
    if not os.path.exists(cert):
        print("\nA browser window opens: log in to Cloudflare, click your domain, then click Authorize.")
        subprocess.run([CLOUDFLARED, "tunnel", "login"])
        if not os.path.exists(cert):
            sys.exit("Cloudflare login was not finished. Run this setup again.")

    code, text = run("tunnel", "create", TUNNEL_NAME)
    match = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", text)
    if code != 0:
        if "already exists" not in text:
            sys.exit("Could not create the tunnel:\n" + text)
        code, text = run("tunnel", "info", TUNNEL_NAME)
        match = re.search(r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", text)
    if not match:
        sys.exit("Could not find the tunnel id:\n" + text)
    tunnel_id = match.group(1)
    credentials = os.path.join(os.path.expanduser("~"), ".cloudflared", f"{tunnel_id}.json")
    if not os.path.exists(credentials):
        sys.exit(f"The tunnel '{TUNNEL_NAME}' was made on another PC. Delete it in the Cloudflare dashboard "
                 f"(Zero Trust > Networks > Tunnels) and run this setup again.")

    code, text = run("tunnel", "route", "dns", TUNNEL_NAME, hostname)
    if code != 0 and "already exists" not in text:
        sys.exit("Could not create the web address:\n" + text)

    with open(CONFIG, "w", encoding="utf-8") as f:
        f.write(f"tunnel: {tunnel_id}\n"
                f"credentials-file: {credentials}\n"
                f"ingress:\n"
                f"  - hostname: {hostname}\n"
                f"    service: http://localhost:5000\n"
                f"  - service: http_status:404\n")
    print(f"\nDone! NOOB AI will be online at https://{hostname} whenever the NOOB server is running.")
    print("Restart NOOB (Settings > Stop NOOB server, then open NOOB App.bat) to switch it on now.")


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "setup":
    name = sys.argv[2] if len(sys.argv) > 2 else input("Web address for NOOB AI (e.g. ai.yourdomain.com): ").strip()
    if not re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+", name.lower()):
        sys.exit("That does not look like a web address.")
    setup(name.lower())
