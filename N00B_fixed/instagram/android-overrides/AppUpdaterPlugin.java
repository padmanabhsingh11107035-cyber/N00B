package com.noob.social;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * "Update the app": the part of NOOB that needs a new app file (anything that is not just the website) is updated from inside the app.
 *
 *   getInfo()                 which build of the app this is (versionCode / versionName) and whether Android lets NOOB install apps
 *   getLatest()               the build number of the newest app file (a tiny file published next to it)
 *   downloadAndInstall({url}) downloads the newest app file and installs it through Android's package installer
 *
 * Android never lets an app replace itself with no say from the person the first time: Android shows its own "Update this app?" screen, and the person taps Update. The installer is
 * asked to skip even that screen (Android 12 and newer do so when this app is the one that installed the version being replaced, which is true from the second in-app update on);
 * wherever Android still wants a tap, its confirmation screen is opened automatically.
 *
 * The address must be NOOB's own release page on GitHub, nothing else is ever downloaded. Android itself refuses to install the file over this app unless it was
 * signed with the same key, so a file from anywhere else could not replace it anyway.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
  private static final String ALLOWED_PREFIX = "https://github.com/padmanabhsingh11107035-cyber/N00B/releases/download/";
  private static final String LATEST_INFO = ALLOWED_PREFIX + "android-latest/native.json";   // {"build": 163}, published next to the app file
  private static final String ACTION_INSTALL_RESULT = "com.noob.social.INSTALL_RESULT";
  private static final long MIN_BYTES = 1024 * 1024;           // a real app file is far bigger than this
  private static final long MAX_BYTES = 200L * 1024 * 1024;     // and far smaller than this
  private volatile boolean busy = false;
  private BroadcastReceiver resultReceiver;

  private boolean canInstall() {
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
  }

  @PluginMethod
  public void getInfo(PluginCall call) {
    try {
      PackageInfo info = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
      long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
      JSObject out = new JSObject();
      out.put("versionCode", code);
      out.put("versionName", info.versionName == null ? "" : info.versionName);
      out.put("canInstall", canInstall());
      call.resolve(out);
    } catch (Exception e) {
      call.reject("Could not read the app version.");
    }
  }

  /** The build number of the newest app file, read from a tiny file published with it. (Asked here, not by the web page, so no browser rule or request limit can get in the way.) */
  @PluginMethod
  public void getLatest(final PluginCall call) {
    new Thread(new Runnable() {
      @Override
      public void run() {
        HttpURLConnection connection = null;
        try {
          connection = (HttpURLConnection) new URL(LATEST_INFO).openConnection();
          connection.setConnectTimeout(15000);
          connection.setReadTimeout(15000);
          connection.setInstanceFollowRedirects(true);
          connection.setUseCaches(false);
          if (connection.getResponseCode() != 200) throw new Exception("No answer.");
          InputStream in = connection.getInputStream();
          ByteArrayOutputStream bytes = new ByteArrayOutputStream();
          byte[] buffer = new byte[2048];
          int n;
          while ((n = in.read(buffer)) != -1 && bytes.size() < 8192) bytes.write(buffer, 0, n);
          in.close();
          JSONObject json = new JSONObject(bytes.toString("UTF-8"));
          JSObject out = new JSObject();
          out.put("build", json.getLong("build"));
          call.resolve(out);
        } catch (Exception e) {
          call.reject("Could not look up the newest app.");
        } finally {
          if (connection != null) connection.disconnect();
        }
      }
    }).start();
  }

  /** Listens (once) for Android's answer to an install: where it still wants the person's tap, its confirmation screen is opened. */
  private synchronized void ensureResultReceiver() {
    if (resultReceiver != null) return;
    resultReceiver = new BroadcastReceiver() {
      @Override
      public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
          Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
          if (confirm != null) {
            confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            try { context.startActivity(confirm); } catch (Exception ignored) { /* the update bar offers the button again */ }
          }
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
          JSObject error = new JSObject();
          String message = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
          error.put("message", message == null ? "The update could not be installed." : message);
          notifyListeners("error", error);
        }
      }
    };
    ContextCompat.registerReceiver(getContext(), resultReceiver, new IntentFilter(ACTION_INSTALL_RESULT), ContextCompat.RECEIVER_NOT_EXPORTED);
  }

  /** Installs through Android's package installer, asking it to skip the confirmation where Android allows that. */
  private void installWithSession(File file) throws Exception {
    Context context = getContext();
    PackageInstaller installer = context.getPackageManager().getPackageInstaller();
    PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
    params.setAppPackageName(context.getPackageName());
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
    int id = installer.createSession(params);
    PackageInstaller.Session session = installer.openSession(id);
    try {
      OutputStream out = session.openWrite("NOOB", 0, file.length());
      InputStream in = new FileInputStream(file);
      byte[] buffer = new byte[64 * 1024];
      int n;
      while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
      session.fsync(out);
      in.close();
      out.close();
      ensureResultReceiver();
      Intent callback = new Intent(ACTION_INSTALL_RESULT).setPackage(context.getPackageName());
      int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? PendingIntent.FLAG_MUTABLE : 0);
      PendingIntent pending = PendingIntent.getBroadcast(context, id, callback, flags);
      session.commit(pending.getIntentSender());
    } catch (Exception e) {
      session.abandon();
      throw e;
    } finally {
      session.close();
    }
  }

  /** The older way, used only if the package installer could not be used: Android's own "install this file" screen. */
  private void installWithScreen(File file) {
    Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
    Intent install = new Intent(Intent.ACTION_VIEW);
    install.setDataAndType(uri, "application/vnd.android.package-archive");
    install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
    getContext().startActivity(install);
  }

  @PluginMethod
  public void downloadAndInstall(final PluginCall call) {
    final String address = call.getString("url", "");
    if (address == null || !address.startsWith(ALLOWED_PREFIX)) {
      call.reject("That is not NOOB's app file.");
      return;
    }
    if (!canInstall()) {
      // Android asks once, per app: "Allow from this source". The person turns it on and taps the update button again.
      try {
        Intent settings = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(settings);
      } catch (Exception ignored) { /* the message below still says what to do */ }
      JSObject out = new JSObject();
      out.put("needsPermission", true);
      call.resolve(out);
      return;
    }
    if (busy) {
      call.reject("The update is already downloading.");
      return;
    }
    busy = true;
    new Thread(new Runnable() {
      @Override
      public void run() {
        HttpURLConnection connection = null;
        try {
          File dir = new File(getContext().getCacheDir(), "updates");
          if (!dir.exists() && !dir.mkdirs()) throw new Exception("No room to keep the update.");
          File file = new File(dir, "NOOB.apk");
          if (file.exists()) file.delete();

          connection = (HttpURLConnection) new URL(address).openConnection();
          connection.setConnectTimeout(20000);
          connection.setReadTimeout(30000);
          connection.setInstanceFollowRedirects(true);      // GitHub sends the file from another address of its own
          connection.connect();
          if (connection.getResponseCode() != 200) throw new Exception("The update could not be downloaded.");
          long total = connection.getContentLengthLong();
          if (total > MAX_BYTES) throw new Exception("The update file is not the right size.");

          long done = 0;
          int lastPercent = -1;
          InputStream in = connection.getInputStream();
          FileOutputStream out = new FileOutputStream(file);
          byte[] buffer = new byte[64 * 1024];
          int n;
          while ((n = in.read(buffer)) != -1) {
            out.write(buffer, 0, n);
            done += n;
            if (done > MAX_BYTES) throw new Exception("The update file is not the right size.");
            int percent = total > 0 ? (int) (done * 100 / total) : -1;
            if (percent != lastPercent) {
              lastPercent = percent;
              JSObject progress = new JSObject();
              progress.put("percent", percent);
              notifyListeners("progress", progress);
            }
          }
          out.close();
          in.close();
          if (done < MIN_BYTES) throw new Exception("The update file is not the right size.");

          try {
            installWithSession(file);
          } catch (Exception sessionProblem) {
            installWithScreen(file);
          }

          JSObject ok = new JSObject();
          ok.put("started", true);
          call.resolve(ok);
        } catch (Exception e) {
          call.reject(e.getMessage() == null ? "The update could not be installed." : e.getMessage());
        } finally {
          busy = false;
          if (connection != null) connection.disconnect();
        }
      }
    }).start();
  }
}
