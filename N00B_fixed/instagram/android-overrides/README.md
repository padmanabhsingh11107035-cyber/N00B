# Android overrides

Files here replace the ones Capacitor generates (the generated `android/` folder is not kept in git, and `npx cap add android`
makes a fresh one on every build). The Android build workflow copies them in right after `npx cap add android`.

- `MainActivity.java` switches on Android's **secure window** (`FLAG_SECURE`): the system itself refuses screenshots and
  screen recordings of the app and shows a blank picture in the recent-apps switcher. A website cannot do this; only the app can.

Everything else that is special about the Android app is done by the build workflow (`.github/workflows/android-build.yml`), step "Native parts", right after `npx cap add android`:

- `AppUpdaterPlugin.java` (the in-app "Update the app" installer) is copied in, and the manifest gets `REQUEST_INSTALL_PACKAGES` and `UPDATE_PACKAGES_WITHOUT_USER_ACTION`.
- The manifest gets **`CAMERA`**, **`RECORD_AUDIO`** and the two optional `uses-feature` lines (camera, microphone). Without them the WebView cannot hand camera or microphone access
  to the app at all (Go Live, Live Lounge). Each step is checked with `grep -q`, so a build that lost one fails instead of shipping without it.
- The app's name and id (`NOOB`, `com.noob.social`) come from `capacitor.config.json`; the launcher icon is made from `resources/icon.png` with a black background; the splash screen
  from `resources/splash.png`.
