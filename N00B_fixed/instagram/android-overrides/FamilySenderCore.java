package com.noob.social;

import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.security.AlgorithmParameters;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.ECParameterSpec;
import java.security.spec.ECPoint;
import java.security.spec.ECPrivateKeySpec;
import java.security.spec.ECPublicKeySpec;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * NOOB Family Map, the phone's own sender: LOCKS a place (end-to-end encryption) exactly the way the web part does (src/e2ee/crypto.ts: seal), so that the background service can keep
 * sending after the app is swiped away, when the web part is gone. The envelope this makes is opened, unchanged, by the app's own code (scripts/supabase/test-family-phone.mjs compiles this
 * file, locks a place with it and opens that with crypto.ts). No Android classes here on purpose: it is plain Java, so it can be tested on a computer.
 *
 * What it does (the same steps as the web part): a random 256-bit message key locks the place (AES-GCM); that key is locked once for EVERY device key of everybody in the room (and the sender),
 * with a wrapping key from two Diffie-Hellman results (a throw-away key, and the sender's own device key, so only the sender could have made it), through HKDF-SHA-256.
 */
public final class FamilySenderCore {
  private FamilySenderCore() {}

  private static final String INFO = "noob-e2ee-v1";
  private static final int MAX_RECIPIENT_KEYS = 200;
  private static final Pattern B64URL43 = Pattern.compile("^[A-Za-z0-9_-]{43}$");
  private static final SecureRandom RNG = new SecureRandom();

  /** a device's public key (x and y as in a JWK) */
  public static final class PublicKeyJwk {
    public final String x, y;
    public PublicKeyJwk(String x, String y) { this.x = x; this.y = y; }
  }
  /** a recipient: the short key id and the public key */
  public static final class Recipient {
    public final String kid; public final PublicKeyJwk key;
    public Recipient(String kid, PublicKeyJwk key) { this.kid = kid; this.key = key; }
  }
  /** this device's own key (the private part `d` as in a JWK) */
  public static final class DeviceKey {
    public final String kid, x, y, d;
    public DeviceKey(String kid, String x, String y, String d) { this.kid = kid; this.x = x; this.y = y; this.d = d; }
  }

  // ------------------------------------------------------------------------------------------------ base64url without padding (java.util.Base64 needs Android 8)
  private static final char[] ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();
  public static String b64(byte[] in) {
    StringBuilder sb = new StringBuilder((in.length * 4 + 2) / 3);
    int i = 0;
    for (; i + 2 < in.length; i += 3) {
      int n = ((in[i] & 255) << 16) | ((in[i + 1] & 255) << 8) | (in[i + 2] & 255);
      sb.append(ALPHA[n >> 18]).append(ALPHA[(n >> 12) & 63]).append(ALPHA[(n >> 6) & 63]).append(ALPHA[n & 63]);
    }
    if (i + 1 == in.length) {
      int n = (in[i] & 255) << 16;
      sb.append(ALPHA[n >> 18]).append(ALPHA[(n >> 12) & 63]);
    } else if (i + 2 == in.length) {
      int n = ((in[i] & 255) << 16) | ((in[i + 1] & 255) << 8);
      sb.append(ALPHA[n >> 18]).append(ALPHA[(n >> 12) & 63]).append(ALPHA[(n >> 6) & 63]);
    }
    return sb.toString();
  }
  public static byte[] unb64(String s) {
    int bits = 0, acc = 0; byte[] out = new byte[s.length() * 3 / 4]; int o = 0;
    for (int i = 0; i < s.length(); i++) {
      char c = s.charAt(i); int v;
      if (c >= 'A' && c <= 'Z') v = c - 'A'; else if (c >= 'a' && c <= 'z') v = c - 'a' + 26; else if (c >= '0' && c <= '9') v = c - '0' + 52;
      else if (c == '-' || c == '+') v = 62; else if (c == '_' || c == '/') v = 63; else if (c == '=') break; else throw new IllegalArgumentException("not base64url");
      acc = (acc << 6) | v; bits += 6;
      if (bits >= 8) { bits -= 8; out[o++] = (byte) ((acc >> bits) & 255); }
    }
    byte[] r = new byte[o]; System.arraycopy(out, 0, r, 0, o); return r;
  }
  private static String hex(byte[] b) { StringBuilder sb = new StringBuilder(); for (byte x : b) sb.append(String.format("%02x", x & 255)); return sb.toString(); }
  private static byte[] concat(byte[]... parts) {
    int n = 0; for (byte[] p : parts) n += p.length;
    byte[] out = new byte[n]; int at = 0;
    for (byte[] p : parts) { System.arraycopy(p, 0, out, at, p.length); at += p.length; }
    return out;
  }
  private static byte[] rand(int n) { byte[] b = new byte[n]; RNG.nextBytes(b); return b; }

  // ------------------------------------------------------------------------------------------------ keys
  public static boolean isPublicJwk(PublicKeyJwk k) { return k != null && k.x != null && k.y != null && B64URL43.matcher(k.x).matches() && B64URL43.matcher(k.y).matches(); }

  /** the short id of a public key: the first 16 hex characters of SHA-256("x.y") (the same as kidOf in crypto.ts) */
  public static String kidOf(PublicKeyJwk k) throws Exception {
    return hex(MessageDigest.getInstance("SHA-256").digest((k.x + "." + k.y).getBytes(StandardCharsets.UTF_8))).substring(0, 16);
  }

  private static ECParameterSpec curve() throws Exception {
    AlgorithmParameters ap = AlgorithmParameters.getInstance("EC");
    ap.init(new ECGenParameterSpec("secp256r1"));
    return ap.getParameterSpec(ECParameterSpec.class);
  }
  private static PublicKey publicKey(PublicKeyJwk k) throws Exception {
    return KeyFactory.getInstance("EC").generatePublic(new ECPublicKeySpec(new ECPoint(new BigInteger(1, unb64(k.x)), new BigInteger(1, unb64(k.y))), curve()));
  }
  private static PrivateKey privateKey(String d) throws Exception {
    return KeyFactory.getInstance("EC").generatePrivate(new ECPrivateKeySpec(new BigInteger(1, unb64(d)), curve()));
  }
  private static byte[] dh(PrivateKey priv, PublicKey pub) throws Exception {
    KeyAgreement ka = KeyAgreement.getInstance("ECDH");
    ka.init(priv); ka.doPhase(pub, true);
    byte[] z = ka.generateSecret();
    if (z.length == 32) return z;
    byte[] out = new byte[32];   // (a leading zero byte could be left out by some providers)
    System.arraycopy(z, Math.max(0, z.length - 32), out, Math.max(0, 32 - z.length), Math.min(32, z.length));
    return out;
  }
  private static byte[] fixed32(BigInteger v) {
    byte[] raw = v.toByteArray(); byte[] out = new byte[32];
    int copy = Math.min(raw.length, 32);
    System.arraycopy(raw, raw.length - copy, out, 32 - copy, copy);
    return out;
  }

  /** HKDF-SHA-256 (RFC 5869), one block (32 bytes) of output */
  private static byte[] hkdf32(byte[] ikm, byte[] salt, byte[] info) throws Exception {
    Mac mac = Mac.getInstance("HmacSHA256");
    mac.init(new SecretKeySpec(salt.length == 0 ? new byte[32] : salt, "HmacSHA256"));
    byte[] prk = mac.doFinal(ikm);
    mac.init(new SecretKeySpec(prk, "HmacSHA256"));
    mac.update(info); mac.update((byte) 1);
    return mac.doFinal();
  }

  private static byte[] gcm(boolean encrypt, byte[] key, byte[] iv, byte[] aad, byte[] data) throws Exception {
    Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
    c.init(encrypt ? Cipher.ENCRYPT_MODE : Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, iv));
    c.updateAAD(aad);
    return c.doFinal(data);
  }

  // ------------------------------------------------------------------------------------------------ the place
  private static String num(Double v) {
    if (v == null || v.isNaN() || v.isInfinite()) return "null";
    return new java.math.BigDecimal(Double.toString(v)).toPlainString();
  }
  /** the place as the web part writes it (readPlace in sealed.ts reads it back); accuracy, heading and speed may be null */
  public static String placeJson(double lat, double lng, Double accuracy, Double heading, Double speed, long atMs) {
    return "{\"v\":1,\"lat\":" + num(lat) + ",\"lng\":" + num(lng) + ",\"acc\":" + num(accuracy) + ",\"hdg\":" + num(heading) + ",\"spd\":" + num(speed) + ",\"at\":" + atMs + "}";
  }

  private static String q(String s) {   // a JSON string (only ever fed ids and base64url text)
    StringBuilder sb = new StringBuilder("\"");
    for (int i = 0; i < s.length(); i++) { char c = s.charAt(i); if (c == '"' || c == '\\') sb.append('\\'); if (c < 0x20) sb.append(String.format("\\u%04x", (int) c)); else sb.append(c); }
    return sb.append('"').toString();
  }

  /**
   * Locks `placeJson` for the room and returns the envelope as JSON text (what family_phone_push stores): {"v":1,"skid":..,"epk":{"x":..,"y":..},"iv":..,"ct":..,"keys":{kid:{"iv":..,"w":..}}}.
   * `recipients` are the public keys of every device of everybody in the room; the sender's own key is added when it is missing, and every key id is checked against its key.
   */
  public static String sealPlace(String roomId, String placeJson, DeviceKey sender, List<Recipient> recipients) throws Exception {
    Map<String, Recipient> all = new LinkedHashMap<>();
    for (Recipient r : recipients) { if (r != null && r.kid != null && !all.containsKey(r.kid)) all.put(r.kid, r); }
    PublicKeyJwk own = new PublicKeyJwk(sender.x, sender.y);
    if (!all.containsKey(sender.kid)) all.put(sender.kid, new Recipient(sender.kid, own));
    if (all.size() > MAX_RECIPIENT_KEYS) { List<Recipient> cut = new ArrayList<>(all.values()).subList(0, MAX_RECIPIENT_KEYS); all.clear(); for (Recipient r : cut) all.put(r.kid, r); if (!all.containsKey(sender.kid)) all.put(sender.kid, new Recipient(sender.kid, own)); }
    if (!sender.kid.equals(kidOf(own))) throw new IllegalArgumentException("the device key does not match its id");
    for (Recipient r : all.values()) if (!isPublicJwk(r.key) || !r.kid.equals(kidOf(r.key))) throw new IllegalArgumentException("a public key does not match its id");

    byte[] K = rand(32), iv = rand(12);
    byte[] aad = (INFO + "|" + roomId + "|" + sender.kid).getBytes(StandardCharsets.UTF_8);
    byte[] ct = gcm(true, K, iv, aad, placeJson.getBytes(StandardCharsets.UTF_8));   // a place is far below the size where the web part would compress it, so it goes in as it is

    KeyPairGenerator g = KeyPairGenerator.getInstance("EC");
    g.initialize(new ECGenParameterSpec("secp256r1"), RNG);
    KeyPair eph = g.generateKeyPair();
    ECPublicKey ephPub = (ECPublicKey) eph.getPublic();
    PrivateKey senderPriv = privateKey(sender.d);

    StringBuilder keys = new StringBuilder("{");
    boolean first = true;
    for (Recipient r : all.values()) {
      PublicKey rpub = publicKey(r.key);
      byte[] z1 = dh(eph.getPrivate(), rpub), z2 = dh(senderPriv, rpub);
      byte[] wk = hkdf32(concat(z1, z2), iv, (INFO + " wrap|" + r.kid + "|" + sender.kid).getBytes(StandardCharsets.UTF_8));
      byte[] ivW = rand(12);
      byte[] w = gcm(true, wk, ivW, r.kid.getBytes(StandardCharsets.UTF_8), K);
      if (!first) keys.append(',');
      first = false;
      keys.append(q(r.kid)).append(":{\"iv\":").append(q(b64(ivW))).append(",\"w\":").append(q(b64(w))).append('}');
    }
    keys.append('}');
    return "{\"v\":1,\"skid\":" + q(sender.kid) + ",\"epk\":{\"x\":" + q(b64(fixed32(ephPub.getW().getAffineX()))) + ",\"y\":" + q(b64(fixed32(ephPub.getW().getAffineY()))) + "},\"iv\":" + q(b64(iv)) + ",\"ct\":" + q(b64(ct)) + ",\"keys\":" + keys + "}";
  }

  // ------------------------------------------------------------------------------------------------ when to send (the same rule as shouldPush in src/family/geo.ts)
  public static double distanceM(double lat1, double lng1, double lat2, double lng2) {
    double R = 6371008.8, dLat = Math.toRadians(lat2 - lat1), dLng = Math.toRadians(lng2 - lng1);
    double h = Math.pow(Math.sin(dLat / 2), 2) + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) * Math.pow(Math.sin(dLng / 2), 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  /** the first time; a heartbeat every 20 s (so a person who stands still stays "live"); or at least 8 m moved and 4 s passed */
  public static boolean shouldSend(boolean hasPrev, double prevLat, double prevLng, long prevAtMs, double lat, double lng, long nowMs) {
    if (!hasPrev) return true;
    long since = nowMs - prevAtMs;
    if (since >= 20_000) return true;
    return since >= 4_000 && distanceM(prevLat, prevLng, lat, lng) >= 8;
  }
}
