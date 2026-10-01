import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { MAX_SHEET_ROW } from '../grade-export.types';

export class InspectDto {
  @IsUUID()
  templateId!: string;

  /** Bắt buộc khi file có nhiều trang tính: không có trang nào được chọn thay giảng viên. */
  @IsOptional()
  @IsString()
  @Length(1, 31)
  sheetName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_SHEET_ROW)
  fromRow?: number;
}
