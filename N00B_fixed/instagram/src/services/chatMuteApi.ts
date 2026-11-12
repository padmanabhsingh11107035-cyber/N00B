// Mute notifications for one chat (1:1 or group). Only the caller's own membership row is changed.
import { supabase } from './supabase';

export async function setChatMuted(chatId: string, muted: boolean): Promise<{ success: boolean; isMuted?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('set_chat_muted', { p_chat: chatId, p_muted: muted });
    if (error) return { success: false, error: error.message || 'Could not change the mute setting.' };
    return { success: true, isMuted: !!(data as any)?.isMuted };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not change the mute setting.' };
  }
}

export async function fetchMutedChatIds(): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('my_muted_chats');
    if (error || !Array.isArray(data)) return [];
    return data.map((x: any) => String(x));
  } catch {
    return [];
  }
}

// Mute for a time: hours = 8, 168 (a week), null = always, -1 = unmute. Uses set_chat_muted_for (migration 20261112000005); while that SQL is not run yet,
// "always" and "unmute" fall back to the plain set_chat_muted, and the timed choices say so instead of pretending.
export async function setChatMutedFor(chatId: string, hours: number | null): Promise<{ success: boolean; isMuted?: boolean; until?: string | null; error?: string }> {
  try {
    const { data, error } = await supabase.rpc('set_chat_muted_for', { p_chat: chatId, p_hours: hours });
    if (!error) return { success: true, isMuted: !!(data as any)?.isMuted, until: ((data as any)?.until as string | null) || null };
    const missing = /set_chat_muted_for|schema cache|does not exist|PGRST202/i.test(error.message || '') || (error as any).code === 'PGRST202' || (error as any).code === '42883';
    if (!missing) return { success: false, error: error.message || 'Could not change the mute setting.' };
    if (hours === null || hours === 0 || hours === -1) {
      const r = await setChatMuted(chatId, hours !== -1);
      return r.success ? { success: true, isMuted: r.isMuted, until: null } : r;
    }
    return { success: false, error: 'Timed mute is not switched on yet. Choose "Always" for now.' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Could not change the mute setting.' };
  }
}

/** My mute end times by chat id (empty when the SQL is not run yet). Asks the server to switch off the expired ones first (only my own). */
export async function fetchChatMuteUntil(): Promise<Record<string, string>> {
  try {
    try { await supabase.rpc('expire_chat_mutes'); } catch { /* not installed yet */ }
    const { data, error } = await supabase.rpc('my_chat_mutes');
    if (error || !Array.isArray(data)) return {};
    const out: Record<string, string> = {};
    for (const r of data as any[]) if (r?.chat_id && r?.until) out[String(r.chat_id)] = String(r.until);
    return out;
  } catch {
    return {};
  }
}

/** True when the end time has passed (so a chat that still says "muted" is not muted any more). */
export const muteExpired = (until: string | null | undefined, now = Date.now()): boolean => !!until && new Date(until).getTime() < now;

/** "Muted until 3:40 pm" / "Muted until Tue 17 Nov, 3:40 pm" */
export function muteUntilLabel(until: string | null | undefined, now = new Date()): string {
  if (!until) return 'Muted';
  const d = new Date(until);
  if (isNaN(d.getTime())) return 'Muted';
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? `Muted until ${time}` : `Muted until ${d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}, ${time}`;
}
