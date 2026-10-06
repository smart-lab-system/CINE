import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';

/**
 * Trần của `page`. Không có nó, `page=1e18` làm `OFFSET` tràn bigint ở Postgres (22003) — một lỗi DB mà bộ lọc ngoại lệ không
 * ánh xạ nên ra 500 cho một đầu vào của người dùng. 100.000 trang × 100 dòng là 10 triệu dòng: quá mọi thứ có thể đọc bằng mắt.
 */
export const AUDIT_MAX_PAGE = 100_000;

/**
 * Bộ lọc của trang đọc `audit_log`. Mọi trường tuỳ chọn; vắng mặt là "không lọc".
 */
export class SearchAuditLogDto {
  /**
   * Một hoặc nhiều hành động. Mục kết thúc bằng `.` là TIỀN TỐ (`room.`), mục
   * khác khớp CHÍNH XÁC. Nhận cả `?action=a&action=b` lẫn `?action=a,b`.
   */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((item) => item.trim())
          .filter((item) => item !== '')
      : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @Length(1, 80, { each: true })
  action?: string[];

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  targetType?: string;

  /** Dùng chỉ mục `(target_type, target_id, occurred_at)`: "ai đã đổi đối tượng này". */
  @IsOptional()
  @IsUUID()
  targetId?: string;

  /** Bao gồm. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** KHÔNG bao gồm. */
  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUDIT_MAX_PAGE)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 50;
}
