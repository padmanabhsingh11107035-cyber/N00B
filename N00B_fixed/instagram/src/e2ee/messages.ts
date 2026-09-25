// The glue between the chat calls of the app and the encryption service: what to lock, how a locked message comes back as a normal one,
// and what happens when locking is not possible. (Kept apart from the network layer so it can be tested on its own.)
import type { E2ee, Payload } from './service.ts';
import type { Message } from '../types.ts';

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export const quoteOf = (m: Pick<Message, 'text' | 'mediaType' | 'mediaUrl'>): string =>
  (m.text || '').slice(0, 120) || (m.mediaType === 'sticker' ? 'Sticker' : m.mediaUrl ? 'Attachment' : '');

export interface SendInput {
  text?: string;
  storedMedia?: string; // the picture's address as it is stored: an object key for our own uploads, an https link for a GIF or sticker from elsewhere
  mediaType?: string;
  sharedTrack?: unknown;
  gameInvite?: unknown;
  sharedProfileUserId?: unknown;
  sharedPostId?: unknown;
  audioDuration?: unknown;
  scheduledAt?: string;
  replyToId?: string;
}

export function bindMessages(e2ee: E2ee) {
  // One message as it came from the database -> as a screen wants it. A locked message is opened here; when it can not be, it says why.
  async function unlockOne(chatId: string, m: any): Promise<Message> {
    if (!m?.e2ee) return m as Message;
    const { e2ee: envelope, ...rest } = m;
    const r = await e2ee.open(chatId, String(m.id), String(m.senderId), envelope);
    if (!r.ok) return { ...rest, encrypted: true, locked: r.code, text: '' } as Message;
    const p = r.payload as Payload;
    return { ...rest, encrypted: true, text: p.t, ...(p.m ? { mediaUrl: p.m, mediaType: (p.mt as Message['mediaType']) || 'image' } : {}) } as Message;
  }

  // Opens every locked message of a chat, and writes the quote of a reply to a locked message from what this device has opened
  // (the server can not read the original, so it never wrote a quote for it).
  async function unlockMessages(chatId: string, list: any[]): Promise<Message[]> {
    const out = await Promise.all(list.map((m) => unlockOne(chatId, m)));
    const byId = new Map(out.map((m) => [m.id, m]));
    return out.map((m) => {
      const q = m.replyTo;
      if (!q?.messageId || q.textPreview) return m;
      const original = byId.get(q.messageId);
      if (original) return original.encrypted && !original.locked ? { ...m, replyTo: { ...q, textPreview: quoteOf(original) } } : m;
      // (the original is not in this list, but this device may have opened it before: e.g. the reply that was just sent)
      const known = e2ee.payloadOf(q.messageId);
      return known ? { ...m, replyTo: { ...q, textPreview: quoteOf({ text: known.t, mediaUrl: known.m, mediaType: known.mt as Message['mediaType'] }) } } : m;
    });
  }

  // What to send for a new message: the locked form when the chat can be locked (and the message is a text or a link to a GIF / sticker),
  // or null when it goes out as before. When the chat SHOULD be locked and this can not be done, this throws: the message fails, it is never
  // sent readable instead. Pictures, video and voice notes are not locked yet.
  async function prepareSend(chatId: string, input: SendInput): Promise<Record<string, unknown> | null> {
    const lockable = !input.sharedTrack && !input.gameInvite && !input.sharedProfileUserId && !input.sharedPostId && !input.audioDuration && (!input.storedMedia || /^https:\/\//.test(input.storedMedia));
    if (!lockable) return null;
    let info;
    try { info = await e2ee.chatCryptoForSend(chatId); } catch { throw new Error('Could not check this chat\'s encryption. Please try again.'); }
    if (!info.encryptable && !info.mustLock) return null;
    const text = (input.text || '').trim();
    if (!text && !input.storedMedia) throw new Error('Message cannot be empty.');
    let env;
    try { env = await e2ee.encrypt(chatId, { t: text, ...(input.storedMedia ? { m: input.storedMedia, mt: input.mediaType || 'image' } : {}) }, info); }
    catch (err) { throw new Error(errorText(err, 'Could not lock this message, so it was not sent.')); }
    return { e2ee: env, scheduledAt: input.scheduledAt, replyTo: input.replyToId ? { messageId: input.replyToId } : undefined };
  }

  // The new locked form of an edited message (a picture link in it stays).
  async function prepareEdit(chatId: string, messageId: string, text: string) {
    const clean = (text || '').trim();
    if (!clean) throw new Error('Message text cannot be empty.');
    const before = e2ee.payloadOf(messageId);
    try { return await e2ee.encrypt(chatId, { t: clean, ...(before?.m ? { m: before.m, mt: before.mt } : {}) }); }
    catch (err) { throw new Error(errorText(err, 'Could not lock the edited message, so it was not changed.')); }
  }

  return { unlockOne, unlockMessages, prepareSend, prepareEdit };
}
