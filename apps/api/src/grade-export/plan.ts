import { createHash } from 'node:crypto';
import { parseHundredths } from '../grading/scoring/hundredths';
import { isOwnLabel } from './blank-reason';
import type { Cause } from './diff-rules';
import type { BlankReason } from './grade-export.types';
import { MSG } from './grade-export.messages';
import { buildMssvIndex, matchMssv, normalizeMssv, type MatchResult } from './mssv-match';
import { roundHalfUp } from './rounding';

export interface FileCell {
  text: string;
  kind: 'empty' | 'text' | 'number' | 'other';
  hasFormula: boolean;
  mergedNonMaster: boolean;
}
export interface FileRowInput {
  row: number;
  mssv: FileCell;
  score: FileCell;
  reason: FileCell | null;
}
export type StudentOutcome =
  | { kind: 'scored'; hundredths: number; computationId: string | null; source: string }
  | { kind: 'blank'; reason: BlankReason }
  /** Nhiều kết quả trong phạm vi xuất (R-a, bẫy 3): không chọn một, không ghi. */
  | { kind: 'conflict'; reason: string };
export interface PlanStudent {
  mssv: string;
  name: string;
  outcome: StudentOutcome;
}
export interface PreviousWrite {
  hundredths: number;
  computationId: string | null;
  /** Bước làm tròn của lượt xuất đã ghi giá trị đó (phần trăm điểm) — để nhận ra thay đổi CHỈ do đổi bước. */
  step: number;
}
export interface PlanInput {
  firstDataRow: number;
  /** Các dòng từ `firstDataRow`, theo thứ tự dòng tăng dần. */
  rows: FileRowInput[];
  students: PlanStudent[];
  /** Khoá: MSSV chữ thường. */
  previous: ReadonlyMap<string, PreviousWrite>;
  roundingStep: number;
  hasReasonColumn: boolean;
  sheetProtected: boolean;
}

export type RowAction = 'write' | 'blank' | 'kept' | 'unmatched' | 'duplicate' | 'conflict' | 'skipped_formula' | 'skipped_merged';
export type Direction = 'up' | 'down' | 'same' | 'new';

export interface PlanRow {
  row: number;
  mssvInFile: string;
  studentMssv: string | null;
  studentName: string | null;
  action: RowAction;
  systemHundredths: number | null;
  writtenHundredths: number | null;
  blankReason: BlankReason | null;
  previousHundredths: number | null;
  direction: Direction | null;
  computationId: string | null;
  source: string | null;
  causes: Cause[];
  note: string | null;
  overwritesScore: boolean;
  overwritesReason: boolean;
  writesReason: boolean;
  clearsReason: boolean;
}

export interface ExportPlan {
  rows: PlanRow[];
  notInFile: PlanStudent[];
  summary: { write: number; blank: number; kept: number; unmatched: number; duplicates: number; skipped: number; ignoredEmpty: number; notInFile: number };
  overwrite: { score: number; reason: number };
  blockers: string[];
  digest: string;
}

const EMPTY_CELL: FileCell = { text: '', kind: 'empty', hasFormula: false, mergedNonMaster: false };

/** "7,5", "7,25", "8,0" — cùng kiểu với `formatVnPoints` của web, từ số nguyên. */
function vn(hundredths: number): string {
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return frac === 0 ? `${whole},0` : frac % 10 === 0 ? `${whole},${frac / 10}` : `${whole},${String(frac).padStart(2, '0')}`;
}

const BLANK_NOTE_TAIL: Record<BlankReason, string> = {
  absent: 'không có bài nộp',
  not_finished: 'chưa chấm xong hoặc chưa chốt điểm',
  ungradable: 'hệ thống không chấm được',
  flagged: 'đang chờ giảng viên duyệt',
};

function cellProblem(cell: FileCell, label: string): { action: 'skipped_formula' | 'skipped_merged'; note: string } | null {
  if (cell.hasFormula) return { action: 'skipped_formula', note: `${label} có công thức — không ghi.` };
  if (cell.mergedNonMaster) return { action: 'skipped_merged', note: `${label} nằm trong vùng gộp ô — không ghi.` };
  return null;
}

/** Giá trị SỐ đang có trong ô điểm, để biết ghi vào có thật sự đổi gì không. */
function existingHundredths(cell: FileCell): number | null {
  return cell.kind === 'number' && /^\d{1,4}(\.\d{1,2})?$/.test(cell.text) ? parseHundredths(cell.text) : null;
}

const blankRow = (row: number, mssvInFile: string): PlanRow => ({
  row, mssvInFile, studentMssv: null, studentName: null, action: 'unmatched', systemHundredths: null, writtenHundredths: null,
  blankReason: null, previousHundredths: null, direction: null, computationId: null, source: null, causes: [], note: null,
  overwritesScore: false, overwritesReason: false, writesReason: false, clearsReason: false,
});

export function buildPlan(input: PlanInput): ExportPlan {
  const index = buildMssvIndex(input.students);
  const byKey = new Map(input.students.map((s) => [s.mssv.toLowerCase(), s] as const));

  let ignoredEmpty = 0;
  const firstPass: { file: FileRowInput; match: MatchResult }[] = [];
  const rowsByStudent = new Map<string, number[]>();
  for (const file of input.rows) {
    // Ô trắng hoặc chỉ có khoảng trắng/ký tự vô hình trông như ô trống với giảng viên — cũng là "trống", không phải "không khớp".
    if (file.mssv.kind === 'empty' || normalizeMssv(file.mssv.text) === '') {
      ignoredEmpty += 1;
      continue;
    }
    const match = matchMssv(file.mssv, index);
    if (match.kind === 'matched') {
      const key = match.student.mssv.toLowerCase();
      rowsByStudent.set(key, [...(rowsByStudent.get(key) ?? []), file.row]);
    }
    firstPass.push({ file, match });
  }
  const duplicated = new Set([...rowsByStudent].filter(([, list]) => list.length > 1).map(([key]) => key));

  const rows = firstPass.map(({ file, match }): PlanRow => {
    const base = blankRow(file.row, normalizeMssv(file.mssv.text));
    if (match.kind === 'unmatched') return { ...base, action: 'unmatched', note: match.note };

    const key = match.student.mssv.toLowerCase();
    const student = byKey.get(key)!;
    const known: PlanRow = { ...base, studentMssv: student.mssv, studentName: student.name, note: match.note };
    if (duplicated.has(key)) {
      return { ...known, action: 'duplicate', note: `MSSV trùng ở các dòng ${rowsByStudent.get(key)!.join(', ')}.` };
    }

    const previous = input.previous.get(key) ?? null;
    const reasonCell = input.hasReasonColumn ? (file.reason ?? EMPTY_CELL) : null;
    const outcome = student.outcome;

    if (outcome.kind === 'scored') {
      // Ô ta sẽ đụng: ô điểm, và ô lý do NẾU nó đang mang nhãn cũ của chính hệ thống (để xoá).
      const clearsReason = reasonCell !== null && reasonCell.kind === 'text' && isOwnLabel(reasonCell.text);
      const problem = cellProblem(file.score, 'Ô điểm') ?? (clearsReason ? cellProblem(reasonCell!, 'Ô lý do') : null);
      if (problem) return { ...known, action: problem.action, note: problem.note };

      const written = roundHalfUp(outcome.hundredths, input.roundingStep);
      const existing = existingHundredths(file.score);
      const direction: Direction | null =
        input.previous.size === 0 ? null : previous === null ? 'new' : written > previous.hundredths ? 'up' : written < previous.hundredths ? 'down' : 'same';
      return {
        ...known,
        action: 'write',
        systemHundredths: outcome.hundredths,
        writtenHundredths: written,
        previousHundredths: previous?.hundredths ?? null,
        direction,
        computationId: outcome.computationId,
        source: outcome.source,
        overwritesScore: file.score.kind !== 'empty' && existing !== written,
        clearsReason,
      };
    }

    if (outcome.kind === 'conflict') {
      // Nhiều kết quả trong phạm vi (R-a): không ghi điểm lẫn nhãn; `blockers` chặn xuất cho tới khi chọn yêu cầu nộp.
      return { ...known, action: 'conflict', note: outcome.reason, previousHundredths: previous?.hundredths ?? null };
    }
    const problem = reasonCell ? cellProblem(reasonCell, 'Ô lý do') : null;
    if (problem) return { ...known, action: problem.action, note: problem.note };
    const kept = previous !== null;
    return {
      ...known,
      action: kept ? 'kept' : 'blank',
      blankReason: outcome.reason,
      previousHundredths: previous?.hundredths ?? null,
      writesReason: reasonCell !== null,
      overwritesReason: reasonCell !== null && reasonCell.kind !== 'empty' && !isOwnLabel(reasonCell.text),
      note: kept ? `Lần trước đã ghi ${vn(previous.hundredths)}; lần này bài ${BLANK_NOTE_TAIL[outcome.reason]} — giữ nguyên ô điểm.` : known.note,
    };
  });

  const notInFile = input.students
    .filter((s) => !rowsByStudent.has(s.mssv.toLowerCase()))
    .sort((a, b) => (a.mssv.toLowerCase() < b.mssv.toLowerCase() ? -1 : a.mssv.toLowerCase() > b.mssv.toLowerCase() ? 1 : 0));

  const count = (...actions: RowAction[]) => rows.filter((r) => actions.includes(r.action)).length;
  const actionable = count('write', 'blank', 'kept');

  const blockers: string[] = [];
  if (input.sheetProtected) blockers.push(MSG.protectedSheet);
  if (duplicated.size > 0) {
    const examples = [...duplicated].slice(0, 3).map((k) => byKey.get(k)!.mssv).join(', ');
    blockers.push(MSG.duplicates(duplicated.size, examples));
  }
  const conflicted = rows.filter((r) => r.action === 'conflict').length;
  if (conflicted > 0) blockers.push(MSG.conflicts(conflicted));
  if (actionable === 0) blockers.push(MSG.noMatch(input.firstDataRow));

  const digest = createHash('sha256')
    .update(
      JSON.stringify({
        step: input.roundingStep,
        reason: input.hasReasonColumn,
        rows: rows.map((r) => [r.row, r.action, r.studentMssv, r.writtenHundredths, r.blankReason, r.writesReason, r.clearsReason]),
        notInFile: notInFile.map((s) => s.mssv),
      }),
    )
    .digest('hex');

  return {
    rows,
    notInFile,
    summary: {
      write: count('write'),
      blank: count('blank'),
      kept: count('kept'),
      unmatched: count('unmatched'),
      duplicates: count('duplicate'),
      skipped: count('skipped_formula', 'skipped_merged'),
      ignoredEmpty,
      notInFile: notInFile.length,
    },
    overwrite: { score: rows.filter((r) => r.overwritesScore).length, reason: rows.filter((r) => r.overwritesReason).length },
    blockers,
    digest,
  };
}
