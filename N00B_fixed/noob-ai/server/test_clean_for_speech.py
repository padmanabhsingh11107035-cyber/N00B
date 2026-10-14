# Checks the speech cleaning of NOOB AI (clean_for_speech): emoji and signs are never sent to the voice, short words in capitals stay words. Run:  python test_clean_for_speech.py
import os
import re
src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'noob_server.py'), encoding='utf-8').read()
start = src.index('# Emoji, pictures-as-letters')
end = src.index('def text_to_speech')
ns = {'re': re, 'ANY_FACE_TAG': re.compile(r"\[face:[a-z]+\]")}
exec(src[start:end], ns)
f = ns['clean_for_speech']
cases = [
    ('Hello \U0001F600 there \U0001F389\U0001F389!', 'Hello there!'),
    ('Do NOT share. YES or NO. It is OK, ok.', 'Do Not share. Yes or No. It is okay, okay.'),
    ('Your OTP and UPI ID, from NOOB', 'Your O T P and U P I I D, from Noob'),
    ('Nice \u2764\ufe0f work \u2705 done \u27a1\ufe0f next', 'Nice work done next'),
    ('Flag \U0001F1EE\U0001F1F3 here \U0001F468\u200d\U0001F469\u200d\U0001F467', 'Flag here'),
    ('[face:happy] See https://x.com now', 'See now'),
]
bad = 0
for text, want in cases:
    got = f(text)
    ok = got == want
    bad += 0 if ok else 1
    print('ok  ' if ok else 'FAIL', ascii(text), '->', ascii(got), '' if ok else '(wanted %s)' % ascii(want))
print('python checks failed:', bad)
