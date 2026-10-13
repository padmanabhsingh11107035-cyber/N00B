// NOOB STUDY: the tutor's answer arrives as one small JSON object per line. This reads them as they come. A half line waits for the rest, and a
// damaged line is skipped, never fatal. Pure, so it is tested without a browser.
export type ChatEvent =
  | { t: 'meta'; conversationId: string; userMessageId?: string }
  | { t: 'delta'; text: string }
  | { t: 'done'; messageId: string | null; remaining: number | null }
  | { t: 'error'; message: string };

export async function readNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: ChatEvent) => void): Promise<void> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const emit = (l: string) => { const s = l.trim(); if (!s) return; try { const e = JSON.parse(s); if (e && typeof e.t === 'string') onEvent(e as ChatEvent); } catch { /* a damaged line */ } };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) { emit(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  emit(buf);
}
