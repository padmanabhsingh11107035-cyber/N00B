import React from 'react';
import { openPlayStore, showPlayStoreButton } from '../../utils/pwaInstall';

// "Get it on Google Play": renders nothing unless PLAY_STORE_URL (utils/pwaInstall.ts) is set and this is an Android phone in a browser.
export const PlayStoreButton: React.FC<{ className?: string }> = ({ className }) => {
  if (!showPlayStoreButton()) return null;
  return (
    <button
      type="button"
      onClick={openPlayStore}
      data-testid="play-store-button"
      className={className || 'inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-black cursor-pointer active:scale-95 transition-transform touch-manipulation'}
    >
      Get it on Google Play
    </button>
  );
};
