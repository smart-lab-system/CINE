import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  Length,
  ValidateNested,
} from 'class-validator';

/**
 * Một dòng đã parse từ Excel **ở browser** — file .xlsx không bao giờ lên
 * server (Security rule 5), chỉ JSON thường.
 *
 * Giảng viên xác định bằng EMAIL chứ không phải tên: tên trùng nhau giữa
 * nhiều giảng viên là chuyện thường, còn email đã có unique constraint sẵn
 * trên `account`.
 */
export class ImportClassRowDto {
  @IsString()
  @Length(2, 32)
  courseCode!: string;

  @IsString()
  @Length(1, 200)
  courseName!: string;

  @IsString()
  @Length(1, 100)
  className!: string;

  @IsEmail()
  teacherEmail!: string;
}

export class ImportClassesDto {
  /**
   * Kỳ ĐƯỢC HỎI TƯỜNG MINH đúng một lần cho cả batch — không suy từ bộ
   * lọc trang, không hỏi lại trên từng dòng.
   *
   * §3.2 có một hệ quả bắt buộc: chỉ đúng MỘT nơi trong hệ thống hỏi "học
   * kỳ nào", và đó là form tạo `Course`. Màn import này chính là form tạo
   * `Course` ở dạng hàng loạt, nên nó hỏi đúng một lần.
   */
  @IsUUID()
  semesterId!: string;

  /**
   * `ArrayMinSize(1)`: một batch rỗng là người dùng bấm nhầm hoặc file
   * parse hỏng. Trả về `{ created: 0 }` cho nó là báo thành công cho một
   * việc chưa từng xảy ra.
   *
   * `ArrayMaxSize(200)`: một khoa cỡ 50-150 lớp mỗi kỳ, nên 200 là dư
   * rộng; và cận trên này giữ cho một file bất thường không biến thành
   * hàng nghìn query trong một request.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportClassRowDto)
  rows!: ImportClassRowDto[];
}
