import { EXAM_SESSION_STATUS_LABELS } from './exam-session-display';

/**
 * Khi nào hàng của một phiên cho Sửa / Huỷ (spec §4.1 "Giao diện", T-SES-11). Hàm THUẦN: `now` được truyền vào để test không phụ thuộc ngày chạy.
 * Khi không đủ điều kiện, nút không bấm được và `reason` nói vì sao — không để người dùng bấm rồi mới nhận 409. Server vẫn là thẩm quyền cuối:
 * một phiên vừa qua giờ bắt đầu giữa lúc trang mở và lúc bấm vẫn bị từ chối ở API.
 */
export type ActionAvailability = { allowed: true } | { allowed: false; reason: string };

/** Cùng câu với server (plan F): người dùng thấy MỘT lời dù bị chặn ở web hay ở API. */
export const EDIT_STARTED_MESSAGE = 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.';

function statusPhrase(status: string): string {
  switch (status) {
    case 'cancelled':
      return 'Phiên đã huỷ';
    case 'completed':
      return 'Phiên đã kết thúc';
    case 'collecting':
      return 'Phiên đang thu bài';
    default:
      return `Phiên đang ở trạng thái “${EXAM_SESSION_STATUS_LABELS[status] ?? status}”`;
  }
}

/**
 * Cửa sổ sửa (phương án A): `status = 'active'` VÀ `now < startTime`. Trong cửa sổ này chắc chắn chưa ai vào phòng (`agent:join` chỉ nhận sau
 * giờ bắt đầu). Giờ không đọc được → coi như ĐÃ bắt đầu: cho sửa nhầm một phiên có thể đang thi đắt hơn chặn nhầm một phiên hỏng ngày.
 */
export function editAvailability(session: { status: string; startTime: string }, now: number): ActionAvailability {
  if (session.status !== 'active') return { allowed: false, reason: `${statusPhrase(session.status)}, không sửa được.` };
  const start = Date.parse(session.startTime);
  if (!Number.isFinite(start) || now >= start) return { allowed: false, reason: EDIT_STARTED_MESSAGE };
  return { allowed: true };
}

/**
 * Chỉ phiên `active`. Cố ý KHÔNG so với giờ bắt đầu: sau giờ bắt đầu mà chưa ai vào phòng thì vẫn huỷ được ("Nếu chưa ai vào phòng bạn vẫn huỷ
 * được"), và web không biết ai đã vào — server biết, và trả 409 kèm câu hướng dẫn, hiện trong hộp thoại.
 */
export function cancelAvailability(session: { status: string }): ActionAvailability {
  if (session.status === 'active') return { allowed: true };
  if (session.status === 'cancelled') return { allowed: false, reason: 'Phiên này đã được huỷ.' };
  const hint = session.status === 'collecting' ? ' Hãy Xác nhận kết thúc ở phòng chờ.' : '';
  return { allowed: false, reason: `${statusPhrase(session.status)}, không huỷ được.${hint}` };
}
