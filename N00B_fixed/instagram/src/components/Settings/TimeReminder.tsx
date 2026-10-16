import React, { useEffect, useState } from 'react';
import { Coffee, Hourglass, Moon } from 'lucide-react';
import { useDevicePrefs } from '../../utils/devicePrefs';
import { dismissReminder, dueReminder, snoozeReminder, startTimeTracking, useTimeSpentVersion, type Reminder } from '../../utils/timeSpent';

// The gentle reminders of Settings > Time management: "you reached your daily limit" and, at night, "time to rest" (sleep mode). A small card at the top of the screen with
// two buttons. It also starts the counting of time spent while someone is signed in. It never blocks anything.
export const TimeReminder: React.FC = () => {
  const prefs = useDevicePrefs();
  const version = useTimeSpentVersion();
  const [, tick] = useState(0);

  useEffect(() => startTimeTracking(), []);
  // the clock moves on even when nothing is being counted (a night begins while the app is open)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 60000); return () => window.clearInterval(t); }, []);

  const due: Reminder = dueReminder(prefs);
  void version;
  if (!due) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[300] w-[min(94vw,420px)]" role="alertdialog" aria-label={due.kind === 'sleep' ? 'Time to rest' : due.kind === 'break' ? 'Take a break' : 'Daily time reminder'} data-testid="time-reminder">
      <div className="rounded-3xl border border-white/30 bg-zinc-950/98 shadow-2xl shadow-black p-4 relative">
        <span aria-hidden="true" className="pointer-events-none absolute inset-[4px] rounded-[20px] border border-dashed border-white/15" />
        <div className="relative flex items-start gap-3">
          <span className="w-10 h-10 shrink-0 rounded-2xl border border-white/25 bg-zinc-900 flex items-center justify-center text-white">{due.kind === 'sleep' ? <Moon className="w-5 h-5" /> : due.kind === 'break' ? <Coffee className="w-5 h-5" /> : <Hourglass className="w-5 h-5" />}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-black text-white">{due.kind === 'sleep' ? 'It is late: time to rest' : due.kind === 'break' ? 'Time for a break' : 'You reached your daily limit'}</p>
            <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
              {due.kind === 'sleep' ? 'Sleep mode is on. NOOB will still be here tomorrow.' : due.kind === 'break' ? `You have been on NOOB for ${due.minutes} minutes in a row. Look away from the screen, stretch, and have some water.` : `You chose to be reminded after ${due.minutes >= 60 ? `${due.minutes / 60} h` : `${due.minutes} min`} a day on NOOB.`}
            </p>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => dismissReminder(due)} className="px-4 py-1.5 rounded-full bg-white text-black text-xs font-extrabold cursor-pointer hover:bg-zinc-200">OK, thanks</button>
              <button type="button" onClick={() => snoozeReminder(15)} className="px-4 py-1.5 rounded-full border border-white/30 text-white text-xs font-extrabold cursor-pointer hover:border-white/70">Remind me in 15 min</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
