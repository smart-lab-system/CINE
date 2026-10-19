import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/** Bộ lọc của nhật ký thao tác (chỉ đọc). */
export class ListAuditLogDto {
  /** Một hoặc nhiều hành động, cách nhau bằng dấu phẩy. */
  @IsOptional()
  @IsString()
  @Length(1, 400)
  action?: string;

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  targetType?: string;

  /** Chỉ lấy dòng xảy ra TỪ thời điểm này trở đi (lọc theo ngày). */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Cursor: chỉ lấy dòng xảy ra TRƯỚC thời điểm này (lấy từ `nextBefore` của trang trước). */
  @IsOptional()
  @IsISO8601()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
