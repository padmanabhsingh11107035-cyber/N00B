import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Monitor, Smartphone, Trash2, X } from 'lucide-react';
import { fetchMyDevices, revokeDeviceSession } from '../../services/api';
import type { ActiveDevice, LoginHistoryEntry } from '../../services/api';
import { getDeviceId } from '../../utils/deviceId';

interface DevicesModalProps {
  onClose: () => void;
  onOpenEncryption: () => void;
}

const stamp = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const isPhone = (label?: string | null, model?: string | null) => /iphone|ipad|android|phone/i.test(`${label || ''} ${model || ''}`);

const endText = (e: LoginHistoryEntry) =>
  e.endReason === 'removed' ? 'Removed' : e.endReason === 'replaced' ? 'Signed in on another device' : 'Signed out';

const DeviceIcon: React.FC<{ label?: string | null; model?: string | null }> = ({ label, model }) =>
  isPhone(label, model) ? <Smartphone className="w-4 h-4 text-zinc-400 shrink-0" /> : <Monitor className="w-4 h-4 text-zinc-400 shrink-0" />;

export const DevicesModal: React.FC<DevicesModalProps> = ({ onClose, onOpenEncryption }) => {
  const [data, setData] = useState<{ active: ActiveDevice[]; history: LoginHistoryEntry[] } | null | undefined>(undefined);
  const [removing, setRemoving] = useState<string | null>(null);
  const thisDeviceId = getDeviceId();

  const load = useCallback(async () => setData(await fetchMyDevices()), []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const remove = async (deviceId: string) => {
    setRemoving(deviceId);
    await revokeDeviceSession(deviceId);
    // Give the sign-out bookkeeping a moment, then show only what is still signed in.
    await new Promise((r) => setTimeout(r, 400));
    await load();
    setRemoving(null);
  };

  return (
    <div className="fixed inset-0 z-[130] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-label="My devices">
      <div className="w-full max-w-md max-h-[90vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden">
        <header className="p-4 border-b border-zinc-800 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#00FF66]/15 border border-[#00FF66]/40 flex items-center justify-center shrink-0">
            <Smartphone className="w-4 h-4 text-[#00FF66]" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-black text-white">My devices</h3>
            <p className="text-[11px] text-zinc-400 leading-snug mt-0.5">Where your account is signed in, and where it has been.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-white/10 cursor-pointer shrink-0" aria-label="Close">
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4 space-y-5 text-[12px] text-zinc-300 leading-relaxed">
          {data === undefined ? (
            <p className="text-zinc-400 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : data === null ? (
            <p className="text-zinc-400">Couldn&apos;t load your devices right now. Please try again in a moment.</p>
          ) : (
            <>
              <section className="space-y-2">
                <div className="text-[11px] font-black text-white uppercase tracking-wider">Signed-in devices</div>
                {data.active.length === 0 && <p className="text-zinc-500">No devices are signed in.</p>}
                {data.active.map((d) => {
                  const mine = d.deviceId === thisDeviceId;
                  return (
                    <div key={d.deviceId} className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 px-3 py-2.5">
                      <DeviceIcon label={d.label} model={d.model} />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-white truncate" translate="no">
                          {d.label}{' '}
                          {mine && <span className="ml-1 text-[9px] px-1.5 py-0.5 rounded bg-[#00FF66]/15 text-[#00FF66] border border-[#00FF66]/30 font-black uppercase">this device</span>}
                        </div>
                        {d.model && <div className="text-[10px] text-zinc-400 truncate" translate="no">{d.model}</div>}
                        <div className="text-[10px] text-zinc-500">Signed in {stamp(d.loggedInAt)}</div>
                      </div>
                      {!mine && (
                        <button
                          type="button"
                          disabled={removing !== null}
                          onClick={() => remove(d.deviceId)}
                          className="p-2 rounded-lg hover:bg-red-500/15 text-zinc-400 hover:text-red-400 cursor-pointer disabled:opacity-50"
                          title="Remove this device (signs it out)"
                          aria-label="Remove this device"
                        >
                          {removing === d.deviceId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      )}
                    </div>
                  );
                })}
                <p className="text-zinc-500 text-[11px]">Removing a device signs it out of your account straight away.</p>
              </section>

              <section className="space-y-2">
                <div className="text-[11px] font-black text-white uppercase tracking-wider">Device / login history</div>
                {data.history.length === 0 && <p className="text-zinc-500">Nothing here yet. Each time you sign in, it is listed here.</p>}
                {data.history.map((h) => (
                  <div key={h.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <DeviceIcon label={h.label} model={h.model} />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-white truncate" translate="no">{h.label || 'Device'}</div>
                        {h.model && <div className="text-[10px] text-zinc-400 truncate" translate="no">{h.model}</div>}
                      </div>
                      {h.deviceId === thisDeviceId && !h.loggedOutAt && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#00FF66]/15 text-[#00FF66] border border-[#00FF66]/30 font-black uppercase shrink-0">this device</span>
                      )}
                    </div>
                    <div className="mt-1.5 text-[10px] text-zinc-400 space-y-0.5">
                      <div><span className="text-zinc-500">From</span> {stamp(h.loggedInAt)}</div>
                      <div>
                        <span className="text-zinc-500">To</span>{' '}
                        {h.loggedOutAt ? (
                          <>{stamp(h.loggedOutAt)} <span className="text-zinc-500">· {endText(h)}</span></>
                        ) : (
                          <span className="text-[#00FF66] font-bold">Still signed in</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </>
          )}

          <button
            type="button"
            onClick={onOpenEncryption}
            className="w-full flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 px-3 py-2.5 text-left cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-emerald-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white">Chat encryption keys &amp; backup</div>
              <div className="text-[10px] text-zinc-500">Manage the keys that lock your chats</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
