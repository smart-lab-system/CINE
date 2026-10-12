import { vi } from 'vitest';
import type { OverviewCriterion, OverviewSession, RubricErrorItem, RubricOverview } from '@/lib/api/rubric-errors';
import type { LibraryRule, ProposalItem } from '@/lib/api/rules';

export const criterion = (over: Partial<OverviewCriterion> = {}): OverviewCriterion => ({
  key: 'tinh_dung',
  description: 'Tính đúng đắn',
  maxPoints: 6,
  errorCount: 1,
  waiverId: null,
  ...over,
});

export const session = (over: Partial<OverviewSession> = {}): OverviewSession => ({
  id: 's1',
  name: 'Giữa kỳ HK1 — Ca sáng',
  semesterName: 'HK1 2026-2027',
  state: 'grading',
  resultCount: 38,
  ...over,
});

/** Mặc định: một rubric SẴN SÀNG — mọi tiêu chí có lỗi, không còn việc nào. Ghi đè để dựng trạng thái khác. */
export function overview(over: Partial<RubricOverview> = {}): RubricOverview {
  const criteria = over.criteria ?? [
    criterion({ key: 'tinh_dung', description: 'Tính đúng đắn', maxPoints: 6, errorCount: 2 }),
    criterion({ key: 'bo_nho', description: 'Quản lý bộ nhớ', maxPoints: 2, errorCount: 1 }),
    criterion({ key: 'trinh_bay', description: 'Trình bày', maxPoints: 2, errorCount: 1 }),
  ];
  const sessions = over.sessions ?? [];
  return {
    rubricName: 'Giữa kỳ CTDL',
    rubricId: 'ru-1',
    totalPoints: criteria.reduce((sum, c) => sum + c.maxPoints, 0),
    criteria,
    errorCount: criteria.reduce((sum, c) => sum + c.errorCount, 0),
    unpricedCount: 0,
    danglingCount: 0,
    proposalCount: 0,
    sessions,
    semesters: [...new Set(sessions.map((s) => s.semesterName))],
    ...over,
  };
}

export const errorItem = (over: Partial<RubricErrorItem> = {}): RubricErrorItem => ({
  id: 'e1',
  ruleId: 'r1',
  ruleKey: 'sai_ca_bien',
  name: 'Sai ca biên',
  description: 'Kết quả sai khi danh sách rỗng hoặc chỉ có một phần tử.',
  predicate: { kind: 'test_group_failed', group: 'bien' },
  checkedBy: 'machine',
  origin: 'teacher',
  criterionKey: 'tinh_dung',
  criterionDangling: false,
  deduction: '1.50',
  appliedTo: { results: 5, sessions: 2 },
  alsoIn: [],
  ...over,
});

export const libraryRule = (over: Partial<LibraryRule> = {}): LibraryRule => ({
  id: 'r1',
  ruleKey: 'sai_ca_bien',
  origin: 'teacher',
  revision: {
    id: 'v1',
    revision: 1,
    name: 'Sai ca biên',
    description: 'Kết quả sai khi danh sách rỗng hoặc chỉ có một phần tử.',
    predicate: { kind: 'test_group_failed', group: 'bien' },
  },
  checkedBy: 'machine',
  uses: [{ rubricName: 'Giữa kỳ CTDL', criterionKey: 'tinh_dung', deduction: '1.50' }],
  ...over,
});

export const proposal = (over: Partial<ProposalItem> = {}): ProposalItem => ({
  id: 'p1',
  ruleKey: 'de_xuat_1',
  name: 'Hàm pop không kiểm tra ngăn xếp rỗng',
  description: 'Hàm pop không kiểm tra ngăn xếp rỗng',
  sightings: { sessions: [{ id: 's1', name: 'Giữa kỳ HK1 — Ca sáng' }], results: 4 },
  legacy: false,
  ...over,
});

/** Giả một `useMutation`: test gọi `mutate.mock.calls[0][1]?.onSuccess(...)` để mô phỏng máy chủ trả lời. */
export const mutation = () => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as Error | null,
  reset: vi.fn(),
});
