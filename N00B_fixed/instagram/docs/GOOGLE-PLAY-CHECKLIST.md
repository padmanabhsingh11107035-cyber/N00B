# NOOB on Google Play: what is done, and what only the owner can do

Checked against Google Play's developer policies and India's rules (IT Rules 2021, Digital Personal Data Protection Act 2023). This is a working checklist, not legal advice.

## Done in the app and the build

| Requirement | Where |
| --- | --- |
| Target the newest Android level | `android/variables.gradle`: targetSdk 36, compileSdk 36 |
| Privacy policy page, reachable inside the app and on the web | `/privacy.html`, Profile > Settings and activity > Privacy |
| Terms of use | `/terms.html` |
| Users can delete their account and data **inside the app** and from a **web address** | Settings and activity > Your NOOB account; `/data-deletion.html` (use this address in the Play Console "Account deletion" field) |
| User-generated content: report, block, remove, moderation | Report on posts, reels, chats and people; Blocked accounts; the admin panel's reports and suspensions |
| Age: nobody under 13 can sign up | date of birth check at sign-up (13 to 82) |
| No app that updates itself outside Google Play | the build for Google Play has no `REQUEST_INSTALL_PACKAGES` / `UPDATE_PACKAGES_WITHOUT_USER_ACTION` permission (the build stops if they are there), and a copy installed from Google Play never offers or installs an app file (`AppUpdaterPlugin.fromPlay`) |
| No cloud backup of the app's private data (chat keys, saved logins) | `allowBackup="false"` set by the build |
| Only the permissions it really uses | Internet, camera and microphone (Go Live, Live Lounge, photos); notifications; contacts only on the owner's choice ("Find friends") |
| Screenshots of chats blocked | `FLAG_SECURE` in `MainActivity` |
| Data collected is told to people | Privacy Policy and Terms: account details, device system and battery level, approximate location and optional city, "we do not sell it, it is used for nothing else, it is encrypted" |
| Complaints, rights and the 24-hour / 15-day answer times | Terms and Privacy Policy: "Contact, complaints and your rights" |
| Passwords found in public breach lists are refused | sign-up and change password (`pwnedPassword.ts`, only 5 characters of a fingerprint are sent) |
| Secrets are never in the code | secret scan on every push; only public keys are committed |
| No paid digital goods inside the app | real money is used only for physical food (UPI, Food Stall); NOOB Points and Pro are earned or spent inside the app. **If real-money purchase of Points or Pro is ever added, Google Play Billing must be used.** |

## Only the owner can do these (Play Console and legal)

1. **Name the Grievance Officer** (name, email, postal address) in the Terms and Privacy Policy and in the Play listing. India's IT Rules 2021 require it to be published. Send the details and they are added.
2. **Fill in the Data safety form** in Play Console. Answers: collects account info (name, email, phone), user content (photos, videos, audio, messages), device info (operating system, battery level), approximate location (city), contacts (only if the person uses Find friends); data is encrypted in transit; people can ask for deletion; nothing is sold or shared for advertising.
3. **Content rating questionnaire**: a social app with user-generated content and chat.
4. **Target audience**: 13 and over (not a children's app). **Legal risk to decide with a lawyer:** India's DPDP Act treats everyone under 18 as a child and asks for a parent's verifiable consent before their data is processed. The app lets people of 13 to 17 sign up.
5. **Permissions declaration** for camera, microphone, contacts and notifications (the reasons are in this table).
6. **Store listing**: name, short and long description, icon (512 px), feature graphic (1024 x 500), at least 2 phone screenshots, a support email, the privacy policy address `https://noobsocials.com/privacy.html`.
7. **App signing**: add the four release-key secrets to GitHub (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`). Without them the signed bundle (`.aab`) is not built.
8. **Test accounts** for the Play review team (a login that works without an emailed code is not possible: the review team needs an inbox they can read; give them a real test email in the "App access" form).
9. **Web wrapper risk (reduced):** the Android app now carries its own screens inside the app file (no website address is loaded), works from files on the phone, signs in through the phone's own browser tab and comes back through its own link `com.noob.social://auth`, and has native parts (secure window, push notifications, camera and microphone, contacts). Say so in the review notes. Add `com.noob.social://auth` to Supabase > Authentication > URL Configuration > Redirect URLs.
10. **Upgrade Supabase** so the service is not switched off (a review team that sees "under maintenance" can reject the app).
