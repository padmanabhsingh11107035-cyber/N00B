package com.noob.social;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.List;

/**
 * Tells the web app whether this build has Firebase set up (the google-services.json of the build). Asking the phone-notification plugin to register WITHOUT it throws an error inside the
 * plugin that nothing can catch, and the whole app stops ("NOOB keeps stopping", right after login). So the web app asks here first and never registers when the answer is no.
 * (Reflection on purpose: the Firebase classes belong to the notification plugin, not to this module.)
 */
@CapacitorPlugin(name = "PushGuard")
public class PushGuardPlugin extends Plugin {
  @PluginMethod
  public void hasFirebase(PluginCall call) {
    boolean ok = false;
    try {
      Class<?> app = Class.forName("com.google.firebase.FirebaseApp");
      Object list = app.getMethod("getApps", android.content.Context.class).invoke(null, getContext());
      ok = list instanceof List && !((List<?>) list).isEmpty();
    } catch (Throwable t) {
      ok = false;
    }
    JSObject r = new JSObject();
    r.put("value", ok);
    call.resolve(r);
  }
}
