import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Tài liệu tham chiếu cho một lượt chấm. Mọi trường đều tuỳ chọn — ba mức
 * suy giảm (`GradingReadiness`) là hợp lệ, chỉ là kém dần.
 *
 * Bỏ TRỐNG một trường thì trường đó GIỮ NGUYÊN; gửi rõ `null` thì XOÁ.
 * Hai thứ đó khác nhau, và gộp chúng làm một sẽ khiến giảng viên đổi được
 * lựa chọn nhưng không bỏ được (xem
 * `GradingReferenceService.upsert`): giảng viên thêm ghi chú sau khi đã
 * chọn đề không được làm mất lựa chọn đề.
 */
export class UpsertGradingReferenceDto {
  /**
   * File nào trong số đã upload LÀ đề bài.
   *
   * Giảng viên chỉ rõ; hệ thống không đoán theo tên file. Một phiên có thể
   * có đề + dataset + starter code, và Security rule 9 cấm đúng loại suy
   * đoán này.
   */
  @IsOptional()
  @IsUUID()
  questionMaterialId?: string | null;

  /**
   * Khoá do `POST /:id/grading-reference/answer-key-upload` cấp.
   *
   * Server kiểm nó khớp khoá mình vừa cấp — client không được tự đặt, nếu
   * không nó trỏ được bản ghi này vào bất kỳ object nào trong bucket.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  modelAnswerStorageKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  modelAnswerFilename?: string | null;

  /**
   * Lối vào rẻ nhất: một câu, không cần file.
   *
   * 4000 ký tự là rộng tay cho vài đoạn ghi chú chấm, và đủ hẹp để nó
   * không thành một bản đáp án gõ tay vào ô text.
   */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  modelAnswerNote?: string | null;

  /**
   * Đáp án mẫu này đến từ agent soạn đề và chưa từng được chạy.
   *
   * Giảng viên tự upload thì bỏ trống (mặc định `false`). Giao diện soạn đề
   * gửi `true` khi `verification.status !== 'passed'`, và kèm một bước xác
   * nhận riêng — xem `grading-reference.entity.ts`.
   */
  @IsOptional()
  @IsBoolean()
  modelAnswerUnverified?: boolean;
}
