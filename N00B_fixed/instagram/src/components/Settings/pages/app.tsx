import React, { useCallback, useEffect, useState } from 'react';
import { Archive, Bell, Bold, Camera, Contrast, Download, Globe, HardDrive, Languages, MapPin, Mic, MousePointerClick, Smartphone, Trash2, Type } from 'lucide-react';
import { PageShell, Section, Row, ToggleRow, Choice, Note, SmallButton, useFlash } from '../kit';
import type { PageProps } from '../types';
import { setDevicePrefs, useDevicePrefs, type AutoplayMode, type TextSize, type UploadQuality } from '../../../utils/devicePrefs';
import { getThemePreference, setThemePreference, subscribeToTheme, type ThemePreference } from '../../../utils/theme';

// Your app and media: device permissions, archiving and downloading, accessibility, language, media quality, app and website permissions.
// Everything here belongs to this phone or computer (see utils/devicePrefs.ts), except where a row opens something that belongs to the account.

type PermState = 'granted' | 'denied' | 'prompt' | 'unsupported';
type PermName = 'camera' | 'microphone' | 'geolocation' | 'notifications';

async function readPermission(name: PermName): Promise<PermState> {
  try {
    if (name === 'notifications') {
      if (typeof Notification === 'undefined') return 'unsupported';
      return Notification.permission === 'default' ? 'prompt' : (Notification.permission as PermState);
    }
    if (name === 'geolocation' && !('geolocation' in navigator)) return 'unsupported';
    if ((name === 'camera' || name === 'microphone') && !navigator.mediaDevices?.getUserMedia) return 'unsupported';
    if (!navigator.permissions?.query) return 'prompt';     // the browser does not say: it will ask when something needs it
    const res = await navigator.permissions.query({ name: name as PermissionName });
    return res.state as PermState;
  } catch {
    return 'prompt';
  }
}

async function askPermission(name: PermName): Promise<void> {
  if (name === 'notifications') { await Notification.requestPermission(); return; }
  if (name === 'geolocation') {
    await new Promise<void>((resolve) => navigator.geolocation.getCurrentPosition(() => resolve(), () => resolve(), { timeout: 15000, maximumAge: 600000 }));
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(name === 'camera' ? { video: true } : { audio: true });
    stream.getTracks().forEach((t) => t.stop());     // only asking: nothing is recorded
  } catch { /* refused or no device: the state is read again below */ }
}

const STATE_TEXT: Record<PermState, string> = { granted: 'Allowed', denied: 'Blocked', prompt: 'Not asked yet', unsupported: 'Not available' };

export const DevicePermissionsPage: React.FC<PageProps> = ({ back }) => {
  const [state, setState] = useState<Record<PermName, PermState>>({ camera: 'prompt', microphone: 'prompt', geolocation: 'prompt', notifications: 'prompt' });
  const [busy, setBusy] = useState<PermName | null>(null);
  const [flash, show] = useFlash();
  const refresh = useCallback(async () => {
    const names: PermName[] = ['camera', 'microphone', 'geolocation', 'notifications'];
    const states = await Promise.all(names.map(readPermission));
    setState(Object.fromEntries(names.map((n, i) => [n, states[i]])) as Record<PermName, PermState>);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const ask = async (name: PermName) => {
    setBusy(name);
    await askPermission(name);
    await refresh();
    setBusy(null);
    if ((await readPermission(name)) === 'denied') show('It is blocked. Open this site’s settings in your browser or your phone’s Settings, and allow it there.', 'bad');
  };

  const items: Array<[PermName, string, string, React.ComponentType<{ className?: string }>]> = [
    ['camera', 'Camera', 'Photos, stories, video calls and QR scanning', Camera],
    ['microphone', 'Microphone', 'Voice messages, video calls and Live', Mic],
    ['geolocation', 'Location', 'Attach a place to a story or share where you are', MapPin],
    ['notifications', 'Notifications', 'Alerts on this device', Bell]
  ];
  return (
    <PageShell title="Device permissions" onBack={back}>
      {flash}
      <Note>These are the permissions you gave NOOB on this device. NOOB only uses one while you are doing something that needs it. You can take one away in your browser or phone settings at any time.</Note>
      <Section>
        {items.map(([name, label, sub, Icon]) => (
          <Row
            key={name}
            icon={Icon}
            label={label}
            sub={sub}
            testId={`perm-${name}`}
            right={
              <span className="flex items-center gap-2 shrink-0">
                <span className={`text-[12px] font-bold ${state[name] === 'granted' ? 'text-white' : 'text-zinc-400'}`}>{STATE_TEXT[state[name]]}</span>
                {(state[name] === 'prompt' || state[name] === 'denied') && <SmallButton onClick={() => ask(name)} disabled={busy === name}>{busy === name ? '…' : state[name] === 'denied' ? 'Try again' : 'Allow'}</SmallButton>}
              </span>
            }
          />
        ))}
      </Section>
    </PageShell>
  );
};

export const ArchivingPage: React.FC<PageProps> = ({ ctx, go, back }) => (
  <PageShell title="Archiving and downloading" onBack={back}>
    <Section title="Archive" note="Stories are saved to your archive automatically when they end, so you can look at them or share them again. Instants are the one thing NOOB deletes by itself: for good, after 24 hours.">
      <Row icon={Archive} label="Stories archive" sub="Every story you posted" onClick={() => go('stories-archive')} testId="archiving-stories" />
    </Section>
    <Section title="Download" note="A readable copy of the details on your account.">
      <Row icon={Download} label="Download your information" onClick={ctx.actions.openExport} testId="archiving-export" />
    </Section>
  </PageShell>
);

const TEXT_SIZES: Array<{ value: TextSize; label: string; sub?: string }> = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
  { value: 'xlarge', label: 'Extra large' }
];

export const AccessibilityPage: React.FC<PageProps> = ({ back }) => {
  const prefs = useDevicePrefs();
  const [theme, setTheme] = useState<ThemePreference>(() => getThemePreference());
  useEffect(() => subscribeToTheme((next) => setTheme(next)), []);
  return (
    <PageShell title="Accessibility" onBack={back}>
      <Section title="Appearance" note="Dark is how NOOB starts. System follows your phone.">
        <Choice value={theme} onChange={setThemePreference} options={[
          { value: 'dark', label: 'Dark' },
          { value: 'light', label: 'Light' },
          { value: 'system', label: 'Same as device' }
        ]} />
      </Section>
      <Section title="Text size">
        <Choice value={prefs.textSize} onChange={(v) => setDevicePrefs({ textSize: v })} options={TEXT_SIZES} />
      </Section>
      <Section title="Easier to see and use">
        <ToggleRow icon={Type} label="Serif text" sub="Classic letters like a book, all over the app. Off by default: NOOB uses the bold sans" on={prefs.serifText} onChange={(v) => setDevicePrefs({ serifText: v })} testId="a11y-serif" />
        <ToggleRow icon={Bold} label="Bold text" sub="Make all text heavier" on={prefs.boldText} onChange={(v) => setDevicePrefs({ boldText: v })} testId="a11y-bold" />
        <ToggleRow icon={Contrast} label="Higher contrast" sub="Brighter text and clearer borders" on={prefs.highContrast} onChange={(v) => setDevicePrefs({ highContrast: v })} testId="a11y-contrast" />
        <ToggleRow icon={MousePointerClick} label="Reduce motion" sub="Fewer animations and no moving backgrounds" on={prefs.reduceMotion} onChange={(v) => setDevicePrefs({ reduceMotion: v })} testId="a11y-motion" />
      </Section>
      <p className="px-3 pt-3 text-[11.5px] text-zinc-500">These choices stay on this device.</p>
    </PageShell>
  );
};

export const LanguagePage: React.FC<PageProps> = ({ ctx, back }) => (
  <PageShell title="Language and translations" onBack={back}>
    <Section title="App language" note="Pick the language NOOB shows you.">
      <Row icon={Languages} label="App language" sub="Menus, buttons and messages" onClick={ctx.actions.openLanguagePicker} testId="language-picker" />
    </Section>
    <Section title="Translations" note="Translate any text you copy or type into your language.">
      <Row icon={Globe} label="Translator" onClick={ctx.actions.openTranslator} />
    </Section>
  </PageShell>
);

export const MediaQualityPage: React.FC<PageProps> = ({ back }) => {
  const prefs = useDevicePrefs();
  return (
    <PageShell title="Media quality" onBack={back}>
      <Section title="Data saver" note="Saves mobile data: videos do not start by themselves and what you upload is smaller.">
        <ToggleRow icon={Smartphone} label="Use less data" on={prefs.dataSaver} onChange={(v) => setDevicePrefs({ dataSaver: v })} testId="media-data-saver" />
      </Section>
      <Section title="Autoplay videos" note={prefs.dataSaver ? 'The data saver is on, so videos wait for you to tap them.' : undefined}>
        <Choice<AutoplayMode> value={prefs.autoplay} onChange={(v) => setDevicePrefs({ autoplay: v })} disabled={prefs.dataSaver} options={[
          { value: 'always', label: 'On mobile data and Wi-Fi' },
          { value: 'wifi', label: 'On Wi-Fi only' },
          { value: 'never', label: 'Never' }
        ]} />
      </Section>
      <Section title="Upload quality" note="Bigger pictures look sharper and take longer to send. The data saver always keeps uploads small.">
        <Choice<UploadQuality> value={prefs.uploadQuality} onChange={(v) => setDevicePrefs({ uploadQuality: v })} disabled={prefs.dataSaver} options={[
          { value: 'standard', label: 'Standard', sub: 'Smaller and quick' },
          { value: 'high', label: 'Highest quality', sub: 'Sharper pictures' }
        ]} />
      </Section>
      <p className="px-3 pt-3 text-[11.5px] text-zinc-500">These choices stay on this device.</p>
    </PageShell>
  );
};

const mb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(bytes >= 104857600 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const AppWebsitesPage: React.FC<PageProps> = ({ ctx, back }) => {
  const prefs = useDevicePrefs();
  const [flash, show] = useFlash();
  const [used, setUsed] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const measure = useCallback(async () => {
    try {
      const est = await navigator.storage?.estimate?.();
      setUsed(est?.usage ? mb(est.usage) : null);
    } catch { setUsed(null); }
  }, []);
  useEffect(() => { void measure(); }, [measure]);

  // Only the downloaded copies of the app and of pictures are removed. Your account, your login and your chats' keys are NOT touched.
  const clearCache = async () => {
    setClearing(true);
    try {
      if (typeof caches !== 'undefined') await Promise.all((await caches.keys()).map((k) => caches.delete(k)));
      show('Cleared. Pictures and pages will download again when you need them.');
    } catch {
      show('Could not clear it on this browser.', 'bad');
    }
    setClearing(false);
    void measure();
  };

  return (
    <PageShell title="App and website permissions" onBack={back}>
      {flash}
      <Section title="Links" note="When this is on, a link to another website opens inside NOOB with a bar to go back. When it is off it opens in your browser.">
        <ToggleRow icon={Globe} label="Open links in NOOB" on={prefs.openLinksInApp} onChange={(v) => setDevicePrefs({ openLinksInApp: v })} testId="links-in-app" />
      </Section>
      <Section title="Stored on this device" note="This removes only the saved copies of pictures and pages. It does not log you out or delete anything from your account.">
        <Row icon={HardDrive} label="Space used by NOOB" value={used || 'Unknown'} />
        <Row icon={Trash2} label="Clear cache" sub="Free up space on this device" onClick={() => clearCache()} disabled={clearing} testId="clear-cache" />
      </Section>
      <Section title="Install">
        <Row icon={Smartphone} label="Add NOOB to your home screen" sub="Open it like an app" onClick={ctx.actions.openInstall} />
      </Section>
    </PageShell>
  );
};
