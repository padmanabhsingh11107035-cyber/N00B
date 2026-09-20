// Content protection for the NOOB website: makes it hard to save media and to capture the screen, and makes any capture
// traceable. It is a DETERRENT, not a guarantee, and it says so honestly:
//   * A website can not block the operating system's own screenshot or screen-recording tools. (The Android app can: see
//     MainActivity.java, which switches on Android's "secure window".)
//   * Anything a browser shows can be saved by someone determined enough.
// What it does:
//   * no "Save image / video as..." menu, no dragging media out of the page, no long-press save on phones, no download
//     button or picture-in-picture on videos, and printing / "save as PDF" produce a blank page;
//   * the screen goes black for a moment when a screenshot shortcut is pressed (PrintScreen, Win+Shift+S, Cmd+Shift+3/4/5) and
//     whenever the tab is hidden (so app-switcher previews show nothing);
//   * a faint tiled watermark with the viewer's @username covers everything, so a leaked screenshot points to who took it.
// The pure parts are exported so they can be tested without a browser.

export const MEDIA_SELECTOR = 'img, video, canvas, picture, [data-protect]';

export interface KeyLike {
  key?: string;
  code?: string;
  metaKey?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
}

// Is this key press a screenshot shortcut? (Only the shortcuts that are specific to capturing: never a plain letter or a
// common editing shortcut.)
export function isCaptureShortcut(e: KeyLike): boolean {
  const key = (e.key || '').toLowerCase();
  const code = e.code || '';
  if (key === 'printscreen' || code === 'PrintScreen') return true; // Windows / Linux, also with Ctrl or Alt
  if (e.metaKey && e.shiftKey && (key === 's' || code === 'KeyS')) return true; // Windows Snipping Tool (Win+Shift+S)
  if (e.metaKey && e.shiftKey && (code === 'Digit3' || code === 'Digit4' || code === 'Digit5')) return true; // macOS capture / recording
  return false;
}

// The attributes to put on a media element so the browser does not offer to download it or float it out of the page.
export function mediaAttributes(tag: string): Record<string, string> {
  const t = tag.toLowerCase();
  if (t === 'video') return { controlslist: 'nodownload noremoteplayback', disablepictureinpicture: '', disableremoteplayback: '', draggable: 'false' };
  if (t === 'img' || t === 'canvas' || t === 'picture') return { draggable: 'false' };
  return {};
}

// Is this element (or something inside it) protected media?
export function isProtectedTarget(target: { closest?: (selector: string) => unknown } | null | undefined): boolean {
  try {
    return !!target && typeof target.closest === 'function' && !!target.closest(MEDIA_SELECTOR);
  } catch {
    return false;
  }
}

const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] as string);

// One tile of the watermark: the text, tilted, in a grey that shows faintly on both the dark and the light theme.
export function watermarkTile(text: string): string {
  const safe = escapeXml(text.trim().slice(0, 40));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="170">` +
    `<text x="130" y="85" text-anchor="middle" font-family="system-ui,sans-serif" font-size="15" font-weight="700" ` +
    `fill="rgb(128,128,128)" fill-opacity="0.14" transform="rotate(-28 130 85)">${safe}</text></svg>`
  );
}

export const watermarkDataUri = (text: string): string => `data:image/svg+xml;utf8,${encodeURIComponent(watermarkTile(text))}`;

export const PROTECTION_CSS = `
img, video, canvas, picture { -webkit-user-drag: none; user-drag: none; -webkit-touch-callout: none; -webkit-user-select: none; user-select: none; }
@media print { html, body { display: none !important; } }
`;

export interface ProtectionOptions {
  // Who is looking, e.g. "@asha": printed faintly all over the screen
  watermarkText: string;
  // For tests: which document to protect
  doc?: Document;
}

const IDS = { style: 'noob-protect-style', mark: 'noob-protect-watermark', shield: 'noob-protect-shield' };

// One protection per page: switching it on again (another person logs in, the name changes) replaces the earlier one, so nothing
// is ever doubled up.
const active = new WeakMap<Document, () => void>();

// Switch the protection on. Returns a function that switches it off again and removes everything it added.
export function installContentProtection(options: ProtectionOptions): () => void {
  const doc = options.doc ?? document;
  active.get(doc)?.();
  const win = doc.defaultView ?? window;
  const undo: (() => void)[] = [];
  const on = <T extends EventTarget>(target: T, type: string, handler: (e: any) => void, opts?: AddEventListenerOptions | boolean) => {
    target.addEventListener(type, handler, opts);
    undo.push(() => target.removeEventListener(type, handler, opts));
  };

  // -- styles (media can not be dragged or selected; printing shows nothing)
  const style = doc.createElement('style');
  style.id = IDS.style;
  style.textContent = PROTECTION_CSS;
  doc.head.appendChild(style);
  undo.push(() => style.remove());

  // -- watermark (never gets in the way of a tap or a click)
  const mark = doc.createElement('div');
  mark.id = IDS.mark;
  mark.setAttribute('aria-hidden', 'true');
  mark.style.cssText = `position:fixed;inset:0;z-index:2147483000;pointer-events:none;background-repeat:repeat;background-image:url("${watermarkDataUri(options.watermarkText)}");`;
  doc.body.appendChild(mark);
  undo.push(() => mark.remove());

  // -- shield (a black cover)
  const shield = doc.createElement('div');
  shield.id = IDS.shield;
  shield.setAttribute('aria-hidden', 'true');
  shield.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;background:#000;color:#777;display:none;align-items:center;justify-content:center;font:600 14px system-ui,sans-serif;text-align:center;padding:24px;';
  shield.textContent = 'Content hidden for privacy';
  doc.body.appendChild(shield);
  undo.push(() => shield.remove());

  let holdTimer: number | undefined;
  const cover = () => {
    shield.style.display = 'flex';
  };
  const uncover = () => {
    shield.style.display = 'none';
  };
  const coverFor = (ms: number) => {
    cover();
    win.clearTimeout(holdTimer);
    holdTimer = win.setTimeout(() => {
      if (doc.visibilityState !== 'hidden') uncover();
    }, ms);
  };
  undo.push(() => win.clearTimeout(holdTimer));

  // -- screenshot shortcuts: cover the screen while the keys are down and for a moment after; also replace what PrintScreen
  //    put on the clipboard
  on(win, 'keydown', (e: KeyboardEvent) => {
    if (isCaptureShortcut(e)) coverFor(2500);
  }, true);
  on(win, 'keyup', (e: KeyboardEvent) => {
    if (isCaptureShortcut(e)) {
      coverFor(900);
      try {
        void win.navigator.clipboard?.writeText('Screenshots are not allowed on NOOB.').catch(() => {});
      } catch {
        // clipboard not available: nothing to replace
      }
    }
  }, true);

  // -- the tab is hidden (app switcher, another tab): nothing to preview
  on(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') cover();
    else uncover();
  });
  on(win, 'beforeprint', () => coverFor(1500));

  // -- saving media: no context menu, no dragging
  on(doc, 'contextmenu', (e: Event) => {
    if (isProtectedTarget(e.target as Element)) e.preventDefault();
  }, true);
  on(doc, 'dragstart', (e: Event) => {
    if (isProtectedTarget(e.target as Element)) e.preventDefault();
  }, true);

  // -- media already on the page and media added later
  const protect = (el: Element) => {
    for (const [name, value] of Object.entries(mediaAttributes(el.tagName))) if (!el.hasAttribute(name)) el.setAttribute(name, value);
  };
  const protectAll = (root: ParentNode) => root.querySelectorAll('img, video, canvas, picture').forEach(protect);
  protectAll(doc);
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      r.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        const el = node as Element;
        if (/^(IMG|VIDEO|CANVAS|PICTURE)$/.test(el.tagName)) protect(el);
        protectAll(el);
      });
    }
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  undo.push(() => observer.disconnect());

  const off = () => {
    if (active.get(doc) === off) active.delete(doc);
    while (undo.length) {
      try {
        undo.pop()!();
      } catch {
        // keep switching the rest off
      }
    }
  };
  active.set(doc, off);
  return off;
}
