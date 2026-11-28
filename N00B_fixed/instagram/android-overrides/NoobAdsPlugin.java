package com.noob.social;

import android.graphics.Color;
import android.graphics.Outline;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewConfiguration;
import android.view.ViewGroup;
import android.view.ViewOutlineProvider;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdLoader;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.RequestConfiguration;
import com.google.android.gms.ads.nativead.MediaView;
import com.google.android.gms.ads.nativead.NativeAd;
import com.google.android.gms.ads.nativead.NativeAdView;

import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * "NoobAds": the Google (AdMob) native ads between the posts on Home, drawn by the phone itself on top of the page (AdMob only allows its ads to be drawn by its own SDK, so the web page can not draw them).
 *
 * The web page (src/components/Ads/AdSlot.tsx) keeps an empty curved box where an ad goes and tells this plugin, a few times a second while the page moves, where that box is on the screen
 * and which part of it can really be seen (the part under the header or the bottom bar is cut off, and nothing is drawn while a page or sheet covers it). This plugin loads the ad and draws it there,
 * inside a curved box: the "Ad" label, the advertiser, the picture or video, the headline and Google's button that opens the advertiser's app or website.
 *
 * Safety rules of this file (an ad must never cost anybody the app or their data):
 *   * nothing here touches the app's data, the login or any file: it only adds and removes ad views;
 *   * every entry point is wrapped, so a problem becomes "no ad" (the web page then simply closes the gap), never an error that stops the app;
 *   * a swipe that starts on an ad scrolls the page underneath (the touches are handed on to the page), so people can scroll past an ad; a tap that does not move is the ad's own click;
 *   * all ad views are released when the screen is destroyed or the web page asks.
 */
@CapacitorPlugin(name = "NoobAds")
public class NoobAdsPlugin extends Plugin {
  private static final int MAX_SLOTS = 6;
  private final Map<String, Slot> slots = new HashMap<>();
  private boolean started = false;

  /** one ad box */
  private static final class Slot {
    String id;
    String unit;
    AdFrame frame;
    NativeAdView adView;
    NativeAd ad;
    boolean loading = false;
    boolean loaded = false;
    boolean failed = false;
    boolean visible = false;
    boolean admin = false;
    int cardColor = Color.parseColor("#1f1f23");
    int textColor = Color.WHITE;
    int mutedColor = Color.parseColor("#b4b4bf");
    int accentColor = Color.parseColor("#ff4d6d");
  }

  // ------------------------------------------------------------------------------------------------------------------------------ plugin calls
  /** Starts the ad SDK. Safe to call many times. The age limit keeps adult ads away (the app has teenagers). */
  @PluginMethod
  public void start(PluginCall call) {
    JSObject res = new JSObject();
    try {
      if (!started) {
        started = true;
        RequestConfiguration config = new RequestConfiguration.Builder()
            .setMaxAdContentRating(RequestConfiguration.MAX_AD_CONTENT_RATING_T)
            .setTagForUnderAgeOfConsent(RequestConfiguration.TAG_FOR_UNDER_AGE_OF_CONSENT_UNSPECIFIED)
            .build();
        MobileAds.setRequestConfiguration(config);
        MobileAds.initialize(getContext(), status -> { /* ready */ });
      }
      res.put("ok", true);
    } catch (Throwable t) {
      res.put("ok", false);
    }
    call.resolve(res);
  }

  /**
   * Shows / moves / hides one ad box. Called by the web page; all numbers are in screen pixels of the web view.
   * slot, unit (the ad unit id), x, y, w, h = the box; visTop, visBottom = how much of the top / bottom is cut off; visible = false while it is covered or off the screen;
   * colors (#rrggbb): card, text, muted, accent. Never fails: a problem is answered with ok:false.
   */
  @PluginMethod
  public void place(final PluginCall call) {
    final JSObject res = new JSObject();
    try {
      final String id = call.getString("slot", "");
      final String unit = call.getString("unit", "");
      if (id == null || id.isEmpty() || unit == null || unit.isEmpty() || getActivity() == null) { res.put("ok", false); call.resolve(res); return; }
      final float x = call.getFloat("x", 0f), y = call.getFloat("y", 0f), w = call.getFloat("w", 0f), h = call.getFloat("h", 0f);
      final float visTop = call.getFloat("visTop", 0f), visBottom = call.getFloat("visBottom", 0f);
      final boolean visible = Boolean.TRUE.equals(call.getBoolean("visible", true));
      final String cCard = call.getString("card", ""), cText = call.getString("text", ""), cMuted = call.getString("muted", ""), cAccent = call.getString("accent", "");
      getActivity().runOnUiThread(new Runnable() {
        @Override public void run() {
          try { placeOnUi(id, unit, x, y, w, h, visTop, visBottom, visible, cCard, cText, cMuted, cAccent); } catch (Throwable ignored) { /* no ad this time */ }
        }
      });
      res.put("ok", true);
    } catch (Throwable t) {
      res.put("ok", false);
    }
    call.resolve(res);
  }

  /** The box is gone from the page: release its ad. */
  @PluginMethod
  public void remove(final PluginCall call) {
    final String id = call.getString("slot", "");
    try {
      if (getActivity() != null) {
        getActivity().runOnUiThread(new Runnable() {
          @Override public void run() { try { removeOnUi(id); } catch (Throwable ignored) { /* nothing to do */ } }
        });
      }
    } catch (Throwable ignored) { /* nothing to do */ }
    call.resolve();
  }

  @Override
  protected void handleOnDestroy() {
    try {
      Iterator<Map.Entry<String, Slot>> it = slots.entrySet().iterator();
      while (it.hasNext()) { destroySlot(it.next().getValue()); it.remove(); }
    } catch (Throwable ignored) { /* the app is closing anyway */ }
    super.handleOnDestroy();
  }

  // ------------------------------------------------------------------------------------------------------------------------------ on the screen thread
  private void placeOnUi(String id, String unit, float x, float y, float w, float h, float visTop, float visBottom, boolean visible, String cCard, String cText, String cMuted, String cAccent) {
    WebView web = getBridge() != null ? getBridge().getWebView() : null;
    if (web == null || !(web.getParent() instanceof ViewGroup)) return;
    ViewGroup parent = (ViewGroup) web.getParent();
    Slot s = slots.get(id);
    if (s == null) {
      if (slots.size() >= MAX_SLOTS) return;
      s = new Slot();
      s.id = id; s.unit = unit;
      slots.put(id, s);
    }
    s.cardColor = parse(cCard, s.cardColor); s.textColor = parse(cText, s.textColor); s.mutedColor = parse(cMuted, s.mutedColor); s.accentColor = parse(cAccent, s.accentColor);
    if (s.failed) { hide(s); return; }
    if (!s.loading && !s.loaded) load(s, web, parent);
    if (s.frame == null) return;   // not loaded yet: nothing to show
    int pw = Math.max(1, Math.round(w)), ph = Math.max(1, Math.round(h));
    int top = Math.round(Math.max(0f, visTop)), bottom = Math.round(Math.max(0f, visBottom));
    int visibleHeight = ph - top - bottom;
    if (!visible || visibleHeight < 8 || pw < 8) { hide(s); return; }
    s.visible = true;
    // the frame is exactly the part that can be seen (so it can not catch touches meant for the header or the bar); the ad card inside is slid up by what is cut off
    s.frame.layoutAt(web, pw, ph, top, visibleHeight);
    s.frame.setX(web.getLeft() + x);
    s.frame.setY(web.getTop() + y + top);
    if (s.frame.getVisibility() != View.VISIBLE) s.frame.setVisibility(View.VISIBLE);
  }

  private void hide(Slot s) {
    s.visible = false;
    if (s.frame != null && s.frame.getVisibility() != View.GONE) s.frame.setVisibility(View.GONE);
  }

  private void removeOnUi(String id) {
    Slot s = slots.remove(id);
    if (s != null) destroySlot(s);
  }

  private void destroySlot(Slot s) {
    try { if (s.frame != null && s.frame.getParent() instanceof ViewGroup) ((ViewGroup) s.frame.getParent()).removeView(s.frame); } catch (Throwable ignored) { /* already gone */ }
    try { if (s.adView != null) s.adView.destroy(); } catch (Throwable ignored) { /* already gone */ }
    try { if (s.ad != null) s.ad.destroy(); } catch (Throwable ignored) { /* already gone */ }
    s.frame = null; s.adView = null; s.ad = null;
  }

  // ------------------------------------------------------------------------------------------------------------------------------ loading
  private void load(final Slot s, final WebView web, final ViewGroup parent) {
    s.loading = true;
    final String id = s.id;
    AdLoader loader = new AdLoader.Builder(getContext(), s.unit)
        .forNativeAd(new NativeAd.OnNativeAdLoadedListener() {
          @Override public void onNativeAdLoaded(NativeAd nativeAd) {
            try {
              Slot cur = slots.get(id);
              if (cur == null || getActivity() == null || getActivity().isDestroyed()) { nativeAd.destroy(); return; }   // the box is gone meanwhile
              cur.ad = nativeAd;
              buildAndFill(cur, web, parent, nativeAd);
              cur.loaded = true; cur.loading = false;
              tell(id, "loaded");
            } catch (Throwable t) {
              Slot cur = slots.get(id);
              if (cur != null) { cur.failed = true; cur.loading = false; destroySlot(cur); }
              try { nativeAd.destroy(); } catch (Throwable ignored) { /* gone */ }
              tell(id, "failed");
            }
          }
        })
        .withAdListener(new AdListener() {
          @Override public void onAdFailedToLoad(LoadAdError error) {
            Slot cur = slots.get(id);
            if (cur != null) { cur.failed = true; cur.loading = false; }
            tell(id, "failed");   // no ad for now (no fill, no network, unit not ready): the page closes the gap
          }
        })
        .build();
    loader.loadAd(new AdRequest.Builder().build());
  }

  private void tell(String id, String state) {
    try {
      JSObject o = new JSObject();
      o.put("slot", id);
      o.put("state", state);
      notifyListeners("adState", o);
    } catch (Throwable ignored) { /* the page asks again */ }
  }

  // ------------------------------------------------------------------------------------------------------------------------------ the ad card (made in code: no layout files needed)
  private int dp(float v) { return Math.round(v * getContext().getResources().getDisplayMetrics().density); }
  private static int parse(String c, int fallback) { try { return c == null || c.isEmpty() ? fallback : Color.parseColor(c); } catch (Throwable t) { return fallback; } }

  private void buildAndFill(Slot s, WebView web, ViewGroup parent, NativeAd ad) {
    final int radius = dp(24);
    NativeAdView adView = new NativeAdView(getContext());
    GradientDrawable bg = new GradientDrawable();
    bg.setColor(s.cardColor);
    bg.setCornerRadius(radius);
    adView.setBackground(bg);
    adView.setClipToOutline(true);
    adView.setOutlineProvider(new ViewOutlineProvider() {
      @Override public void getOutline(View view, Outline outline) { outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), radius); }
    });

    LinearLayout col = new LinearLayout(getContext());
    col.setOrientation(LinearLayout.VERTICAL);
    col.setPadding(dp(14), dp(12), dp(14), dp(14));
    adView.addView(col, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

    // top row: the "Ad" label (always shown, AdMob requires it), the icon and the advertiser
    LinearLayout top = new LinearLayout(getContext());
    top.setOrientation(LinearLayout.HORIZONTAL);
    top.setGravity(Gravity.CENTER_VERTICAL);
    TextView badge = new TextView(getContext());
    badge.setText("Ad");
    badge.setTextSize(11);
    badge.setTypeface(Typeface.DEFAULT_BOLD);
    badge.setTextColor(Color.BLACK);
    badge.setPadding(dp(7), dp(2), dp(7), dp(2));
    GradientDrawable badgeBg = new GradientDrawable();
    badgeBg.setColor(Color.parseColor("#ffd23f"));
    badgeBg.setCornerRadius(dp(6));
    badge.setBackground(badgeBg);
    top.addView(badge);
    ImageView icon = new ImageView(getContext());
    LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(28), dp(28));
    iconLp.leftMargin = dp(10);
    icon.setScaleType(ImageView.ScaleType.CENTER_CROP);
    icon.setClipToOutline(true);
    icon.setOutlineProvider(new ViewOutlineProvider() {
      @Override public void getOutline(View view, Outline outline) { outline.setRoundRect(0, 0, view.getWidth(), view.getHeight(), dp(7)); }
    });
    top.addView(icon, iconLp);
    TextView advertiser = new TextView(getContext());
    advertiser.setTextSize(13);
    advertiser.setTextColor(s.mutedColor);
    advertiser.setSingleLine(true);
    advertiser.setEllipsize(android.text.TextUtils.TruncateAt.END);
    LinearLayout.LayoutParams advLp = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
    advLp.leftMargin = dp(8);
    top.addView(advertiser, advLp);
    col.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    // the picture or video takes the room that is left
    MediaView media = new MediaView(getContext());
    LinearLayout.LayoutParams mediaLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f);
    mediaLp.topMargin = dp(10);
    col.addView(media, mediaLp);

    TextView headline = new TextView(getContext());
    headline.setTextSize(16);
    headline.setTypeface(Typeface.DEFAULT_BOLD);
    headline.setTextColor(s.textColor);
    headline.setMaxLines(2);
    headline.setEllipsize(android.text.TextUtils.TruncateAt.END);
    LinearLayout.LayoutParams hlLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    hlLp.topMargin = dp(10);
    col.addView(headline, hlLp);

    TextView body = new TextView(getContext());
    body.setTextSize(13.5f);
    body.setTextColor(s.mutedColor);
    body.setMaxLines(2);
    body.setEllipsize(android.text.TextUtils.TruncateAt.END);
    col.addView(body, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

    // Google's button: it opens the advertiser's app or website
    Button cta = new Button(getContext());
    cta.setAllCaps(false);
    cta.setTextSize(15);
    cta.setTypeface(Typeface.DEFAULT_BOLD);
    cta.setTextColor(Color.WHITE);
    GradientDrawable ctaBg = new GradientDrawable();
    ctaBg.setColor(s.accentColor);
    ctaBg.setCornerRadius(dp(22));
    cta.setBackground(ctaBg);
    cta.setStateListAnimator(null);
    LinearLayout.LayoutParams ctaLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44));
    ctaLp.topMargin = dp(10);
    col.addView(cta, ctaLp);

    // fill and register every view with the ad (the registration is what makes Google count shows and taps)
    advertiser.setText(ad.getAdvertiser() != null ? ad.getAdvertiser() : "");
    headline.setText(ad.getHeadline() != null ? ad.getHeadline() : "");
    if (ad.getBody() != null) body.setText(ad.getBody()); else body.setVisibility(View.GONE);
    if (ad.getCallToAction() != null) cta.setText(ad.getCallToAction()); else cta.setVisibility(View.GONE);
    if (ad.getIcon() != null) icon.setImageDrawable(ad.getIcon().getDrawable()); else icon.setVisibility(View.GONE);
    if (ad.getMediaContent() != null) media.setMediaContent(ad.getMediaContent()); else media.setVisibility(View.GONE);
    adView.setHeadlineView(headline);
    adView.setBodyView(body);
    adView.setCallToActionView(cta);
    adView.setIconView(icon);
    adView.setMediaView(media);
    adView.setAdvertiserView(advertiser);
    adView.setNativeAd(ad);

    AdFrame frame = new AdFrame(getContext(), web);
    frame.setClipChildren(true);
    frame.addView(adView, new FrameLayout.LayoutParams(1, 1));
    frame.setVisibility(View.GONE);
    parent.addView(frame, new FrameLayout.LayoutParams(1, 1));
    s.frame = frame;
    s.adView = adView;
  }

  /**
   * The box that holds an ad card. It is exactly the visible part of the ad. A swipe that starts on it is handed to the page underneath (so the page scrolls, people can scroll past an ad); a tap that
   * does not move belongs to the ad (Google's button, the picture). Once a finger has moved, the ad is told "cancel" so finishing a scroll can never count as a tap on the ad.
   */
  private static final class AdFrame extends FrameLayout {
    private final WebView web;
    private final int slop;
    private float downX, downY;
    private boolean moved = false;
    private boolean cancelledAd = false;

    AdFrame(android.content.Context c, WebView web) {
      super(c);
      this.web = web;
      this.slop = ViewConfiguration.get(c).getScaledTouchSlop();
    }

    /** places the (full size) ad card so that the visible part shows: the frame is the visible part, the card slides up by what is cut off at the top */
    void layoutAt(WebView webView, int fullW, int fullH, int cutTop, int visibleH) {
      ViewGroup.LayoutParams lp = getLayoutParams();
      if (lp.width != fullW || lp.height != visibleH) { lp.width = fullW; lp.height = visibleH; setLayoutParams(lp); }
      View card = getChildAt(0);
      if (card != null) {
        ViewGroup.LayoutParams cl = card.getLayoutParams();
        if (cl.width != fullW || cl.height != fullH) { cl.width = fullW; cl.height = fullH; card.setLayoutParams(cl); }
        card.setTranslationY(-cutTop);
      }
    }

    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
      try {
        final int action = e.getActionMasked();
        if (action == MotionEvent.ACTION_DOWN) { downX = e.getRawX(); downY = e.getRawY(); moved = false; cancelledAd = false; }
        if (!moved && action == MotionEvent.ACTION_MOVE && (Math.abs(e.getRawX() - downX) > slop || Math.abs(e.getRawY() - downY) > slop)) moved = true;
        // the page underneath gets every touch (so scrolling works from anywhere on the ad)
        MotionEvent forWeb = MotionEvent.obtain(e);
        try {
          forWeb.offsetLocation(getX() - web.getLeft(), getY() - web.getTop());
          web.dispatchTouchEvent(forWeb);
        } finally { forWeb.recycle(); }
        if (moved) {
          if (!cancelledAd) {
            cancelledAd = true;
            MotionEvent cancel = MotionEvent.obtain(e);
            try { cancel.setAction(MotionEvent.ACTION_CANCEL); super.dispatchTouchEvent(cancel); } finally { cancel.recycle(); }
          }
          return true;
        }
        super.dispatchTouchEvent(e);
        return true;
      } catch (Throwable t) {
        return true;   // never let a touch problem reach the app
      }
    }
  }
}
