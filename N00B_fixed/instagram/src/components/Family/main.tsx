import React from 'react';
import { createRoot } from 'react-dom/client';
import FamilyMap from './FamilyMap.tsx';
import { createDemoApi } from '../../family/demoApi.ts';
import { codeFromHash } from '../../family/geo.ts';
import type { FamilyApi } from '../../family/api.ts';

// The Family Map as a page of its own (family.html, the address /family): the app is not loaded, only the login library and the family_* database functions. It opens straight from an
// invitation link (/family#join=CODE) and shows a made-up demo at /family?demo=1, which needs no account and no database.
const root = createRoot(document.getElementById('root') as HTMLElement);
const origin = window.location.origin;
const home = (): void => { window.location.assign('/'); };
const demoUrl = (): void => { window.location.assign('/family?demo=1'); };
const startCode = codeFromHash(window.location.hash);

async function start(): Promise<void> {
  if (new URLSearchParams(window.location.search).has('demo')) {
    const api: FamilyApi = createDemoApi();
    root.render(<FamilyMap api={api} onClose={home} origin={origin} startCode={startCode} />);
    return;
  }
  const { liveApi, hasLogin } = await import('../../family/liveApi.ts');
  if (!(await hasLogin())) { root.render(<FamilyMap api={liveApi} onClose={home} origin={origin} onDemo={demoUrl} loggedOut />); return; }
  root.render(<FamilyMap api={liveApi} onClose={home} origin={origin} startCode={startCode} onDemo={demoUrl} />);
}
void start();
