import { IsIn } from 'class-validator';
import { DECLARED_LANGUAGES, DeclaredLanguage } from '../../exam-session/declared-language';

/**
 * Một trường, cố ý. Không nhận `null`: gỡ một ngôn ngữ đã khai không có nghĩa gì trước khi chấm — bài chưa khai và
 * bài khai `java` đều đi đường `one_shot` — nên "chưa khai" chỉ là trạng thái ban đầu, không phải một lựa chọn.
 */
export class DeclareLanguageDto {
  @IsIn(DECLARED_LANGUAGES)
  language!: DeclaredLanguage;
}
