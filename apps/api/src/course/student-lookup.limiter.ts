import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Giới hạn tốc độ tra tên sinh viên theo MSSV: 30 lần mỗi phút cho mỗi giảng viên.
 *
 * Vì sao BẮT BUỘC (spec §2.6): `GET /students/:mssv` trả họ tên của bất kỳ MSSV nào
 * đã có trong hệ thống. Không giới hạn thì một giảng viên quét được cả dải MSSV để lấy
 * tên của sinh viên không thuộc lớp họ. 30/phút đủ cho người gõ tay (mỗi MSSV một lần
 * tra, đã debounce ở giao diện) và biến việc quét thành chuyện hàng giờ.
 *
 * Giữ trong BỘ NHỚ tiến trình, cùng khuôn và cùng giới hạn đã chấp nhận của
 * `AgentJoinLockStore`: không sống qua khởi động lại, và với N bản sao tiến trình giới
 * hạn thực là N×30. Đủ cho "chặn lần quét tiếp theo"; sai cho bất kỳ thứ gì cần tra cứu
 * về sau. Không có dọn dẹp chủ động: mỗi giảng viên một mảng ≤ 30 mốc thời gian.
 *
 * MỘT bộ đếm cho mỗi giảng viên, dùng chung cho MỌI đường trả họ tên đã lưu của một MSSV mà người gọi không
 * tự có: `GET /students/:mssv`, thêm tay vào lớp, và thêm tay vào phiên (review cụm 2, I1). Mỗi đường một bộ
 * đếm riêng thì quét chỉ chậm đi vài lần. Đường mới trả tên đã lưu phải gọi `enforce` TRƯỚC khi đọc hay ghi tên.
 *
 * Cửa sổ TRƯỢT, không phải cửa sổ cố định: cửa sổ cố định cho 60 lần liền nhau quanh
 * ranh giới phút. Lần bị chặn KHÔNG ghi mốc mới, để người bị chặn không tự kéo dài
 * thời gian chặn bằng cách bấm tiếp.
 */
@Injectable()
export class StudentLookupLimiter {
  static readonly MAX_PER_WINDOW = 30;
  static readonly WINDOW_MS = 60_000;

  private readonly hits = new Map<string, number[]>();

  consume(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => now - at < StudentLookupLimiter.WINDOW_MS,
    );
    if (recent.length >= StudentLookupLimiter.MAX_PER_WINDOW) {
      this.hits.set(key, recent);
      return {
        allowed: false,
        retryAfterMs: StudentLookupLimiter.WINDOW_MS - (now - recent[0]),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  /** `consume` rồi ném 429 nếu hết lượt: chỗ DUY NHẤT dựng thông điệp, để các đường không lệch nhau. */
  enforce(key: string): void {
    const verdict = this.consume(key);
    if (!verdict.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Tra cứu quá nhanh. Hãy thử lại sau ${Math.ceil(verdict.retryAfterMs / 1000)} giây.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
