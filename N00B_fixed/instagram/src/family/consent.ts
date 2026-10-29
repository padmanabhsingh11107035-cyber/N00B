// NOOB Family Map: what this device remembers so it never asks twice. Only yes/no switches are kept here, never a place.
//   noob_family_loc_v1   "on" once the person allowed the location (the "Turn on your location" step is then skipped), "off" once they switched sharing off
//   noob_family_auto_v1  the accounts on this device that keep sharing whenever NOOB is open (and, in the Android app, also when it is closed)
//   noob_family_bg_v1    "off" when the person switched the Android background sharing off
const ALLOWED_SLOT = 'noob_family_loc_v1';
const AUTO_SLOT = 'noob_family_auto_v1';
const BG_SLOT = 'noob_family_bg_v1';
const REPORT_SLOT = 'noob_family_report_v1';

const read = (slot: string): string => { try { return localStorage.getItem(slot) || ''; } catch { return ''; } };
const write = (slot: string, value: string): void => { try { if (value) localStorage.setItem(slot, value); else localStorage.removeItem(slot); } catch { /* a private window keeps nothing: it asks again next time */ } };
const autoMap = (): Record<string, true> => {
  try { const j = JSON.parse(read(AUTO_SLOT) || '{}'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; }
};

/** has the person already allowed the location (and not switched sharing off since)? then nothing is asked again */
export const locationAllowed = (): boolean => read(ALLOWED_SLOT) === 'on';
export const setLocationAllowed = (on: boolean): void => write(ALLOWED_SLOT, on ? 'on' : 'off');

/** this account keeps sharing by itself whenever NOOB is open */
export const autoShareOn = (userId: string): boolean => !!userId && autoMap()[userId] === true;
/** is there any account on this device that does? (a quick check, so people who never used Family Map load nothing at all) */
export const anyAutoShare = (): boolean => Object.keys(autoMap()).length > 0;
export function setAutoShare(userId: string, on: boolean): void {
  if (!userId) return;
  const map = autoMap();
  if (on) map[userId] = true; else delete map[userId];
  write(AUTO_SLOT, Object.keys(map).length ? JSON.stringify(map) : '');
}

/** the person has been told what the day report is (once, the first time they switch it on) */
export const reportInformed = (): boolean => read(REPORT_SLOT) === 'yes';
export const setReportInformed = (): void => write(REPORT_SLOT, 'yes');

/** the Android app keeps sharing when it is closed (on unless the person switched it off) */
export const backgroundWanted = (): boolean => read(BG_SLOT) !== 'off';
export const setBackgroundWanted = (on: boolean): void => write(BG_SLOT, on ? 'on' : 'off');
