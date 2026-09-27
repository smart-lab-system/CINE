import { Allow, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Body của một luật. Mọi trường khai ở đây để `ValidationPipe({ whitelist: true })` không lột mất;
 * kiểm THẬT nằm ở `parseRuleInput` / `parseRuleChanges` (`rule-input.ts`) — một chỗ cho cả route
 * lẫn service, vì `predicate` có bốn hình dạng mà decorator không tả gọn được.
 */
export class RuleChangesDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  criterionKey?: string;

  /** null = luật bằng lời; không thì một trong bốn mẫu của §4.1. */
  @IsOptional()
  @Allow()
  predicate?: unknown;
}

export class RuleBodyDto extends RuleChangesDto {
  @IsOptional()
  @IsString()
  ruleKey?: string;
}

/** Xem trước một luật đang soạn (spec UI 3.2) — kèm luật đang sửa và mức trừ giả định. */
export class RulePreviewDto extends RuleBodyDto {
  @IsOptional()
  @IsUUID()
  ruleId?: string;

  /** Chuỗi thập phân hay null — `parseDeduction` kiểm, không `@IsNumber` (§13.2). */
  @IsOptional()
  @Allow()
  deduction?: unknown;
}
