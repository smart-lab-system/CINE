import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Thân của `POST exam-sessions/:id/review-groups/confirm` (spec duyệt nhanh 2026-10-21 §5.4).
 *
 * Mọi trường PHẢI khai ở đây: `ValidationPipe({ whitelist: true })` cắt trường chưa khai mà không báo.
 */
export class ConfirmReviewGroupDto {
  /**
   * Khoá nhóm đúng như `GET exam-sessions/:id/review-groups` trả (`ReviewGroup.key`): `${rubricVersionId}:${ruleId}`,
   * `multi` hoặc `none`. Server không tách chuỗi này; nó dựng lại nhóm của phiên rồi so khoá.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  key!: string;

  /**
   * Không có = cả nhóm. Có = chỉ các bài này (xác nhận một bài từ hồ sơ, §5.8). Bài không thuộc phiên → 400 cả lô.
   * Trần 500 và chặn trùng: cùng lý do với `BulkReviewDto.resultIds`.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique({ message: 'Danh sách có bài bị lặp — mỗi bài chỉ được nêu một lần.' })
  @IsUUID('4', { each: true })
  resultIds?: string[];
}
