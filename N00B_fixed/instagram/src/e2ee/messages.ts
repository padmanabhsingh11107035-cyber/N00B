// The glue between the chat calls of the app and the encryption service: what to lock, how a locked message comes back as a normal one,
// and what happens when locking is not possible. (Kept apart from the network layer so it can be tested on its own.)
import type { E2ee, Payload } from './service.ts';
import type { Message } from '../types.ts';
import { isSealedKey, parseDescriptor, type SealedMedia } from './media.ts';

const errorText = (err: unknown, fallback: string) => (err instanceof Error && err.message ? err.message : fallback);

export const quoteOf = (m: Pick<Message, 'text' | 'mediaType' | 'mediaUrl'> & { sealed?: unknown }): string =>
  (m.text || '').slice(0, 120) || (m.mediaType === 'sticker' ? 'Sticker' : m.sealed ? (m.mediaType === 'audio' ? 'Voice message' : m.mediaType === 'video' ? 'Video' : 'Photo') : m.mediaUrl ? 'Attachment' : '');

/** The words for a locked attachment where its content must never show (chat list, quotes, notices). */
export const sealedLabel = (mediaType?: string): string => (mediaType === 'audio' ? 'Voice message' : mediaType === 'video' ? 'Video' : 'Photo');

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
  // a picture / video / voice note that was ALREADY locked on this device and uploaded (key = where the locked file is stored)
  sealed?: { key: string; desc: SealedMedia };
}

export function bindMessages(e2ee: E2ee) {
  // One message as it came from the database -> as a screen wants it. A locked message is opened here; when it can not be, it says why.
  async function unlockOne(chatId: string, m: any): Promise<Message> {
    if (!m?.e2ee) return m as Message;
    const { e2ee: envelope, ...rest } = m;
    const r = await e2ee.open(chatId, String(m.id), String(m.senderId), envelope);
    if (!r.ok) return { ...rest, encrypted: true, locked: r.code, text: '' } as Message;
    const p = r.payload as Payload;
    if (p.s && p.m) {
      // a locked picture / video / voice note: the file itself is fetched and opened later, only when the person asks (see SealedAttachment)
      const { mediaUrl: _drop, ...clean } = rest as any;
      return { ...clean, encrypted: true, text: p.t, mediaType: (p.mt as Message['mediaType']) || 'image', ...(p.s.dur ? { audioDuration: p.s.dur } : {}), sealed: { key: p.m, desc: p.s } } as Message;
    }
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
      return known ? { ...m, replyTo: { ...q, textPreview: quoteOf({ text: known.t, mediaUrl: known.s ? undefined : known.m, mediaType: known.mt as Message['mediaType'], sealed: known.s }) } } : m;
    });
  }

  // What to send for a new message: the locked form when the chat can be locked (and the message is a text, a link to a GIF / sticker, or a picture / video /
  // voice note that is already locked on this device), or null when it goes out as before. When the chat SHOULD be locked and this can not be done, this
  // throws: the message fails, it is never sent readable instead. In a chat that can be locked, an ordinary (readable) stored picture, video or voice note is
  // refused too - the caller must lock the file first (prepareAttachment in the api layer).
  async function prepareSend(chatId: string, input: SendInput): Promise<Record<string, unknown> | null> {
    const stored = input.storedMedia;
    const isFile = !!stored && !/^https:\/\//.test(stored);
    const sealed = input.sealed;
    if (input.sharedTrack || input.gameInvite || input.sharedProfileUserId || input.sharedPostId) return null;
    if (sealed && (!isSealedKey(sealed.key) || !parseDescriptor(sealed.desc))) throw new Error('Could not lock this attachment, so it was not sent.');
    // a readable stored picture / video / voice note: it can not be locked after the fact, so in a lockable chat it is refused (below)
    const plainFile = !sealed && (!!input.audioDuration || (isFile && (input.mediaType === 'image' || input.mediaType === 'video' || input.mediaType === 'audio')));
    // any other stored file (a custom sticker) has never been lockable: it goes as before
    if (!sealed && !plainFile && isFile) return null;
    let info;
    try { info = await e2ee.chatCryptoForSend(chatId); } catch { throw new Error("Could not check this chat's encryption. Please try again."); }
    if (!info.encryptable && !info.mustLock) {
      if (sealed) throw new Error('This chat can no longer be locked, so the locked attachment was not sent. Please send it again.');
      return null;
    }
    if (plainFile) throw new Error('This chat is end-to-end encrypted, so pictures, videos and voice notes have to be locked first. Please try again.');
    const text = (input.text || '').trim();
    if (!text && !stored && !sealed) throw new Error('Message cannot be empty.');
    let env;
    try {
      env = await e2ee.encrypt(chatId, sealed
        ? { t: text, m: sealed.key, mt: input.mediaType || 'image', s: { ...sealed.desc, ...(input.audioDuration ? { dur: String(input.audioDuration) } : {}) } }
        : { t: text, ...(stored ? { m: stored, mt: input.mediaType || 'image' } : {}) }, info);
    }
    catch (err) { throw new Error(errorText(err, 'Could not lock this message, so it was not sent.')); }
    return { e2ee: env, scheduledAt: input.scheduledAt, replyTo: input.replyToId ? { messageId: input.replyToId } : undefined };
  }

  // The new locked form of an edited message (a picture link in it stays).
  async function prepareEdit(chatId: string, messageId: string, text: string) {
    const clean = (text || '').trim();
    if (!clean) throw new Error('Message text cannot be empty.');
    const before = e2ee.payloadOf(messageId);
    try { return await e2ee.encrypt(chatId, { t: clean, ...(before?.m ? { m: before.m, mt: before.mt, ...(before.s ? { s: before.s } : {}) } : {}) }); }
    catch (err) { throw new Error(errorText(err, 'Could not lock the edited message, so it was not changed.')); }
  }

  return { unlockOne, unlockMessages, prepareSend, prepareEdit };
}
