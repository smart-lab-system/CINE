/**
 * Parse `rubric.txt` kiểu dsa_vi_03 → approaches/steps QS.
 * Chỉ lấy Solution + bước checklist — bỏ solution/sub.
 */

export interface ParsedDsaStep {
  description: string;
  maxPoints: number;
}

export interface ParsedDsaApproach {
  /** Tên hiển thị (sau "Solution N:"). */
  name: string;
  steps: ParsedDsaStep[];
}

export interface ParsedDsaRubric {
  /** Dòng tiêu đề trước Solution đầu (nếu có). */
  title: string | null;
  approaches: ParsedDsaApproach[];
}

/** Tên sau dấu `:` có thể trống → đặt "Cách giải N". */
const SOLUTION_RE = /^(?:\d+\.\s*)?Solution\s+(\d+)\s*:\s*(.*?)\s*$/i;
/** Có mark — cho phép `:` sau `marks`. */
const STEP_MARKED_RE =
  /^(?:\d+\.\s*)?(.+?)\s*\[(\d+(?:[.,]\d+)?)\s*marks?\]\s*:?\s*$/i;
/** Bước đánh số không có mark → mặc định 1 điểm. */
const STEP_NUMBERED_RE = /^(\d+)\.\s+(.+?)\s*$/;

function parseMarks(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Điểm bước không hợp lệ: [${raw} mark]`);
  }
  return Math.round(n * 100) / 100;
}

function cleanStepText(raw: string): string {
  return raw
    .replace(/^\d+\.\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDsaRubricText(text: string): ParsedDsaRubric {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const approaches: ParsedDsaApproach[] = [];
  let title: string | null = null;
  let current: ParsedDsaApproach | null = null;
  let pendingContinuation: string[] = [];

  const flushContinuation = () => {
    if (!current || current.steps.length === 0 || pendingContinuation.length === 0) {
      pendingContinuation = [];
      return;
    }
    const extra = pendingContinuation.map((l) => l.trim()).filter(Boolean).join(' ');
    pendingContinuation = [];
    if (!extra) return;
    const last = current.steps[current.steps.length - 1];
    last.description = `${last.description} ${extra}`.replace(/\s+/g, ' ').trim();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u00a0/g, ' ').trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sol = trimmed.match(SOLUTION_RE);
    if (sol) {
      flushContinuation();
      const n = sol[1];
      const label = sol[2].trim() || `Cách giải ${n}`;
      current = { name: label, steps: [] };
      approaches.push(current);
      continue;
    }

    if (!current) {
      if (!title) title = trimmed;
      continue;
    }

    const marked = trimmed.match(STEP_MARKED_RE);
    if (marked) {
      flushContinuation();
      current.steps.push({
        description: cleanStepText(marked[1]),
        maxPoints: parseMarks(marked[2]),
      });
      continue;
    }

    const numbered = trimmed.match(STEP_NUMBERED_RE);
    if (numbered && !SOLUTION_RE.test(trimmed)) {
      flushContinuation();
      current.steps.push({
        description: cleanStepText(numbered[2]),
        maxPoints: 1,
      });
      continue;
    }

    if (/^[*•\-–]/.test(trimmed)) {
      pendingContinuation.push(trimmed.replace(/^[*•\-–]\s*/, ''));
      continue;
    }

    if (current.steps.length > 0) {
      pendingContinuation.push(trimmed);
    }
  }
  flushContinuation();

  if (approaches.length === 0) {
    throw new Error('Không tìm thấy Solution nào trong rubric.txt.');
  }
  for (let i = 0; i < approaches.length; i++) {
    if (approaches[i].steps.length === 0) {
      throw new Error(`Solution "${approaches[i].name}" không có bước nào có điểm.`);
    }
  }

  return { title, approaches };
}

/** Điểm câu = max tổng mark các hướng. */
export function maxApproachPoints(approaches: ParsedDsaApproach[]): number {
  return Math.max(
    ...approaches.map(
      (a) => Math.round(a.steps.reduce((s, st) => s + st.maxPoints, 0) * 100) / 100,
    ),
  );
}
