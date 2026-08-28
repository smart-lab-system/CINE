import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Length, Min } from 'class-validator';
import { SESSION_STATUSES } from '../../entities/lab-session.entity';

const TRANSITION_STATUSES = SESSION_STATUSES.filter(
  (status) => status !== 'draft',
);

export class TransitionLabSessionStatusDto {
  @IsIn(TRANSITION_STATUSES)
  toStatus!: (typeof TRANSITION_STATUSES)[number];

  @IsString()
  @Length(1, 2000)
  reason!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  rowVersion!: number;
}
