import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ExamType, ExamSessionStatus } from '../entities/exam-session.entity';

const EXAM_TYPES: ExamType[] = ['TK', 'GK', 'CK'];
// Cùng thứ tự với enum trong DB, để đọc ra đúng vòng đời.
const EXAM_SESSION_STATUSES: ExamSessionStatus[] = [
  'draft',
  'scheduled',
  'active',
  'collecting',
  'completed',
  'cancelled',
];

/**
 * QA-reported gap: "Tạo filter cho cả trang quản lý kỳ thi và bài thu" —
 * this list only ever took page/pageSize. Four filters, each optional
 * and AND-ed together in the service, matching a teacher's actual
 * question ("which of MY sessions are still active", "find the one named
 * X") — not exposed as a generic query builder, so nothing here can ever
 * reach past `s.teacherId = :teacherId`.
 *
 * Học kỳ là cái thứ tư, bổ sung 2026-09-15: yêu cầu QA nói "cả hai trang"
 * nhưng lần đầu chỉ ba bộ lọc trên được làm, nên một giảng viên dạy qua
 * nhiều kỳ phải lật từng trang 20 dòng mới tìm lại được phiên cũ.
 */
export class SearchExamSessionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  /** Matches session name OR code, case-insensitive — the two things a
   *  teacher actually has in hand when looking for one session. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @IsIn(EXAM_SESSION_STATUSES)
  status?: ExamSessionStatus;

  @IsOptional()
  @IsIn(EXAM_TYPES)
  examType?: ExamType;

  /**
   * Học kỳ HIỆN TẠI của lớp (`class.semester_id`), lọc bằng KHOÁ — không bằng bản chụp `semester_name`. Từng lọc theo chuỗi
   * nên "HK1 2026-2027" và "Học kỳ 1 2026-2027" là hai mục lọc (spec §0). Vắng mặt là "tất cả học kỳ", không phải lỗi:
   * học kỳ ở đây là tham số lọc, không phải điều kiện để thao tác được (CLAUDE.md §1.2).
   */
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  /** Năm học (2026 nghĩa là 2026-2027): cả ba kỳ của năm đó. AND với `semesterId` nếu cả hai có mặt. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYear?: number;

  /**
   * Lớp của phiên (`exam_session.class_id`).
   *
   * Khác mọi bộ lọc trên ở một điểm quyết định: đây là KHOÁ NGOẠI, không
   * phải chuỗi giảng viên gõ. Sau khi môn học trở thành hằng số, lớp là
   * trục học vụ có cấu trúc duy nhất còn lại — không gõ lệch được, không
   * phân mảnh được, và là cách giảng viên thật sự nghĩ về phiên của mình.
   *
   * Phải nằm ở SERVER chứ không lọc phía client: danh sách này phân trang
   * ở server, nên lọc trên trang hiện tại sẽ chỉ cắt 20 dòng đang xem và
   * nói dối về tổng số.
   *
   * `@IsOptional` như các bộ lọc khác: vắng nghĩa là mọi lớp.
   */
  @IsOptional()
  @IsUUID()
  classId?: string;

  /**
   * Khoảng ngày cho chế độ xem LỊCH. Đi theo cặp — một mình `from` là 400.
   *
   * Khác mọi bộ lọc trên ở một điểm quyết định: khi cặp này có mặt, **phân
   * trang bị bỏ qua** (xem `findAllForOwner`). Lý do không phải tiện tay —
   * một lưới tuần phân trang 20 dòng sẽ IM LẶNG nuốt phiên thứ 21, và người
   * dùng không có cách nào biết tuần của mình đang thiếu. Một danh sách
   * biết mình bị cắt thì hiện nút "trang sau"; một cái lịch thì không.
   *
   * Lọc theo `start_time`, nên một phiên nằm ở ĐÚNG ngày nó bắt đầu — cùng
   * quy ước với việc lưới gom phiên vào ô ca thi theo giờ bắt đầu. Phiên vắt
   * qua nửa đêm hiện ở ngày bắt đầu, một lần, không phải hai.
   *
   * Độ dài khoảng bị chặn trên ở service (`MAX_RANGE_DAYS`), không ở đây:
   * class-validator không so được hai trường với nhau mà không thêm một
   * validator riêng, và luật này chỉ có một chỗ tiêu thụ.
   */
  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;
}
