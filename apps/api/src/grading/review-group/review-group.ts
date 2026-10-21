import type { GroupInput, ReviewGroup, ReviewGroupKind } from './review-group.types';

export type { GroupInput, ReviewGroup, ReviewGroupKind } from './review-group.types';

/** Số bài mẫu tối đa của một nhóm (spec 2026-10-21 §5.4). */
export const REVIEW_GROUP_SAMPLE_SIZE = 3;

/** Nhãn hiển thị của hai nhóm không gắn với một luật. Viết cho giảng viên (spec §5.8a: "hệ thống", không "model"). */
export const MULTI_GROUP_LABEL = 'Bài có nhiều lỗi';
export const NONE_GROUP_LABEL = 'Hệ thống không tìm thấy lỗi nào';

/**
 * So chuỗi theo mã ký tự, không theo locale: thứ tự phải giống nhau trên mọi máy chủ. Với uuid chữ thường, thứ tự
 * này trùng thứ tự `ORDER BY id` của Postgres.
 */
function byCodeUnit(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

interface Bucket {
  resultIds: Set<string>;
  sources: Set<string>;
}

function emptyBucket(): Bucket {
  return { resultIds: new Set(), sources: new Set() };
}

function toGroup(kind: ReviewGroupKind, key: string, ruleId: string | null, label: string, bucket: Bucket): ReviewGroup {
  const resultIds = [...bucket.resultIds].sort(byCodeUnit);
  return {
    key,
    label,
    description: null,
    sources: [...bucket.sources].sort(byCodeUnit),
    kind,
    ruleId,
    resultIds,
    sampleResultIds: resultIds.slice(0, REVIEW_GROUP_SAMPLE_SIZE),
  };
}

/**
 * Gom bài theo lỗi (spec 2026-10-21 §5.4): bài có đúng MỘT luật lỗi → nhóm của luật đó; từ hai luật → nhóm `multi`;
 * không lỗi → nhóm `none`. "Không lỗi" là `breakdown.errors` rỗng, không lọc `counted` — cùng lớp mà cầu dao §5.3
 * và phạm vi `noErrors` của `recomputeForTeacher` dùng. Một luật xuất hiện hai lần trong cùng bài vẫn là một luật.
 *
 * Nhóm khoá theo `ruleId`, không theo `ruleKey`: cùng luật ở hai phiên bản rubric là hai `ruleId`, hai nhóm.
 *
 * Kết quả xác định, không phụ thuộc thứ tự đầu vào: nhóm đơn theo `ruleId` tăng dần, rồi `multi`, rồi `none`; bài và
 * nguồn trong nhóm tăng dần; bài mẫu là ba bài đầu. Không trả nhóm rỗng. Không đọc DB, không sửa đầu vào.
 */
export function groupResults(rows: readonly GroupInput[]): ReviewGroup[] {
  const single = new Map<string, Bucket>();
  const multi = emptyBucket();
  const none = emptyBucket();

  for (const row of rows) {
    const ruleIds = new Set(row.errors.map((e) => e.ruleId));
    let bucket: Bucket;
    if (ruleIds.size === 0) {
      bucket = none;
    } else if (ruleIds.size > 1) {
      bucket = multi;
    } else {
      const [ruleId] = ruleIds;
      bucket = single.get(ruleId) ?? emptyBucket();
      single.set(ruleId, bucket);
    }
    bucket.resultIds.add(row.resultId);
    for (const e of row.errors) bucket.sources.add(e.source);
  }

  const groups = [...single.keys()]
    .sort(byCodeUnit)
    .map((ruleId) => toGroup('single', ruleId, ruleId, ruleId, single.get(ruleId)!));
  if (multi.resultIds.size > 0) groups.push(toGroup('multi', 'multi', null, MULTI_GROUP_LABEL, multi));
  if (none.resultIds.size > 0) groups.push(toGroup('none', 'none', null, NONE_GROUP_LABEL, none));
  return groups;
}
