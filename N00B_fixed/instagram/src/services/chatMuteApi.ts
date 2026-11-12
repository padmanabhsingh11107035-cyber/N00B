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
