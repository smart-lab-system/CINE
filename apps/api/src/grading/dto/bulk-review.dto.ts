import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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

export const BULK_RULE_KINDS = [
  'keep_ai',
  'apply_advocate',
  'criterion_full_marks',
  'criterion_bonus',
] as const;

/**
 * Luật, ở dạng PHẲNG.
 *
 * `class-validator` không diễn đạt được union rời rạc: mọi cách ép nó đều ra
 * một cây `@ValidateNested` không ai đọc nổi. Nên `kind` là một `@IsIn`, các
 * trường phụ `@IsOptional`, và service thu hẹp về `BulkRule` — chỗ duy nhất
 * biết luật nào cần trường nào.
 */
export class BulkRuleDto {
  @IsIn(BULK_RULE_KINDS)
  kind!: (typeof BULK_RULE_KINDS)[number];

  /** Bắt buộc với `criterion_*`; service kiểm, không phải decorator. */
  @IsOptional()
  @IsUUID()
  criterionId?: string;

  /** Chỉ `criterion_bonus` dùng. Trần chặn ở tầng luật, không ở đây. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  points?: number;
}

export class BulkReviewDto {
  /**
   * LUÔN tường minh, kể cả khi là cả phiên.
   *
   * Client đã có sẵn danh sách (nó vừa gọi `grading-results` để vẽ bảng), nên
   * 45 UUID tốn ~1,7KB. Đổi lại: server kiểm từng id có thuộc phiên không,
   * nên một client cũ không vô tình chạm vào những bài nó không biết là có.
   *
   * `ArrayMaxSize(500)`: một phiên thật là 40–50 bài. Trần này không phải để
   * chặn người dùng, mà để một payload dị dạng không mở một giao dịch vô hạn.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  // Trùng id thì truy vấn trả về ít hàng hơn số id gửi lên, và phép so khớp
  // số lượng ở service sẽ báo "có bài không thuộc phiên thi này" — một thông
  // báo nói về chuyện hoàn toàn khác. Chặn ở đây để lỗi nói đúng nguyên nhân.
  @ArrayUnique({ message: 'Danh sách có bài bị lặp — mỗi bài chỉ được nêu một lần.' })
  @IsUUID('4', { each: true })
  resultIds!: string[];

  @ValidateNested()
  @Type(() => BulkRuleDto)
  rule!: BulkRuleDto;

  /**
   * Ghi chú cho chính giảng viên, nhân bản vào TỪNG dòng duyệt.
   *
   * ⚠️ Trường này BẮT BUỘC phải khai ở đây. `main.ts` chạy
   * `ValidationPipe({ whitelist: true })` mà KHÔNG kèm `forbidNonWhitelisted`,
   * nên một trường chưa khai bị cắt bỏ **không báo** và request vẫn 2xx —
   * giảng viên thấy lưu thành công trong khi ghi chú không bao giờ tới DB.
   */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  privateNote?: string;
}
