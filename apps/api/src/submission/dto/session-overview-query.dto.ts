import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Query của "Quản lý bài thu".
 *
 * Một trường duy nhất, và nó lọc theo SINH VIÊN nhưng chọn PHIÊN: giữ lại
 * những phiên có sinh viên khớp, không đụng tới con số roll-up bên trong
 * phiên. Mọi bộ lọc còn lại của trang (học kỳ, phòng, loại kỳ thi, mức độ)
 * chạy phía client trên đúng danh sách này, nên chúng không có mặt ở đây.
 *
 * Tối thiểu 2 ký tự: một ký tự khớp gần như mọi sinh viên, nên nó không phải
 * một lượt tìm kiếm mà là một lượt tải lại toàn bộ trang đội lốt tìm kiếm.
 */
export class SessionOverviewQueryDto {
  /** Khớp MSSV HOẶC tên sinh viên (roster lẫn tên đã nộp), không phân biệt hoa thường. */
  @IsOptional()
  @IsString()
  @Length(2, 200)
  student?: string;
}
