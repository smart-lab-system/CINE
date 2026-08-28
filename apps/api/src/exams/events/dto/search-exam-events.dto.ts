import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../../master-data/dto/common/pagination-query.dto';
import { EXAM_EVENT_STATUSES } from '../../entities/exam-event.entity';

export class SearchExamEventsDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsIn([...EXAM_EVENT_STATUSES])
  status?: (typeof EXAM_EVENT_STATUSES)[number];

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
