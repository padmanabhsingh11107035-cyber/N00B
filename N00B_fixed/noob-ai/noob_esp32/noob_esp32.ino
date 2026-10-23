/*
  NOOB - ESP32-S3 AI voice assistant (device firmware)
  ----------------------------------------------------
  Hold the button and speak, then release it. NOOB sends your voice to the NOOB
  server on your PC, which understands it (any language), asks the free AI, and
  sends back NOOB's spoken answer, which plays on the speaker.

  First use: open the NOOB App on your PC > Devices > Scan now > Connect, and type
  the 4-digit code shown on NOOB's screen. The pairing is saved, even after power-off.

  Board   : ESP32-S3-DevKitC-1 N16R8 (MUST have PSRAM)
  Arduino : "esp32 by Espressif Systems" board package version 3.x
  Tools   : Board "ESP32S3 Dev Module", PSRAM "OPI PSRAM", Flash Size "16MB (128Mb)"
  Library : "Adafruit SSD1306" (installs "Adafruit GFX Library" with it)
*/

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "driver/i2s_std.h"

// ===================== CHANGE THESE 2 LINES =====================
const char* WIFI_SSID = "YOUR_WIFI_NAME";       // tip: use your phone's hotspot, then NOOB works anywhere
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";
// ================================================================
// The PC's address and the secret key are set by pairing in the NOOB App.

#define FW_VERSION  "1.9"
#define DEVICE_PORT 4210         // NOOB listens here for the NOOB App
#define SERVER_PORT 4211         // the NOOB server listens here
#define PAIR_WINDOW_MS 120000    // a pairing code is valid for 2 minutes
#define PING_ONLINE_MS  15000    // say hello to the PC this often while it answers
#define PING_OFFLINE_MS 30000    // ...and this often while it does not

// Set to 1 once to preview all 25 faces after the splash screen (takes about 40 seconds).
#define TEST_FACES_ON_BOOT 0
// Set to 1 once to preview the music sound waves after the splash screen (5 seconds).
#define TEST_MUSIC_ON_BOOT 0

// ---------- Pins (see wiring table) ----------
#define MIC_SCK     5    // INMP441 SCK
#define MIC_WS      4    // INMP441 WS
#define MIC_SD      6    // INMP441 SD
#define AMP_BCLK    15   // MAX98357A BCLK
#define AMP_LRC     16   // MAX98357A LRC
#define AMP_DIN     7    // MAX98357A DIN
#define BUTTON_PIN  12   // push button to GND (stop speaking / mute)
#define OLED_SDA    8
#define OLED_SCL    9

// ---------- Audio settings ----------
#define SAMPLE_RATE        16000   // must match the server
#define MAX_RECORD_SECONDS 10      // longest sentence NOOB records
#define MIC_GAIN_SHIFT     12      // lower number = louder mic (11 = louder, 13 = quieter)
#define VOLUME_PERCENT     150     // speaker volume: 100 = normal max, above 100 = boost (clipped safely)
                                   // FULL VOLUME. If the voice sounds crackly, lower this (try 130 or 100)

// ---------- Always-listening (voice activity detection) settings ----------
#define VAD_MIN_LEVEL       100    // NOOB never reacts to sounds quieter than this (raise if it hears ghosts)
#define VAD_NOISE_MULT      3.0f   // speech must be this many times louder than the room noise
#define VAD_MAX_NOISE       1500.0f// the room-noise estimate never goes above this
#define VAD_START_MS        90     // a sound must last this long to count as speech
#define VAD_END_SILENCE_MS  500    // this much quiet = you finished talking (lower = faster reply,
                                   // but if NOOB cuts you off when you pause, raise it to 700)
#define VAD_KEEP_TAIL_MS    150    // quiet kept at the end of the recording (less = less to send)
#define VAD_MIN_SPEECH_MS   250    // shorter sounds (claps, clicks, bumps) are ignored
#define VAD_PREROLL_MS      350    // keeps the sound just BEFORE speech was detected, so no word is cut
#define VAD_COOLDOWN_MS     1000   // NOOB ignores the mic this long after it stops speaking (echo)
#define VAD_DEBUG           1      // 1 = print loudness numbers to the Serial Monitor once per second
#define TIMING_DEBUG        1      // 1 = print how long each answer took (the [TIME] lines)

// ---------- Music wave settings ----------
#define VIZ_UPDATE_MS       70     // how often the waves move while a song plays
#define VIZ_MAX_HEIGHT      15     // tallest wave bar, in pixels (up from the centre line)
#define AUTO_MUSIC_MS       20000  // audio longer than this (and no face from the server) = show music waves
                                   // set to 0 to turn this automatic switch off

const size_t MAX_SAMPLES = (size_t)SAMPLE_RATE * MAX_RECORD_SECONDS;
const size_t PREROLL_SAMPLES = (size_t)SAMPLE_RATE * VAD_PREROLL_MS / 1000;

i2s_chan_handle_t micChan = NULL;
i2s_chan_handle_t spkChan = NULL;
int16_t* recBuf = NULL;           // recording buffer, lives in PSRAM
int16_t preRoll[PREROLL_SAMPLES]; // the last moments of sound, before speech was detected

Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledOk = false;

WiFiUDP udp;
bool udpStarted = false;
Preferences prefs;                // pairing is saved in flash memory
String serverUrl, deviceKey, deviceName;
int pairCode = 0;
unsigned long pairUntil = 0;      // 0 = not in pairing mode
unsigned long lastWifiTry = 0;
unsigned long lastPing = 0;
bool pcOnline = false;            // does the NOOB server on the PC answer?
String ownerName;                 // first name of the account NOOB belongs to
bool micMuted = false;            // button press when idle toggles this

// ------------------------------------------------------------------ faces
#define FG SSD1306_WHITE
#define BG SSD1306_BLACK
#define NUM_FACES 25
#define MUSIC_ID  25              // special screen: music sound waves (not one of the 25 faces)
#define EYE_L_X 34                // centre of the left eye
#define EYE_R_X 94                // centre of the right eye
#define EYE_Y   38                // vertical centre of the eyes

const char* FACE_NAMES[NUM_FACES] = {
  "normal", "happy", "laugh", "love", "wink",
  "angry", "furious", "sad", "crying", "surprised",
  "scared", "sleepy", "sleeping", "cool", "confused",
  "thinking", "listening", "speaking", "lookleft", "lookright",
  "suspicious", "bored", "shy", "dizzy", "smug"
};
// Face numbers: 0 normal, 1 happy, 2 laugh, 3 love, 4 wink, 5 angry, 6 furious, 7 sad, 8 crying,
// 9 surprised, 10 scared, 11 sleepy, 12 sleeping, 13 cool, 14 confused, 15 thinking, 16 listening,
// 17 speaking, 18 look left, 19 look right, 20 suspicious, 21 bored, 22 shy, 23 dizzy, 24 smug
// 25 = music sound waves

const char* RESPONSE_HEADERS[] = {"X-Face"};   // header the server can send to choose NOOB's face

String hint1, hint2;              // small text next to the NOOB title (only when idle)
bool idleFace = false;            // true while the calm "ready" face is on screen
unsigned long nextIdleAt = 0;     // when the next blink / look-around happens
unsigned long holdFaceUntil = 0;  // keep the answer's face on screen a little after speaking

// ----- eyes -----
void eyeBox(int cx, int cy, int w, int h, int r, bool blink) {
  if (blink) { h = 3; r = 1; }
  display.fillRoundRect(cx - w / 2, cy - h / 2, w, h, r, FG);
}

void eyeHalfLid(int cx, int cy, int w, int h, int lidPercent, bool blink) {
  eyeBox(cx, cy, w, h, 8, blink);
  if (!blink) display.fillRect(cx - w / 2 - 1, cy - h / 2 - 1, w + 2, (h * lidPercent) / 100 + 1, BG);
}

void eyeHappy(int cx, int cy) {                 // ^ shape
  display.fillCircle(cx, cy + 2, 13, FG);
  display.fillCircle(cx, cy + 10, 13, BG);
}

void eyeContent(int cx, int cy) {               // u shape (closed, relaxed)
  display.fillCircle(cx, cy - 2, 13, FG);
  display.fillCircle(cx, cy - 10, 13, BG);
}

void eyeAngry(int cx, int cy, bool left, int w, int h) {
  display.fillRoundRect(cx - w / 2, cy - h / 2, w, h, 6, FG);
  int x0 = cx - w / 2 - 2, x1 = cx + w / 2 + 2, yt = cy - h / 2 - 2;
  if (left) display.fillTriangle(x0, yt, x1, yt, x1, cy - 2, BG);
  else      display.fillTriangle(x1, yt, x0, yt, x0, cy - 2, BG);
}

void eyeSad(int cx, int cy, bool left) {
  int w = 26, h = 28;
  display.fillRoundRect(cx - w / 2, cy - h / 2, w, h, 6, FG);
  int x0 = cx - w / 2 - 2, x1 = cx + w / 2 + 2, yt = cy - h / 2 - 2;
  if (left) display.fillTriangle(x0, yt, x1, yt, x0, cy - 2, BG);
  else      display.fillTriangle(x1, yt, x0, yt, x1, cy - 2, BG);
}

void eyeHeart(int cx, int cy) {
  display.fillCircle(cx - 6, cy - 3, 7, FG);
  display.fillCircle(cx + 6, cy - 3, 7, FG);
  display.fillTriangle(cx - 13, cy, cx + 13, cy, cx, cy + 14, FG);
}

void eyeX(int cx, int cy) {
  for (int d = -1; d <= 1; d++) {
    display.drawLine(cx - 11, cy - 11 + d, cx + 11, cy + 11 + d, FG);
    display.drawLine(cx - 11, cy + 11 + d, cx + 11, cy - 11 + d, FG);
  }
}

void eyeGlass(int cx, int cy) {                 // one sunglasses lens
  display.fillRoundRect(cx - 15, cy - 9, 30, 20, 6, FG);
  display.drawLine(cx - 9, cy + 5, cx - 2, cy - 4, BG);
  display.drawLine(cx - 6, cy + 6, cx + 1, cy - 3, BG);
}

// ----- mouths (centre of the screen, below the eyes) -----
void mouthSmile() {
  display.fillCircle(64, 50, 11, FG);
  display.fillCircle(64, 46, 11, BG);
}

void mouthFrown() {
  display.fillCircle(64, 62, 11, FG);
  display.fillCircle(64, 66, 11, BG);
}

void mouthLine() {
  display.fillRect(54, 56, 20, 3, FG);
}

void mouthO() {
  display.fillCircle(64, 56, 6, FG);
  display.fillCircle(64, 56, 3, BG);
}

void mouthSmirk() {
  display.drawLine(54, 58, 66, 58, FG);
  display.drawLine(54, 59, 66, 59, FG);
  display.drawLine(66, 58, 74, 53, FG);
  display.drawLine(66, 59, 74, 54, FG);
}

void mouthTeeth() {
  display.drawRoundRect(52, 50, 24, 12, 3, FG);
  display.drawFastVLine(58, 50, 12, FG);
  display.drawFastVLine(64, 50, 12, FG);
  display.drawFastVLine(70, 50, 12, FG);
  display.drawFastHLine(52, 56, 24, FG);
}

void mouthZigzag(int amp, int x0, int x1) {
  int y = 57, step = (x1 - x0) / 4;
  for (int i = 0; i < 4; i++) {
    int xa = x0 + i * step, xb = xa + step;
    int ya = y + ((i & 1) ? amp : -amp);
    int yb = y + ((i & 1) ? -amp : amp);
    display.drawLine(xa, ya, xb, yb, FG);
    display.drawLine(xa, ya + 1, xb, yb + 1, FG);
  }
}

// Draws the eyes + mouth of face `id`. `phase` (0..3) is used by the faces that move.
void drawFaceBody(int id, int phase, bool blink) {
  const int L = EYE_L_X, R = EYE_R_X, cy = EYE_Y;
  switch (id) {
    case 0: {                                           // normal
      eyeBox(L, cy, 26, 28, 8, blink);
      eyeBox(R, cy, 26, 28, 8, blink);
      break;
    }
    case 1: {                                           // happy
      eyeHappy(L, cy); eyeHappy(R, cy);
      mouthSmile();
      break;
    }
    case 2: {                                           // laugh (mouth opens and closes)
      eyeHappy(L, cy); eyeHappy(R, cy);
      int h = (phase & 1) ? 12 : 8;
      display.fillRoundRect(54, 50, 20, h, 5, FG);
      break;
    }
    case 3: {                                           // love
      eyeHeart(L, cy); eyeHeart(R, cy);
      mouthSmile();
      break;
    }
    case 4: {                                           // wink
      eyeBox(L, cy, 26, 28, 8, false);
      eyeHappy(R, cy);
      mouthSmile();
      break;
    }
    case 5: {                                           // angry
      eyeAngry(L, cy, true, 26, 28);
      eyeAngry(R, cy, false, 26, 28);
      mouthFrown();
      break;
    }
    case 6: {                                           // furious (shakes, gritted teeth)
      int dx = (phase & 1) ? 1 : -1;
      eyeAngry(L + dx, cy - 1, true, 30, 30);
      eyeAngry(R + dx, cy - 1, false, 30, 30);
      mouthTeeth();
      break;
    }
    case 7: {                                           // sad
      eyeSad(L, cy, true); eyeSad(R, cy, false);
      mouthFrown();
      break;
    }
    case 8: {                                           // crying (tears run)
      eyeSad(L, cy, true); eyeSad(R, cy, false);
      int len = (phase & 1) ? 6 : 12;
      display.fillRoundRect(L - 10, cy + 15, 4, len, 2, FG);
      display.fillRoundRect(R + 6, cy + 15, 4, len, 2, FG);
      mouthFrown();
      break;
    }
    case 9: {                                           // surprised
      display.fillCircle(L, cy, 14, FG); display.fillCircle(L, cy, 5, BG);
      display.fillCircle(R, cy, 14, FG); display.fillCircle(R, cy, 5, BG);
      mouthO();
      break;
    }
    case 10: {                                          // scared (trembles)
      int dx = (phase & 1) ? 1 : -1;
      display.drawCircle(L + dx, cy, 13, FG); display.drawCircle(L + dx, cy, 12, FG);
      display.drawCircle(R + dx, cy, 13, FG); display.drawCircle(R + dx, cy, 12, FG);
      display.fillCircle(L + dx, cy, 2, FG);
      display.fillCircle(R + dx, cy, 2, FG);
      mouthZigzag(5, 48, 80);
      break;
    }
    case 11: {                                          // sleepy
      eyeHalfLid(L, cy, 26, 28, 55, blink);
      eyeHalfLid(R, cy, 26, 28, 55, blink);
      display.setTextSize(2);
      display.setCursor(110, 18);
      display.print("z");
      break;
    }
    case 12: {                                          // sleeping
      display.fillRoundRect(L - 12, cy + 2, 24, 4, 2, FG);
      display.fillRoundRect(R - 12, cy + 2, 24, 4, 2, FG);
      if (phase & 1) { display.setTextSize(2); display.setCursor(108, 18); display.print("Z"); }
      else           { display.setTextSize(1); display.setCursor(112, 24); display.print("z"); }
      break;
    }
    case 13: {                                          // cool (sunglasses)
      eyeGlass(L, cy); eyeGlass(R, cy);
      display.fillRect(L + 15, cy - 7, (R - 15) - (L + 15), 3, FG);
      mouthSmirk();
      break;
    }
    case 14: {                                          // confused
      eyeBox(L, cy, 26, 28, 8, blink);
      eyeBox(R, cy + 2, 18, 18, 7, blink);
      display.setTextSize(2);
      display.setCursor(110, 18);
      display.print("?");
      display.drawLine(54, 59, 74, 54, FG);
      display.drawLine(54, 60, 74, 55, FG);
      break;
    }
    case 15: {                                          // thinking (looks up and away, dots)
      eyeBox(L + 6, cy - 5, 24, 22, 8, blink);
      eyeBox(R + 6, cy - 5, 24, 22, 8, blink);
      for (int i = 0; i < 3; i++) display.fillCircle(84 + i * 10, 57, 2, FG);
      break;
    }
    case 16: {                                          // listening (tall wide-open eyes)
      eyeBox(L, cy - 2, 26, 34, 10, blink);
      eyeBox(R, cy - 2, 26, 34, 10, blink);
      break;
    }
    case 17: {                                          // speaking (mouth moves)
      eyeBox(L, cy, 26, 28, 8, blink);
      eyeBox(R, cy, 26, 28, 8, blink);
      const int hs[4] = {3, 8, 13, 7};
      display.fillRoundRect(55, 51, 18, hs[phase & 3], 3, FG);
      break;
    }
    case 18: {                                          // look left
      eyeBox(L - 8, cy, 26, 28, 8, blink);
      eyeBox(R - 8, cy, 26, 28, 8, blink);
      break;
    }
    case 19: {                                          // look right
      eyeBox(L + 8, cy, 26, 28, 8, blink);
      eyeBox(R + 8, cy, 26, 28, 8, blink);
      break;
    }
    case 20: {                                          // suspicious
      eyeBox(L + 4, cy + 2, 26, 10, 3, blink);
      eyeBox(R + 4, cy + 2, 26, 10, 3, blink);
      for (int t = 0; t < 2; t++) {
        display.drawLine(L - 10, cy - 12 + t, L + 14, cy - 12 + t, FG);
        display.drawLine(R - 10, cy - 14 + t, R + 14, cy - 19 + t, FG);
      }
      display.fillRect(58, 56, 14, 2, FG);
      break;
    }
    case 21: {                                          // bored
      eyeHalfLid(L - 5, cy, 26, 28, 50, blink);
      eyeHalfLid(R - 5, cy, 26, 28, 50, blink);
      mouthLine();
      break;
    }
    case 22: {                                          // shy (blush)
      eyeContent(L, cy); eyeContent(R, cy);
      for (int i = 0; i < 3; i++) {
        display.drawLine(L - 9 + i * 6, cy + 18, L - 6 + i * 6, cy + 13, FG);
        display.drawLine(R - 9 + i * 6, cy + 18, R - 6 + i * 6, cy + 13, FG);
      }
      mouthSmile();
      break;
    }
    case 23: {                                          // dizzy
      eyeX(L, cy); eyeX(R, cy);
      mouthZigzag(3, 52, 76);
      break;
    }
    case 24: {                                          // smug
      eyeHalfLid(L, cy, 26, 28, 50, blink);
      eyeBox(R, cy, 26, 28, 8, blink);
      for (int t = 0; t < 2; t++) display.drawLine(R - 12, cy - 18 + t, R + 12, cy - 22 + t, FG);
      mouthSmirk();
      break;
    }
    default: {
      eyeBox(L, cy, 26, 28, 8, blink);
      eyeBox(R, cy, 26, 28, 8, blink);
      break;
    }
  }
}

// ----- music sound waves -----
// The waves are symmetric like a real sound wave: the newest loudness appears in the middle, and
// older loudness moves outward to both sides. The edges fade to small dots.
#define VIZ_HALF 16                    // bars from the centre to one edge (31 bars in total)
float vizHist[VIZ_HALF];               // loudness history, [0] = centre = newest
float vizPeak = 300;                   // loudest recent sound (so quiet and loud songs both look good)

void vizReset() {
  for (int i = 0; i < VIZ_HALF; i++) vizHist[i] = 0;
  vizPeak = 300;
}

// Adds a new loudness value (average size of the audio samples, roughly 0..20000).
void vizPush(float level) {
  vizPeak *= 0.99f;
  if (level > vizPeak) vizPeak = level;
  if (vizPeak < 300.0f) vizPeak = 300.0f;
  float v = level / vizPeak;
  if (v > 1.0f) v = 1.0f;
  v = powf(v, 0.8f);
  for (int k = VIZ_HALF - 1; k > 0; k--) vizHist[k] = vizHist[k - 1];
  vizHist[0] = v;
}

void renderMusic() {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(FG);
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.print("NOOB");
  const int cy = 36;
  for (int k = 0; k < VIZ_HALF; k++) {
    float env = powf(cosf((float)k * 1.5708f / (float)VIZ_HALF), 1.5f);   // tall in the middle, small at the edges
    float v = vizHist[k] * ((k & 1) ? 1.0f : 0.8f);
    int hh = (int)(v * env * (float)VIZ_MAX_HEIGHT + 0.5f);
    for (int side = 0; side < 2; side++) {
      if (k == 0 && side == 1) break;                                      // the centre bar is drawn once
      int x = side ? (64 + 4 * k - 1) : (64 - 4 * k - 1);
      if (hh <= 1) display.fillRect(x, cy - 1, 2, 2, FG);                  // a small dot
      else         display.fillRect(x, cy - hh, 2, hh * 2, FG);            // a wave bar
    }
  }
  display.setTextSize(1);
  display.setCursor(34, 56);
  display.print("Music Beat");
  display.display();
}

// Draws the whole screen: NOOB on top + the face.
void renderFace(int id, int phase = 0, bool blink = false) {
  if (!oledOk) return;
  if (id == MUSIC_ID) { renderMusic(); return; }
  display.clearDisplay();
  display.setTextColor(FG);
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.print("NOOB");
  display.setTextSize(1);
  if (hint1.length()) { display.setCursor(50, 0); display.print(hint1); }
  if (hint2.length()) { display.setCursor(50, 8); display.print(hint2); }
  drawFaceBody(id, phase, blink);
  display.display();
}

// Shows a face for an action (listening, thinking, speaking, ...). Clears the idle hints.
void showStateFace(int id, int phase = 0) {
  idleFace = false;
  hint1 = ""; hint2 = "";
  if (id == MUSIC_ID) {
    Serial.println("[NOOB] music waves");
    vizReset();
    renderMusic();
    return;
  }
  Serial.printf("[NOOB] face %d (%s)\n", id, FACE_NAMES[id]);
  renderFace(id, phase, false);
}

bool faceAnimates(int id) {
  return id == 2 || id == 6 || id == 8 || id == 10 || id == 12 || id == 17;
}

// "happy" or "3" -> face number ("music" -> MUSIC_ID). Returns -1 if unknown/empty.
int faceFromString(String s) {
  s.trim();
  s.toLowerCase();
  if (s.length() == 0) return -1;
  if (s == "music" || s == "song") return MUSIC_ID;
  if (isDigit(s[0])) {
    int n = s.toInt();
    return (n >= 0 && n <= MUSIC_ID) ? n : -1;
  }
  for (int i = 0; i < NUM_FACES; i++) if (s == FACE_NAMES[i]) return i;
  return -1;
}

// Full-screen NOOB when the device starts.
void showSplash() {
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(FG);
  display.setTextSize(4);
  display.setCursor(16, 16);
  display.print("NOOB");
  display.display();
}

// ------------------------------------------------------------------ screen
void showStatus(const char* line1, const char* line2 = "") {
  idleFace = false;
  Serial.printf("[NOOB] %s %s\n", line1, line2);
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println("NOOB");
  display.setTextSize(1);
  display.setCursor(0, 28);
  display.println(line1);
  display.setCursor(0, 44);
  display.println(line2);
  display.display();
}

bool isPaired() {
  return serverUrl.length() > 0 && deviceKey.length() > 0;
}

void showMuted() {
  idleFace = false;
  hint1 = "Muted";
  hint2 = "press = listen";
  Serial.println("[NOOB] Muted");
  renderFace(12, 0, false);
}

void showReady() {
  if (WiFi.status() != WL_CONNECTED) showStatus("No WiFi", WIFI_SSID);
  else if (!isPaired())              showStatus("Not paired yet", "NOOB App > Devices");
  else if (!pcOnline)                showStatus("PC offline", "open NOOB App on PC");
  else if (micMuted)                 showMuted();
  else {
    hint1 = "Hi " + (ownerName.length() ? ownerName.substring(0, 9) : String("friend")) + "!";
    hint2 = "Just talk!";
    Serial.println("[NOOB] Ready - listening all the time");
    renderFace(0, 0, false);
    idleFace = true;
    nextIdleAt = millis() + 3000;
  }
}

// Calm idle animation (does not block): blinks now and then, sometimes looks left or right.
void idleAnimate() {
  static int stage = 0;
  static unsigned long endAt = 0;
  if (!idleFace || holdFaceUntil != 0 || pairUntil != 0) { stage = 0; return; }
  unsigned long now = millis();
  if (stage == 0) {
    if (now < nextIdleAt) return;
    int r = random(0, 10);
    if (r < 6) { renderFace(0, 0, true);  endAt = now + 130; }
    else       { renderFace(r < 8 ? 18 : 19, 0, false); endAt = now + 700; }
    stage = 1;
  } else if ((long)(now - endAt) >= 0) {
    renderFace(0, 0, false);
    stage = 0;
    nextIdleAt = now + random(2500, 6000);
  }
}

void showPairCode() {
  idleFace = false;
  Serial.printf("[NOOB] Pairing code: %d\n", pairCode);
  if (!oledOk) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Pairing code:");
  display.setTextSize(3);
  display.setCursor(28, 20);
  display.println(pairCode);
  display.setTextSize(1);
  display.setCursor(0, 54);
  display.println("Type it in NOOB App");
  display.display();
}

void haltWithError() {           // stop here; the reason is on the OLED + Serial Monitor
  while (true) delay(1000);
}

// ------------------------------------------------------------------ audio
bool setupMic() {
  i2s_chan_config_t chanCfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  if (i2s_new_channel(&chanCfg, NULL, &micChan) != ESP_OK) return false;

  i2s_std_config_t stdCfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,
      .bclk = (gpio_num_t)MIC_SCK,
      .ws   = (gpio_num_t)MIC_WS,
      .dout = I2S_GPIO_UNUSED,
      .din  = (gpio_num_t)MIC_SD,
      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
    },
  };
  stdCfg.slot_cfg.slot_mask = I2S_STD_SLOT_LEFT;   // INMP441 L/R pin tied to GND = left

  if (i2s_channel_init_std_mode(micChan, &stdCfg) != ESP_OK) return false;
  return i2s_channel_enable(micChan) == ESP_OK;
}

bool setupSpeaker() {
  i2s_chan_config_t chanCfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_1, I2S_ROLE_MASTER);
  chanCfg.auto_clear = true;   // play silence (not noise) when there is no data
  if (i2s_new_channel(&chanCfg, &spkChan, NULL) != ESP_OK) return false;

  i2s_std_config_t stdCfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,
      .bclk = (gpio_num_t)AMP_BCLK,
      .ws   = (gpio_num_t)AMP_LRC,
      .dout = (gpio_num_t)AMP_DIN,
      .din  = I2S_GPIO_UNUSED,
      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
    },
  };
  stdCfg.slot_cfg.slot_mask = I2S_STD_SLOT_BOTH;   // same sound on left + right

  if (i2s_channel_init_std_mode(spkChan, &stdCfg) != ESP_OK) return false;
  return i2s_channel_enable(spkChan) == ESP_OK;
}

// ------------------------------------------------------------------ Wi-Fi + pairing
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;
  
  showStatus("Connecting WiFi...", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  
  // Clear any active connection state before setting new config
  WiFi.disconnect();
  delay(100);
  
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(250);
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    showStatus("WiFi connected", WiFi.localIP().toString().c_str());
    if (!udpStarted) udpStarted = udp.begin(DEVICE_PORT);
  } else {
    showStatus("WiFi FAILED", "check name/password");
  }
}

void udpReply(const String& message) {
  udp.beginPacket(udp.remoteIP(), udp.remotePort());
  udp.print(message);
  udp.endPacket();
}

// Reads one UDP message into `msg`. Returns false if there is none.
bool readUdp(char* msg, size_t size) {
  if (!udpStarted || udp.parsePacket() <= 0) return false;
  int len = udp.read(msg, size - 1);
  if (len <= 0) return false;
  msg[len] = 0;
  while (len > 0 && (msg[len - 1] == '\n' || msg[len - 1] == '\r' || msg[len - 1] == ' ')) msg[--len] = 0;
  return true;
}

void savePairing(const String& url, const String& key) {
  serverUrl = url;
  deviceKey = key;
  prefs.putString("url", url);
  prefs.putString("key", key);
}

// Answers the NOOB App: "Connect to nearby devices".
void handleUdp() {
  char msg[300];
  if (!readUdp(msg, sizeof(msg))) return;

  if (strcmp(msg, "NOOB?DISCOVER") == 0) {
    udpReply("NOOB!DEVICE|" + deviceName + "|" + WiFi.macAddress() + "|" + (isPaired() ? "1" : "0") + "|" FW_VERSION);

  } else if (strcmp(msg, "NOOB?PAIRSTART") == 0) {
    if (pairUntil == 0) pairCode = 1000 + (esp_random() % 9000);   // keep the same code if asked again
    pairUntil = millis() + PAIR_WINDOW_MS;
    showPairCode();
    udpReply("NOOB!CODE");

  } else if (strncmp(msg, "NOOB?PAIR|", 10) == 0) {          // NOOB?PAIR|code|server_url|device_key
    char* code = strtok(msg + 10, "|");
    char* url  = strtok(NULL, "|");
    char* key  = strtok(NULL, "|");
    String paired = "NOOB!PAIRED|" + deviceName + "|" + WiFi.macAddress();
    if (!code || !url || !key) return;
    if (isPaired() && serverUrl == url && deviceKey == key) {   // already done (the reply was lost)
      udpReply(paired);
    } else if (pairUntil != 0 && atoi(code) == pairCode) {
      savePairing(url, key);
      pairUntil = 0;
      udpReply(paired);
      showStatus("Paired!", "saying hello to PC");
      lastPing = 0;                                  // say hello right away
    } else {
      udpReply("NOOB!BADCODE");
    }

  } else if (strncmp(msg, "NOOB?UNPAIR|", 12) == 0) {
    if (isPaired() && deviceKey == String(msg + 12)) {
      savePairing("", "");
      udpReply("NOOB!UNPAIRED");
      showReady();
    }
  }
}

// Asks the network where the NOOB server is (used when the PC's IP address changed).
bool findServer(bool quiet = false) {
  if (!udpStarted) return false;
  if (!quiet) showStatus("Looking for PC...", "");
  char msg[300];
  for (int attempt = 0; attempt < 3; attempt++) {
    udp.beginPacket(IPAddress(255, 255, 255, 255), SERVER_PORT);
    udp.print("NOOB?SERVER");
    udp.endPacket();
    unsigned long start = millis();
    while (millis() - start < 700) {
      if (readUdp(msg, sizeof(msg)) && strncmp(msg, "NOOB!SERVER|", 12) == 0) {
        savePairing(String(msg + 12), deviceKey);
        Serial.printf("[NOOB] Server found at %s\n", serverUrl.c_str());
        return true;
      }
      delay(10);
    }
  }
  return false;
}

// Says hello to the NOOB server, so the app shows NOOB as online and NOOB knows the PC is on.
void pingServer(bool retry = true) {
  if (!isPaired() || WiFi.status() != WL_CONNECTED) return;
  bool wasOnline = pcOnline;
  String url = serverUrl;
  url.replace("/ask", "/device/ping");
  HTTPClient http;
  http.begin(url);
  http.setConnectTimeout(2500);
  http.setTimeout(3000);
  http.addHeader("X-Device-Key", deviceKey);
  int code = http.GET();
  if (code == 200) {
    pcOnline = true;
    String body = http.getString();                  // {"name":"Padmanabh","ok":true}
    int start = body.indexOf("\"name\":\"");
    if (start >= 0) {
      start += 8;
      ownerName = body.substring(start, body.indexOf('"', start));
    }
  } else {
    pcOnline = false;
    if (code == 403) {                               // this PC no longer knows NOOB
      http.end();
      savePairing("", "");
      showReady();
      return;
    }
  }
  http.end();
  if (!pcOnline && retry && findServer(true)) {      // the PC may have a new IP address
    pingServer(false);
    return;
  }
  if (pcOnline != wasOnline && pairUntil == 0) showReady();
}

// ------------------------------------------------------------------ always listening (VAD)
// How it works: NOOB reads the microphone all the time. It measures how loud each short piece of
// sound is. When something clearly louder than the room noise lasts a moment, that is speech: NOOB
// starts recording (including the last 350 ms before, so the first word is not lost). When it is
// quiet for about a second, you have finished, and the recording is sent to the server.

enum { VAD_WAIT, VAD_REC };
int vadState = VAD_WAIT;
float noiseFloor = 40;                 // how loud the room is when nobody talks
size_t voiceRun = 0;                   // how long the sound has been loud (in samples)
size_t voicedSamples = 0;              // how much loud sound is in the current recording
size_t silenceSamples = 0;             // how long it has been quiet at the end of the recording
size_t recCount = 0;                   // samples in recBuf
size_t ringPos = 0, ringCount = 0;     // pre-roll ring buffer
unsigned long vadIgnoreUntil = 0;      // do not listen until this time (after speaking = echo)
unsigned long lastVoiceAt = 0;         // last time something loud was heard
unsigned long lastVadPrint = 0;
unsigned long tSpeechEnd = 0;          // when the end of your sentence was detected (for the [TIME] lines)
float dcPrevIn = 0, dcPrevOut = 0;     // DC-blocking filter state

static int32_t rawBlock[512];
static int16_t blockBuf[512];

// Reads one block of microphone sound into blockBuf. Returns the number of samples (0 = nothing).
size_t readBlock(float* level) {
  size_t bytesRead = 0;
  if (i2s_channel_read(micChan, rawBlock, sizeof(rawBlock), &bytesRead, 100) != ESP_OK || bytesRead == 0) return 0;
  size_t n = bytesRead / sizeof(int32_t);
  float sum = 0;
  for (size_t i = 0; i < n; i++) {
    float x = (float)(rawBlock[i] >> MIC_GAIN_SHIFT);
    float y = x - dcPrevIn + 0.995f * dcPrevOut;       // remove DC offset
    dcPrevIn = x; dcPrevOut = y;
    if (y > 32767.0f) y = 32767.0f;
    if (y < -32768.0f) y = -32768.0f;
    blockBuf[i] = (int16_t)y;
    sum += fabsf(y);
  }
  *level = sum / (float)n;
  return n;
}

// Throws away old sound that piled up while NOOB was busy.
void flushMic() {
  size_t bytesRead = 0;
  for (int i = 0; i < 60; i++) {
    if (i2s_channel_read(micChan, rawBlock, sizeof(rawBlock), &bytesRead, 0) != ESP_OK || bytesRead == 0) break;
  }
}

void vadReset() {
  vadState = VAD_WAIT;
  voiceRun = 0;
  voicedSamples = 0;
  silenceSamples = 0;
  recCount = 0;
  ringPos = 0;
  ringCount = 0;
  dcPrevIn = 0;
  dcPrevOut = 0;
}

float vadThreshold() {
  float t = noiseFloor * VAD_NOISE_MULT;
  return (t < VAD_MIN_LEVEL) ? (float)VAD_MIN_LEVEL : t;
}

void clampNoise() {
  if (noiseFloor > VAD_MAX_NOISE) noiseFloor = VAD_MAX_NOISE;
  if (noiseFloor < 1.0f) noiseFloor = 1.0f;
}

// Listens to the room for a moment (at start-up) to learn how loud it is.
void calibrateNoise() {
  float sum = 0;
  int blocks = 0;
  unsigned long start = millis();
  flushMic();
  while (millis() - start < 1200) {
    float level;
    if (readBlock(&level) > 0 && millis() - start > 200) { sum += level; blocks++; }
  }
  noiseFloor = blocks ? sum / blocks : 40.0f;
  clampNoise();
  Serial.printf("[VAD] room noise = %.0f, speech threshold = %.0f\n", noiseFloor, vadThreshold());
}

// Does one listening step. Returns true when a full sentence has been recorded (it is in recBuf,
// with recCount samples).
bool listenStep() {
  float level = 0;
  size_t n = readBlock(&level);
  if (n == 0) return false;
  if (millis() < vadIgnoreUntil) return false;          // cooldown (echo of NOOB's own voice)

  const size_t startSamples  = (size_t)SAMPLE_RATE * VAD_START_MS / 1000;
  const size_t endSamples    = (size_t)SAMPLE_RATE * VAD_END_SILENCE_MS / 1000;
  const size_t minSamples    = (size_t)SAMPLE_RATE * VAD_MIN_SPEECH_MS / 1000;
  const size_t keepSilence   = (size_t)SAMPLE_RATE * VAD_KEEP_TAIL_MS / 1000;
  float thr = vadThreshold();

  if (vadState == VAD_WAIT) {
    for (size_t i = 0; i < n; i++) {                     // keep the latest sound in the ring
      preRoll[ringPos] = blockBuf[i];
      ringPos = (ringPos + 1) % PREROLL_SAMPLES;
    }
    ringCount += n;
    if (ringCount > PREROLL_SAMPLES) ringCount = PREROLL_SAMPLES;

    if (level > thr) {
      voiceRun += n;
      lastVoiceAt = millis();
    } else {
      voiceRun = 0;
      noiseFloor = 0.97f * noiseFloor + 0.03f * level;   // slowly follow the room noise
      clampNoise();
    }

#if VAD_DEBUG
    if (millis() - lastVadPrint > 1000) {
      lastVadPrint = millis();
      Serial.printf("[VAD] level=%.0f  room=%.0f  threshold=%.0f\n", level, noiseFloor, thr);
    }
#endif

    if (voiceRun >= startSamples) {                      // speech started: begin recording
      size_t first = (ringPos + PREROLL_SAMPLES - ringCount) % PREROLL_SAMPLES;
      recCount = 0;
      for (size_t i = 0; i < ringCount; i++) recBuf[recCount++] = preRoll[(first + i) % PREROLL_SAMPLES];
      voicedSamples = voiceRun;
      silenceSamples = 0;
      vadState = VAD_REC;
      holdFaceUntil = 0;
      Serial.printf("[VAD] speech started (level %.0f)\n", level);
      showStateFace(16);                                 // listening face
    }
    return false;
  }

  // VAD_REC: recording a sentence
  for (size_t i = 0; i < n && recCount < MAX_SAMPLES; i++) recBuf[recCount++] = blockBuf[i];
  if (level >= thr * 0.7f) {
    silenceSamples = 0;
    if (level >= thr) voicedSamples += n;
  } else {
    silenceSamples += n;
  }

  bool done = (silenceSamples >= endSamples) || (recCount >= MAX_SAMPLES);
  if (!done) return false;

  vadState = VAD_WAIT;
  voiceRun = 0;
  ringCount = 0;
  ringPos = 0;
  if (voicedSamples < minSamples) {                      // too short: a click or a clap, not speech
    Serial.println("[VAD] ignored (too short)");
    recCount = 0;
    showReady();
    return false;
  }
  if (silenceSamples > keepSilence && recCount >= (silenceSamples - keepSilence)) {
    recCount -= (silenceSamples - keepSilence);          // cut most of the quiet at the end
  }
  tSpeechEnd = millis();
  Serial.printf("[VAD] sentence recorded: %u samples (%.1f s)\n", (unsigned)recCount, (float)recCount / SAMPLE_RATE);
  return true;
}

bool canListen() {
  return WiFi.status() == WL_CONNECTED && isPaired() && pcOnline && !micMuted && pairUntil == 0;
}

// ------------------------------------------------------------------ talking
// Everything written here goes straight to the speaker (16-bit samples, with the volume applied).
class SpeakerStream : public Stream {
 public:
  // Pressing the button while NOOB talks or plays a song stops it (the button must be let go first,
  // so the press that asked the question does not count).
  bool stopped = false;
  int faceId = 17;                 // face (or music waves) shown while speaking
  int phase = 0;                   // animation step for faces that move
  unsigned long startedAt = millis();   // when this audio started (for the automatic music waves)
  unsigned long lastAnim = 0;      // last time the face moved
  unsigned long lastViz = 0;       // last time the music waves moved
  unsigned long firstWriteAt = 0;  // when the first sound reached the speaker (for the [TIME] lines)
  uint32_t accSum = 0;             // loudness collected since the waves last moved
  uint32_t accCount = 0;

  size_t write(const uint8_t* data, size_t len) override {
    if (digitalRead(BUTTON_PIN) == HIGH) released = true;
    else if (released) stopped = true;
    if (stopped) return 0;                               // writeToStream() then ends the download
    if (firstWriteAt == 0 && len > 0) firstWriteAt = millis();

    // Long audio and the server did not choose a face: it is probably a song, so show the waves.
    if (AUTO_MUSIC_MS > 0 && faceId == 17 && millis() - startedAt > AUTO_MUSIC_MS) {
      faceId = MUSIC_ID;
      vizReset();
      Serial.println("[NOOB] long audio -> music waves");
    }

    if (faceId != MUSIC_ID && faceAnimates(faceId) && millis() - lastAnim > 300) {   // move the face a little
      lastAnim = millis();
      phase = (phase + 1) & 3;
      renderFace(faceId, phase, false);
    }

    static int16_t out[512];
    size_t count = 0, i = 0;
    if (hasCarry && len > 0) {                          // a sample that was split between two pieces
      int16_t s = (int16_t)(carry | (data[0] << 8));
      tally(s);
      out[count++] = scale(s);
      i = 1;
      hasCarry = false;
    }
    for (; i + 1 < len; i += 2) {
      int16_t s = (int16_t)(data[i] | (data[i + 1] << 8));
      tally(s);
      out[count++] = scale(s);
      if (count == 512) { play(out, count); count = 0; }
    }
    if (i < len) { carry = data[i]; hasCarry = true; }
    play(out, count);

    // Music: move the sound waves. This is done after the sound was handed to the speaker, so the
    // speaker keeps playing from its buffer while the screen is redrawn.
    if (faceId == MUSIC_ID && accCount > 0 && millis() - lastViz > VIZ_UPDATE_MS) {
      lastViz = millis();
      vizPush((float)accSum / (float)accCount);
      accSum = 0;
      accCount = 0;
      renderMusic();
    }
    return len;
  }
  size_t write(uint8_t b) override { return write(&b, 1); }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }

 private:
  uint8_t carry = 0;
  bool hasCarry = false;
  bool released = false;
  void tally(int16_t s) {                                // adds the size of one sample to the loudness
    accSum += (s < 0) ? (uint32_t)(-(int32_t)s) : (uint32_t)s;
    accCount++;
  }
  // Applies the volume. Values above 100% are boosted, and clipped so loud parts never wrap into noise.
  static int16_t scale(int16_t s) {
    int32_t v = ((int32_t)s * VOLUME_PERCENT) / 100;
    if (v > 32767)  v = 32767;
    if (v < -32768) v = -32768;
    return (int16_t)v;
  }
  static void play(const int16_t* samples, size_t count) {
    if (count == 0) return;
    size_t written = 0;
    i2s_channel_write(spkChan, samples, count * sizeof(int16_t), &written, portMAX_DELAY);
  }
};

int postAudio(HTTPClient& http, size_t samples) {
  http.begin(serverUrl);
  http.setConnectTimeout(8000);
  http.setTimeout(60000);   // NOOB may take a while to think / search
  http.collectHeaders(RESPONSE_HEADERS, 1);       // so we can read the X-Face header of the answer
  http.addHeader("Content-Type", "application/octet-stream");
  http.addHeader("X-Device-Key", deviceKey);
  return http.POST((uint8_t*)recBuf, samples * sizeof(int16_t));
}

// Sends audio to the server and plays the spoken reply as it arrives.
void askServerAndPlay(size_t samples) {
  connectWiFi();
  if (WiFi.status() != WL_CONNECTED) return;

  showStateFace(15);                        // thinking face
  HTTPClient http;
  unsigned long tReq = millis();
  int code = postAudio(http, samples);
  if (code < 0) {                           // PC not found: its IP address may have changed
    http.end();
    if (findServer()) {
      showStateFace(15);
      code = postAudio(http, samples);
    }
  }
  if (code != 200) {
    Serial.printf("[NOOB] HTTP error: %d (%s)\n", code, http.errorToString(code).c_str());
    if (code == 403)    { savePairing("", ""); showStatus("Not paired with PC", "pair again in app"); }
    else if (code < 0)  showStatus("PC not found", "is NOOB App open?");
    else                showStatus("Server error", "see NOOB App log");
    delay(2500);
    http.end();
    showReady();
    return;
  }

  // The server may choose NOOB's face (or the music waves) for this answer with the "X-Face" header.
  unsigned long tHeaders = millis();
  String faceHeader = http.header("X-Face");
  int face = faceFromString(faceHeader);
  bool serverFace = (face >= 0);
  if (!serverFace) face = 17;               // normal speaking face
  Serial.printf("[NOOB] X-Face header: '%s' -> face %d\n", faceHeader.c_str(), face);

  // The answer arrives sentence by sentence while the PC is still making the rest, so NOOB starts
  // speaking at once. writeToStream() unwraps the web "chunks" and passes pure audio to the speaker.
  showStateFace(face);
  SpeakerStream speaker;
  speaker.faceId = face;
  int result = http.writeToStream(&speaker);
#if TIMING_DEBUG
  if (speaker.firstWriteAt != 0) {
    Serial.printf("[TIME] waited for quiet: %d ms | send + server started answering: %lu ms | first sound after another: %lu ms\n",
                  (int)VAD_END_SILENCE_MS, tHeaders - tReq, speaker.firstWriteAt - tHeaders);
    Serial.printf("[TIME] TOTAL from the end of your speech to the first sound: about %lu ms\n",
                  (unsigned long)VAD_END_SILENCE_MS + (speaker.firstWriteAt - tSpeechEnd));
  }
#endif
  if (speaker.stopped) {
    Serial.println("[NOOB] Stopped by the button");
    showStatus("Stopped", "");
    while (digitalRead(BUTTON_PIN) == LOW) delay(10);    // wait until the button is let go
    delay(300);
  } else if (result < 0) {
    Serial.printf("[NOOB] Stream ended early: %s\n", http.errorToString(result).c_str());
  }

  http.end();
  pcOnline = true;
  if (serverFace && !speaker.stopped && face != MUSIC_ID) {
    renderFace(face, 0, false);              // keep the answer's feeling on screen for 3 seconds
    holdFaceUntil = millis() + 3000;
  } else {
    showReady();
  }
}

// ------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  Wire.begin(OLED_SDA, OLED_SCL);
  oledOk = display.begin(SSD1306_SWITCHCAPVCC, 0x3C) || display.begin(SSD1306_SWITCHCAPVCC, 0x3D);
  if (!oledOk) Serial.println("[NOOB] OLED not found - continuing without screen");

  showSplash();                 // "NOOB" full screen for 2 seconds
  delay(2000);

#if TEST_FACES_ON_BOOT
  for (int i = 0; i < NUM_FACES; i++) {
    hint1 = String(i);
    hint2 = FACE_NAMES[i];
    renderFace(i, 0, false);
    delay(1500);
  }
  hint1 = ""; hint2 = "";
#endif

#if TEST_MUSIC_ON_BOOT
  vizReset();
  for (unsigned long t0 = millis(); millis() - t0 < 5000; ) {          // pretend music for 5 seconds
    float t = (float)millis();
    float beat = fabsf(sinf(t / 180.0f)) * (0.5f + 0.5f * sinf(t / 53.0f));
    vizPush(300.0f + 5000.0f * beat);
    renderMusic();
    delay(VIZ_UPDATE_MS);
  }
#endif

  showStatus("Starting...", "");

  if (!psramFound()) {
    showStatus("NO PSRAM!", "Tools > PSRAM > OPI");
    haltWithError();
  }
  recBuf = (int16_t*)ps_malloc(MAX_SAMPLES * sizeof(int16_t));
  if (!recBuf) {
    showStatus("Memory error", "");
    haltWithError();
  }

  if (!setupMic())     { showStatus("Mic init failed", "");     haltWithError(); }
  if (!setupSpeaker()) { showStatus("Speaker init failed", ""); haltWithError(); }

  showStatus("Calibrating mic", "stay quiet 1 sec");
  calibrateNoise();
  vadReset();

  prefs.begin("noob", false);
  serverUrl = prefs.getString("url", "");
  deviceKey = prefs.getString("key", "");

  connectWiFi();
  String mac = WiFi.macAddress();              // e.g. "AA:BB:CC:DD:EE:FF" -> name "NOOB-EEFF"
  deviceName = "NOOB-" + mac.substring(12, 14) + mac.substring(15, 17);
  lastWifiTry = millis();
  pingServer();
  lastPing = millis();
  showReady();
}

void loop() {
  bool talking = (vadState == VAD_REC);       // while you are talking, do nothing that could delay the mic

  if (!talking) {
    handleUdp();

    if (pairUntil != 0 && (long)(millis() - pairUntil) > 0) {     // pairing code expired
      pairUntil = 0;
      showReady();
    }
    if (holdFaceUntil != 0 && (long)(millis() - holdFaceUntil) > 0) {   // done showing the answer's face
      holdFaceUntil = 0;
      showReady();
    }
    if (WiFi.status() != WL_CONNECTED && millis() - lastWifiTry > 30000) {
      lastWifiTry = millis();
      connectWiFi();
      showReady();
    }
    if (pairUntil == 0 && millis() - lastVoiceAt > 3000 &&
        millis() - lastPing > (pcOnline ? PING_ONLINE_MS : PING_OFFLINE_MS)) {
      lastPing = millis();
      pingServer();
    }

    idleAnimate();
  }

  // Button when NOOB is idle: mute / unmute the microphone (while speaking it means "stop").
  if (digitalRead(BUTTON_PIN) == LOW) {
    delay(30);                                   // debounce
    if (digitalRead(BUTTON_PIN) == LOW) {
      while (digitalRead(BUTTON_PIN) == LOW) delay(10);
      if (!isPaired()) {
        showStatus("Not paired yet", "NOOB App > Devices");
      } else {
        micMuted = !micMuted;
        vadReset();
        holdFaceUntil = 0;
        showReady();
      }
    }
  }

  static bool wasListening = false;
  if (canListen()) {
    if (!wasListening) {                         // just started listening: clean start
      wasListening = true;
      flushMic();
      vadReset();
      vadIgnoreUntil = millis() + 300;
    }
    if (listenStep()) {                          // a whole sentence was recorded
      askServerAndPlay(recCount);
      flushMic();                                // forget everything the mic heard while NOOB spoke
      vadReset();
      vadIgnoreUntil = millis() + VAD_COOLDOWN_MS;
    }
  } else {
    wasListening = false;
    if (vadState == VAD_REC) vadReset();
    delay(10);
  }
}

