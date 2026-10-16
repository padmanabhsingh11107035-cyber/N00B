import React, { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import { PageShell, Section, Row, Note } from '../kit';
import type { PageProps } from '../types';
import { ANDROID_APK_URL, currentBuildId, fetchLatestBuildId, updateState } from '../../../utils/appVersion';
import { hardReload } from '../../../utils/reloadApp';
import { isNativeApp } from '../../../utils/siteUrl';
import { useNativeUpdate } from '../../../services/nativeUpdate';

// "Update NOOB". Ordinary changes need nothing from you: the website, the home-screen app and the Android app (which shows the live website) all pick them up by themselves.
// Only when something NATIVE changes does the Android app need a new app file; then this page (and a bar at the top of the app) offers one button that downloads it and opens
// Android's installer.

const shortId = (id: string | null | undefined): string => (id ? id.slice(0, 10) : '');
const looksAndroid = (): boolean => { try { return /android/i.test(navigator.userAgent); } catch { return false; } };

function openAppFile(): void {
  // inside the Android app a normal address change hands the file to the phone's browser; on the website a new tab does
  if (isNativeApp()) window.location.href = ANDROID_APK_URL; else window.open(ANDROID_APK_URL, '_blank', 'noopener');
}

export const UpdatePage: React.FC<PageProps> = ({ back }) => {
  const native = isNativeApp();
  const current = currentBuildId();
  const [latest, setLatest] = useState<string | null | undefined>(undefined);     // undefined: asking, null: could not ask
  const check = useCallback(async () => { setLatest(undefined); setLatest(await fetchLatestBuildId()); }, []);
  useEffect(() => { void check(); }, [check]);
  const state = updateState(current, latest);
  const asking = latest === undefined;
  const app = useNativeUpdate();
  const recheckAll = async () => { await Promise.all([check(), app.recheck()]); };
  const appState = app.info?.state;

  return (
    <PageShell title="Update NOOB" onBack={back}>
      <Section title="Everyday updates" note={native ? 'Everything you see in the app comes live from the website, so new features and fixes arrive by themselves. You never have to update for those.' : 'New features and fixes arrive by themselves. If something looks old, reload to get the newest version.'}>
        <Row icon={Smartphone} label="Version on this device" value={shortId(current) || 'Unknown'} testId="update-current" />
        <Row icon={RefreshCw} label="Newest version" value={asking ? 'Checking…' : latest ? shortId(latest) : 'Could not check'} testId="update-latest" />
        {!native && state === 'newer' && <Row icon={Download} label="Update now" sub="Reloads NOOB with the newest version" onClick={hardReload} testId="update-now" />}
        {!native && state !== 'newer' && <Row icon={RefreshCw} label="Reload NOOB" sub="Fetches the page again, in case something looks old" onClick={hardReload} testId="update-reload" />}
        <Row icon={RefreshCw} label="Check again" onClick={recheckAll} testId="update-check" />
      </Section>
      {!asking && state === 'unknown' && <Note tone="bad">Could not reach NOOB to check. Check your connection and try again.</Note>}
      {!asking && state === 'newest' && <Note tone="good">Everything is up to date.</Note>}
      {!asking && state === 'newer' && !native && <Note tone="good">A newer version of NOOB is ready.</Note>}

      {(native || looksAndroid()) && (
        <Section
          title="Android app"
          note={native
            ? 'Now and then something changes inside the app itself (for example the screenshot block). Those updates need a new app file: tap the button, and NOOB downloads it and opens Android’s installer. Android asks you to confirm, and the first time to allow NOOB to install apps. Your account and chats stay as they are.'
            : 'On Android you can install NOOB as an app. It blocks screenshots and screen recordings of your chats. Open the file after it downloads. If Android says it cannot install it over an old NOOB app, remove the old one first: your account and chats are safe on the server.'}
        >
          {native ? (
            <>
              <Row icon={Download} label={appState === 'newer' ? 'Update the app' : 'Reinstall the newest app'} sub={app.busy || app.message ? app.message || 'Working…' : appState === 'newer' ? 'A new app file is ready' : appState === 'newest' ? 'Your app is up to date' : app.checking ? 'Checking…' : 'Could not check for a new app file'} onClick={app.install} testId="update-app" />
              {app.busy && app.percent >= 0 && (
                <div className="px-4 pb-4" aria-hidden="true"><div className="h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-white transition-all" style={{ width: `${app.percent}%` }} /></div></div>
              )}
              <Row icon={ShieldCheck} label="Screenshots" sub="The newest app blocks screenshots and screen recordings" />
            </>
          ) : (
            <Row icon={Download} label="Get the Android app" sub="NOOB.apk" onClick={openAppFile} testId="update-apk" />
          )}
        </Section>
      )}
    </PageShell>
  );
};
