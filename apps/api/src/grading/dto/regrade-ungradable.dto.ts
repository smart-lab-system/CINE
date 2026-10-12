import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Chấm lại cả phiên. `reason` (tuỳ chọn) giới hạn vào những bài có ĐÚNG câu lý do này — so nguyên văn, vì
 * `ungradable_reason` là văn bản tự do và chuẩn hoá nó là đoán. Bỏ trống hoặc `null` = mọi bài lớp system.
 */
export class RegradeUngradableDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string | null;
}
