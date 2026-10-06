import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/**
 * Lớp mới. Form CHỈ CHỌN: lớp danh nghĩa phải đã có trong Danh mục (spec §2.2) — nhận id (ô chọn)
 * hoặc mã (script, import), đúng MỘT trong hai; `ClassService` kiểm điều đó và trả 400 nêu Danh mục.
 *
 * KHÔNG có `courseName`: một môn duy nhất, server điền hằng số. Client cũ còn gửi kèm thì
 * `ValidationPipe({ whitelist: true })` lặng lẽ cắt.
 */
export class CreateClassDto {
  @IsUUID()
  semesterId!: string;

  @IsOptional()
  @IsUUID()
  administrativeClassId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  administrativeClassCode?: string;

  /** Nhóm, vd "Nhóm 1". Bỏ trống = không tách nhóm. */
  @IsOptional()
  @IsString()
  @Length(0, 50)
  groupName?: string;

  @IsUUID()
  teacherId!: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsUUID()
  administrativeClassId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  administrativeClassCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  groupName?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;
}

/** Bộ lọc của trang Lớp (admin): năm học, học kỳ, giảng viên và ô tìm mã lớp. Vắng mặt = "tất cả". */
export class SearchClassesDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYear?: number;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  /** Tìm theo mã lớp danh nghĩa (khớp một phần, không phân biệt hoa-thường). */
  @IsOptional()
  @IsString()
  @Length(1, 50)
  q?: string;
}

/** Bộ lọc "Lớp của tôi" (giảng viên). Học kỳ chỉ thu hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2). */
export class SearchTeachingClassesDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYear?: number;
}
