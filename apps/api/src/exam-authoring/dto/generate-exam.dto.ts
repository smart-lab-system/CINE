import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  MAX_CLASSIC_PROBLEM_LENGTH,
  MAX_QUESTIONS_PER_RUN,
} from '../ai-provider/exam-authoring-provider';

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
   *
   * Trần `MAX_CLASSIC_PROBLEM_LENGTH`, KHÔNG phải số viết tay: cùng hằng số
   * mà `parseAuthoringResponse` (authoring-prompt.ts) dùng để CẮT
   * `resemblesKnownProblem` khi đọc đầu ra của model. Hai số viết tay ở hai
   * chỗ từng lệch nhau (một bên không giới hạn, một bên 200) và đó chính là
   * lỗi thật 2026-09-24 — model viết dài hơn 200 ký tự, lượt sinh lại kế
   * tiếp gửi nó lên `avoid` và bị chặn ngay ở đây.
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, MAX_CLASSIC_PROBLEM_LENGTH, { each: true })
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

/**
 * Gắn bộ đề vừa soạn vào một phiên thi.
 *
 * Cùng `examJson` đi ngược lên như `ExportExamDto`, vì cùng một lý do: không
 * có bảng nào lưu bản nháp để mà tra id. Server tự dựng lại hai file Word từ
 * đây chứ không nhận file từ trình duyệt — file giảng viên tải về và file
 * gắn vào phiên phải là CÙNG MỘT thứ, và cách chắc chắn nhất là dựng cả hai
 * từ cùng một nguồn bằng cùng một đoạn mã.
 */
export class AttachExamDto {
  @IsUUID()
  examSessionId!: string;

  @IsString()
  @Length(1, 500_000)
  examJson!: string;
}
