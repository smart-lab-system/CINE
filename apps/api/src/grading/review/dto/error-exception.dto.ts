import { IsIn, IsUUID } from 'class-validator';
import { EXCEPTION_DIRECTIONS, ExceptionDirection } from '../../grading-model.types';

/** *Bỏ lỗi này cho riêng bài này* (`exclude`) hay gỡ việc đó (`include`) — §2.2. */
export class ErrorExceptionDto {
  @IsUUID()
  ruleId!: string;

  @IsIn([...EXCEPTION_DIRECTIONS])
  direction!: ExceptionDirection;
}
