package com.noob.social;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Switches the icon on the phone's home screen between the normal NOOB icon and the two NOOB Pro icons (black and white), by turning one of the three launcher entries of AndroidManifest.xml on and the other off.
 * The web app decides which one is right (a NOOB Pro plan that is still running = the Pro icon the person chose) and calls set() again at every start, so an ended plan goes back by itself.
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
  @PluginMethod
  public void set(PluginCall call) {
    String icon = call.getString("icon", "default");
    PackageManager pm = getContext().getPackageManager();
    String[] names = { "default", "pro-black", "pro-white" };
    String[] classes = { "com.noob.social.IconDefault", "com.noob.social.IconProBlack", "com.noob.social.IconProWhite" };
    try {
      int want = 0;
      for (int i = 0; i < names.length; i++) if (names[i].equals(icon)) want = i;
      for (int i = 0; i < names.length; i++) {
        ComponentName c = new ComponentName(getContext(), classes[i]);
        int state = i == want ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED;
        if (i == want && pm.getComponentEnabledSetting(c) != state) pm.setComponentEnabledSetting(c, state, PackageManager.DONT_KILL_APP);
      }
      for (int i = 0; i < names.length; i++) {
        ComponentName c = new ComponentName(getContext(), classes[i]);
        if (i != want && pm.getComponentEnabledSetting(c) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) pm.setComponentEnabledSetting(c, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
      }
      call.resolve();
    } catch (Exception e) {
      call.reject("Could not change the icon");
    }
  }
}
