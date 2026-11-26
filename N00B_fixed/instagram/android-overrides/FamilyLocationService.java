package com.noob.social;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * NOOB Family Map, the background service: follows the phone's place and sends it LOCKED (FamilySenderCore) to the rooms the person shares with, also after the app was swiped away.
 * It runs as an Android "foreground service" (the phone shows a small notification for as long as it works) and talks to the database with the phone token (family_phone_rooms /
 * family_phone_push), never with the person's login. Sticky: Android starts it again after it was stopped for memory, as long as the person has not switched it off.
 */
public class FamilyLocationService extends Service {
  static final String ACTION_START = "com.noob.social.family.START";
  static final String ACTION_STOP = "com.noob.social.family.STOP";
  private static final String CHANNEL = "noob_family_sender";
  private static final int NOTIFICATION_ID = 7421;
  private static final long ROOMS_EVERY_MS = 60_000;
  private static final long GIVE_UP_NO_ROOMS_MS = 10 * 60_000;
  private static final long HEARTBEAT_CHECK_MS = 5_000;

  /** the web part listens while it is alive (the pin of "you", the day report); the sending never depends on it */
  interface Listener { void onFix(Location l); void onProblem(String code); }
  private static volatile Listener listener;
  static volatile boolean running;
  static volatile long lastPushAt;
  static volatile String lastError = "";
  static void setListener(Listener l) { listener = l; }

  private FamilyStore store;
  private LocationManager lm;
  private HandlerThread thread;
  private Handler handler;
  private final ExecutorService net = Executors.newSingleThreadExecutor();
  private Location best;             // the newest good reading
  private long bestAt;
  private long gpsAt;                // when the last satellite (GPS) reading came
  private Location lastSent;
  private long lastSentAt;
  private long roomsAt;
  private long noRoomsSince;
  private List<Room> rooms = new ArrayList<>();
  private boolean sending;

  private static final class Room { String id; List<FamilySenderCore.Recipient> keys = new ArrayList<>(); }

  @Override public IBinder onBind(Intent intent) { return null; }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    store = new FamilyStore(this);
    String action = intent == null ? null : intent.getAction();
    if (ACTION_STOP.equals(action)) { shutDown(true); return START_NOT_STICKY; }
    // started again by Android (no intent) or by the app: only when the person still wants it
    if (!store.flag("wanted") || store.get("token") == null) { stopSelf(); return START_NOT_STICKY; }
    try { goForeground(); } catch (Throwable t) { lastError = "foreground:" + t.getClass().getSimpleName(); stopSelf(); return START_NOT_STICKY; }
    if (thread == null) {
      thread = new HandlerThread("noob-family");
      thread.start();
      handler = new Handler(thread.getLooper());
      if (!listen()) { lastError = "no_permission"; if (listener != null) listener.onProblem("denied"); shutDown(false); return START_NOT_STICKY; }
      handler.postDelayed(this::beat, HEARTBEAT_CHECK_MS);
    }
    running = true;
    lastError = "";
    return START_STICKY;
  }

  private void goForeground() {
    NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
    if (Build.VERSION.SDK_INT >= 26 && nm != null && nm.getNotificationChannel(CHANNEL) == null) {
      NotificationChannel ch = new NotificationChannel(CHANNEL, "Family Map sharing", NotificationManager.IMPORTANCE_LOW);
      ch.setDescription("Shows that NOOB is sharing your place with your Family Map rooms.");
      ch.setShowBadge(false);
      nm.createNotificationChannel(ch);
    }
    Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    Intent stop = new Intent(this, FamilyLocationService.class).setAction(ACTION_STOP);
    PendingIntent stopPi = PendingIntent.getService(this, 1, stop, PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
    String title = store.text("title").isEmpty() ? "NOOB Family Map" : store.text("title");
    String text = store.text("message").isEmpty() ? "Sharing your place with your rooms." : store.text("message");
    Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
    b.setContentTitle(title).setContentText(text).setSmallIcon(getApplicationInfo().icon).setOngoing(true).setContentIntent(pi)
        .addAction(new Notification.Action.Builder(null, "Stop sharing", stopPi).build());
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, b.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
    else startForeground(NOTIFICATION_ID, b.build());
  }

  private boolean listen() {
    lm = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
    if (lm == null) return false;
    boolean fine = checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    boolean coarse = checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    if (!fine && !coarse) return false;
    boolean any = false;
    try {
      if (fine && lm.isProviderEnabled(LocationManager.GPS_PROVIDER)) { lm.requestLocationUpdates(LocationManager.GPS_PROVIDER, 2000, 5f, gps, thread.getLooper()); any = true; }
      if (lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) { lm.requestLocationUpdates(LocationManager.NETWORK_PROVIDER, 5000, 10f, net2, thread.getLooper()); any = true; }
    } catch (SecurityException e) { return false; } catch (Throwable t) { /* a provider is missing: the other one may work */ }
    if (!any) lastError = "location_off";
    return true;   // the service stays: the person may switch location on again
  }

  private final LocationListener gps = new SimpleListener(true);
  private final LocationListener net2 = new SimpleListener(false);
  private final class SimpleListener implements LocationListener {
    private final boolean satellite;
    SimpleListener(boolean satellite) { this.satellite = satellite; }
    @Override public void onLocationChanged(Location l) { accept(l, satellite); }
    @Override public void onProviderEnabled(String p) { }
    @Override public void onProviderDisabled(String p) { }
    @Override @SuppressWarnings("deprecation") public void onStatusChanged(String p, int s, Bundle e) { }
  }

  /** the newest good reading: satellites win; a cell/Wi-Fi reading is used only when no satellite reading came in the last 20 s, and a very rough one never replaces a good one */
  private void accept(Location l, boolean satellite) {
    if (l == null || (l.getLatitude() == 0 && l.getLongitude() == 0)) return;
    long now = System.currentTimeMillis();
    if (satellite) gpsAt = now;
    else if (now - gpsAt < 20_000) return;
    float acc = l.hasAccuracy() ? l.getAccuracy() : 9999f;
    if (best != null && now - bestAt < 60_000 && acc > 200f && best.hasAccuracy() && best.getAccuracy() <= 200f) return;
    best = l; bestAt = now;
    Listener li = listener;
    if (li != null) { try { li.onFix(l); } catch (Throwable t) { /* the web part is gone */ } }
    maybeSend(now, false);
  }

  private void beat() {
    if (handler == null) return;
    maybeSend(System.currentTimeMillis(), true);
    handler.postDelayed(this::beat, HEARTBEAT_CHECK_MS);
  }

  private void maybeSend(long now, boolean heartbeat) {
    Location l = best;
    if (l == null || sending) return;
    if (now - bestAt > 10 * 60_000) return;   // a reading that old says nothing about where the person is now
    boolean has = lastSent != null;
    if (!FamilySenderCore.shouldSend(has, has ? lastSent.getLatitude() : 0, has ? lastSent.getLongitude() : 0, lastSentAt, l.getLatitude(), l.getLongitude(), now)) return;
    sending = true; lastSent = l; lastSentAt = now;
    final Location send = l;
    net.execute(() -> { try { push(send, now); } catch (Throwable t) { lastError = "send:" + t.getClass().getSimpleName(); } finally { sending = false; } });
  }

  // ------------------------------------------------------------------------------------------------ talking to the database
  private String rpc(String fn, JSONObject body) throws Exception {
    String base = store.get("url"), key = store.get("anon");
    if (base == null || key == null) throw new IllegalStateException("not set up");
    HttpURLConnection c = (HttpURLConnection) new URL(base + "/rest/v1/rpc/" + fn).openConnection();
    try {
      c.setConnectTimeout(10_000); c.setReadTimeout(15_000); c.setRequestMethod("POST"); c.setDoOutput(true);
      c.setRequestProperty("Content-Type", "application/json");
      c.setRequestProperty("apikey", key);
      if (key.startsWith("eyJ")) c.setRequestProperty("Authorization", "Bearer " + key);   // an older (JWT) key is also the bearer; the newer "sb_publishable" key goes in apikey only
      byte[] data = body.toString().getBytes(StandardCharsets.UTF_8);
      try (OutputStream o = c.getOutputStream()) { o.write(data); }
      int code = c.getResponseCode();
      InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
      StringBuilder sb = new StringBuilder();
      if (in != null) { byte[] buf = new byte[4096]; int n; while ((n = in.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8)); in.close(); }
      if (code >= 500 || code == 429) throw new java.io.IOException("server " + code);
      return sb.toString();
    } finally { c.disconnect(); }
  }

  private void refreshRooms(long now) throws Exception {
    if (roomsAt != 0 && now - roomsAt < ROOMS_EVERY_MS) return;
    JSONObject res = new JSONObject(rpc("family_phone_rooms", new JSONObject().put("p_token", store.get("token"))));
    if (!res.optBoolean("ok", false)) {
      String err = res.optString("error", "failed");
      lastError = err;
      if ("invalid_token".equals(err) || "switched_off".equals(err)) { handlerShutDown(); }
      throw new IllegalStateException(err);
    }
    List<Room> next = new ArrayList<>();
    JSONArray arr = res.optJSONArray("rooms");
    for (int i = 0; arr != null && i < arr.length(); i++) {
      JSONObject r = arr.getJSONObject(i);
      Room room = new Room(); room.id = r.getString("room");
      JSONArray ks = r.optJSONArray("keys");
      for (int j = 0; ks != null && j < ks.length(); j++) {
        JSONObject k = ks.getJSONObject(j), jwk = k.optJSONObject("key");
        if (jwk == null) continue;
        FamilySenderCore.PublicKeyJwk pk = new FamilySenderCore.PublicKeyJwk(jwk.optString("x"), jwk.optString("y"));
        if (FamilySenderCore.isPublicJwk(pk)) room.keys.add(new FamilySenderCore.Recipient(k.optString("kid"), pk));
      }
      next.add(room);
    }
    rooms = next; roomsAt = now;
    if (next.isEmpty()) { if (noRoomsSince == 0) noRoomsSince = now; if (now - noRoomsSince > GIVE_UP_NO_ROOMS_MS) { lastError = "no_rooms"; handlerShutDown(); } }
    else noRoomsSince = 0;
  }

  private void push(Location l, long now) throws Exception {
    refreshRooms(now);
    if (rooms.isEmpty()) return;
    FamilySenderCore.DeviceKey me = new FamilySenderCore.DeviceKey(store.get("kid"), store.get("x"), store.get("y"), store.get("d"));
    String place = FamilySenderCore.placeJson(l.getLatitude(), l.getLongitude(), l.hasAccuracy() ? (double) l.getAccuracy() : null,
        l.hasBearing() ? (double) l.getBearing() : null, l.hasSpeed() ? (double) l.getSpeed() : null, now);
    JSONArray items = new JSONArray();
    for (Room r : rooms) items.put(new JSONObject().put("room", r.id).put("env", new JSONObject(FamilySenderCore.sealPlace(r.id, place, me, r.keys))));
    JSONObject res = new JSONObject(rpc("family_phone_push", new JSONObject().put("p_token", store.get("token")).put("p_items", items)));
    if (res.optBoolean("ok", false)) { lastPushAt = now; lastError = ""; store.setLong("lastPushAt", now); }
    else { String err = res.optString("error", "failed"); lastError = err; if ("invalid_token".equals(err) || "switched_off".equals(err)) handlerShutDown(); }
  }

  private void handlerShutDown() { if (handler != null) handler.post(() -> shutDown(false)); else shutDown(false); }

  private void shutDown(boolean personChose) {
    running = false;
    if (personChose || "invalid_token".equals(lastError) || "switched_off".equals(lastError) || "no_rooms".equals(lastError)) { if (store != null) store.setFlag("wanted", false); }
    if (personChose) lastError = "";
    try { if (lm != null) { lm.removeUpdates(gps); lm.removeUpdates(net2); } } catch (Throwable t) { /* already gone */ }
    if (handler != null) handler.removeCallbacksAndMessages(null);
    if (thread != null) { thread.quitSafely(); thread = null; handler = null; }
    if (Build.VERSION.SDK_INT >= 24) stopForeground(Service.STOP_FOREGROUND_REMOVE); else stopForeground(true);
    stopSelf();
  }

  @Override public void onDestroy() {
    running = false;
    try { if (lm != null) { lm.removeUpdates(gps); lm.removeUpdates(net2); } } catch (Throwable t) { /* already gone */ }
    if (thread != null) { thread.quitSafely(); thread = null; }
    net.shutdown();
    super.onDestroy();
  }

  // a swipe in the recent apps list only removes the screen: the service goes on (android:stopWithTask="false" in the manifest)
  @Override public void onTaskRemoved(Intent rootIntent) { super.onTaskRemoved(rootIntent); }
}
