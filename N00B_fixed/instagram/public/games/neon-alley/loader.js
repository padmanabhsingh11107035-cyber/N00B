const GODOT_CONFIG = {"args":[],"canvasResizePolicy":2,"emscriptenPoolSize":8,"ensureCrossOriginIsolationHeaders":true,"executable":"index","experimentalVK":false,"fileSizes":{"index.pck":31485628,"index.wasm":39514754},"focusCanvas":true,"gdextensionLibs":[],"godotPoolSize":4}; const GODOT_SCRIPT_URL = "index.js";
const WEB_CATALOGS = {"en":{"web.starting":"STARTING GAME","web.assembling":"ASSEMBLING RUNTIME","web.downloading":"DOWNLOADING GAME DATA","web.measuring":"MEASURING","web.calculating":"CALCULATING","web.ready":"READY","web.canvas":"Your browser does not support the canvas element.","web.kicker":"NEON ALLEY · LAST CALL","web.preparing":"PREPARING ENGINE","web.connecting":"CONNECTING","web.telemetry":"Download telemetry","web.speed":"SPEED","web.eta":"ETA","web.loading":"Loading the Web runtime…","web.retry_download":"RETRY DOWNLOAD","web.failed":"LOAD FAILED","web.offline":"OFFLINE","web.retry":"RETRY","web.cold":"Connecting to game storage. This can take longer on a cold deployment…","web.initializing":"{percent} received. Initializing the {size} runtime…","web.slow":"Loading is taking longer than expected. You can retry safely.","web.missing":"This browser is missing required features: {features}","web.download_pack":"Downloading engine and game pack…","web.complete":"COMPLETE","web.runtime_ready":"Runtime ready.","web.runtime_error":"The game could not start. Please retry or use a WebGL 2 compatible browser.","web.engine_error":"The game engine could not be downloaded. Check your connection and retry.","web.seconds":"{count}s","web.minutes":"{count}m","web.hours":"{count}h","web.loading_notice":"Still loading. You can keep waiting or retry.","web.stalled_notice":"No recent loading progress. You can keep waiting or retry."},"zh-CN":{"web.starting":"正在启动游戏","web.assembling":"正在准备运行环境","web.downloading":"正在下载游戏数据","web.measuring":"测速中","web.calculating":"计算中","web.ready":"已就绪","web.canvas":"您的浏览器不支持画布元素。","web.kicker":"霓虹街头：最后一夜","web.preparing":"正在准备引擎","web.connecting":"连接中","web.telemetry":"下载状态","web.speed":"速度","web.eta":"预计剩余","web.loading":"正在加载网页运行环境…","web.retry_download":"重新下载","web.failed":"加载失败","web.offline":"未连接","web.retry":"重试","web.cold":"正在连接游戏存储。首次加载可能需要更长时间…","web.initializing":"已接收 {percent}。正在初始化 {size} 的运行环境…","web.slow":"加载时间超出预期。您可以安全重试。","web.missing":"此浏览器缺少必要功能：{features}","web.download_pack":"正在下载引擎和游戏资源包…","web.complete":"已完成","web.runtime_ready":"运行环境已就绪。","web.runtime_error":"游戏无法启动。请重试或使用支持 WebGL 2 的浏览器。","web.engine_error":"无法下载游戏引擎。请检查网络连接后重试。","web.seconds":"{count}秒","web.minutes":"{count}分","web.hours":"{count}小时","web.loading_notice":"仍在加载。可以继续等待，或重试。","web.stalled_notice":"暂未看到新的加载进度。可以继续等待，或重试。"}};
// WEB_CATALOGS is generated from the same English/Chinese catalogs used by Godot.
function normalizeWebLocale(value) {
  const locale = String(value || '').replaceAll('_', '-').toLowerCase();
  if (locale === 'zh' || /^zh-(cn|sg|hans)/.test(locale)) return 'zh-CN';
  if (locale.startsWith('en')) return 'en';
  return null;
}
function selectWebLocale(search, storage, language) {
  const explicit = normalizeWebLocale(new URLSearchParams(search).get('locale'));
  if (explicit) return explicit;
  try {
    const saved = normalizeWebLocale(storage?.getItem('neon-alley.locale'));
    if (saved) return saved;
  } catch { /* Browser storage may be disabled. */ }
  // No explicit or saved choice: any Chinese browser preference selects Chinese.
  return String(language || '').toLowerCase().startsWith('zh') ? 'zh-CN' : 'en';
}
let webLocale = selectWebLocale(window.location.search, {
  getItem: key => window.localStorage.getItem(key)
}, (window.navigator.languages && window.navigator.languages[0]) || window.navigator.language);
window.protoScrollerLocale = webLocale;
document.documentElement.lang = webLocale;
window.protoScrollerSetLocale = function(locale, automatic = false) {
  webLocale = normalizeWebLocale(locale) || 'en';
  window.protoScrollerLocale = webLocale;
  document.documentElement.lang = webLocale;
  try {
    if (automatic) window.localStorage.removeItem('neon-alley.locale');
    else window.localStorage.setItem('neon-alley.locale', webLocale);
  } catch { /* Gameplay and localization work without writable storage. */ }
};
function webT(key, values = {}) {
  const text = WEB_CATALOGS[webLocale]?.[key] ?? WEB_CATALOGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (match, name) => String(values[name] ?? match));
}

// Adapted from the supplied Proto Scroller client: loading progress and static title/audio bridge.

function createGodotFileSizes(
  executable        ,
  mainPack        ,
  wasmBytes        ,
  packBytes
)                 {
  return {
    [`${executable}.wasm`]: wasmBytes,
    [mainPack]: packBytes,
  };
}

function calculateLoadingPercent(
  currentBytes        ,
  totalBytes
)                {
  if (!Number.isFinite(currentBytes) || !Number.isFinite(totalBytes)) {
    return null;
  }
  if (currentBytes < 0 || totalBytes <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((currentBytes / totalBytes) * 100)));
}

function loadingStage(percent        )         {
  if (percent >= 100) return webT("web.starting");
  return webT("web.downloading");
}

function formatDownloadSpeed(bytesPerSecond               )         {
  if (bytesPerSecond === null || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return webT("web.measuring");
  }
  if (bytesPerSecond >= 1_048_576) {
    return `${(bytesPerSecond / 1_048_576).toFixed(1)} MiB/s`;
  }
  if (bytesPerSecond >= 1_024) {
    return `${(bytesPerSecond / 1_024).toFixed(1)} KiB/s`;
  }
  return `${Math.round(bytesPerSecond)} B/s`;
}

function formatEta(etaSeconds               )         {
  if (etaSeconds === null || !Number.isFinite(etaSeconds) || etaSeconds < 0) {
    return webT("web.calculating");
  }
  if (etaSeconds === 0) return webT("web.ready");
  const totalSeconds = Math.max(1, Math.ceil(etaSeconds));
  if (totalSeconds < 60) return webT("web.seconds", {count: totalSeconds});
  if (totalSeconds < 3_600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? webT("web.minutes", {count: minutes}) : webT("web.minutes", {count: minutes}) + " " + webT("web.seconds", {count: seconds});
  }
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.ceil((totalSeconds % 3_600) / 60);
  return minutes === 0 ? webT("web.hours", {count: hours}) : webT("web.hours", {count: hours}) + " " + webT("web.minutes", {count: minutes});
}

class DownloadTelemetryTracker {
                   smoothingFactor        ;
                   minimumSampleMs        ;
          lastBytes                = null;
          lastTimestampMs                = null;
          smoothedBytesPerSecond                = null;

  constructor(smoothingFactor = 0.25, minimumSampleMs = 250) {
    this.smoothingFactor = Math.min(1, Math.max(0.01, smoothingFactor));
    this.minimumSampleMs = Math.max(0, minimumSampleMs);
  }

  sample(currentBytes        , totalBytes        , timestampMs        )                    {
    if (
      !Number.isFinite(currentBytes) ||
      !Number.isFinite(totalBytes) ||
      !Number.isFinite(timestampMs) ||
      currentBytes < 0 ||
      totalBytes <= 0
    ) {
      return { bytesPerSecond: null, etaSeconds: null };
    }

    if (
      this.lastBytes === null ||
      this.lastTimestampMs === null ||
      currentBytes < this.lastBytes ||
      timestampMs < this.lastTimestampMs
    ) {
      this.lastBytes = currentBytes;
      this.lastTimestampMs = timestampMs;
      this.smoothedBytesPerSecond = null;
      return this.currentEstimate(currentBytes, totalBytes);
    }

    const elapsedMs = timestampMs - this.lastTimestampMs;
    const downloadedBytes = currentBytes - this.lastBytes;
    if (elapsedMs >= this.minimumSampleMs && downloadedBytes > 0) {
      const instantaneousBytesPerSecond = downloadedBytes / (elapsedMs / 1_000);
      this.smoothedBytesPerSecond = this.smoothedBytesPerSecond === null
        ? instantaneousBytesPerSecond
        : this.smoothingFactor * instantaneousBytesPerSecond +
          (1 - this.smoothingFactor) * this.smoothedBytesPerSecond;
      this.lastBytes = currentBytes;
      this.lastTimestampMs = timestampMs;
    }

    return this.currentEstimate(currentBytes, totalBytes);
  }

          currentEstimate(currentBytes        , totalBytes        )                    {
    const remainingBytes = Math.max(0, totalBytes - currentBytes);
    const etaSeconds = remainingBytes === 0
      ? 0
      : this.smoothedBytesPerSecond === null || this.smoothedBytesPerSecond <= 0
        ? null
        : remainingBytes / this.smoothedBytesPerSecond;
    return {
      bytesPerSecond: this.smoothedBytesPerSecond,
      etaSeconds,
    };
  }
}

const DESKTOP_MAX_WIDTH = 1600;
const DESKTOP_MAX_HEIGHT = 900;
const PERFORMANCE_MAX_WIDTH = 1280;
const PERFORMANCE_MAX_HEIGHT = 720;

function positiveDimension(value        )         {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, value);
}

function calculateWebRenderResolution(
  cssWidth        ,
  cssHeight        ,
  devicePixelRatio        ,
  tier
)                      {
  const safeCssWidth = positiveDimension(cssWidth);
  const safeCssHeight = positiveDimension(cssHeight);
  const safeDevicePixelRatio = positiveDimension(devicePixelRatio);
  const desiredWidth = safeCssWidth * safeDevicePixelRatio;
  const desiredHeight = safeCssHeight * safeDevicePixelRatio;
  const landscapeMaxWidth =
    tier === "performance" ? PERFORMANCE_MAX_WIDTH : DESKTOP_MAX_WIDTH;
  const landscapeMaxHeight =
    tier === "performance" ? PERFORMANCE_MAX_HEIGHT : DESKTOP_MAX_HEIGHT;
  const portrait = safeCssHeight > safeCssWidth;
  const maxWidth = portrait ? landscapeMaxHeight : landscapeMaxWidth;
  const maxHeight = portrait ? landscapeMaxWidth : landscapeMaxHeight;
  const scale = Math.min(1, maxWidth / desiredWidth, maxHeight / desiredHeight);

  return {
    cssWidth: safeCssWidth,
    cssHeight: safeCssHeight,
    devicePixelRatio: safeDevicePixelRatio,
    width: Math.max(1, Math.round(desiredWidth * scale)),
    height: Math.max(1, Math.round(desiredHeight * scale)),
    tier,
  };
}

function selectWebRenderTier(
  requestedTier               ,
  touchPoints
)                {
  if (requestedTier === "performance") return "performance";
  if (requestedTier === "desktop") return "desktop";
  return touchPoints > 0 ? "performance" : "desktop";
}

const ENGINE_SCRIPT_ID = "proto-scroller-godot-engine";
const ENGINE_WASM_BYTES = GODOT_CONFIG.fileSizes[GODOT_CONFIG.executable + '.wasm'] || 0;
const GAME_PACK_BYTES = GODOT_CONFIG.fileSizes[GODOT_CONFIG.mainPack || GODOT_CONFIG.executable + '.pck'] || 0;
const SLOW_LOAD_NOTICE_MS = 15_000;
const STALLED_LOAD_NOTICE_MS = 30_000;
const searchParameters = new URLSearchParams(window.location.search);
const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing game root element.");
}

root.innerHTML = `
  <main class="game-host">
    <div id="title-poster-backdrop" class="title-poster-backdrop" aria-hidden="true"></div>
    <canvas id="canvas" class="game-canvas" tabindex="0" aria-label="Neon Alley: Last Call">
      ${webT("web.canvas")}
    </canvas>
    <section id="runtime-state" class="runtime-state" role="status" aria-live="polite">
      <div class="loader-console">
        <div class="loader-brand">
          <img class="loader-favicon" src="./loader-icon.png" alt="" />
          <div>
            <p class="loader-kicker">${webT("web.kicker")}</p>
            <h1 class="loader-title">Neon Alley: Last Call</h1>
          </div>
        </div>
        <p id="loader-stage" class="loader-stage">${webT("web.preparing")}</p>
        <div class="loader-progress-row">
          <progress id="loader-progress" class="loader-progress" max="100"></progress>
          <span id="loader-percent" class="loader-percent">${webT("web.connecting")}</span>
        </div>
        <dl class="loader-telemetry" aria-label="${webT('web.telemetry')}">
          <div class="loader-telemetry-item">
            <dt>${webT("web.speed")}</dt>
            <dd id="loader-speed">${webT("web.measuring")}</dd>
          </div>
          <div class="loader-telemetry-item">
            <dt>${webT("web.eta")}</dt>
            <dd id="loader-eta">${webT("web.calculating")}</dd>
          </div>
        </dl>
        <p id="loader-detail" class="loader-detail">${webT("web.loading")}</p>
        <p id="loader-notice" class="loader-detail" hidden></p>
        <button id="loader-retry" class="loader-retry" type="button" hidden>${webT("web.retry_download")}</button>
      </div>
    </section>
  </main>
`;

function requireElement                       (id        )    {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing loader element: ${id}`);
  return element     ;
}

const canvas = requireElement                   ("canvas");
// Static title artwork preserves the command-deck mood without video downloads.
// Keep the host title lifecycle hooks, but never gate launch on media playback.
const trackedAudioContexts = new Set();
let titleScheduleGeneration = 0;
let titleScheduleTimer = 0;

function installAudioContextTracking() {
  const NativeAudioContext = window.AudioContext ?? window.webkitAudioContext;
  if (!NativeAudioContext || NativeAudioContext.__protoScrollerWrapped) return;
  class WrappedAudioContext extends NativeAudioContext {
    constructor(options) {
      super(options);
      trackedAudioContexts.add(this);
    }
  }
  WrappedAudioContext.__protoScrollerWrapped = true;
  window.AudioContext = WrappedAudioContext;
  if (window.webkitAudioContext) window.webkitAudioContext = WrappedAudioContext;
}
installAudioContextTracking();

window.protoScrollerResumeTitleAudio = () => {
  const contexts = [...trackedAudioContexts];
  const telemetry = window.__PROTO_SCROLLER_TITLE_MUSIC_SYNC__ ??= {
    sourceKind: "static-poster", committed: false, commitStatus: "queued-at-title"
  };
  // Resuming within the interaction preserves browser audio unlock. An unavailable
  // or suspended audio device must not delay the playable scene.
  Promise.all(contexts.map(context => context.resume())).then(() => {
    telemetry.audioContextState = contexts.find(context => context.state === "running")?.state || "unavailable";
  }).catch(() => {
    telemetry.audioContextState = "resume-rejected";
  });
  return contexts.length > 0;
};
window.protoScrollerMarkTitleMusicPrewarm = status => {
  const telemetry = window.__PROTO_SCROLLER_TITLE_MUSIC_SYNC__;
  if (telemetry) telemetry.prewarmStatus = status;
};
window.protoScrollerCancelTitleBeatCommit = (reason = "host-cancelled") => {
  titleScheduleGeneration += 1;
  if (titleScheduleTimer) window.clearTimeout(titleScheduleTimer);
  titleScheduleTimer = 0;
  const telemetry = window.__PROTO_SCROLLER_TITLE_MUSIC_SYNC__;
  if (telemetry && !telemetry.committed) {
    telemetry.cancelled = true;
    telemetry.cancelReason = reason;
    telemetry.commitStatus = "cancelled";
  }
};
window.protoScrollerScheduleTitleBeatCommit = (commitCallback, calibrationCallback) => {
  window.protoScrollerCancelTitleBeatCommit("rescheduled");
  const generation = titleScheduleGeneration;
  const telemetry = window.__PROTO_SCROLLER_TITLE_MUSIC_SYNC__ = {
    sourceKind: "static-poster", committed: false, commitStatus: "scheduled",
    cancelled: false, prewarmStatus: "not-required"
  };
  window.protoScrollerResumeTitleAudio();
  titleScheduleTimer = window.setTimeout(() => {
    if (generation !== titleScheduleGeneration) return;
    titleScheduleTimer = 0;
    telemetry.commitStatus = "callback-invoked";
    calibrationCallback?.("scheduled", 0);
    commitCallback();
    if (generation !== titleScheduleGeneration) return;
    telemetry.committed = true;
    telemetry.commitStatus = "complete";
    calibrationCallback?.("complete");
  }, 0);
  return true;
};
const runtimeState = requireElement             ("runtime-state");
const loaderStage = requireElement             ("loader-stage");
const loaderProgress = requireElement                     ("loader-progress");
const loaderPercent = requireElement             ("loader-percent");
const loaderSpeed = requireElement             ("loader-speed");
const loaderEta = requireElement             ("loader-eta");
const loaderDetail = requireElement             ("loader-detail");
const loaderNotice = requireElement("loader-notice");
const loaderRetry = requireElement                   ("loader-retry");
const renderTier = selectWebRenderTier(
  searchParameters.get("renderTier"),
  navigator.maxTouchPoints
);
let resizeFrame = 0;
let loadingComplete = false;
let loadingFailed = false;
const loadingStartedAt = performance.now();
let lastLoadingProgressAt = loadingStartedAt;
let downloadedBytes = 0;
let downloadComplete = false;
let latestPercent                = null;
const downloadTelemetry = new DownloadTelemetryTracker();

window.protoScrollerSetTitleBackdropActive = active => {
  document.body.classList.toggle("title-backdrop-active", active);
};
window.protoScrollerSetTitleBackdropActive(true);

loaderRetry.addEventListener("click", () => window.location.reload());

function updateCanvasResolution()       {
  const bounds = canvas.getBoundingClientRect();
  const resolution = calculateWebRenderResolution(
    bounds.width || window.innerWidth,
    bounds.height || window.innerHeight,
    window.devicePixelRatio,
    renderTier
  );

  if (canvas.width !== resolution.width) canvas.width = resolution.width;
  if (canvas.height !== resolution.height) canvas.height = resolution.height;
  canvas.dataset.renderTier = resolution.tier;
  canvas.dataset.renderResolution = `${resolution.width}x${resolution.height}`;
  window.protoScrollerResolution = resolution;
}

function queueCanvasResolutionUpdate()       {
  window.cancelAnimationFrame(resizeFrame);
  resizeFrame = window.requestAnimationFrame(updateCanvasResolution);
}

function formatMebibytes(bytes        )         {
  return `${(bytes / 1_048_576).toFixed(1)} MiB`;
}

function showDownloadProgress(current        , total        )       {
  if (loadingFailed || loadingComplete) return;
  if (Number.isFinite(current) && current > downloadedBytes) {
    downloadedBytes = current;
    lastLoadingProgressAt = performance.now();
  }
  if (!downloadComplete && Number.isFinite(total) && total > 0 && Number.isFinite(current) && current >= total) {
    downloadComplete = true;
    lastLoadingProgressAt = performance.now();
  }
  updateLoadingNotice();
  const percent = calculateLoadingPercent(current, total);
  const telemetry = downloadTelemetry.sample(current, total, performance.now());
  latestPercent = percent;
  if (percent === null) {
    loaderProgress.removeAttribute("value");
    loaderPercent.textContent = webT("web.connecting");
    loaderSpeed.textContent = webT("web.measuring");
    loaderEta.textContent = webT("web.calculating");
    return;
  }

  loaderProgress.value = percent;
  loaderPercent.textContent = `${percent}%`;
  loaderSpeed.textContent = formatDownloadSpeed(telemetry.bytesPerSecond);
  loaderEta.textContent = formatEta(telemetry.etaSeconds);
  loaderStage.textContent = loadingStage(percent);
  loaderDetail.textContent = `${formatMebibytes(current)} / ${formatMebibytes(total)}`;
}

function showError(message        )       {
  if (loadingFailed || loadingComplete) return;
  loadingFailed = true;
  stopLoadingWatch();
  loaderNotice.hidden = true;
  console.error(message);
  runtimeState.classList.add("is-error");
  loaderStage.textContent = webT("web.failed");
  loaderPercent.textContent = webT("web.offline");
  loaderSpeed.textContent = "—";
  loaderEta.textContent = webT("web.retry");
  loaderDetail.textContent = message;
  loaderProgress.hidden = true;
  loaderRetry.hidden = false;
}

function nextPaint()                {
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

updateCanvasResolution();
window.addEventListener("resize", queueCanvasResolutionUpdate, {
  passive: true,
});

function updateLoadingNotice() {
  if (loadingFailed || loadingComplete || performance.now() - loadingStartedAt < SLOW_LOAD_NOTICE_MS) return;
  loaderNotice.hidden = false;
  const message = webT(performance.now() - lastLoadingProgressAt >= STALLED_LOAD_NOTICE_MS ? "web.stalled_notice" : "web.loading_notice");
  if (loaderNotice.textContent !== message) loaderNotice.textContent = message;
  loaderRetry.hidden = false;
}
const onStartupError = event => {
  console.error(event.error || event.reason || event);
  showError(webT("web.runtime_error"));
};
const loadingWatch = window.setInterval(updateLoadingNotice, 1000);
function stopLoadingWatch() {
  window.clearInterval(loadingWatch);
  window.removeEventListener("error", onStartupError);
  window.removeEventListener("unhandledrejection", onStartupError);
}
window.addEventListener("error", onStartupError);
window.addEventListener("unhandledrejection", onStartupError);

async function startEngine()                {
  if (loadingFailed) return;
  lastLoadingProgressAt = performance.now();
  try {
  const Engine = window.Engine;
  if (!Engine) return;

  const missing = Engine.getMissingFeatures({ threads: false });
  if (missing.length > 0) {
    showError(webT("web.missing", {features: missing.join(", ")}));
    return;
  }

  const engine = new Engine({ ...GODOT_CONFIG, canvas, canvasResizePolicy: 0 });

  loaderStage.textContent = webT("web.downloading");
  loaderDetail.textContent = webT("web.download_pack");

    await engine.startGame({ onProgress: showDownloadProgress });
    if (loadingFailed) return;
    loadingComplete = true;
    stopLoadingWatch();
    loaderNotice.hidden = true;
    loaderRetry.hidden = true;
    loaderStage.textContent = webT("web.starting");
    loaderPercent.textContent = "100%";
    loaderSpeed.textContent = webT("web.complete");
    loaderEta.textContent = webT("web.ready");
    loaderProgress.value = 100;
    loaderDetail.textContent = webT("web.runtime_ready");
    canvas.classList.add("is-ready");
    await nextPaint();
    await nextPaint();
    runtimeState.remove();
    canvas.focus();
    window.protoScrollerSetTitleBackdropActive(true);
  } catch (runtimeError) {
    console.error(runtimeError);
    showError(webT("web.runtime_error"));
  }
}

if (window.Engine) {
  void startEngine();
} else {
  const script = document.createElement("script");
  script.id = ENGINE_SCRIPT_ID;
  script.src = GODOT_SCRIPT_URL;
  script.async = true;
  script.addEventListener("load", () => void startEngine(), { once: true });
  script.addEventListener(
    "error",
    () => showError(webT("web.engine_error")),
    { once: true }
  );
  document.head.appendChild(script);
}
