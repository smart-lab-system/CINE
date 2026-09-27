/**
 * Luật giải nén — HÀM THUẦN, không import gì. Port từ `grading/archive/archive-rules.ts` của nhánh
 * plan-1, giữ nguyên luật (zip slip, symlink, bom), chỉ đổi trần: đây là bài CODE, không phải bộ
 * tài liệu. Tách khỏi thư viện đọc zip để các ca tấn công test được bằng một mảng object.
 */

export interface ArchiveEntry {
  /** Tên như ghi trong archive — KHÔNG TIN ĐƯỢC. */
  path: string;
  /** Kích thước sau giải nén, đọc từ header — cũng KHÔNG tin được; người đọc byte phải đếm lại. */
  uncompressedSize: number;
  isDirectory: boolean;
  isSymlink: boolean;
}

export interface ExtractionLimits {
  maxEntries: number;
  maxTotalBytes: number;
  maxFileBytes: number;
}

/** Bài code CTDL&GT: vài chục file, vài chục KB. Trần rộng gấp nhiều lần mà vẫn chặn được bom. */
export const SOURCE_EXTRACTION_LIMITS: ExtractionLimits = {
  maxEntries: 500,
  maxTotalBytes: 8 * 1024 * 1024,
  maxFileBytes: 1024 * 1024,
};

export type EntryDecision = { take: true; safePath: string } | { take: false; reason: string };

export function decideEntry(entry: ArchiveEntry, limits: ExtractionLimits): EntryDecision {
  if (entry.isSymlink) {
    // Không kiểm đích: đích chỉ đọc được SAU khi đã tạo link.
    return { take: false, reason: 'liên kết tượng trưng không được phép' };
  }
  const normalised = entry.path.replace(/\\/g, '/');
  if (normalised.startsWith('/') || /^[A-Za-z]:\//.test(normalised)) {
    return { take: false, reason: 'đường dẫn tuyệt đối' };
  }
  // Tách theo SEGMENT, không dùng `includes('..')`: "a..b.txt" là tên file hợp lệ.
  const segments = normalised.split('/').filter((s) => s.length > 0 && s !== '.');
  if (segments.some((s) => s === '..')) return { take: false, reason: 'đường dẫn thoát ra ngoài thư mục đích' };
  if (segments.length === 0) return { take: false, reason: 'đường dẫn rỗng' };
  if (entry.uncompressedSize > limits.maxFileBytes) return { take: false, reason: `file vượt ${limits.maxFileBytes} byte` };
  return { take: true, safePath: segments.join('/') };
}

export function planExtraction(
  entries: ArchiveEntry[],
  limits: ExtractionLimits = SOURCE_EXTRACTION_LIMITS,
): { take: { path: string; safePath: string }[]; rejected: { path: string; reason: string }[]; refusal: string | null } {
  const files = entries.filter((e) => !e.isDirectory);
  if (files.length > limits.maxEntries) return { take: [], rejected: [], refusal: `số lượng file vượt ${limits.maxEntries}` };
  const take: { path: string; safePath: string }[] = [];
  const rejected: { path: string; reason: string }[] = [];
  let total = 0;
  for (const entry of files) {
    const decision = decideEntry(entry, limits);
    if (!decision.take) {
      rejected.push({ path: entry.path, reason: decision.reason });
      continue;
    }
    total += entry.uncompressedSize;
    // Chặn TRƯỚC khi đọc byte nào.
    if (total > limits.maxTotalBytes) {
      return { take: [], rejected: [], refusal: `tổng dung lượng sau giải nén vượt ${limits.maxTotalBytes} byte` };
    }
    take.push({ path: entry.path, safePath: decision.safePath });
  }
  return { take, rejected, refusal: null };
}
