import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Home, LogOut, UserCircle, Users, ShieldAlert, BellRing, Settings as SettingsIcon, X } from 'lucide-react';
import './adminMobile.css';
import { GrowthCard, type Growth } from './AdminGrowth';

// The admin console as a PHONE app: a bottom bar, a home screen with the numbers and the sections in groups, and one page per section with a back arrow.
// It does not rebuild the panels: every section is still the same panel as on a computer. The list of sections is read from the (hidden) tab strip of AdminControlModal,
// where each tab button carries data-admin-tab="<key>", so a section that is added or hidden there shows up or disappears here by itself.

export function useIsPhone(): boolean {
  const q = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    on();
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

export interface PhoneItem { key: string; label: string; count: number | null; icon: string }

const GROUPS: { title: string; keys: string[] }[] = [
  { title: 'People', keys: ['users', 'reports', 'accountRequests', 'joinRequests', 'sparkxRequests', 'staff', 'team'] },
  { title: 'Content and community', keys: ['content', 'daily', 'moderation', 'suggestions', 'grievances', 'activity', 'noobAi', 'notify'] },
  { title: 'Shop and money', keys: ['orders', 'foodStall', 'gifts', 'ads', 'accounts'] },
  { title: 'Numbers and checks', keys: ['analytics', 'signupSources', 'visitors', 'userLogs', 'storage', 'errors'] },
  { title: 'Settings', keys: ['settings', 'pages', 'signIn'] }
];

/** reads the sections from the hidden tab strip */
function readItems(): PhoneItem[] {
  const out: PhoneItem[] = [];
  document.querySelectorAll<HTMLElement>('#admin-tabs [data-admin-tab]').forEach((b) => {
    const text = (b.textContent || '').replace(/\s+/g, ' ').trim();
    const m = /\((\d+)\)\s*$/.exec(text);
    out.push({
      key: b.getAttribute('data-admin-tab') || '',
      label: text.replace(/\s*\(\d+\)\s*$/, '').trim(),
      count: m ? Number(m[1]) : null,
      icon: b.querySelector('svg')?.outerHTML || ''
    });
  });
  return out;
}

export function usePhoneItems(_phone: string): PhoneItem[] {
  const [items, setItems] = useState<PhoneItem[]>([]);
  // every render: the counts in the tab labels change as lists load; the check keeps it from looping
  useLayoutEffect(() => { const next = readItems(); setItems((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next)); });
  return items;
}

const Icon: React.FC<{ svg: string }> = ({ svg }) => <span className="apx-ico" aria-hidden="true" dangerouslySetInnerHTML={{ __html: svg }} />;

export const PhoneTopBar: React.FC<{
  home: boolean; title: string; subtitle: string; onBack: () => void; fullPage: boolean; onClose: () => void; onUseAsUser?: () => void; onLogout?: () => void;
}> = ({ home, title, subtitle, onBack, fullPage, onClose, onUseAsUser, onLogout }) => (
  <header className="apx-top">
    {home ? (
      <>
        <img src="/noob-logo-circle.png" alt="" className="apx-logo" />
        <div className="apx-title"><b>NOOB Admin</b><small>{subtitle}</small></div>
        {fullPage ? (
          <>
            <button type="button" className="apx-icon" onClick={onUseAsUser} aria-label="Use as User"><UserCircle size={20} /></button>
            <button type="button" className="apx-icon" onClick={onLogout} aria-label="Log Out"><LogOut size={20} /></button>
          </>
        ) : (
          <button type="button" className="apx-icon" onClick={onClose} aria-label="Close"><X size={20} /></button>
        )}
      </>
    ) : (
      <>
        <button type="button" className="apx-icon" onClick={onBack} aria-label="Back" data-testid="apx-back"><ChevronLeft size={22} /></button>
        <div className="apx-title"><b>{title}</b></div>
      </>
    )}
  </header>
);

export const PhoneHome: React.FC<{
  items: PhoneItem[];
  stats: { accounts: number; suspended: number; reports: number; role: string };
  canAccounts: boolean; canReports: boolean;
  growth?: Growth;
  onOpen: (key: string) => void;
  onStat: (kind: 'accounts' | 'suspended' | 'reports') => void;
}> = ({ items, stats, canAccounts, canReports, growth, onOpen, onStat }) => {
  const byKey = new Map(items.map((i) => [i.key, i]));
  const used = new Set<string>();
  const groups = GROUPS.map((g) => ({ title: g.title, rows: g.keys.map((k) => byKey.get(k)).filter((x): x is PhoneItem => !!x) }));
  groups.forEach((g) => g.rows.forEach((r) => used.add(r.key)));
  const rest = items.filter((i) => !used.has(i.key));
  if (rest.length) groups.push({ title: 'More', rows: rest });
  return (
    <div className="apx-home">
      {growth && canAccounts && <GrowthCard growth={growth} />}
      <div className="apx-tiles">
        <button type="button" disabled={!canAccounts} onClick={() => onStat('accounts')}><small>Accounts</small><b>{stats.accounts}</b></button>
        <button type="button" disabled={!canAccounts} onClick={() => onStat('suspended')}><small>Suspended</small><b className="red">{stats.suspended}</b></button>
        <button type="button" disabled={!canReports} onClick={() => onStat('reports')}><small>Reports</small><b className="amber">{stats.reports}</b></button>
        <div className="apx-role"><small>Your role</small><b>{stats.role}</b></div>
      </div>
      {groups.filter((g) => g.rows.length).map((g) => (
        <section key={g.title} className="apx-group">
          <h3>{g.title}</h3>
          <div className="apx-card">
            {g.rows.map((r) => (
              <button type="button" key={r.key} className="apx-row" onClick={() => onOpen(r.key)} data-testid={`apx-open-${r.key}`}>
                <Icon svg={r.icon} />
                <span className="apx-label">{r.label}</span>
                {r.count !== null && <span className={`apx-count ${r.count > 0 && (r.key === 'reports' || r.key === 'accountRequests' || r.key === 'joinRequests' || r.key === 'sparkxRequests') ? 'hot' : ''}`}>{r.count}</span>}
                <ChevronRight size={18} className="apx-chev" />
              </button>
            ))}
          </div>
        </section>
      ))}
      <p className="apx-foot">NOOB Admin • live account oversight</p>
    </div>
  );
};

export const PhoneBottomBar: React.FC<{ items: PhoneItem[]; view: 'home' | 'section'; activeKey: string; onHome: () => void; onOpen: (key: string) => void }> = ({ items, view, activeKey, onHome, onOpen }) => {
  const has = (k: string) => items.some((i) => i.key === k);
  const tab = (k: string, label: string, I: React.ElementType) => has(k) && (
    <button type="button" className={view === 'section' && activeKey === k ? 'on' : ''} onClick={() => onOpen(k)} data-testid={`apx-tab-${k}`}><I size={20} /><span>{label}</span></button>
  );
  return (
    <nav className="apx-bar" aria-label="Admin">
      <button type="button" className={view === 'home' ? 'on' : ''} onClick={onHome} data-testid="apx-tab-home"><Home size={20} /><span>Home</span></button>
      {tab('users', 'Accounts', Users)}
      {tab('reports', 'Reports', ShieldAlert)}
      {tab('notify', 'Alerts', BellRing)}
      {tab('settings', 'Platform', SettingsIcon)}
    </nav>
  );
};
