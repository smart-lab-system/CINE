import type { GradingSessionSummary } from './api/grading';
import type { SessionOverviewItem } from './api/submissions';
import { buildRows } from './session-list';

/** 15:10 29/09/2026, giờ máy — mọi test tính "bao lâu rồi" từ đây, không từ Date.now(). */
export const NOW = new Date(2026, 8, 29, 15, 10).getTime();

export function session(over: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 's1',
    name: 'Kiểm tra giữa kỳ',
    code: 'GK-01',
    courseName: 'CTDL&GT',
    classId: 'c1',
    className: 'DHKTPM18ATT',
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
