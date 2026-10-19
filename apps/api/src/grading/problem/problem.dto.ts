import { IsIn, IsInt, IsString, IsUUID, Length, Min } from 'class-validator';

/**
 * Thêm một câu thủ công vào phiên (P1b Task 4). Rubric phải là rubric đang gắn với phiên, và `pointsHundredths`
 * phải bằng tổng tiêu chí của rubric đó (D1); `language` phải khớp yêu cầu nộp đã chọn (D2). Hai luật này được
 * kiểm trong service, không ở đây, vì chúng cần trạng thái của phiên.
 */
export class AddProblemDto {
  @IsString()
  @Length(1, 200)
  title!: string;

  @IsInt()
  @Min(1)
  pointsHundredths!: number;

  @IsUUID()
  requiredDeliverableId!: string;

  @IsUUID()
  rubricId!: string;

  @IsIn(['cpp', 'python'])
  language!: 'cpp' | 'python';
}
