package com.noob.social;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Android's "secure window": the system itself refuses screenshots and screen recordings of this app, and shows a blank
    // picture in the recent-apps switcher. (A website can not do this; only the app can.)
    getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE);
  }
}
