package com.noob.social;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * "Update the app": the part of NOOB that needs a new app file (anything that is not just the website) is updated from inside the app.
 *
 *   getInfo()                 which build of the app this is (versionCode / versionName) and whether Android lets NOOB install apps
 *   downloadAndInstall({url}) downloads the newest app file and hands it to Android's installer, which asks the person to confirm
 *                             (Android never lets an app install another version of itself silently)
 *
 * The address must be NOOB's own release page on GitHub, nothing else is ever downloaded. Android itself refuses to install the file over this app unless it was
 * signed with the same key, so a file from anywhere else could not replace it anyway.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
  private static final String ALLOWED_PREFIX = "https://github.com/padmanabhsingh11107035-cyber/N00B/releases/download/";
  private static final long MIN_BYTES = 1024 * 1024;           // a real app file is far bigger than this
  private static final long MAX_BYTES = 200L * 1024 * 1024;     // and far smaller than this
  private static final String LATEST_INFO = ALLOWED_PREFIX + "android-latest/native.json";   // {"build": 163}, published next to the app file
  private volatile boolean busy = false;

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

          Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
          Intent install = new Intent(Intent.ACTION_VIEW);
          install.setDataAndType(uri, "application/vnd.android.package-archive");
          install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
          getContext().startActivity(install);

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
