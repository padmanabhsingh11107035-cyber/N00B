package com.noob.social;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * What the background sender needs to work after the app is swiped away (the phone token, this device's key, the address of the database), kept on this phone only, locked with a key that
 * lives in the Android Keystore (the app can use it, nothing can copy it out). If the Keystore refuses, nothing is saved at all (the web part then keeps using its own way).
 */
final class FamilyStore {
  private static final String ALIAS = "noob_family_sender_v1";
  private static final String PREFS = "noob_family_sender";
  private final SharedPreferences prefs;

  FamilyStore(Context c) { prefs = c.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  private static SecretKey key() throws Exception {
    KeyStore ks = KeyStore.getInstance("AndroidKeyStore");
    ks.load(null);
    if (ks.containsAlias(ALIAS)) return (SecretKey) ks.getKey(ALIAS, null);
    KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
    g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
    return g.generateKey();
  }

  boolean put(String name, String value) {
    try {
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.ENCRYPT_MODE, key());
      byte[] ct = c.doFinal(value.getBytes(StandardCharsets.UTF_8));
      byte[] iv = c.getIV();
      byte[] all = new byte[iv.length + ct.length];
      System.arraycopy(iv, 0, all, 0, iv.length); System.arraycopy(ct, 0, all, iv.length, ct.length);
      return prefs.edit().putString(name, Base64.encodeToString(all, Base64.NO_WRAP)).commit();
    } catch (Throwable t) { return false; }
  }

  String get(String name) {
    try {
      String s = prefs.getString(name, null);
      if (s == null) return null;
      byte[] all = Base64.decode(s, Base64.NO_WRAP);
      Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
      c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, all, 0, 12));
      return new String(c.doFinal(all, 12, all.length - 12), StandardCharsets.UTF_8);
    } catch (Throwable t) { return null; }
  }

  void setFlag(String name, boolean on) { prefs.edit().putBoolean(name, on).commit(); }
  boolean flag(String name) { return prefs.getBoolean(name, false); }
  void setLong(String name, long v) { prefs.edit().putLong(name, v).apply(); }
  long getLong(String name) { return prefs.getLong(name, 0L); }
  void setText(String name, String v) { prefs.edit().putString(name, v).apply(); }
  String text(String name) { return prefs.getString(name, ""); }

  /** forget everything (logout, background sharing switched off) */
  void wipe() { prefs.edit().clear().commit(); }
}
