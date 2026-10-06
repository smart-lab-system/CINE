import { MAX_BACKDATE_MINUTES, MIN_EXAM_DURATION_MINUTES } from './dto/create-exam-session.dto';

/**
 * Luật sửa và huỷ phiên thi (spec §4.1) — hàm THUẦN, để các ca biên (đúng giờ bắt đầu, đúng 15 phút, đúng 30 phút) test được
 * mà không cần DB, và để `ExamSessionEditService` chỉ còn việc điều phối.
 */

/**
 * Lý do KHÔNG sửa được, hoặc `null` nếu sửa được. Cửa sổ là `status = 'active'` VÀ `now < start_time` (phương án A, chủ đồ
 * án chốt 05/10): trong cửa sổ này chắc chắn chưa ai vào phòng vì `agent:join` chỉ nhận sau `start_time`. `now < start`, không
 * phải `<=`: đúng giờ bắt đầu là lúc `agent:join` bắt đầu nhận.
 */
export function editWindowProblem(session: { status: string; startTime: Date }, now: Date): string | null {
  if (session.status === 'active') {
    return now.getTime() < session.startTime.getTime()
      ? null
      : 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.';
  }
  switch (session.status) {
    case 'collecting':
      return 'Phiên đang thu bài nên không sửa được.';
    case 'completed':
      return 'Phiên đã kết thúc nên không sửa được.';
    case 'cancelled':
      return 'Phiên đã bị huỷ nên không sửa được.';
    default:
      return `Phiên ở trạng thái "${session.status}" nên không sửa được.`;
  }
}

/**
 * Các vấn đề của cặp (bắt đầu, kết thúc) SAU KHI sửa — cùng luật với tạo phiên (`create-exam-session.dto.ts`): kết thúc sau
 * bắt đầu, ít nhất 15 phút, bắt đầu không lùi quá 30 phút. Kiểm trên CẶP chứ không trên từng trường được gửi: `{ endTime }`
 * một mình ghép với `start_time` cũ có thể ra một khoảng 10 phút mà từng giá trị riêng đều trông hợp lệ.
 *
 * "Quá ngắn" không được báo chồng lên "kết thúc không sau bắt đầu" — cùng quy ước với `HasMinimumDurationConstraint`.
 */
export function timeProblems(startTime: Date, endTime: Date, now: Date): string[] {
  const problems: string[] = [];
  const start = startTime.getTime();
  const end = endTime.getTime();
  if (end <= start) {
    problems.push('Giờ kết thúc phải sau giờ bắt đầu.');
  } else if (end - start < MIN_EXAM_DURATION_MINUTES * 60_000) {
    problems.push(`Phiên thi phải kéo dài ít nhất ${MIN_EXAM_DURATION_MINUTES} phút.`);
  }
  if (start < now.getTime() - MAX_BACKDATE_MINUTES * 60_000) {
    problems.push(`Giờ bắt đầu không được lùi quá ${MAX_BACKDATE_MINUTES} phút so với hiện tại.`);
  }
  return problems;
}

export const CANCEL_HAS_PRESENCE_MESSAGE =
  'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc.';

/** Lý do KHÔNG huỷ được vì TRẠNG THÁI, hoặc `null`. Điều kiện "đã có người vào" được kiểm riêng, ngay trong câu `UPDATE`. */
export function cancelStatusProblem(status: string): string | null {
  switch (status) {
    case 'active':
      return null;
    case 'collecting':
      return 'Phiên đang thu bài nên không huỷ được — hãy Xác nhận kết thúc khi xong.';
    case 'completed':
      return 'Phiên đã kết thúc nên không huỷ được.';
    default:
      return `Phiên ở trạng thái "${status}" nên không huỷ được.`;
  }
}
