import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/**
 * `departmentHeadId` is deliberately absent: ownership is taken from the
 * authenticated caller, never from the body. Accepting it here would let one
 * Trưởng khoa create a course owned by another.
 */
export class CreateCourseDto {
  @IsString()
  @Length(2, 32)
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsUUID()
  semesterId!: string;
}

export class UpdateCourseDto {
  @IsOptional()
  @IsString()
  @Length(2, 32)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsUUID()
  semesterId?: string;
}

/** Admin-only: hand an unowned course to a Trưởng khoa. */
export class AssignCourseOwnerDto {
  @IsUUID()
  departmentHeadId!: string;
}

export class CreateSemesterDto {
  @IsString()
  @Length(1, 150)
  name!: string;

  @IsISO8601()
  startDate!: string;

  @IsISO8601()
  endDate!: string;
}

export class UpdateSemesterDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

export class CreateRoomDto {
  @IsString()
  @Length(1, 100)
  name!: string;

  // Optional because a lab's machine count is not always known when the room
  // is first recorded, and not knowing it must not block recording the room.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  capacity?: number;
}

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
