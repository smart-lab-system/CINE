/** Nhóm bước QS từ dòng criterion (+ approach) cho overview Bảng lỗi. */

export type OverviewCriterionRow = {
  key: string;
  description: string;
  maxPoints: number;
  errorCount: number;
  waiverId: string | null;
};

export type OverviewApproach = {
  key: string;
  name: string;
  maxPoints: number;
  steps: OverviewCriterionRow[];
};

export type CriterionWithApproach = {
  key: string;
  description: string;
  maxPoints: number;
  errorCount: number;
  waiverId: string | null;
  approachKey: string | null;
  approachName: string | null;
  approachSort: number | null;
  stepSort: number;
};

/** Tổng điểm QS = max tổng điểm các hướng (không cộng mọi hướng). */
export function qsOverviewTotalPoints(approaches: OverviewApproach[]): number {
  if (approaches.length === 0) return 0;
  return Math.max(...approaches.map((a) => a.maxPoints));
}

export function groupQsApproaches(rows: CriterionWithApproach[]): OverviewApproach[] {
  const byKey = new Map<
    string,
    { name: string; sort: number; steps: OverviewCriterionRow[] }
  >();

  for (const row of rows) {
    const ak = row.approachKey ?? '_ungrouped';
    const name = row.approachName?.trim() || (ak === '_ungrouped' ? 'Chưa gắn hướng' : ak);
    const sort = row.approachSort ?? 9999;
    let bucket = byKey.get(ak);
    if (!bucket) {
      bucket = { name, sort, steps: [] };
      byKey.set(ak, bucket);
    }
    bucket.steps.push({
      key: row.key,
      description: row.description,
      maxPoints: row.maxPoints,
      errorCount: row.errorCount,
      waiverId: row.waiverId,
    });
  }

  return [...byKey.entries()]
    .sort((a, b) => a[1].sort - b[1].sort || a[0].localeCompare(b[0]))
    .map(([key, b]) => {
      const maxPoints =
        Math.round(b.steps.reduce((s, st) => s + st.maxPoints, 0) * 100) / 100;
      return { key, name: b.name, maxPoints, steps: b.steps };
    });
}
