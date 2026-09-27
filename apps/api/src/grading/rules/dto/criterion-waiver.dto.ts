import { IsString, Matches } from 'class-validator';

export class CriterionWaiverDto {
  @IsString()
  @Matches(/^[a-z0-9_]{1,64}$/)
  criterionKey!: string;
}
