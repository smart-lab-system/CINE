import { IsIn } from 'class-validator';

/** `proposed` không đặt được bằng tay — chỉ agent báo *luật còn thiếu* mới sinh nó (3d). */
export class RuleStateDto {
  @IsIn(['active', 'dismissed', 'retired'])
  state!: 'active' | 'dismissed' | 'retired';
}
