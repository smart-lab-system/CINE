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

export class CreateClassDto {
  /**
   * Tên môn, dạng VĂN BẢN. Không có bảng nào để đối chiếu, và đó là điểm
   * của đợt thu hẹp master data: hệ thống ghi lại thứ giảng viên khai.
   *
   * Hệ quả nhìn thấy được: gõ "CTDL&GT" ở lớp này và "CTDL & GT" ở lớp kia
   * tạo ra hai môn độc lập với mọi phép gom nhóm phía sau.
   */
  @IsString()
  @Length(1, 200)
  courseName!: string;

  @IsString()
  @Length(1, 100)
  name!: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  courseName?: string;
}
