import { IsString, Matches } from 'class-validator';
import { CASE_KEY_REGEX } from './create-test-bundle.dto';

/**
 * `case_key` là khoá của `grading_test_case`, không phải tên tự do — dùng
 * CHÍNH regex mà `TestCaseDto` và `CHECK` của DB dùng, để ba nơi không lệch
 * nhau. Không có nó, một `caseKey` rác đi thẳng vào `WHERE` và ra 404 với
 * thông báo sai nguyên nhân.
 */
export class DropTestCaseDto {
  @IsString()
  @Matches(CASE_KEY_REGEX, { message: 'caseKey chỉ gồm chữ, số, "_", "-", tối đa 64 ký tự' })
  caseKey!: string;
}
