// shared by the weekly-test screens

// "Mon, 14 Oct 2026, 6:42 pm" in the student's own time zone (a wrong or unknown zone falls back to the phone's)
export function fmtWhen(iso: string | null | undefined, tz?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true };
  try { return d.toLocaleString('en-IN', { ...opts, timeZone: tz || undefined }); } catch { return d.toLocaleString('en-IN', opts); }
}

// the line that goes with a result, kind and honest
export function testMessage(percent: number): string {
  if (percent >= 90) return 'Excellent. You really know this.';
  if (percent >= 70) return 'Very good. A little more and it is perfect.';
  if (percent >= 50) return 'A fair start. Look at the ones you missed, they will teach you the most.';
  return 'This is how learning starts. Go through the review, then try the tutor on the parts that felt hard.';
}

// the answers of a test being taken are kept on this phone only until it is handed in, so a refresh or a phone call does not lose them
const key = (id: string) => 'noob.study.test.' + id;
export function loadDraft(id: string, n: number): Array<number | null> {
  try {
    const raw = JSON.parse(localStorage.getItem(key(id)) || 'null');
    if (Array.isArray(raw) && raw.length === n) return raw.map((x) => (Number.isInteger(x) && x >= 0 && x < 8 ? x : null));
  } catch { /* none */ }
  return Array.from({ length: n }, () => null);
}
export function saveDraft(id: string, answers: Array<number | null>): void { try { localStorage.setItem(key(id), JSON.stringify(answers)); } catch { /* it just will not survive a refresh */ } }
export function clearDraft(id: string): void { try { localStorage.removeItem(key(id)); } catch { /* none */ } }
