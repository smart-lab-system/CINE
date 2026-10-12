import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { MAX_SHEET_ROW, ROUNDING_STEPS } from '../grade-export.types';

const COLUMN = /^[A-Z]{1,3}$/;

/**
 * Mọi thứ định vị ô là trường TƯỜNG MINH, không mặc định (rule 9, spec D5): trang tính, dòng bắt đầu, ba cột,
 * bước làm tròn. Web không chọn sẵn cái nào.
 */
export class PlanDto {
  @IsUUID()
  templateId!: string;

  @IsString()
  @Length(1, 31)
  sheetName!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_SHEET_ROW)
  firstDataRow!: number;

  @Matches(COLUMN)
  mssvColumn!: string;

  @Matches(COLUMN)
  scoreColumn!: string;

  @IsOptional()
  @Matches(COLUMN)
  reasonColumn?: string;

  /** Bắt buộc khi phiên có nhiều hơn một yêu cầu nộp (D7). */
  @IsOptional()
  @IsUUID()
  deliverableId?: string;

  @IsIn([...ROUNDING_STEPS])
  roundingStepHundredths!: number;
}
