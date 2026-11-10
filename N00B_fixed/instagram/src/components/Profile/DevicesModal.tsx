import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Loader2, Monitor, Smartphone, Trash2 } from 'lucide-react';
import { NzHeader } from '../Common/NzPage';
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
  isPhone(label, model) ? <Smartphone className="w-5 h-5 shrink-0" /> : <Monitor className="w-5 h-5 shrink-0" />;

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
    <div className="nz-page fixed inset-0 z-[130]" role="dialog" aria-modal="true" aria-label="My devices">
      <div className="nz-panel">
        <NzHeader icon={<Smartphone size={20} />} title="My devices" subtitle="Where your account is signed in, and where it has been." onBack={onClose} />
        <div className="nz-scroll">
          {data === undefined ? (
            <div className="nz-note" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          ) : data === null ? (
            <div className="nz-note" data-kind="err">Couldn&apos;t load your devices right now. Please try again in a moment.</div>
          ) : (
            <>
              <p className="nz-label">Signed-in devices</p>
              {data.active.length === 0 && <div className="nz-note">No devices are signed in.</div>}
              {data.active.map((d) => {
                const mine = d.deviceId === thisDeviceId;
                return (
                  <div key={d.deviceId} className="nz-dev" style={{ alignItems: 'center' }}>
                    <span className="nz-ico"><DeviceIcon label={d.label} model={d.model} /></span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b translate="no">{d.label}{mine && <span className="nz-live">this device</span>}</b>
                      {d.model && <small translate="no">{d.model}</small>}
                      <small>Signed in {stamp(d.loggedInAt)}</small>
                    </div>
                    {!mine && (
                      <button type="button" disabled={removing !== null} onClick={() => remove(d.deviceId)} className="nz-pill" data-kind="ghost" title="Remove this device (signs it out)" aria-label="Remove this device">
                        {removing === d.deviceId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 size={15} />} Remove
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="nz-note">Removing a device signs it out of your account straight away.</div>

              <p className="nz-label">Device / login history</p>
              {data.history.length === 0 && <div className="nz-note">Nothing here yet. Each time you sign in, it is listed here.</div>}
              {data.history.map((h) => (
                <div key={h.id} className="nz-dev">
                  <span className="nz-ico"><DeviceIcon label={h.label} model={h.model} /></span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b translate="no">{h.label || 'Device'}{h.deviceId === thisDeviceId && !h.loggedOutAt && <span className="nz-live">this device</span>}</b>
                    {h.model && <small translate="no">{h.model}</small>}
                    <small>From {stamp(h.loggedInAt)}</small>
                    <small>{h.loggedOutAt ? <>To {stamp(h.loggedOutAt)} · {endText(h)}</> : <strong style={{ color: 'var(--nz-acc)' }}>Still signed in</strong>}</small>
                  </div>
                </div>
              ))}
            </>
          )}

          <button type="button" onClick={onOpenEncryption} className="nz-dev" style={{ width: '100%', alignItems: 'center', textAlign: 'left', cursor: 'pointer', color: 'inherit', marginTop: 18 }}>
            <span className="nz-ico"><KeyRound size={20} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>Chat encryption keys &amp; backup</b>
              <small>Manage the keys that lock your chats</small>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
