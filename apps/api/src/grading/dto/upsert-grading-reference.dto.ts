import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Tài liệu tham chiếu cho một lượt chấm. Mọi trường đều tuỳ chọn — ba mức
 * suy giảm (`GradingReadiness`) là hợp lệ, chỉ là kém dần.
 *
 * Gửi lại chỉ một trường thì các trường kia GIỮ NGUYÊN (xem
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
  questionMaterialId?: string;

  /**
   * Khoá do `POST /:id/grading-reference/answer-key-upload` cấp.
   *
   * Server kiểm nó khớp khoá mình vừa cấp — client không được tự đặt, nếu
   * không nó trỏ được bản ghi này vào bất kỳ object nào trong bucket.
   */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  modelAnswerStorageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  modelAnswerFilename?: string;

  /**
   * Lối vào rẻ nhất: một câu, không cần file.
   *
   * 4000 ký tự là rộng tay cho vài đoạn ghi chú chấm, và đủ hẹp để nó
   * không thành một bản đáp án gõ tay vào ô text.
   */
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  modelAnswerNote?: string;
}
