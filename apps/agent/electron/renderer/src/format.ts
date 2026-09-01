/** Small formatting helpers shared by ConfirmedBadge and DetailView. */

export function formatClockTime(iso: string | null): string {
  if (!iso) {
    return '--:--';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/** "1:14:22" — h:mm:ss, dropping the hour digit only once it's actually
 *  zero, so a countdown never jumps from "1:14:22" to "14:22" and back. */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
