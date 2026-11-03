package com.noob.social;

import android.content.ComponentName;
import android.content.pm.PackageManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Switches the icon on the phone's home screen between the normal NOOB icon and the NOOB Pro icon, by turning one of the two launcher entries of AndroidManifest.xml on and the other off.
 * The web app decides which one is right (a NOOB Pro plan that is still running = the Pro icon if the person chose it) and calls set() again at every start, so an ended plan goes back by itself.
 */
@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {
  @PluginMethod
  public void set(PluginCall call) {
    boolean pro = "pro".equals(call.getString("icon", "default"));
    PackageManager pm = getContext().getPackageManager();
    ComponentName normal = new ComponentName(getContext(), "com.noob.social.IconDefault");
    ComponentName proIcon = new ComponentName(getContext(), "com.noob.social.IconPro");
    ComponentName on = pro ? proIcon : normal;
    ComponentName off = pro ? normal : proIcon;
    try {
      if (pm.getComponentEnabledSetting(on) != PackageManager.COMPONENT_ENABLED_STATE_ENABLED) {
        pm.setComponentEnabledSetting(on, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
      }
      if (pm.getComponentEnabledSetting(off) != PackageManager.COMPONENT_ENABLED_STATE_DISABLED) {
        pm.setComponentEnabledSetting(off, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
      }
      call.resolve();
    } catch (Exception e) {
      call.reject("Could not change the icon");
    }
  }
}
