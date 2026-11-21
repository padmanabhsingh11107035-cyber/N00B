import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ErrorDialog } from '../components/Common/ErrorDialog';

// Opens the error box (a message and an OK button) from anywhere, in place of a banner at the top or the browser's own alert(). One box at a time: a newer message replaces the one on screen.
let host: HTMLDivElement | null = null;
let root: Root | null = null;
let pendingOk: (() => void) | undefined;

export function closeErrorDialog(): void {
  if (root) { root.unmount(); root = null; }
  if (host && host.parentNode) host.parentNode.removeChild(host);
  host = null;
}

export function showErrorDialog(message: string, opts: { title?: string; onOk?: () => void } = {}): void {
  if (typeof document === 'undefined' || !message) return;
  pendingOk = opts.onOk;
  if (!host) {
    host = document.createElement('div');
    host.setAttribute('data-noob-keep', '1');
    document.body.appendChild(host);
    root = createRoot(host);
  }
  const ok = () => { const cb = pendingOk; pendingOk = undefined; closeErrorDialog(); try { cb?.(); } catch { /* the caller's own callback */ } };
  root!.render(<ErrorDialog title={opts.title || 'Something needs your attention'} message={message} onOk={ok} />);
}
