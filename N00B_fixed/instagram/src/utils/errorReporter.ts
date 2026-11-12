import { supabase } from '../services/supabase';
import { isNativeApp } from './siteUrl';
import {
  clientFingerprint, createGate, cutMessage, cutNote, cutOther, cutStack, detectPlatform, isNoise, pathOnly, scrubText,
  type ReportPlatform
} from './errorReporterCore';

declare const __BUILD_ID__: string;

// Automatic error reports. One tiny module: it listens for errors nobody caught, and sends a SHORT report to our own database (function report_client_error).
// Sent: what kind, the error text, the top of the stack, the page PATH (no query string, no #), the app version, the kind of device, the browser name string and, from the login, the user id.
// Never sent: e-mails, message texts, tokens, screenshots. Reporting must never cause an error itself, so everything here is wrapped.
export function appVersion(): string {
  try { return typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev'; } catch { return 'dev'; }
}
export function currentPlatform(): ReportPlatform {
  try {
    return detectPlatform({
      native: isNativeApp(), ua: navigator.userAgent, platform: navigator.platform, touchPoints: navigator.maxTouchPoints,
      standalone: (navigator as unknown as { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches
    });
  } catch { return 'web'; }
}
export function currentPage(): string {
  try { return pathOnly(location.pathname); } catch { return ''; }
}

export type ReportKind = 'error' | 'rejection' | 'boundary' | 'user_report';
const allow = createGate();
let installed = false;

async function send(kind: ReportKind, message: string, stack: string | undefined, note?: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('report_client_error', {
      p_kind: kind,
      p_message: cutMessage(scrubText(message)),
      p_stack: stack ? cutStack(scrubText(stack)) : null,
      p_page: cutOther(currentPage()),
      p_app_version: cutOther(appVersion()),
      p_platform: currentPlatform(),
      p_user_agent: cutOther(navigator.userAgent),
      p_note: note ? cutNote(note) : null
    });
    return !error;
  } catch { return false; }
}

/** An automatic report (error, rejection, boundary). Ignores noise, sends the same error once per page load, at most 10 per page load. */
export function reportError(kind: Exclude<ReportKind, 'user_report'>, err: unknown, source?: string): void {
  try {
    const message = err instanceof Error ? err.message || err.name : typeof err === 'string' ? err : (() => { try { return JSON.stringify(err) ?? String(err); } catch { return String(err); } })();
    const stack = err instanceof Error ? err.stack : undefined;
    const online = typeof navigator === 'undefined' ? true : navigator.onLine !== false;
    if (isNoise({ message, stack, source }, online, typeof location === 'undefined' ? '' : location.origin)) return;
    if (!allow(clientFingerprint(kind, message, stack))) return;
    void send(kind, message, stack);
  } catch { /* never throw from the reporter */ }
}

/** What a person wrote in "Report a problem". Returns true when it was handed to the server. */
export async function sendUserReport(note: string): Promise<boolean> {
  return send('user_report', 'User report', undefined, note);
}

export function installErrorReporter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  try {
    window.addEventListener('error', (e: ErrorEvent) => { reportError('error', e.error ?? e.message, e.filename); });
    window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => { reportError('rejection', e.reason ?? 'Unhandled promise rejection'); });
  } catch { /* nothing to do */ }
}
