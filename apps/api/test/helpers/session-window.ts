/**
 * Khung giờ cho một phiên thi trong e2e, thoả CẢ HAI luật cùng lúc.
 *
 * 1. `MAX_BACKDATE_MINUTES = 30` (create-exam-session.dto.ts) — `startTime`
 *    không được lùi quá 30 phút so với hiện tại, nếu không là 400.
 * 2. `ex_exam_session_teacher_gap` (migration `1789350000000`) — hai phiên
 *    của CÙNG một giảng viên phải cách nhau >= 30 phút, nếu không là 409.
 *
 * Hai luật ấy kẹp nhau: phiên thứ hai của một người KHÔNG thể nằm trong quá
 * khứ, nên nó phải đi về tương lai. Trước khi có luật 2, mọi spec dùng chung
 * một khung `Date.now() - 60_000` và không ai để ý.
 *
 * Bộ đếm là của MODULE; jest cấp cho mỗi file test một registry riêng nên nó
 * tự reset theo từng spec. Đủ, vì va chạm chỉ xảy ra trong cùng một file —
 * mỗi spec tạo tài khoản giảng viên riêng.
 */

let cursor = 0;

const HOUR_MS = 60 * 60 * 1000;
/** Mỗi phiên sau lùi thêm 2 giờ, phiên dài 1 giờ → hở 1 giờ. Rộng hơn hẳn
 *  ngưỡng 30 phút, và vẫn đủ gần để đọc log không nhức mắt. */
const STRIDE_MS = 2 * HOUR_MS;

export interface SessionWindow {
  startTime: string;
  endTime: string;
}

/**
 * Phiên ĐANG diễn ra — nhưng chỉ LẦN GỌI ĐẦU trong một spec mới thật sự đang
 * chạy theo đồng hồ; các lần sau nằm ở tương lai.
 *
 * Không có cách nào khác: một giảng viên không thể có hai phiên chạy cùng lúc,
 * và đó chính là luật mà ràng buộc ở trên ép. Spec nào cần nhiều phiên cùng
 * đang chạy thì phải tạo nhiều giảng viên.
 */
export function liveSessionWindow(): SessionWindow {
  const n = cursor;
  cursor += 1;
  const start = n === 0 ? Date.now() - 60_000 : Date.now() + n * STRIDE_MS;
  return {
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + HOUR_MS).toISOString(),
  };
}

/** Phiên CHƯA diễn ra. Dùng chung bộ đếm với `liveSessionWindow` để hai loại
 *  trộn lẫn trong một spec vẫn không đụng nhau. */
export function upcomingSessionWindow(): SessionWindow {
  const n = cursor;
  cursor += 1;
  const start = Date.now() + HOUR_MS + n * STRIDE_MS;
  return {
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + HOUR_MS).toISOString(),
  };
}

/**
 * Khung giờ ĐANG chạy, giống nhau ở mọi lần gọi.
 *
 * CHỈ dùng cho các phiên thuộc về những GIẢNG VIÊN KHÁC NHAU. Hai phiên cùng
 * một người mà dùng hàm này sẽ đụng `ex_exam_session_teacher_gap` và nhận
 * 409 — đó không phải lỗi, đó là luật: một người không coi được hai phòng
 * cùng giờ.
 *
 * Tồn tại tách khỏi `liveSessionWindow` vì hai nhu cầu khác nhau: hàm kia
 * giãn ra để một giảng viên tạo được nhiều phiên; hàm này giữ nguyên để
 * nhiều giảng viên cùng có phiên đang chạy — thứ mà các test về agent join
 * thật sự cần.
 */
export function concurrentLiveWindow(): SessionWindow {
  const start = Date.now() - 60_000;
  return {
    startTime: new Date(start).toISOString(),
    endTime: new Date(start + HOUR_MS).toISOString(),
  };
}

/**
 * Đánh dấu mọi phiên đang mở của một giảng viên là đã xong.
 *
 * Dùng ở ĐẦU hàm seed của những spec tạo một phiên ĐANG CHẠY cho mỗi test.
 * `ex_exam_session_teacher_gap` loại `completed`/`cancelled`/`collecting`, nên
 * đây là cách nói "ca thi của test trước đã kết thúc" — đúng thứ xảy ra ngoài
 * đời giữa hai ca thi của một người.
 *
 * Cách khác là cấp cho mỗi test một giảng viên riêng, nhưng nó kéo theo đổi
 * chủ sở hữu lớp và token ở mọi lời gọi về sau, tức sửa rất rộng cho một thứ
 * mà một câu UPDATE nói đúng hơn.
 *
 * Nhận `dataSource` dạng structural để helper không phải import TypeORM.
 */
export async function releaseTeacherSessions(
  dataSource: { query(sql: string, params?: unknown[]): Promise<unknown> },
  teacherId: string,
): Promise<void> {
  await dataSource.query(
    `UPDATE examcollect.exam_session
        SET status = 'completed'
      WHERE teacher_id = $1
        AND status NOT IN ('completed', 'cancelled')`,
    [teacherId],
  );
}
