# Android overrides

Files here replace the ones Capacitor generates (the generated `android/` folder is not kept in git, and `npx cap add android`
makes a fresh one on every build). The Android build workflow copies them in right after `npx cap add android`.

- `MainActivity.java` switches on Android's **secure window** (`FLAG_SECURE`): the system itself refuses screenshots and
  screen recordings of the app and shows a blank picture in the recent-apps switcher. A website cannot do this; only the app can.
