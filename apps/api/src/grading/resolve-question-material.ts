import { extractText } from './extract-text';
import { isPdfFilename } from './model-answer-package';

/**
 * Đề bài đã nạp sẵn cho prompt one_shot / advocate.
 *
 * PDF giữ nguyên bytes (document block). DOCX/TXT và mọi định dạng
 * `extractText` đọc được → chữ. Không gửi giả PDF cho docx.
 */
export type ResolvedQuestionMaterial =
  | { kind: 'pdf'; bytes: Buffer; filename: string }
  | { kind: 'text'; text: string; filename: string }
  | { kind: 'unreadable'; filename: string };

/**
 * Phân loại bytes đề theo tên file đã khai (giống nhánh đáp án mẫu).
 */
export async function resolveQuestionMaterial(
  bytes: Buffer,
  filename: string,
): Promise<ResolvedQuestionMaterial> {
  const name = filename.trim() || 'question';
  if (isPdfFilename(name)) {
    return { kind: 'pdf', bytes, filename: name };
  }
  const text = (await extractText(bytes, name)).trim();
  if (text.length > 0) {
    return { kind: 'text', text, filename: name };
  }
  return { kind: 'unreadable', filename: name };
}
