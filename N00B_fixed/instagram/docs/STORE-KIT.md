# NOOB: everything needed to list the app in other free app stores

Google Play is done. These are the other free stores worth trying for India, best first. Each needs a developer account made BY THE OWNER (a person's own e-mail, password, phone code and, for some, an ID or business paper: nobody else can do this part).

## What is ready
| What | Where |
|---|---|
| Signed release APK (the file stores ask for) | GitHub Actions run of "Build Android APK" > Artifacts > `noob-release-apk` (new from build 306) |
| Signed Play bundle (AAB) | same run, `noob-release-aab` |
| App icon 512 x 512 | `D:\n00b-android-build\store\icon-512.png` |
| Feature picture 1024 x 500 | `D:\n00b-android-build\store\feature-1024x500.png` |
| 8 phone screenshots | `D:\n00b-android-build\store\phone-1-home-feed.png` ... `phone-8-music.png` |
| Package name | `com.noob.social` |
| Website | https://noobsocials.com |
| Privacy policy | https://noobsocials.com/privacy.html |
| Terms | https://noobsocials.com/terms.html |
| Category | Social |
| Contains ads | Yes (Google AdMob, Android app only) |

## Short description (80 characters)
Chat, reels, games and live with friends: the NOOB social app.

## Full description
NOOB is a social app made for fun and for connecting: share photos, reels and stories, chat with friends, go live, play games together, listen to music and join live voice rooms.

- Posts, reels, stories and a live feed
- Private chats with voice calls and end-to-end protection
- Live streams, up to 30 minutes
- Mini-games and 3D games, daily challenges
- Family Map: share your live location only with the people you choose
- Face lenses and photo / video tools
- NOOB Pro for extra privileges

Free to use. Contains ads. You must be 13 or older.

## The stores, in the order I would do them
1. **Samsung Galaxy Store** (free, no fee): https://seller.samsungapps.com : make a Samsung account, then "Sign Up Now" in the Seller Portal. Choose seller type "Individual". Samsung may ask for ID or business proof for an Indian individual: I could not confirm. Upload `noob-release-apk`.
2. **Indus Appstore** (PhonePe, made for India, free): https://developer.indusappstore.com : needs a developer sign-up with phone number and ID checks. Xiaomi is moving its India phones to this store.
3. **Aptoide** (free, quick): https://www.aptoide.com : an account with an e-mail, then upload the APK. Reaches people outside the big stores.
4. **Xiaomi GetApps / Mi Developer**: https://global.developer.mi.com : needs an identity check; in India Xiaomi is replacing GetApps with Indus, so this one has the least value.
5. **Amazon Appstore** (free): https://developer.amazon.com/apps-and-games : mostly Fire tablets now. Low value.
6. **Huawei AppGallery** (free): https://developer.huawei.com/consumer/en/appgallery : very few Huawei phones in India. Low value.
7. OPPO and VIVO stores need a registered company in most cases: skip.

## Rules to keep (so nobody can lose money or the account)
- Never tap your own real ads. The administrator account is shown Google's test ads on purpose.
- Every store can ask for the same privacy policy and the same screenshots: use the files above.
- Keep ONE signing key for all stores (the same one that signs the Play bundle), so the app can update over itself.
