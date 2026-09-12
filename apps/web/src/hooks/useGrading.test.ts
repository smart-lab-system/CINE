import { describe, expect, it } from 'vitest';
import {
  PROGRESS_FAST_WINDOW_MS,
  PROGRESS_POLL_FAST_MS,
  PROGRESS_POLL_SLOW_MS,
  progressPollIntervalMs,
} from './useGrading';

/**
 * Nhịp hỏi tiến độ.
 *
 * Vì sao đáng có test riêng: đây là endpoint bị gọi nhiều nhất trong
 * toàn hệ thống, ở đúng khoảng thời gian hệ thống bận nhất — trong lúc
 * năm worker đang chấm trên cùng process. Một `refetchInterval` trả về
 * số ở nhánh đáng lẽ phải trả `false` sẽ không gây lỗi nào nhìn thấy
 * được; nó chỉ lặng lẽ gọi mãi.
 */
describe('progressPollIntervalMs', () => {
  it('không hỏi lại khi không còn bài nào đang chấm', () => {
    // Một trang mở suốt buổi không được phép gọi mãi một endpoint không
    // còn gì để nói.
    expect(progressPollIntervalMs(0, 0)).toBe(false);
    expect(progressPollIntervalMs(0, PROGRESS_FAST_WINDOW_MS * 10)).toBe(false);
  });

  it('nhanh trong phút đầu — giảng viên vừa bấm nút và đang nhìn', () => {
    expect(progressPollIntervalMs(40, 0)).toBe(PROGRESS_POLL_FAST_MS);
    expect(progressPollIntervalMs(40, PROGRESS_FAST_WINDOW_MS - 1)).toBe(PROGRESS_POLL_FAST_MS);
  });

  it('chậm lại sau phút đầu — lượt chấm dài thì không ai theo từng giây', () => {
    // Giữ 2 giây tới cuối là 2.5 request/giây khi năm giảng viên chấm
    // cùng lúc cuối kỳ, mỗi request một GROUP BY join hai bảng.
    expect(progressPollIntervalMs(40, PROGRESS_FAST_WINDOW_MS)).toBe(PROGRESS_POLL_SLOW_MS);
    expect(progressPollIntervalMs(1, PROGRESS_FAST_WINDOW_MS * 30)).toBe(PROGRESS_POLL_SLOW_MS);
  });

  it('"xong" thắng "mới bắt đầu" — số 0 chặn trước khi xét thời gian', () => {
    // Thứ tự hai nhánh là thứ quan trọng: nếu xét thời gian trước thì
    // một lượt vừa xong trong phút đầu vẫn trả về 2 giây và không bao
    // giờ dừng.
    expect(progressPollIntervalMs(0, 1)).toBe(false);
  });
});
