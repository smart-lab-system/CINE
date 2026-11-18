import type { Rubric } from './api/grading';
import { formatVnPoints } from './format';
import { parseCap, type CriterionRow } from './rubric-form';

export interface QsStepRow {
  id: string;
  key: string;
  existing: boolean;
  description: string;
  maxPoints: string;
}

export interface QsApproachRow {
  id: string;
  key: string;
  existing: boolean;
  name: string;
  steps: QsStepRow[];
}

export interface QsRubricErrors {
  name?: string;
  totalPoints?: string;
  general?: string;
  approaches: Record<
    string,
    {
      name?: string;
      steps?: string;
      stepsById?: Record<string, { description?: string; maxPoints?: string }>;
    }
  >;
}

const CAP_ERROR = 'Điểm tối đa: từ 0,25 đến 100, tối đa hai chữ số lẻ.';
const TOTAL_ERROR = 'Tổng điểm: từ 0,25 đến 100, tối đa hai chữ số lẻ.';

export function newQsStep(id: string): QsStepRow {
  return { id, key: '', existing: false, description: '', maxPoints: '1' };
}

export function newQsApproach(id: string, stepId: string, name = ''): QsApproachRow {
  return { id, key: '', existing: false, name, steps: [newQsStep(stepId)] };
}

/** Nhãn ổn định "Cách giải N" - N = thứ tự 1-based trong form. */
export function approachOrdinalLabel(index: number): string {
  return `Cách giải ${index + 1}`;
}

export function approachesFromRubric(rubric: Rubric): QsApproachRow[] {
  const approaches = rubric.approaches ?? [];
  if (approaches.length === 0) {
    // Fallback: nhóm criteria theo approachKey
    const byKey = new Map<string, CriterionRow[]>();
    for (const c of rubric.criteria) {
      const ak = c.approachKey ?? '_';
      const list = byKey.get(ak) ?? [];
      list.push({
        id: c.id,
        key: c.key,
        existing: true,
        description: c.description,
        maxPoints: String(c.maxPoints),
      });
      byKey.set(ak, list);
    }
    return [...byKey.entries()].map(([key, steps], i) => ({
      id: `ap-${key}-${i}`,
      key: key === '_' ? '' : key,
      existing: key !== '_',
      name: key === '_' ? `Cách giải ${i + 1}` : key,
      steps: steps.map((s) => ({
        id: s.id,
        key: s.key,
        existing: true,
        description: s.description,
        maxPoints: s.maxPoints,
      })),
    }));
  }
  return approaches.map((a, i) => ({
    id: `ap-${a.key}-${i}`,
    key: a.key,
    existing: true,
    name: a.name,
    steps: a.steps.map((s, j) => ({
      id: `st-${a.key}-${s.key}-${j}`,
      key: s.key,
      existing: true,
      description: s.description,
      maxPoints: String(s.maxPoints),
    })),
  }));
}

export function sumApproachCaps(approach: QsApproachRow): number {
  let sum = 0;
  for (const step of approach.steps) {
    const n = parseCap(step.maxPoints);
    if (n !== null) sum += n;
  }
  return Math.round(sum * 100) / 100;
}

/** Tổng điểm rubric QS = max các cách giải. */
export function maxApproachCaps(approaches: QsApproachRow[]): number {
  if (approaches.length === 0) return 0;
  return Math.max(...approaches.map(sumApproachCaps));
}

export function validateQsRubric(
  meta: {
    name: string;
    nameEditable: boolean;
    existingNames: string[];
    totalPoints: string;
    courseRequired?: boolean;
    courseId?: string;
  },
  approaches: QsApproachRow[],
): QsRubricErrors {
  const errors: QsRubricErrors = { approaches: {} };
  const approachError = (id: string) => (errors.approaches[id] ??= {});

  if (meta.nameEditable) {
    const name = meta.name.trim();
    if (name === '') errors.name = 'Đặt tên cho rubric.';
    else if (name.length > 200) errors.name = 'Tên tối đa 200 ký tự.';
    else if (meta.existingNames.includes(name)) {
      errors.name = 'Đã có rubric tên này - chọn nó rồi sửa thay vì tạo lại.';
    }
  }

  if (meta.courseRequired && !(meta.courseId ?? '').trim()) {
    errors.general = errors.general ?? 'Chọn môn học.';
  }

  const total = parseCap(meta.totalPoints);
  if (total === null) errors.totalPoints = TOTAL_ERROR;

  if (approaches.length === 0) errors.general = 'Rubric QS cần ít nhất một cách giải.';
  else if (approaches.length > 20) errors.general = 'Tối đa 20 cách giải.';

  let capsOk = true;

  for (const ap of approaches) {
    const ae = approachError(ap.id);
    if (ap.name.trim().length < 1 || ap.name.trim().length > 200) {
      ae.name = 'Tên cách giải: 1–200 ký tự.';
    }

    if (ap.steps.length === 0) ae.steps = 'Mỗi cách giải cần ≥ 1 bước.';
    else if (ap.steps.length > 30) ae.steps = 'Tối đa 30 bước / cách giải.';

    for (const step of ap.steps) {
      const se = (ae.stepsById ??= {})[step.id] ??= {};
      const description = step.description.trim();
      if (description.length < 3 || description.length > 1000) {
        se.description = 'Mô tả bước: 3–1000 ký tự.';
      }
      if (parseCap(step.maxPoints) === null) {
        se.maxPoints = CAP_ERROR;
        capsOk = false;
      }
    }
  }

  if (errors.general === undefined && total !== null && capsOk && approaches.length > 0) {
    const max = maxApproachCaps(approaches);
    if (max > total) {
      errors.general = `Điểm cách giải cao nhất (${formatVnPoints(max)}) vượt tổng điểm (${formatVnPoints(total)}).`;
    }
  }

  return errors;
}

export function hasQsErrors(errors: QsRubricErrors): boolean {
  if (errors.name || errors.totalPoints || errors.general) return true;
  for (const ae of Object.values(errors.approaches)) {
    if (ae.name || ae.steps) return true;
    if (ae.stepsById && Object.keys(ae.stepsById).length > 0) {
      for (const se of Object.values(ae.stepsById)) {
        if (se.description || se.maxPoints) return true;
      }
    }
  }
  return false;
}

/** Server tự gán khoá hướng (từ tên) và bước `{approachKey}_s{n}` - không gửi key. */
export function buildSaveQsInput(
  name: string,
  approaches: QsApproachRow[],
  courseId?: string,
): {
  name: string;
  courseId?: string;
  kind: 'qs';
  approaches: {
    name: string;
    steps: { description: string; maxPoints: number }[];
  }[];
} {
  return {
    name: name.trim(),
    ...(courseId ? { courseId } : {}),
    kind: 'qs',
    approaches: approaches.map((ap) => ({
      name: ap.name.trim(),
      steps: ap.steps.map((st) => ({
        description: st.description.trim(),
        maxPoints: parseCap(st.maxPoints) as number,
      })),
    })),
  };
}
