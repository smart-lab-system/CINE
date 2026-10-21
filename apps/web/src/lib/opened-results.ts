/**
 * Bài nào giảng viên đã mở TRÊN TRÌNH DUYỆT NÀY — nguồn của trạng thái "Đã xem / Chưa xem" ở panel duyệt nhanh.
 *
 * Vì sao ở phía trình duyệt: mốc thật (`grading_result.opened_at`, spec §5.5) chỉ được GHI qua
 * `POST grading-results/:id/opened`; chưa route đọc nào trả nó ra. Bản ghi ở đây vì thế chỉ biết những bài đã mở trên
 * trình duyệt này. Sai lệch của nó chỉ có một chiều an toàn: một bài đã mở ở máy khác hiện "Chưa xem" và thêm một
 * lời nhắc — không bao giờ một bài chưa mở hiện "Đã xem". Lời nhắc không chặn nút duyệt.
 *
 * `localStorage` có thể bị chặn (chế độ riêng tư, chính sách trình duyệt): mọi lần đọc/ghi bọc try/catch, và khi đó
 * mọi bài đơn giản là "Chưa xem".
 */
const STORAGE_KEY = 'cine:grading:opened-results';
const CHANGE_EVENT = 'cine:opened-results-change';
/** Giữ những lần mở gần nhất; một học kỳ của một giảng viên còn xa mới chạm tới. */
const MAX_REMEMBERED = 2000;

const EMPTY: ReadonlySet<string> = new Set();
let cache: { raw: string | null; ids: ReadonlySet<string> } = { raw: null, ids: EMPTY };

function readRaw(): string | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Ảnh chụp hiện tại. Trả CÙNG một đối tượng khi dữ liệu không đổi (điều kiện của `useSyncExternalStore`). */
export function openedResultsSnapshot(): ReadonlySet<string> {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, ids: raw ? new Set(parse(raw)) : EMPTY };
  return cache.ids;
}

export function openedResultsServerSnapshot(): ReadonlySet<string> {
  return EMPTY;
}

export function rememberOpened(resultId: string): void {
  try {
    const ids = parse(readRaw()).filter((id) => id !== resultId);
    ids.push(resultId);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(-MAX_REMEMBERED)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Không ghi được thì chỉ mất dấu "Đã xem" — không phải lỗi của giảng viên, không báo gì.
  }
}

/** Nghe cả tab khác (`storage`) lẫn chính tab này (sự kiện riêng): mở bài ở tab mới rồi quay lại vẫn thấy "Đã xem". */
export function subscribeOpenedResults(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
