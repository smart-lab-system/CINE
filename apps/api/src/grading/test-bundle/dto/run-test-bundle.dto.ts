import { IsOptional, IsString, Matches } from 'class-validator';
import { CASE_KEY_REGEX } from './create-test-bundle.dto';

/**
 * Chạy thử MỘT ca (có `caseKey`) hay mọi ca đang dùng của gói (bỏ trống). Cùng regex với `case_key` của DB và
 * `DropTestCaseDto`: một khoá rác phải là 400, không phải một 404 sai nguyên nhân.
 */
export class RunTestBundleDto {
  @IsOptional()
  @IsString()
  @Matches(CASE_KEY_REGEX, { message: 'caseKey chỉ gồm chữ, số, "_", "-", tối đa 64 ký tự' })
  caseKey?: string;
}
