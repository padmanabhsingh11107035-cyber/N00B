"""
"Continue with NOOB": sign in to the NOOB AI Assistant with a NOOB social media account (nooob.xyz).

It checks the username/email and password with NOOB's own login service (the same one the
nooob.xyz website uses), reads the account's signup details (name, birthday, phone, email, city...), and ends that login
straight away. The NOOB password is never saved or logged by the assistant.
"""

import re
import threading
import time
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

NOOB_SOCIAL_URL = "https://abffssydapumuhwgzeck.supabase.co"
# The website's public "publishable" key: safe to share, it can only do what NOOB's security rules allow.
NOOB_SOCIAL_KEY = "sb_publishable_g20GG46EXeMr1jcNwVJtmw_rAZKsuA3"
TIMEOUT = (6, 15)          # seconds to connect, seconds to wait for the answer

# One shared connection to NOOB that stays open between sign-ins (no new DNS lookup and secure handshake
# every time, which is slow on a phone hotspot). A connection that fails to open is retried twice.
_http = requests.Session()
_http.mount("https://", HTTPAdapter(pool_maxsize=8, max_retries=Retry(
    total=2, connect=2, read=0, status=0, backoff_factor=0.4, allowed_methods=None)))
_pool = ThreadPoolExecutor(max_workers=4)


def warm_up():
    """Opens the connection to NOOB early (called when the sign-in page loads), so signing in is quick."""
    try:
        _http.get(f"{NOOB_SOCIAL_URL}/auth/v1/health", headers=_headers(), timeout=(5, 5))
    except Exception:                                   # only a head start; signing in still works without it
        pass


def details_from(me):
    """The person's NOOB signup and profile details, as "About Me" fields for NOOB AI."""
    def text(key):
        value = me.get(key)
        return str(value).strip() if value not in (None, "") else ""

    details = {}
    name = " ".join(part for part in (text("firstName"), text("lastName")) if part) or text("displayName")
    if name:
        details["Name"] = name
    birthday = text("dateOfBirth")[:10]
    if birthday:
        try:
            details["Birthday"] = date.fromisoformat(birthday).strftime("%d %B %Y").lstrip("0")
        except ValueError:
            details["Birthday"] = birthday
    for key, field in (("gender", "Gender"), ("pronouns", "Pronouns"), ("city", "City"), ("email", "Email"),
                       ("website", "Website"), ("bio", "About me")):
        if text(key):
            details[field] = text(key)
    phone = re.sub(r"[^\d]", "", text("mobileNumber"))
    if phone:
        code = re.search(r"\+?(\d{1,4})\)?\s*$", text("countryCode")) if text("countryCode") else None
        details["Phone"] = f"+{code.group(1)} {phone}" if code else phone
    interests = me.get("interests")
    if isinstance(interests, list) and interests:
        details["Hobbies and interests"] = ", ".join(str(i) for i in interests if i)
    if text("username"):
        details["NOOB username"] = "@" + text("username")
    business = [part for part in (text("businessCategory"),
                                  text("businessEmail") and "email " + text("businessEmail"),
                                  text("businessPhone") and "phone " + text("businessPhone"),
                                  text("businessAddress") and "address " + text("businessAddress")) if part]
    if business:
        details["Business"] = "; ".join(business)
    return {k: v[:1000] for k, v in details.items()}


class NoobSocialError(Exception):
    """A message that can be shown to the person signing in."""


# ---------------- NOOB AI feedback (report an issue / suggest a change) ----------------
# NOOB AI never keeps a login session for the linked NOOB account (the whole point of "Continue with
# NOOB" is that the password is never kept), so submitting/reading feedback on that account's behalf
# proves who it's speaking for with a shared secret instead of a session token — the caller passes it
# in (settings()["noob_ai_feedback_secret"]), it is never hardcoded here: this file is committed to a
# public repo, and a secret baked into source code stops being a secret the moment it is pushed.


def submit_feedback(secret, noob_id, category, message):
    """Saves a report/suggestion against the linked NOOB account so it shows up in the NOOB admin panel."""
    try:
        r = _http.post(f"{NOOB_SOCIAL_URL}/rest/v1/rpc/submit_noob_ai_feedback", headers=_headers(),
                       json={"p_secret": secret, "p_noob_user_id": noob_id,
                             "p_category": category, "p_message": message}, timeout=TIMEOUT)
        if r.status_code != 200:
            raise NoobSocialError("Could not send that to NOOB right now. Please try again.")
    except requests.RequestException:
        raise NoobSocialError("Could not reach NOOB right now. Check the internet and try again.")


def list_feedback(secret, noob_id):
    """This account's own past reports/suggestions, newest first, with any admin reply."""
    try:
        r = _http.post(f"{NOOB_SOCIAL_URL}/rest/v1/rpc/noob_ai_feedback_for_user", headers=_headers(),
                       json={"p_secret": secret, "p_noob_user_id": noob_id}, timeout=TIMEOUT)
        return r.json() if r.status_code == 200 and isinstance(r.json(), list) else []
    except (requests.RequestException, ValueError):
        return []


# ---------------- the person's current NOOB profile picture ----------------
# Shown next to their name in the NOOB AI app. It is asked from NOOB (same shared secret as the feedback above, scoped to the one
# linked account) and kept for a few minutes, so changing the picture in NOOB shows up here without signing in again.
MEDIA_BASE = "https://nooob.xyz"
AVATAR_FRESH = 300         # seconds a picture is trusted before NOOB is asked again
AVATAR_RETRY = 60          # seconds before trying again after NOOB could not be reached
_avatars = {}              # NOOB account id -> {"url": str, "until": float}
_avatars_busy = set()
_avatars_lock = threading.Lock()


def media_url(value):
    """A stored picture (a short storage key, a /media/ path or a full address) as an address that works from anywhere."""
    value = str(value or "").strip()
    if not value or value.lower().startswith("data:"):
        return ""
    if re.match(r"^https?://", value, re.I):
        return value
    if value.startswith("/"):
        return MEDIA_BASE + value
    return MEDIA_BASE + "/media/" + "/".join(quote(part, safe="") for part in value.split("/"))


def _load_avatar(secret, noob_id):
    url = None
    try:
        r = _http.post(f"{NOOB_SOCIAL_URL}/rest/v1/rpc/noob_ai_profile_for_user", headers=_headers(),
                       json={"p_secret": secret, "p_noob_user_id": noob_id}, timeout=(4, 6))
        if r.status_code == 200 and isinstance(r.json(), dict):
            url = media_url(r.json().get("avatar"))
    except (requests.RequestException, ValueError):
        pass
    with _avatars_lock:
        old = _avatars.get(noob_id, {}).get("url", "")
        if url is None:                                   # NOOB could not be reached (or the lookup is not set up yet)
            _avatars[noob_id] = {"url": old, "until": time.time() + AVATAR_RETRY}
        else:
            _avatars[noob_id] = {"url": url, "until": time.time() + AVATAR_FRESH}
        _avatars_busy.discard(noob_id)


def profile_avatar(secret, noob_id):
    """The person's current NOOB profile picture address ('' when there is none). The first look waits a moment; after that
    a stale picture is shown straight away while a fresh one is fetched in the background."""
    if not secret or not noob_id:
        return ""
    with _avatars_lock:
        entry = _avatars.get(noob_id)
        stale = entry is None or entry["until"] < time.time()
        start = stale and noob_id not in _avatars_busy
        if start:
            _avatars_busy.add(noob_id)
    if start:
        if entry is None:
            _load_avatar(secret, noob_id)
        else:
            threading.Thread(target=_load_avatar, args=(secret, noob_id), daemon=True).start()
    with _avatars_lock:
        return _avatars.get(noob_id, {}).get("url", "")


# ---------------- NOOB AI maintenance lock ----------------
# The NOOB admin can lock NOOB AI for maintenance (NOOB app → Admin Control Panel → Platform). NOOB AI reads that
# switch from NOOB every 15 seconds in the background, so answering a question never waits for it.
_platform = {"noob_ai_maintenance": False}


def noob_ai_locked():
    return bool(_platform["noob_ai_maintenance"])


def check_platform():
    """Reads the switch once. If NOOB can't be reached, the last known value is kept."""
    try:
        r = _http.post(f"{NOOB_SOCIAL_URL}/rest/v1/rpc/public_platform_settings", headers=_headers(), json={},
                       timeout=(5, 10))
        if r.status_code == 200 and isinstance(r.json(), dict):
            _platform["noob_ai_maintenance"] = bool(r.json().get("noobAiMaintenance"))
    except Exception:
        pass
    return noob_ai_locked()


def watch_platform(log, every=15):
    """Keeps checking the switch in the background and logs when it changes."""
    def loop():
        before = None
        while True:
            now = check_platform()
            if now != before and before is not None:
                log("NOOB AI locked for maintenance by the NOOB admin" if now else "NOOB AI maintenance lock removed")
            before = now
            time.sleep(every)
    threading.Thread(target=loop, daemon=True).start()


def _headers(token=None):
    headers = {"apikey": NOOB_SOCIAL_KEY, "Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def verify_login(identifier, password):
    """Returns {"id", "username", "name"} for a correct NOOB login, otherwise raises NoobSocialError."""
    identifier = (identifier or "").strip()
    if not identifier or not password:
        raise NoobSocialError("Enter your NOOB username (or email) and password.")
    try:
        # 1. NOOB accounts log in with a private address; find it from the username or email.
        r = _http.post(f"{NOOB_SOCIAL_URL}/rest/v1/rpc/resolve_login_email", headers=_headers(),
                          json={"identifier": identifier}, timeout=TIMEOUT)
        if r.status_code != 200:
            raise NoobSocialError("Could not reach NOOB right now. Check the internet and try again.")
        login_email = r.json()

        # 2. Check the password.
        r = _http.post(f"{NOOB_SOCIAL_URL}/auth/v1/token?grant_type=password", headers=_headers(),
                          json={"email": login_email, "password": password}, timeout=TIMEOUT)
        if r.status_code == 429:
            raise NoobSocialError("Too many attempts. Please wait a moment and try again.")
        if r.status_code != 200:
            details = str(r.json()) if r.headers.get("Content-Type", "").startswith("application/json") else r.text
            if "banned" in details.lower():
                raise NoobSocialError("This NOOB account has been suspended.")
            raise NoobSocialError("Wrong NOOB username/email or password.")
        session = r.json()
        token, user_id = session["access_token"], session["user"]["id"]

        # 3. Read the account's name, then end this one login (other devices stay signed in).
        try:
            r = _http.post(f"{NOOB_SOCIAL_URL}/rest/v1/rpc/get_my_user", headers=_headers(token), json={},
                              timeout=TIMEOUT)
            me = r.json() if r.status_code == 200 and isinstance(r.json(), dict) else {}
        finally:
            try:
                _http.post(f"{NOOB_SOCIAL_URL}/auth/v1/logout?scope=local", headers=_headers(token), timeout=TIMEOUT)
            except requests.RequestException:
                pass
    except (requests.RequestException, ValueError, KeyError, TypeError):      # no internet or an unexpected reply
        raise NoobSocialError("Could not reach NOOB right now. Check the internet and try again.")

    if me.get("isSuspended"):
        raise NoobSocialError("This NOOB account has been suspended.")
    username = str(me.get("username") or "")
    return {"id": user_id, "username": username, "name": str(me.get("displayName") or username or "NOOB user"),
            "details": details_from(me)}


def verify_token(token):
    """For the "NOOB AI" button inside the NOOB social media app: checks the login token the app handed over.
    Returns {"id", "username", "name"}, otherwise raises NoobSocialError. The token is used once and never saved.
    (No logout here: this token is the person's own NOOB app login.)"""
    token = (token or "").strip()
    if not token or len(token) > 4000:
        raise NoobSocialError("Please sign in.")
    try:
        # Both questions go to NOOB at the same time (half the waiting): is this login real and still
        # signed in, and whose account is it.
        check = _pool.submit(_http.get, f"{NOOB_SOCIAL_URL}/auth/v1/user", headers=_headers(token), timeout=TIMEOUT)
        details = _pool.submit(_http.post, f"{NOOB_SOCIAL_URL}/rest/v1/rpc/get_my_user", headers=_headers(token),
                               json={}, timeout=TIMEOUT)
        r = check.result()
        if r.status_code in (401, 403):
            raise NoobSocialError("Your NOOB login has expired. Please sign in.")
        if r.status_code != 200:
            raise NoobSocialError("Could not reach NOOB right now. Check the internet and try again.")
        user_id = r.json()["id"]
        r = details.result()
        me = r.json() if r.status_code == 200 and isinstance(r.json(), dict) else {}
        if me.get("id") not in (None, user_id):          # never mix up two accounts
            raise NoobSocialError("Could not reach NOOB right now. Check the internet and try again.")
    except (requests.RequestException, ValueError, KeyError, TypeError):
        raise NoobSocialError("Could not reach NOOB right now. Check the internet and try again.")
    if me.get("isSuspended"):
        raise NoobSocialError("This NOOB account has been suspended.")
    username = str(me.get("username") or "")
    return {"id": user_id, "username": username, "name": str(me.get("displayName") or username or "NOOB user"),
            "details": details_from(me)}
