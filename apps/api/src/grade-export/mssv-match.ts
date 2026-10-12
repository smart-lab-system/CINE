export interface SessionStudent {
  mssv: string;
  name: string;
}
export interface MssvCell {
  text: string;
  kind: 'empty' | 'text' | 'number' | 'other';
}
export interface MssvIndex {
  byLower: Map<string, SessionStudent>;
  byStripped: Map<string, SessionStudent[]>;
}
export type MatchResult =
  | { kind: 'matched'; student: SessionStudent; note: string | null }
  | { kind: 'unmatched'; reason: 'not_found' | 'ambiguous' | 'not_mssv'; note: string };

/** Cùng khuôn với `ck_session_roster_mssv` / `ck_submission_mssv`. */
const MSSV_SHAPE = /^[A-Za-z0-9]{4,20}$/;

/** Bỏ ký tự rộng-bằng-không, đổi chữ số toàn-góc về ASCII (NFKC), cắt khoảng trắng (kể cả NBSP). */
export function normalizeMssv(raw: string): string {
  return raw.replace(/[​-‍﻿]/g, '').normalize('NFKC').trim();
}

const stripZeros = (s: string) => s.replace(/^0+(?=.)/, '');

export function buildMssvIndex<T extends SessionStudent>(students: T[]): MssvIndex {
  const byLower = new Map<string, SessionStudent>();
  const byStripped = new Map<string, SessionStudent[]>();
  for (const student of students) {
    const key = student.mssv.toLowerCase();
    byLower.set(key, student);
    const stripped = stripZeros(key);
    byStripped.set(stripped, [...(byStripped.get(stripped) ?? []), student]);
  }
  return { byLower, byStripped };
}

/**
 * Khớp MỘT ô MSSV của file với sinh viên của phiên (spec D10). Không đoán ngầm: ô số mất số 0 đầu chỉ khớp khi
 * ĐÚNG MỘT MSSV của phiên hợp lý, và dòng đó mang ghi chú; mơ hồ thì từ chối.
 */
export function matchMssv(cell: MssvCell, index: MssvIndex): MatchResult {
  const text = normalizeMssv(cell.text);
  if (!MSSV_SHAPE.test(text)) {
    return { kind: 'unmatched', reason: 'not_mssv', note: 'Không giống MSSV (4–20 chữ hoặc số, không dấu cách).' };
  }
  const exact = index.byLower.get(text.toLowerCase());
  if (exact) return { kind: 'matched', student: exact, note: null };

  if (cell.kind === 'number' && /^\d+$/.test(text)) {
    const candidates = (index.byStripped.get(stripZeros(text)) ?? []).filter((s) => s.mssv.toLowerCase() !== text.toLowerCase());
    if (candidates.length === 1) {
      return { kind: 'matched', student: candidates[0]!, note: 'Khớp sau khi bỏ số 0 đầu (ô số).' };
    }
    if (candidates.length > 1) {
      return { kind: 'unmatched', reason: 'ambiguous', note: `Mơ hồ: ${candidates.length} MSSV của phiên cùng khớp sau khi bỏ số 0 đầu.` };
    }
  }
  return { kind: 'unmatched', reason: 'not_found', note: 'Không có trong danh sách sinh viên của phiên.' };
}
