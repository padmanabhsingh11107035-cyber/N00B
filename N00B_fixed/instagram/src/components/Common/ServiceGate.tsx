import React, { useSyncExternalStore } from 'react';
import { SystemPage } from './SystemPage';
import { isServiceDown, subscribeServiceDown, probeService, reportServiceUp } from '../../services/serviceHealth';
import { hardReload } from '../../utils/reloadApp';

// "NOOB is under maintenance", drawn over the whole app the moment the host switches the database service off (see services/serviceHealth.ts), whoever is looking: a person who
// is signed in (they STAY signed in: nothing here touches the login), someone on the sign-in page, the administrator. The app underneath is left exactly as it was.
// Every 10 seconds (and at the Try again button) a tiny public question asks whether the service answers again; when it does the page goes away and the app is loaded fresh.
export const ServiceGate: React.FC = () => {
  const down = useSyncExternalStore(subscribeServiceDown, isServiceDown, () => false);
  if (!down) return null;
  const check = () => {
    void probeService().then((r) => {
      if (r !== 'up') return;
      reportServiceUp();
      hardReload();   // what was loading when the service went away is loaded again, from the start
    });
  };
  return <SystemPage kind="maintenance" retryEverySeconds={10} onRetry={check} />;
};
