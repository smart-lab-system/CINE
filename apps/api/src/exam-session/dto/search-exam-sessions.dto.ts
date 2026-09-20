import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
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
   * Học kỳ mà phiên tự khai (`exam_session.semester_name`).
   *
   * Từng là `semesterId`, một khoá ngoại tới bảng `semester`. Bảng đó
   * biến mất ở đợt thu hẹp master data, nên bộ lọc so KHỚP CHUỖI CHÍNH
   * XÁC trên bản chụp lúc tạo phiên. Hệ quả cho người dùng: "HK1 2026-2027"
   * và "HK1 26-27" là hai mục lọc khác nhau — giao diện lấy danh sách từ
   * chính các giá trị đã có, nên không ai phải gõ lại chuỗi đó.
   *
   * `@IsOptional` là phần quan trọng: vắng nó nghĩa là "tất cả học kỳ",
   * không phải lỗi. Học kỳ ở đây là tham số lọc, không phải điều kiện để
   * thao tác được — CLAUDE.md §1.2: hệ thống không bao giờ từ chối một
   * thao tác vì lý do liên quan tới học kỳ.
   */
  @IsOptional()
  @IsString()
  @Length(1, 150)
  semesterName?: string;
}
