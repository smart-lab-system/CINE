import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { MAX_QUESTIONS_PER_RUN } from '../ai-provider/exam-authoring-provider';

/**
 * Ngôn ngữ mở nhưng KHÔNG tự do.
 *
 * Một chuỗi bất kỳ đi thẳng vào prompt là một đường tiêm lệnh, và cũng là
 * cách sinh ra đề bằng ngôn ngữ mà sandbox sau này không chạy được. Danh sách
 * khớp `SANDBOX_LANGUAGES` của nhánh autograder, để bước kiểm chứng sau này
 * không phải thu hẹp lại.
 */
export const AUTHORING_LANGUAGES = ['python', 'cpp', 'java', 'node'] as const;

export class GenerateExamDto {
  @IsString()
  @Length(10, 2000)
  prompt!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_QUESTIONS_PER_RUN)
  questionCount!: number;

  @IsIn(AUTHORING_LANGUAGES)
  language!: string;

  /**
   * Ba trường của lượt SINH LẠI MỘT CÂU. Vắng ở lượt sinh đầu.
   *
   * `avoid` do FRONTEND điền từ `resemblesKnownProblem` của câu đang bị thay,
   * không phải giảng viên gõ: hệ thống đã biết model tự khai gì, bắt người
   * dùng gõ lại là bắt họ làm việc của máy.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 200, { each: true })
  avoid?: string[];

  @IsOptional()
  @IsString()
  @Length(1, 1000)
  refineNote?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 4000, { each: true })
  existingStatements?: string[];
}

/**
 * Bộ ba đi NGƯỢC lên từ trình duyệt để xuất file.
 *
 * Trông lạ, nhưng là hệ quả trực tiếp của "không lưu" (spec §9): server không
 * giữ bản nháp nào, nên lúc xuất file nó phải được đưa lại. Không có `examId`
 * để tra, vì không có bảng nào để tra.
 */
export class ExportExamDto {
  @IsString()
  @Length(1, 500_000)
  examJson!: string;
}
