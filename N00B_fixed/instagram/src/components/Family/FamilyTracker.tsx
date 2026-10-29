import React, { useEffect } from 'react';
import { anyAutoShare } from '../../family/consent';

// Keeps Family Map sharing by itself for the people who turned it on: the place keeps going out while NOOB is open on any screen, and in the Android app also while the app is closed.
// People who never used Family Map load nothing at all (a single look at a small setting decides). It never asks for a permission by itself: it starts only when the phone already allowed it.
export const FamilyTracker: React.FC = () => {
  useEffect(() => {
    if (!anyAutoShare()) return;
    let dead = false;
    let unsubscribe = (): void => undefined;
    void (async () => {
      const [{ liveApi, hasLogin }, consent, locate, bg, live, { supabase }] = await Promise.all([
        import('../../family/liveApi'), import('../../family/consent'), import('../../family/locate'), import('../../family/background'), import('../../family/trackerLive'), import('../../services/supabase')
      ]);
      const attempt = async (): Promise<void> => {
        if (dead || !(await hasLogin())) return;
        const uid = await liveApi.userId();
        if (!uid || !consent.autoShareOn(uid)) return;
        if (!bg.backgroundSupported() && (await locate.permissionState()) !== 'granted') return;
        try {
          const [rooms, prefs] = await Promise.all([liveApi.myRooms(), liveApi.getPrefs()]);
          if (!prefs.shareDefault || !rooms.some((r) => r.sharing)) { if (!rooms.length) consent.setAutoShare(uid, false); return; }
        } catch { return; }
        if (!dead) await live.startTracker(liveApi, false);
      };
      void attempt();
      const { data } = supabase.auth.onAuthStateChange((event) => { if (event === 'SIGNED_OUT') live.tracker.stop(); else if (event === 'SIGNED_IN') void attempt(); });
      unsubscribe = () => data.subscription.unsubscribe();
    })();
    return () => { dead = true; unsubscribe(); };
  }, []);
  return null;
};
