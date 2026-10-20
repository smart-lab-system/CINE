import { IsIn, IsString, MaxLength } from 'class-validator';

/** Đuôi file mã đáp án — chỉ hai ngôn ngữ sandbox chạy được (`sandboxLanguage`: cpp, python). */
export const ANSWER_SOURCE_EXTENSIONS = ['cpp', 'py'] as const;

export class RequestAnswerSourceUploadDto {
  @IsIn(ANSWER_SOURCE_EXTENSIONS, { message: 'extension phải là "cpp" hoặc "py"' })
  extension!: (typeof ANSWER_SOURCE_EXTENSIONS)[number];
}

/**
 * Khoá tạm mà `upload-url` đã trả. Service kiểm KHUÔN và tiền tố của phiên; DTO chỉ chặn kích thước vô lý để một chuỗi
 * khổng lồ không đi sâu vào regex hay lời gọi kho.
 */
export class ConfirmAnswerSourceDto {
  @IsString()
  @MaxLength(512)
  storageKey!: string;
}
