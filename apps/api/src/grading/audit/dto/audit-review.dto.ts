import { ArrayMaxSize, IsArray, IsString, IsUUID, MaxLength } from 'class-validator';

/**
 * Nhận xét kiểm mẫu (parent spec §8.1 luật 3). Cả hai trường bắt buộc và ĐƯỢC RỖNG: "bài này không có lỗi" là
 * một nhãn thật — thiếu trường thì 400, còn mảng rỗng thì ghi.
 */
export class AuditReviewDto {
  /** Luật giảng viên thấy trong bài, từ bảng lỗi ĐANG DÙNG của chính họ. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  pickedRuleIds!: string[];

  /**
   * Lỗi không có trong bảng lỗi — mỗi dòng một lỗi. Độ dài THẬT (1–500) kiểm SAU khi trim ở service (spec D8);
   * `MaxLength(2000)` ở đây chỉ chặn tải trọng khổng lồ trước khi tới service.
   */
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(2000, { each: true })
  extraErrors!: string[];
}
