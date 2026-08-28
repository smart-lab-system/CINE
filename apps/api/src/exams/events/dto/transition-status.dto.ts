import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Length, Min } from 'class-validator';
import { EXAM_EVENT_STATUSES } from '../../entities/exam-event.entity';

const TRANSITION_STATUSES = EXAM_EVENT_STATUSES.filter(
  (status) => status !== 'draft',
);

export class TransitionExamEventStatusDto {
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
