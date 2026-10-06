import { IsOptional, IsString, Length } from 'class-validator';

/**
 * Lớp mới. KHÔNG mang tên môn.
 *
 * Hệ thống chỉ phục vụ một môn, nên `course_name` là hằng số server tự
 * điền (`COURSE_NAME`). Client cũ còn gửi kèm thì `ValidationPipe`
 * (`whitelist: true`) lặng lẽ cắt bỏ — y như `teacherId`, và vì cùng một
 * lý do: giá trị đó không phải của người gọi quyết định.
 */
export class CreateClassDto {
  @IsString()
  @Length(1, 100)
  name!: string;
}

/** Sửa lớp. Chỉ còn cái tên — xem `CreateClassDto` về phần môn. */
export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;
}
