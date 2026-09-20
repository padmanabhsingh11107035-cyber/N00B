// The two calls the translator makes to the server: read the translations already stored for a language (one quick call), and ask
// for the ones that do not exist yet to be made (the server translates them once and keeps them for everybody).
import { supabase } from '../services/supabase';

// The deployed name of the function whose code is supabase/functions/ai/index.ts (the same one the support chat uses).
const FUNCTION_NAME = 'dynamic-handler';

const asMap = (value: unknown): Record<string, string> => {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (typeof v === 'string') out[k] = v;
  }
  return out;
};

export async function fetchStoredTranslations(lang: string): Promise<Record<string, string>> {
  const { data, error } = await supabase.rpc('get_ui_translations', { p_lang: lang });
  if (error) throw new Error(error.message);
  return asMap(data);
}

export interface TranslateReply {
  translations: Record<string, string>;
  // true when the server said "not now" (too many requests, translator unavailable): try again later, do not give up
  busy: boolean;
}

export async function requestTranslations(lang: string, items: { id: string; text: string }[]): Promise<TranslateReply> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, { body: { action: 'translate-ui', lang, items } });
  if (error) {
    const status = (error as any)?.context?.status;
    if (status === 429 || status === 503 || status === 502 || status === 504) return { translations: {}, busy: true };
    throw new Error(error.message);
  }
  return { translations: asMap((data as any)?.translations), busy: !!(data as any)?.busy };
}
