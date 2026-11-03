import React, { useState } from 'react';
import { Check, Crown } from 'lucide-react';
import { PageShell, Section, Row, Note, useFlash } from '../kit';
import type { PageProps } from '../types';
import { applyAppIcon, canChangeHomeIcon, getIconChoice, setIconChoice, type AppIconName } from '../../../utils/appIcon';

// App icon: only for members of NOOB Pro. Choose the normal icon or the Pro icon; the Pro one shows while the plan runs and the normal one comes back when it ends (utils/appIcon.ts).

const OPTIONS: Array<{ id: AppIconName; label: string; src: string }> = [
  { id: 'default', label: 'NOOB', src: '/app-icons/default.png' },
  { id: 'pro', label: 'NOOB Pro', src: '/app-icons/pro.png' },
];

export const AppIconPage: React.FC<PageProps> = ({ ctx, back }) => {
  const isPro = !!ctx.currentUser.proTier;
  const [choice, setChoice] = useState<AppIconName>(() => (isPro ? getIconChoice() : 'default'));
  const [flash, show] = useFlash();
  const native = canChangeHomeIcon();

  const pick = async (id: AppIconName) => {
    if (!isPro && id === 'pro') return;
    setChoice(id);
    setIconChoice(id);
    await applyAppIcon(ctx.currentUser.proTier);
    show(native ? 'Done. The icon on your home screen changes in a moment.' : 'Saved.', 'good');
  };

  return (
    <PageShell title="App icon" subtitle="Choose the icon of NOOB" onBack={back}>
      {flash}
      {!isPro && (
        <Note tone="info">The NOOB Pro icon is for NOOB Pro members. Subscribe to any plan to unlock it; when a plan ends the normal icon comes back by itself, and while it keeps renewing the Pro icon stays.</Note>
      )}
      <Section title="Icons">
        <div className="grid grid-cols-2 gap-3 p-4">
          {OPTIONS.map((o) => {
            const locked = o.id === 'pro' && !isPro;
            const on = choice === o.id;
            return (
              <button key={o.id} type="button" onClick={() => pick(o.id)} disabled={locked} data-testid={`app-icon-${o.id}`} aria-pressed={on}
                className={`relative rounded-3xl border p-3 flex flex-col items-center gap-2 cursor-pointer transition-colors ${on ? 'border-white bg-white/10' : 'border-white/15 bg-white/[0.03]'} ${locked ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <img src={o.src} alt="" width={96} height={96} className="w-24 h-24 rounded-[26px] object-cover" draggable={false} />
                <span className="text-sm font-bold text-white flex items-center gap-1.5">{o.id === 'pro' && <Crown className="w-3.5 h-3.5 text-amber-300" />}{o.label}</span>
                {on && <span className="absolute top-2 right-2 w-6 h-6 rounded-full bg-white text-black flex items-center justify-center"><Check className="w-4 h-4" strokeWidth={3} /></span>}
              </button>
            );
          })}
        </div>
        {!isPro && <Row label="Get NOOB Pro" sub="Unlock the Pro icon" onClick={ctx.actions.openPro} testId="app-icon-get-pro" />}
      </Section>
      <Note tone="info">{native
        ? 'This changes the icon on your phone’s home screen. Some phones show the new icon after a few seconds.'
        : 'A website or an installed web app can’t change its own icon: Apple and the browser decide that. The Android app from Google Play can, and so shows your choice on the home screen. Here the choice is kept for the app.'}</Note>
    </PageShell>
  );
};
