package com.noob.social;

import android.os.Bundle;
import android.view.WindowManager;

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
    super.onCreate(savedInstanceState);
  }
}
