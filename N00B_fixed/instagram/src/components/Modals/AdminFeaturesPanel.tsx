import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { adminSetFeature, adminSetMusicPageHidden, fetchPublicPlatformSettings, type PlatformSettings } from '../../services/api';
import { FEATURES, FEATURE_GROUPS, disabledFeatureSet, type FeatureDef } from '../../utils/features';

// Admin panel -> "Pages": one on / off switch for every page of the app that users can open. One tap switches a page off for everyone except the administrators (it leaves the bottom bar, the
// side menu, the menu on Home and the buttons that open it); one tap brings it back. Nothing is deleted. See supabase/migrations/20261023000001_feature_switches.sql and utils/features.ts.

const Switch: React.FC<{ on: boolean; busy: boolean; label: string; onChange: () => void; testId: string }> = ({ on, busy, label, onChange, testId }) => (
  <button type="button" role="switch" aria-checked={on} aria-label={`${label}: ${on ? 'on' : 'off'} for users`} onClick={onChange} disabled={busy} data-testid={testId}
    className="shrink-0 cursor-pointer disabled:opacity-50">
    <span className={`relative block w-11 h-6 rounded-full transition-colors ${on ? 'bg-emerald-400' : 'bg-zinc-700'}`}>
      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </span>
  </button>
);

export const AdminFeaturesPanel: React.FC = () => {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setSettings(await fetchPublicPlatformSettings());
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const off = disabledFeatureSet(settings?.disabledFeatures);
  const isOn = (f: FeatureDef) => (f.legacy === 'music' ? settings?.musicPageHidden !== true : !off.has(f.key));
  const offCount = FEATURES.filter((f) => !isOn(f)).length;

  const change = async (f: FeatureDef, on: boolean) => {
    if (busyKey) return;
    setBusyKey(f.key); setMessage(null);
    // the switch moves at once; it goes back if the change could not be saved
    const before = settings;
    setSettings((cur) => {
      if (!cur) return cur;
      if (f.legacy === 'music') return { ...cur, musicPageHidden: !on };
      const list = new Set(cur.disabledFeatures ?? []); if (on) list.delete(f.key); else list.add(f.key);
      return { ...cur, disabledFeatures: [...list] };
    });
    const res = f.legacy === 'music' ? await adminSetMusicPageHidden(!on) : await adminSetFeature(f.key, on);
    if (res.success && res.settings) {
      setSettings(res.settings);
      setMessage({ ok: true, text: on ? `${f.label} is ON again for users.` : `${f.label} is OFF: users no longer see it.` });
    } else {
      setSettings(before);
      setMessage({ ok: false, text: res.error || 'Could not change the page.' });
    }
    setBusyKey(null);
  };

  const allOn = async () => {
    if (busyKey) return;
    setBusyKey('*'); setMessage(null);
    let last: PlatformSettings | undefined; let failed = '';
    for (const f of FEATURES) {
      if (isOn(f)) continue;
      const res = f.legacy === 'music' ? await adminSetMusicPageHidden(false) : await adminSetFeature(f.key, true);
      if (res.success && res.settings) last = res.settings; else { failed = res.error || 'Could not change the page.'; break; }
    }
    if (last) setSettings(last); else if (failed) await load();
    setMessage(failed ? { ok: false, text: failed } : { ok: true, text: 'Every page is ON again for users.' });
    setBusyKey(null);
  };

  if (loading && !settings) {
    return <div className="py-12 text-center"><Loader2 className="w-6 h-6 text-zinc-500 animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-4" data-testid="admin-features-panel">
      <div className="p-4 bg-zinc-900/60 rounded-2xl border border-zinc-800">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-black text-white">Pages on / off</h3>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              One tap switches a page off for every user: it leaves the bottom bar, the side menu, the menu on Home and the buttons that open it. Nothing is deleted, and tapping again brings it back.
              You (the administrator) always see every page, so look with a normal account to check. Users see the change when they open the app or come back to it (within a couple of minutes).
            </p>
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="shrink-0 p-2 rounded-xl bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer disabled:opacity-50" aria-label="Refresh" title="Refresh">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={`text-xs font-bold ${offCount > 0 ? 'text-red-300' : 'text-emerald-300'}`} data-testid="features-summary">
            {offCount === 0 ? `All ${FEATURES.length} pages are ON for users` : `${offCount} of ${FEATURES.length} pages are OFF for users`}
          </span>
          {offCount > 0 && (
            <button type="button" onClick={() => void allOn()} disabled={!!busyKey} className="px-3 py-1.5 rounded-xl bg-emerald-400 text-black text-xs font-black cursor-pointer disabled:opacity-50" data-testid="features-all-on">
              Turn everything on
            </button>
          )}
        </div>
        {message && <p className={`mt-2 text-xs font-bold ${message.ok ? 'text-emerald-300' : 'text-red-300'}`} role="status">{message.text}</p>}
      </div>

      {FEATURE_GROUPS.map((group) => (
        <div key={group} className="space-y-2">
          <p className="px-1 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">{group}</p>
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 divide-y divide-zinc-800/80">
            {FEATURES.filter((f) => f.group === group).map((f) => {
              const on = isOn(f);
              return (
                <div key={f.key} className="flex items-center justify-between gap-3 px-4 py-3" data-testid={`feature-row-${f.key}`}>
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-white flex items-center gap-2">
                      {f.label}
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black tracking-wider ${on ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>{on ? 'ON' : 'OFF'}</span>
                    </span>
                    <span className="text-[11px] text-zinc-400 block truncate">{f.blurb}</span>
                  </div>
                  <Switch on={on} busy={!!busyKey} label={f.label} onChange={() => void change(f, !on)} testId={`feature-switch-${f.key}`} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <p className="px-1 text-[11px] text-zinc-500 leading-relaxed">
        NOOB Study and the Food Stall have their own switches in their own tabs, and the maintenance locks (Live Lounge, NOOB AI, NOOB Rooms) in the Platform tab: those show a message instead of hiding the page.
      </p>
    </div>
  );
};
