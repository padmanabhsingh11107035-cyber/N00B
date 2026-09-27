"""
Keeps NOOB AI running while Windows is on.

"Start with Windows.bat" adds this to Windows' startup programs (a shortcut in the Startup folder, so it can be
switched off any time in Task Manager > Startup apps, or with "Don't start with Windows.bat"). After you log in it:
  - starts the NOOB server in the background (no window) if it isn't running,
  - checks it every 3 seconds and starts it again if it stopped unexpectedly (a crash, a restart...),
  - leaves it off if you stopped it on purpose (NOOB App > Settings > Stop NOOB server) until you open
    NOOB App.bat again or log in to Windows again,
  - starts it when someone taps "Wake up NOOB" in the NOOB app (anyone signed in can wake it, nobody can
    stop it that way). This only works while this computer is on.

    pythonw noob_autostart.py             keep NOOB running (what the Startup shortcut runs)
    python  noob_autostart.py --install   add the Startup shortcut and start keeping NOOB running now
    python  noob_autostart.py --remove    remove the Startup shortcut (NOOB keeps running until you stop it)
"""

import os
import socket
import subprocess
import sys
import time

import requests

import noob_launcher as launcher
import noob_network
from noob_social import NOOB_SOCIAL_KEY, NOOB_SOCIAL_URL

HERE = os.path.dirname(os.path.abspath(__file__))
SHORTCUT_NAME = "NOOB AI.lnk"
CHECK_EVERY = 3            # seconds between checks (is NOOB running? did anyone tap "Wake up NOOB"?)
DOWN_CHECKS = 5            # down this many checks in a row (about 15 s) = stopped unexpectedly: start it again
START_GRACE = 30           # seconds a fresh start gets before it is checked again (loading, Wi-Fi, tunnel)
LOCK_PORT = 5098           # only one keeper runs at a time


def startup_folder():
    return os.path.join(os.environ["APPDATA"], "Microsoft", "Windows", "Start Menu", "Programs", "Startup")


def install():
    pythonw = os.path.join(HERE, ".venv", "Scripts", "pythonw.exe")
    if not os.path.exists(pythonw):
        sys.exit("Run \"Setup NOOB.bat\" first.")
    link = os.path.join(startup_folder(), SHORTCUT_NAME)
    ps = ("$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:NOOB_LINK); "
          "$s.TargetPath = $env:NOOB_PYW; $s.Arguments = '\"' + $env:NOOB_SCRIPT + '\"'; "
          "$s.WorkingDirectory = $env:NOOB_DIR; $s.Description = 'Keeps NOOB AI running'; $s.WindowStyle = 7; $s.Save()")
    env = dict(os.environ, NOOB_LINK=link, NOOB_PYW=pythonw, NOOB_SCRIPT=os.path.abspath(__file__), NOOB_DIR=HERE)
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], env=env, check=True)
    print(f"NOOB AI now starts by itself when you log in to Windows ({link}).")
    subprocess.Popen([pythonw, os.path.abspath(__file__)], cwd=HERE,
                     creationflags=subprocess.CREATE_NO_WINDOW | subprocess.DETACHED_PROCESS)
    print("It is being kept running from now on.")


def remove():
    link = os.path.join(startup_folder(), SHORTCUT_NAME)
    if os.path.exists(link):
        os.remove(link)
        print("NOOB AI no longer starts with Windows. (It keeps running until you stop it or restart the PC.)")
    else:
        print("NOOB AI was not set to start with Windows.")


def wake_requested_at():
    """When someone last tapped "Wake up NOOB" in the NOOB app (None if NOOB can't be reached right now)."""
    try:
        r = requests.post(f"{NOOB_SOCIAL_URL}/rest/v1/rpc/public_platform_settings", json={}, timeout=(5, 8),
                          headers={"apikey": NOOB_SOCIAL_KEY, "Content-Type": "application/json"})
        if r.status_code == 200 and isinstance(r.json(), dict):
            return r.json().get("noobAiWakeRequestedAt")
    except Exception:
        pass
    return None


def keep_running():
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))            # a second keeper would find this port taken and quit
    except OSError:
        return
    if os.path.exists(launcher.STOP_FLAG):
        os.remove(launcher.STOP_FLAG)                  # a fresh Windows login: NOOB should be on again
    time.sleep(15)                                     # a moment for Windows and Wi-Fi after logging in
    noob_network.prefer_ipv4()                         # quick connections on phone hotspots
    last_wake = wake_requested_at()                    # taps from before now don't count
    misses = DOWN_CHECKS - 1                           # not running at login: start it straight away
    while True:
        running = launcher.server_running()
        # "Wake up NOOB" only matters while NOOB is asleep, so NOOB's server is only asked then (saves data)
        wake = None if running else wake_requested_at()
        woken = bool(wake) and wake != last_wake
        if wake:
            last_wake = wake
        if running:
            misses = 0
        elif woken:                                    # someone tapped "Wake up NOOB"
            if os.path.exists(launcher.STOP_FLAG):
                os.remove(launcher.STOP_FLAG)
            misses = DOWN_CHECKS
        elif os.path.exists(launcher.STOP_FLAG):
            misses = 0                                 # the owner switched it off on purpose
        else:
            misses += 1
        if not running and misses >= DOWN_CHECKS:
            launcher.start_server()
            misses = 0
            time.sleep(START_GRACE)
            continue
        time.sleep(CHECK_EVERY)


if __name__ == "__main__":
    if "--install" in sys.argv:
        install()
    elif "--remove" in sys.argv:
        remove()
    else:
        keep_running()
