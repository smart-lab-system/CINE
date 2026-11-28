import type { GradingResult } from '@/lib/api/grading';
import { isMakeupSubmission } from '@/lib/grading-triage';
import { errorCounts, isReadingCode, reasonOf, scoreCell, stateOf, type ScoreTag, type SessionState } from '@/lib/session-triage';

/**
 * Mọi chữ và điều kiện của MỘT hàng bài trong danh sách bài của phiên, tính một lần để bảng (`ResultsTable`) và thẻ
 * (`ResultCards`) cùng đọc - hai cách vẽ không có chỗ nào để lệch nhau về nội dung.
 */
export interface ResultRowView {
  id: string;
  /** Hồ sơ của bài, giữ phiên trên URL. */
  href: string;
  mssv: string;
  name: string;
  /** "Thi bù - <lớp gốc>" khi bài thuộc lớp khác lớp của phiên. */
  makeup: string | null;
  /** Cách chấm cần nêu: đọc mã (không chạy thử), bài tự luận, hoặc không nêu. */
  method: 'reading-code' | 'essay' | null;
  /** Ba trường `StatusPill` cần. */
  status: string;
  ungradableReason: string | null;
  pipeline: GradingResult['pipeline'];
  state: SessionState;
  score: { text: string; tag: ScoreTag };
  /** Kiểm mẫu chưa nhận xét: điểm hệ thống bị ẩn. */
  auditHidden: boolean;
  /** Cột "Lỗi": "-" khi chưa có `triage`, "Không lỗi nào" khi `triage` rỗng. */
  errors: string;
  /** Cột "Vì sao cần bạn". */
  reason: string;
}

function errorsText(triage: GradingResult['triage']): string {
  const counts = errorCounts(triage);
  if (counts === null) return '-';
  const parts: string[] = [];
  if (counts.counted > 0) parts.push(`${counts.counted} đã trừ`);
  if (counts.unpriced > 0) parts.push(`${counts.unpriced} chờ giá`);
  return parts.length > 0 ? parts.join(' · ') : 'Không lỗi nào';
}

export function resultRowView(r: GradingResult, ctx: { sessionId: string; sessionClassId: string | null }): ResultRowView {
  const state = stateOf(r);
  return {
    id: r.id,
    href: `/teacher/grading/${r.id}?sessionId=${ctx.sessionId}`,
    mssv: r.studentMssv,
    name: r.studentName,
    makeup: isMakeupSubmission(r.homeClassId, ctx.sessionClassId) ? `Thi bù - ${r.homeClassName ?? r.homeClassId}` : null,
    method: isReadingCode(r) ? 'reading-code' : r.pipeline === 'one_shot' ? 'essay' : null,
    status: r.status,
    ungradableReason: r.ungradableReason,
    pipeline: r.pipeline,
    state,
    score: scoreCell(r, state),
    auditHidden: state === 'audit',
    errors: errorsText(r.triage),
    // Không đoán lý do khi chưa có `triage`: chỉ đường mở hồ sơ.
    reason: reasonOf(r) ?? (state === 'needsYou' ? 'Mở hồ sơ để xem lý do.' : '-'),
  };
}
