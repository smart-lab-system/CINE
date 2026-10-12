import { Allow, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** Mọi trường khai ở đây để `ValidationPipe({ whitelist: true })` không lột mất; kiểm THẬT ở `parseAssignInput`. */
export class AssignErrorDto {
  @IsString()
  rubricName!: string;

  @IsString()
  criterionKey!: string;

  @IsOptional()
  @Allow()
  deduction?: unknown;

  @IsOptional()
  @IsUUID()
  ruleId?: string;

  @IsOptional()
  @Allow()
  newRule?: unknown;

  @IsOptional()
  @Allow()
  changes?: unknown;
}

export class MoveErrorDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,64}$/)
  criterionKey!: string;
}

export class CopyErrorsDto {
  @IsString()
  fromRubricName!: string;

  @IsString()
  toRubricName!: string;
}

export class SplitRuleDto {
  @IsString()
  rubricName!: string;

  @IsOptional()
  @Allow()
  changes?: unknown;
}
