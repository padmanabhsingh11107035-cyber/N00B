export function formatClockTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((Math.max(0, ms) % 1000) / 100);

  if (totalSeconds < 10) {
    return `${seconds}.${tenths}`;
  }
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}
