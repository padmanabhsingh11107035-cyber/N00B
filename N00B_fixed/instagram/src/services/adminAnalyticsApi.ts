import { supabase } from './supabase';
import type { PlatformOverview } from '../utils/adminAnalyticsMath';

// The administrator's view of the whole app: counts per day and breakdowns. Only the main administrator gets an answer; it never contains message text,
// captions or any one person's activity.
export * from '../utils/adminAnalyticsMath';

type Out<T> = { ok: true; data: T; error?: undefined } | { ok: false; error: string; data?: undefined };
export async function platformOverview(days: number): Promise<Out<PlatformOverview>> {
  try {
    const { data, error } = await supabase.rpc('admin_analytics_overview', { p_days: days });
    if (error) return { ok: false, error: /could not find the function|schema cache/i.test(error.message) ? 'The analytics need their database update. Run the newest migration, then try again.' : error.message || 'Something went wrong.' };
    return { ok: true, data: data as PlatformOverview };
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Something went wrong.' }; }
}
