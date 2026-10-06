import { formatDmy, semesterLabel } from '../../common/semester-label';
import { semesterProblems, type SemesterInput } from '../semester.rules';
import { parseCellDate, parseCellInt, parseTermCell, shown } from './import-cells';
import { blankRow, errorRow, type ImportPlan, type ImportRowResult } from './import.types';

export interface SemesterImportRow {
  line: number;
  academicYear: string;
  term: string;
  startDate: string;
  endDate: string;
}

export interface ExistingSemester {
  id: string;
  academicYearStart: number;
  term: number;
  /** `yyyy-mm-dd`. */
  startDate: string;
  endDate: string;
}

export type SemesterWrite =
  | { kind: 'create'; academicYearStart: number; term: number; startDate: string; endDate: string }
  | { kind: 'update'; id: string; startDate: string; endDate: string };

interface Candidate {
  index: number;
  line: number;
  label: string;
  input: SemesterInput;
  current: ExistingSemester | undefined;
  kind: 'new' | 'update' | 'unchanged';
}

/** Hai khoảng ĐÓNG ở hai đầu (như `ex_semester_dates_overlap`, `daterange(…, '[]')`) có chung ít nhất một ngày. */
function overlaps(a: { startDate: string; endDate: string }, b: { startDate: string; endDate: string }): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

const range = (value: { startDate: string; endDate: string }) =>
  `${formatDmy(value.startDate)}–${formatDmy(value.endDate)}`;

/**
 * Hàm THUẦN cho import học kỳ. Khoá là (năm học, kỳ); CHỈ SỬA ngày (nguyên tắc 2) — đổi khoá là một học kỳ mới.
 *
 * Chồng ngày là quy tắc BẢO THỦ có chủ ý. Ràng buộc `ex_semester_dates_overlap` kiểm TỪNG câu lệnh và không hoãn được, nên
 * một file dời hai kỳ chéo vào chỗ của nhau sẽ chồng NGAY LÚC câu `UPDATE` đầu chạy dù kết quả cuối hợp lệ. Thay vì sắp
 * thứ tự ghi (không có thứ tự nào đúng cho mọi file), mỗi khoảng ngày mới bị so với:
 *   (1) ngày HIỆN TẠI của MỌI học kỳ có sẵn — kể cả kỳ cũng đang được file dời đi, và
 *   (2) ngày sau-nhập của mọi dòng khác trong file.
 * Qua được cả hai thì mọi thứ tự ghi đều không chồng ở bất kỳ thời điểm nào. Cái giá: file dời chéo hai kỳ bị từ chối kèm
 * gợi ý "nhập từng kỳ một" — hiếm với 3 kỳ/năm, và rẻ hơn một rollback khó hiểu.
 *
 * Mọi so sánh chồng dùng tập dòng hợp lệ ở thời điểm TRƯỚC khi gán lỗi chồng, để kết quả không phụ thuộc thứ tự dòng.
 */
export function planSemesterImport(
  rows: readonly SemesterImportRow[],
  existing: readonly ExistingSemester[],
): ImportPlan<SemesterWrite> {
  const byKey = new Map(existing.map((s) => [`${s.academicYearStart}-${s.term}`, s]));
  const firstLineOfKey = new Map<string, number>();
  const results: ImportRowResult[] = new Array(rows.length);
  const candidates: Candidate[] = [];

  rows.forEach((row, index) => {
    const problems: string[] = [];
    const year = parseCellInt(row.academicYear);
    const term = parseTermCell(row.term);
    const startDate = parseCellDate(row.startDate);
    const endDate = parseCellDate(row.endDate);
    if (year === null) problems.push(`Năm học ${shown(row.academicYear)} không phải số (vd 2026 cho năm học 2026-2027).`);
    if (term === null) problems.push(`Kỳ ${shown(row.term)} không hợp lệ, cần 1, 2 hoặc 3.`);
    if (startDate === null) {
      problems.push(`Ngày bắt đầu ${shown(row.startDate)} không hiểu được, dùng yyyy-mm-dd hoặc dd/mm/yyyy.`);
    }
    if (endDate === null) {
      problems.push(`Ngày kết thúc ${shown(row.endDate)} không hiểu được, dùng yyyy-mm-dd hoặc dd/mm/yyyy.`);
    }

    const label = year !== null && term !== null ? semesterLabel(year, term) : `Dòng ${row.line}`;
    if (year === null || term === null || startDate === null || endDate === null) {
      results[index] = errorRow(row.line, label, problems);
      return;
    }

    const input: SemesterInput = { academicYearStart: year, term, startDate, endDate };
    problems.push(...semesterProblems(input));

    if (problems.length === 0) {
      const key = `${year}-${term}`;
      const first = firstLineOfKey.get(key);
      if (first !== undefined) {
        problems.push(`Trùng với dòng ${first}: ${label} đã xuất hiện trong file.`);
      } else {
        firstLineOfKey.set(key, row.line);
      }
    }
    if (problems.length > 0) {
      results[index] = errorRow(row.line, label, problems);
      return;
    }

    const current = byKey.get(`${year}-${term}`);
    const kind: Candidate['kind'] = !current
      ? 'new'
      : current.startDate === startDate && current.endDate === endDate
        ? 'unchanged'
        : 'update';
    candidates.push({ index, line: row.line, label, input, current, kind });
  });

  // Chồng ngày — chỉ các dòng sẽ ĐỔI dữ liệu (`new`/`update`) là chủ thể; dòng `unchanged` trùng đúng dữ liệu có sẵn
  // nên phép so (1) đã bao nó.
  const touched = candidates.filter((c) => c.kind !== 'unchanged');
  const overlapError = new Map<number, string>();
  for (const subject of touched) {
    const mine = subject.input;
    const clash = existing.find((other) => other.id !== subject.current?.id && overlaps(mine, other));
    if (clash) {
      const movedByFile = touched.some((t) => t.current?.id === clash.id);
      overlapError.set(
        subject.index,
        `Ngày ${range(mine)} chồng với ${semesterLabel(clash.academicYearStart, clash.term)} (${range(clash)}).` +
          (movedByFile
            ? ' Ngày hiện tại của kỳ đó vẫn được tính; nếu bạn đang dời cả hai kỳ, hãy nhập từng kỳ một.'
            : ''),
      );
      continue;
    }
    const fileClash = touched.find((other) => other.index !== subject.index && overlaps(mine, other.input));
    if (fileClash) {
      overlapError.set(
        subject.index,
        `Ngày ${range(mine)} chồng với ${fileClash.label} ở dòng ${fileClash.line} của file (${range(fileClash.input)}).`,
      );
    }
  }

  const writes: SemesterWrite[] = [];
  for (const candidate of candidates) {
    const message = overlapError.get(candidate.index);
    if (message) {
      results[candidate.index] = errorRow(candidate.line, candidate.label, [message]);
      continue;
    }
    const result = blankRow(candidate.line, candidate.label);
    result.status = candidate.kind;
    if (candidate.kind === 'new') {
      writes.push({ kind: 'create', ...candidate.input });
    } else if (candidate.kind === 'update' && candidate.current) {
      const { current, input } = candidate;
      if (current.startDate !== input.startDate) {
        result.changes.push({
          field: 'startDate',
          label: 'Ngày bắt đầu',
          from: formatDmy(current.startDate),
          to: formatDmy(input.startDate),
        });
      }
      if (current.endDate !== input.endDate) {
        result.changes.push({
          field: 'endDate',
          label: 'Ngày kết thúc',
          from: formatDmy(current.endDate),
          to: formatDmy(input.endDate),
        });
      }
      writes.push({ kind: 'update', id: current.id, startDate: input.startDate, endDate: input.endDate });
    }
    results[candidate.index] = result;
  }

  return { rows: results, writes };
}
