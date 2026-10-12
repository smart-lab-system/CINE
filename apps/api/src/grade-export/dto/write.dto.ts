import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PlanDto } from './plan.dto';

export class WriteDto extends PlanDto {
  /** Digest của bản xem trước mà giảng viên đã xem (D20). */
  @Matches(/^[0-9a-f]{64}$/)
  expectedDigest!: string;

  /** Tên file giảng viên đã chọn — chỉ để đặt tên file tải về, được làm sạch ở service. */
  @IsString()
  @Length(1, 255)
  templateFileName!: string;

  @IsOptional()
  @IsBoolean()
  overwriteExisting?: boolean;

  @IsOptional()
  @IsBoolean()
  confirmDecreases?: boolean;
}
