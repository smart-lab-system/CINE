import { normalizeRoomName, roomNameProblem } from '../../common/master-data-normalize';
import { parseCellInt, shown } from './import-cells';
import { attachSimilar, type NewEntry } from './import-similar';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface RoomImportRow {
  line: number;
  name: string;
  /** Chữ của ô; rỗng = không nói gì về sức chứa. */
  capacity: string;
}

export interface ExistingRoom {
  id: string;
  name: string;
  capacity: number | null;
}

export type RoomWrite =
  | { kind: 'create'; name: string; capacity: number | null }
  | { kind: 'update'; id: string; capacity: number };

/** Khớp `ck_room_capacity` ở DB (plan C). */
const CAPACITY_MIN = 1;
const CAPACITY_MAX = 1000;

/**
 * Hàm THUẦN: dòng chữ + các phòng có sẵn → kết quả từng dòng và việc cần ghi. Không chạm DB, nên xem trước và ghi thật gọi
 * cùng một hàm (spec §6.2 nguyên tắc 5) và test được hết các ca mà không cần dựng gì.
 *
 * Khoá là TÊN (so không phân biệt hoa-thường, như `citext` ở DB). Chỉ SỬA sức chứa (nguyên tắc 2): ô sức chứa trống không
 * xoá sức chứa đang có, và đổi tên làm thủ công — một tên khác trong file là một phòng MỚI (T-IMP-8).
 *
 * `toLowerCase()` của JS và `lower()` của Postgres có thể khác nhau ở locale lạ; nếu lệch, DB (khoá duy nhất citext) vẫn là
 * thẩm quyền cuối và cả lô rollback — không bao giờ ghi nửa chừng.
 */
export function planRoomImport(
  rows: readonly RoomImportRow[],
  existing: readonly ExistingRoom[],
): ImportPlan<RoomWrite> {
  const byKey = new Map(existing.map((room) => [room.name.toLowerCase(), room]));
  const firstLineOfKey = new Map<string, number>();
  const results: ImportRowResult[] = [];
  const writes: RoomWrite[] = [];
  const newEntries: NewEntry[] = [];

  rows.forEach((row) => {
    const name = normalizeRoomName(row.name);
    const problems: string[] = [];

    const nameProblem = roomNameProblem(name);
    if (nameProblem) problems.push(nameProblem);

    let capacity: number | null = null;
    if (row.capacity.trim() !== '') {
      const parsed = parseCellInt(row.capacity);
      if (parsed === null || parsed < CAPACITY_MIN || parsed > CAPACITY_MAX) {
        problems.push(
          `Sức chứa ${shown(row.capacity)} không hợp lệ, cần số nguyên từ ${CAPACITY_MIN} đến ${CAPACITY_MAX} (hoặc để trống).`,
        );
      } else {
        capacity = parsed;
      }
    }

    if (!nameProblem) {
      const key = name.toLowerCase();
      const first = firstLineOfKey.get(key);
      if (first !== undefined) {
        problems.push(`Trùng với dòng ${first}: phòng "${name}" đã xuất hiện trong file.`);
      } else {
        firstLineOfKey.set(key, row.line);
      }
    }

    if (problems.length > 0) {
      results.push(errorRow(row.line, name === '' ? `Dòng ${row.line}` : name, problems));
      return;
    }

    const current = byKey.get(name.toLowerCase());
    if (!current) {
      const created = { ...blankRow(row.line, name), status: 'new' as const };
      // Dòng MỚI cũng hiện giá trị đã hiểu (từ trống → giá trị): bản xem trước phải cho admin thấy thứ sẽ được ghi.
      if (capacity !== null) {
        created.changes.push({ field: 'capacity', label: 'Sức chứa', from: null, to: String(capacity) });
      }
      results.push(created);
      writes.push({ kind: 'create', name, capacity });
      newEntries.push({ index: results.length - 1, line: row.line, name });
      return;
    }

    const result = blankRow(row.line, current.name);
    if (capacity !== null && capacity !== current.capacity) {
      result.status = 'update';
      result.changes.push({
        field: 'capacity',
        label: 'Sức chứa',
        from: current.capacity === null ? null : String(current.capacity),
        to: String(capacity),
      });
      writes.push({ kind: 'update', id: current.id, capacity });
    }
    results.push(result);
  });

  attachSimilar(
    results,
    newEntries,
    existing.map((room) => ({ id: room.id, name: room.name })),
  );
  return { rows: results, writes };
}
