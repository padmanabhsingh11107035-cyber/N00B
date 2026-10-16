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
// Android's installer. The page always says plainly where things stand, so a page with nothing to install never looks broken.

const shortId = (id: string | null | undefined): string => (id ? id.slice(0, 10) : '');
const looksAndroid = (): boolean => { try { return /android/i.test(navigator.userAgent); } catch { return false; } };

function openAppFile(): void {
  // inside the Android app a normal address change hands the file to the phone's browser; on the website a new tab does
  if (isNativeApp()) window.location.href = ANDROID_APK_URL; else window.open(ANDROID_APK_URL, '_blank', 'noopener');
}

export const UpdatePage: React.FC<PageProps> = ({ back }) => {
  const native = isNativeApp();
  const android = looksAndroid();
  const current = currentBuildId();
  const [latest, setLatest] = useState<string | null | undefined>(undefined);     // undefined: asking, null: could not ask
  const check = useCallback(async () => { setLatest(undefined); setLatest(await fetchLatestBuildId()); }, []);
  useEffect(() => { void check(); }, [check]);
  const state = updateState(current, latest);
  const asking = latest === undefined;
  const app = useNativeUpdate();
  const recheckAll = async () => { await Promise.all([check(), app.recheck()]); };
  const info = app.info;
  const appState = info?.state;

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

      {native && (
        <>
          <Section
            title="The Android app itself"
            note="Now and then something changes inside the app itself (for example the screenshot block). Those updates need a new app file: tap the button, and NOOB downloads it and opens Android's installer. Android asks you to confirm, and the first time to allow NOOB to install apps. Your account and chats stay as they are."
          >
            <Row icon={Smartphone} label="Your app" value={app.checking ? 'Checking…' : info?.installed ? `build ${info.installed}` : 'older app'} testId="update-app-installed" />
            <Row icon={RefreshCw} label="Newest app" value={app.checking ? 'Checking…' : info?.latest ? `build ${info.latest}` : 'Could not check'} testId="update-app-latest" />
            <Row
              icon={Download}
              label={appState === 'newer' || !info?.supported ? 'Update the app' : 'Install the newest app again'}
              sub={app.busy || app.message ? app.message || 'Working…' : !info?.supported ? 'Your app is from before in-app updates: this downloads the newest app file' : appState === 'newer' ? 'A new app file is ready' : appState === 'newest' ? 'Nothing to install: your app is the newest one' : 'Could not check for a new app file'}
              onClick={app.install}
              testId="update-app"
            />
            {app.busy && app.percent >= 0 && (
              <div className="px-4 pb-4" aria-hidden="true"><div className="h-1.5 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-white transition-all" style={{ width: `${app.percent}%` }} /></div></div>
            )}
            <Row icon={ShieldCheck} label="Screenshots" sub="The newest app blocks screenshots and screen recordings" />
          </Section>
          {!app.checking && appState === 'newest' && <Note tone="good">Your app is the newest one: there is no app file to install right now. When one comes, a bar at the top of the app and this page will offer it.</Note>}
        </>
      )}

      {!native && android && (
        <Section title="Android app" note="On Android you can install NOOB as an app. It blocks screenshots and screen recordings of your chats. Open the file after it downloads. If Android says it cannot install it over an old NOOB app, remove the old one first: your account and chats are safe on the server.">
          <Row icon={Download} label="Get the Android app" sub="NOOB.apk" onClick={openAppFile} testId="update-apk" />
        </Section>
      )}

      {!native && !android && (
        <Note>On iPhone, iPad and computers there is no app file to install: NOOB is a website that updates itself. After a new version comes out, tap Update now (or Reload) once if something still looks old.</Note>
      )}
    </PageShell>
  );
};
