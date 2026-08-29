import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class RubricCriterionDto {
  @IsString()
  @Length(3, 1000)
  description!: string;

  /**
   * Two decimals, matching numeric(6,2) on the column. Bounded so one
   * criterion cannot carry a rubric whose total means nothing.
   */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.25)
  @Max(100)
  maxPoints!: number;
}

export class SaveRubricDto {
  @IsArray()
  @ArrayMinSize(1)
  // A rubric with fifty criteria is a rubric nobody reviews, and every one
  // of them is a separate question put to the model on every submission.
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RubricCriterionDto)
  criteria!: RubricCriterionDto[];
}
