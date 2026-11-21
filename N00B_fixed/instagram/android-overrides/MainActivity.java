package com.noob.social;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

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
    hideSystemBars();
  }

  // The camera and the microphone are asked for ONCE, like Instagram: when Android has already let the app use them, a page asking for the camera (the story camera, Instants, a call) is answered
  // yes at once, with no question each time. The first time (nothing allowed yet) the normal question is asked.
  @Override
  public void onStart() {
    super.onStart();
    try {
      getBridge().getWebView().setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
          try {
            boolean wantsCamera = false, wantsMic = false;
            for (String r : request.getResources()) {
              if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
              if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) wantsMic = true;
            }
            boolean cameraOk = !wantsCamera || ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
            boolean micOk = !wantsMic || ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            if ((wantsCamera || wantsMic) && cameraOk && micOk) { request.grant(request.getResources()); return; }
          } catch (Throwable ignored) { /* the normal question below */ }
          super.onPermissionRequest(request);
        }
      });
    } catch (Throwable ignored) { /* the app keeps its normal behaviour */ }
  }

  // Full screen like a game: no clock, battery or network bar at the top and no three buttons at the bottom. Swiping from the edge shows them for a moment (Android's own rule), then they hide again.
  private void hideSystemBars() {
    try {
      WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
      c.hide(WindowInsetsCompat.Type.systemBars());   // the clock/battery bar at the top AND the three buttons at the bottom
      c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    } catch (Throwable ignored) { /* a phone that refuses just keeps its normal status bar */ }
  }

  @Override
  public void onWindowFocusChanged(boolean hasFocus) {
    super.onWindowFocusChanged(hasFocus);
    if (hasFocus) hideSystemBars();   // comes back to full screen after a dialog, the keyboard or the app switcher
  }
}
