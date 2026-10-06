import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Trần dòng của từng loại (spec §6.3). Vượt là 400 cho cả yêu cầu, không phải lỗi theo dòng: một file 5.000 dòng phòng là
 * file sai chứ không phải file có dòng sai.
 */
export const IMPORT_ROW_LIMITS = {
  semesters: 20,
  rooms: 500,
  administrativeClasses: 500,
  classes: 200,
} as const;

/** Độ dài tối đa một ô — chặn một ô khổng lồ trước khi nó tới planner. */
const CELL_MAX = 200;

/**
 * Mọi ô là CHỮ: trình duyệt gửi `cell.text`, server tự hiểu số/ngày/học kỳ (`import-cells.ts`) để có MỘT chỗ hiểu.
 * `line` là số dòng như Excel hiện ra, do client tính — server không tự đoán nên câu báo lỗi luôn trỏ đúng dòng người dùng
 * nhìn thấy.
 *
 * `@IsString()` không có `@IsOptional`: một ô `null` hay thiếu là 400 cho cả yêu cầu chứ không lọt tới planner, nơi
 * `row.name.trim()` trên `null` sẽ là 500 (cùng lớp lỗi `@IsOptional` bỏ qua `null` ở các route nhập tay).
 */
class ImportRowBase {
  @IsInt()
  @Min(1)
  line!: number;
}

export class ImportSemesterRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) academicYear!: string;
  @IsString() @MaxLength(CELL_MAX) term!: string;
  @IsString() @MaxLength(CELL_MAX) startDate!: string;
  @IsString() @MaxLength(CELL_MAX) endDate!: string;
}

export class ImportRoomRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) name!: string;
  @IsString() @MaxLength(CELL_MAX) capacity!: string;
}

export class ImportAdministrativeClassRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) code!: string;
}

export class ImportClassRowDto extends ImportRowBase {
  @IsString() @MaxLength(CELL_MAX) semester!: string;
  @IsString() @MaxLength(CELL_MAX) administrativeClassCode!: string;
  @IsString() @MaxLength(CELL_MAX) groupName!: string;
  @IsString() @MaxLength(CELL_MAX) teacherEmail!: string;
}

export class ImportSemestersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.semesters)
  @ValidateNested({ each: true })
  @Type(() => ImportSemesterRowDto)
  rows!: ImportSemesterRowDto[];

  /** BẮT BUỘC, không mặc định: một client lỗi quên cờ không được phép ghi. */
  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ImportRoomsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.rooms)
  @ValidateNested({ each: true })
  @Type(() => ImportRoomRowDto)
  rows!: ImportRoomRowDto[];

  @IsBoolean()
  dryRun!: boolean;

  /** Admin đã thấy cảnh báo "gần giống" ở bản xem trước và vẫn muốn ghi. */
  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ImportAdministrativeClassesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.administrativeClasses)
  @ValidateNested({ each: true })
  @Type(() => ImportAdministrativeClassRowDto)
  rows!: ImportAdministrativeClassRowDto[];

  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}

export class ImportClassesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(IMPORT_ROW_LIMITS.classes)
  @ValidateNested({ each: true })
  @Type(() => ImportClassRowDto)
  rows!: ImportClassRowDto[];

  @IsBoolean()
  dryRun!: boolean;

  @IsOptional()
  @IsBoolean()
  confirmSimilar?: boolean;
}
