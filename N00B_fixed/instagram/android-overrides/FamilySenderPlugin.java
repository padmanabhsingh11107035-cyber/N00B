package com.noob.social;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * NOOB Family Map: the web part's door to the phone's own background sender (FamilyLocationService). The web part hands over the phone token and this device's key once (configure), starts
 * and stops the service, and listens to the places while it is alive. After the app is swiped away the service keeps sending by itself (see FamilySenderCore / FamilyLocationService).
 */
@CapacitorPlugin(
  name = "FamilySender",
  permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION }),
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
  }
)
public class FamilySenderPlugin extends Plugin {
  @Override
  public void load() {
    FamilyLocationService.setListener(new FamilyLocationService.Listener() {
      @Override public void onFix(Location l) {
        JSObject o = new JSObject();
        o.put("latitude", l.getLatitude()); o.put("longitude", l.getLongitude());
        if (l.hasAccuracy()) o.put("accuracy", (double) l.getAccuracy());
        if (l.hasSpeed()) o.put("speed", (double) l.getSpeed());
        if (l.hasBearing()) o.put("bearing", (double) l.getBearing());
        o.put("time", l.getTime());
        notifyListeners("location", o);
      }
      @Override public void onProblem(String code) { JSObject o = new JSObject(); o.put("code", code); notifyListeners("problem", o); }
    });
  }

  @Override
  protected void handleOnDestroy() {
    FamilyLocationService.setListener(null);   // the service itself goes on without the web part
    super.handleOnDestroy();
  }

  /** hands over what the service needs after the app is gone: { url, anonKey, token, kid, x, y, d, title, message } */
  @PluginMethod
  public void configure(PluginCall call) {
    FamilyStore st = new FamilyStore(getContext());
    String[] names = { "url", "anonKey", "token", "kid", "x", "y", "d" };
    for (String n : names) { String v = call.getString(n); if (v == null || v.isEmpty()) { call.reject("Missing " + n); return; } }
    String url = call.getString("url");
    if (!url.startsWith("https://")) { call.reject("The address must be https"); return; }
    boolean ok = st.put("url", url.replaceAll("/+$", "")) & st.put("anon", call.getString("anonKey")) & st.put("token", call.getString("token"))
        & st.put("kid", call.getString("kid")) & st.put("x", call.getString("x")) & st.put("y", call.getString("y")) & st.put("d", call.getString("d"));
    st.setText("title", call.getString("title", "NOOB Family Map"));
    st.setText("message", call.getString("message", "Sharing your place with your rooms."));
    if (!ok) { st.wipe(); call.reject("This phone could not keep the key safe.", "NO_KEYSTORE"); return; }
    JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
  }

  @PluginMethod
  public void start(PluginCall call) {
    if (getPermissionState("location") != PermissionState.GRANTED) {
      if (call.getBoolean("requestPermissions", true)) requestPermissionForAlias("location", call, "locationResult");
      else call.reject("Permission denied.", "NOT_AUTHORIZED");
      return;
    }
    afterLocation(call);
  }

  @PermissionCallback
  private void locationResult(PluginCall call) {
    if (getPermissionState("location") != PermissionState.GRANTED) { call.reject("User denied location permission", "NOT_AUTHORIZED"); return; }
    afterLocation(call);
  }

  private void afterLocation(PluginCall call) {
    // from Android 13 the notification of a background service needs its own permission; the service works without it, but the person would not see why the phone is busy
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED && call.getBoolean("requestPermissions", true) && !call.getBoolean("asked", false)) {
      call.getData().put("asked", true);
      requestPermissionForAlias("notifications", call, "notificationsResult");
      return;
    }
    launch(call);
  }

  @PermissionCallback
  private void notificationsResult(PluginCall call) { launch(call); }

  private void launch(PluginCall call) {
    FamilyStore st = new FamilyStore(getContext());
    if (st.get("token") == null || st.get("d") == null) { call.reject("Not set up yet.", "NOT_CONFIGURED"); return; }
    st.setFlag("wanted", true);
    try {
      ContextCompat.startForegroundService(getContext(), new Intent(getContext(), FamilyLocationService.class).setAction(FamilyLocationService.ACTION_START));
    } catch (Throwable t) { call.reject("The service could not start: " + t.getClass().getSimpleName(), "START_FAILED"); return; }
    JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
  }

  /** stops the service and removes the notification (the person switched background sharing off, or paused everything) */
  @PluginMethod
  public void stop(PluginCall call) {
    new FamilyStore(getContext()).setFlag("wanted", false);
    getContext().startService(new Intent(getContext(), FamilyLocationService.class).setAction(FamilyLocationService.ACTION_STOP));
    JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
  }

  /** stops and forgets everything (logout) */
  @PluginMethod
  public void clear(PluginCall call) {
    try { getContext().startService(new Intent(getContext(), FamilyLocationService.class).setAction(FamilyLocationService.ACTION_STOP)); } catch (Throwable t) { /* not running */ }
    new FamilyStore(getContext()).wipe();
    JSObject r = new JSObject(); r.put("ok", true); call.resolve(r);
  }

  @PluginMethod
  public void status(PluginCall call) {
    FamilyStore st = new FamilyStore(getContext());
    JSObject r = new JSObject();
    r.put("running", FamilyLocationService.running);
    r.put("configured", st.get("token") != null && st.get("d") != null);
    r.put("wanted", st.flag("wanted"));
    r.put("lastPushAt", Math.max(FamilyLocationService.lastPushAt, st.getLong("lastPushAt")));
    r.put("lastError", FamilyLocationService.lastError);
    r.put("location", getPermissionState("location") == PermissionState.GRANTED);
    call.resolve(r);
  }

  /** the phone's settings page of this app (where "Allow all the time" and the battery setting are) */
  @PluginMethod
  public void openSettings(PluginCall call) {
    try {
      Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", getContext().getPackageName(), null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getContext().startActivity(i);
    } catch (Throwable t) { /* no settings page */ }
    call.resolve();
  }
}
