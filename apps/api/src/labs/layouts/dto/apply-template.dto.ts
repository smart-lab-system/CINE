import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

export class ApplyTemplateDto {
  @IsUUID()
  templateId!: string;

  @IsOptional()
  @IsIn(['replace', 'append'])
  mode?: 'replace' | 'append';

  @IsOptional()
  @IsBoolean()
  matchCanvas?: boolean;
}
