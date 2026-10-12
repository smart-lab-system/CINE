import { IsIn } from 'class-validator';

/**
 * Duyệt lỗi đề xuất đi qua POST /rubric-errors; `proposed`/`active` không đặt được bằng tay.
 */
export class RuleStateDto {
  @IsIn(['dismissed', 'retired'])
  state!: 'dismissed' | 'retired';
}
