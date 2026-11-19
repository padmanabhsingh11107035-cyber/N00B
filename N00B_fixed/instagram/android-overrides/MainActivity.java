package com.noob.social;

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    // Android's "secure window": the system itself refuses screenshots and screen recordings of this app (so of the chats too) and shows a blank
    // picture in the recent-apps switcher. A website can not do this; only the app can. It is switched on BEFORE anything is drawn, so not even
    // the first frame (the chat list, a chat) can be captured.
    getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
    // "Update the app" (src/services/nativeUpdate.ts): downloads the newest app file and hands it to Android's installer. Plugins of our own are registered before the bridge starts.
    registerPlugin(AppUpdaterPlugin.class);
    // The icon on the home screen (normal / NOOB Pro, Settings and activity > App icon, src/utils/appIcon.ts).
    registerPlugin(AppIconPlugin.class);
    // Does this build have Firebase? The web app asks before it registers for phone notifications (without Firebase that registration stops the whole app).
    registerPlugin(PushGuardPlugin.class);
    super.onCreate(savedInstanceState);
    hideStatusBar();
  }

  // Full screen like a game: no clock, battery or network bar at the top. Swiping down from the top edge shows them for a moment (Android's own rule), then they hide again.
  private void hideStatusBar() {
    try {
      WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
      c.hide(WindowInsetsCompat.Type.statusBars());
      c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    } catch (Throwable ignored) { /* a phone that refuses just keeps its normal status bar */ }
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideStatusBar();   // comes back to full screen after a dialog, the keyboard or the app switcher
  }
}
