import type { GradingSessionSummary } from './api/grading';
import type { Semester } from './api/semesters';
import type { SessionOverviewItem } from './api/submissions';
import { buildRows } from './session-list';

/** Hai học kỳ cố định cho test. Id có HÌNH uuid vì `parseListState` chỉ nhận `sem` có hình uuid. */
export const SEM_HK1_2026 = '11111111-1111-4111-8111-111111111111';
export const SEM_HK2_2025 = '22222222-2222-4222-8222-222222222222';

export const SEMESTERS: Semester[] = [
  { id: SEM_HK1_2026, academicYearStart: 2026, term: 1, label: 'HK1 2026-2027', startDate: '2026-09-01', endDate: '2027-01-15' },
  { id: SEM_HK2_2025, academicYearStart: 2025, term: 2, label: 'HK2 2025-2026', startDate: '2026-02-01', endDate: '2026-06-30' },
];

/** Rải vào `session({ … })` để đặt phiên vào kỳ cũ. */
export const IN_HK2_2025 = { semesterId: SEM_HK2_2025, academicYear: 2025, term: 2, semesterName: 'HK2 2025-2026' } as const;

/** 15:10 29/09/2026, giờ máy — mọi test tính "bao lâu rồi" từ đây, không từ Date.now(). */
export const NOW = new Date(2026, 8, 29, 15, 10).getTime();

export function session(over: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 's1',
    name: 'Kiểm tra giữa kỳ',
    code: 'GK-01',
    courseName: 'CTDL&GT',
    classId: 'c1',
    classLabel: 'DHKTPM18ATT',
    roomName: 'Phòng máy A1',
    examType: 'GK',
    startTime: new Date(2026, 8, 28, 7, 30).toISOString(),
    endTime: new Date(2026, 8, 28, 9, 30).toISOString(),
    status: 'completed',
    rubricId: 'ru-1',
    rubricVersion: 3,
    requiredDeliverableCount: 1,
    expectedCount: 40,
    rosterKnown: true,
    fullySubmittedCount: 38,
    partialCount: 0,
    attendedNoSubmissionCount: 0,
    neverAttendedCount: 0,
    satElsewhereCount: 0,
    matchedStudents: null,
    invalidFileCount: 0,
    archiveIssueCount: 0,
    semesterName: 'HK1 2026-2027',
    semesterId: SEM_HK1_2026,
    academicYear: 2026,
    term: 1,
    archivedAt: null,
    attentionClosedAt: null,
    ...over,
  };
}

export function summary(
  id: string,
  byStatus: Record<string, number> = {},
  over: Partial<GradingSessionSummary> = {},
): GradingSessionSummary {
  return { examSessionId: id, byStatus, ungradable: 0, hasQuestion: true, ...over };
}

/** Dựng hàng như trang làm: mỗi phiên kèm tóm tắt cùng id (hoặc không có tóm tắt nào). */
export function rowsOf(sessions: SessionOverviewItem[], summaries: GradingSessionSummary[] | undefined) {
  return buildRows(sessions, summaries, NOW);
}
