import { Allow, IsOptional, IsString } from 'class-validator';

/**
 * Body sửa danh tính lỗi. Kiểm THẬT nằm ở `parseRuleChanges` (`rule-input.ts`) —
 * một chỗ cho cả route lẫn service, vì `predicate` có bốn hình dạng mà decorator không tả gọn được.
 */
export class RuleChangesDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** null = luật bằng lời; không thì một trong bốn mẫu của §4.1. */
  @IsOptional()
  @Allow()
  predicate?: unknown;
}
