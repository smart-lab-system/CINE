import { Comparator } from '../sandbox/contract';

export class CheckerUnavailableError extends Error {
  constructor(name: string) {
    super(`checker "${name}" chưa được cài ở worker`);
    this.name = 'CheckerUnavailableError';
  }
}

export function normalizeLines(s: string): string[] {
  const lines = s.replace(/\r\n/g, '\n').split('\n').map((l) => l.replace(/[ \t]+$/, ''));
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const clip = (s: string | undefined) =>
  s === undefined ? '(không có dòng)' : JSON.stringify(s.length > 200 ? `${s.slice(0, 200)}…` : s);

function firstLineDiff(expected: string[], got: string[]): string | null {
  const n = Math.max(expected.length, got.length);
  for (let i = 0; i < n; i++) {
    if (expected[i] !== got[i]) return `dòng ${i + 1}: mong đợi ${clip(expected[i])}, nhận ${clip(got[i])}`;
  }
  return null;
}

function numbersClose(a: string, b: string, eps: number): boolean {
  if (a === b) return true;
  const x = Number(a);
  const y = Number(b);
  if (!Number.isFinite(x) || !Number.isFinite(y) || a.trim() === '' || b.trim() === '') return false;
  return Math.abs(x - y) <= eps * Math.max(1, Math.abs(x));
}

/**
 * So output NGOÀI container (spec §3.5 luật 4): container của bài không bao
 * giờ thấy output mong đợi, nên phép so không thể chạy ở trong.
 */
export function compareOutput(expected: string, got: string, c: Comparator): { equal: boolean; diff: string | null } {
  switch (c.kind) {
    case 'exact': {
      const diff = firstLineDiff(normalizeLines(expected), normalizeLines(got));
      return { equal: diff === null, diff: diff?.slice(0, 1_024) ?? null };
    }
    case 'unordered_lines': {
      const a = normalizeLines(expected).sort();
      const b = normalizeLines(got).sort();
      const equal = firstLineDiff(a, b) === null;
      return { equal, diff: equal ? null : `tập dòng khác nhau (${a.length} dòng mong đợi, ${b.length} dòng nhận)` };
    }
    case 'float_tolerance': {
      const a = expected.trim().split(/\s+/);
      const b = got.trim().split(/\s+/);
      if (a.length !== b.length) {
        return { equal: false, diff: `số token khác nhau: mong đợi ${a.length}, nhận ${b.length}` };
      }
      const i = a.findIndex((tok, k) => !numbersClose(tok, b[k], c.eps));
      return i === -1
        ? { equal: true, diff: null }
        : { equal: false, diff: `token ${i + 1}: mong đợi ${clip(a[i])}, nhận ${clip(b[i])}` };
    }
    case 'checker':
      throw new CheckerUnavailableError(c.name);
  }
}
