import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { PaginationQueryDto } from '../../dto/common/pagination-query.dto';
import { STUDENT_STATUSES } from './create-student.dto';

export class SearchStudentsDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(STUDENT_STATUSES)
  status?: (typeof STUDENT_STATUSES)[number];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
