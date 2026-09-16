import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CriterionVerdict } from '../ai-provider/ai-grading-provider';

const VERDICTS: CriterionVerdict[] = ['met', 'partially_met', 'not_met'];

export class ReviewCriterionDto {
  @IsUUID()
  criterionId!: string;

  @IsIn(VERDICTS)
  verdict!: CriterionVerdict;

  /**
   * The teacher edits POINTS directly; `verdict` is the qualitative label that
   * goes with them.
   *
   * `pointsFor()` only offers three levels (all / half / none), and real
   * marking needs 3 out of 5. Storing both means the next person to open this
   * review can see what the last one thought, not just what they scored.
   *
   * The upper bound depends on `criterion.maxPoints`, so it cannot be a
   * decorator — the service checks it (spec §6.1 step 5).
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  points!: number;

  /**
   * Đoạn giảng viên tự bôi đen làm minh chứng, khi AI trích sai hoặc không
   * trích được.
   *
   * Đi CÙNG `verdict` và `points` của chính tiêu chí đó, không phải một
   * trường riêng ở tầng trên: `validateAndTotal` đòi payload phủ đủ mọi
   * tiêu chí, nên không tồn tại đường gửi một minh chứng mà bỏ trống đánh
   * giá đi kèm.
   *
   * ⚠️ Trường này BẮT BUỘC phải khai ở đây. `main.ts` chạy
   * `ValidationPipe({ whitelist: true })` mà KHÔNG kèm
   * `forbidNonWhitelisted`, nên một trường chưa khai bị cắt bỏ **không
   * báo** và request vẫn trả 201 — giảng viên thấy lưu thành công trong
   * khi dữ liệu không bao giờ tới DB.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  pinnedEvidence?: string;
}

/**
 * Deliberately no `finalScore`.
 *
 * The server computes it as the sum of `points`. Taking it from the client
 * would let a total arrive that does not match its own parts, which turns the
 * per-criterion breakdown into a lie. `whitelist: true` on the global
 * ValidationPipe strips the field if anyone sends it.
 */
export class SubmitReviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReviewCriterionDto)
  criteria!: ReviewCriterionDto[];

  /** Ghi chú cho chính giảng viên. Không gửi cho sinh viên. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  privateNote?: string;

  /** Nhận xét chính thức, đi vào phiếu phúc khảo. */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  studentFeedback?: string;
}
