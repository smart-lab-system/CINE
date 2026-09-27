import type { InvestigationResult } from '../investigator/types';

/**
 * Hợp đồng của cột `grading_attempt.investigation` với đường `investigator` — 3d ghi, 3c đọc.
 * Đổi hình dạng là một migration DỮ LIỆU: lượt chấm bất biến, nên hồ sơ cũ sống mãi ở phiên bản
 * cũ. `rulesSeen` và `modelCeiling` đi kèm vì lượt tính lại (bậc 1, 2) gọi lại `decide()` trên hồ
 * sơ đã lưu, và hai thứ đó không suy lại được sau này.
 */
export interface StoredInvestigation {
  version: 1;
  result: InvestigationResult;
  /** Bảng lỗi model đã thấy lúc điều tra (review I3 của 3a; T-FAIR-1). */
  rulesSeen: { ruleKey: string; checkedBy: 'machine' | 'model' }[];
  /** Trần thấp nhất của các bậc model đã trả lời (§4.2). */
  modelCeiling: number;
}

export function readStoredInvestigation(json: unknown): StoredInvestigation {
  const o = json as Partial<StoredInvestigation> | null;
  const ok =
    o !== null &&
    typeof o === 'object' &&
    o.version === 1 &&
    o.result !== null &&
    typeof o.result === 'object' &&
    (o.result.kind === 'verdict' || o.result.kind === 'ungradable') &&
    Array.isArray(o.rulesSeen) &&
    typeof o.modelCeiling === 'number';
  if (!ok) throw new Error('hồ sơ lượt chấm không đúng khuôn StoredInvestigation v1');
  return o as StoredInvestigation;
}
