import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { RosterStudentDto } from '../../course/dto/roster.dto';

export class EnsureRosterDto {
  @IsString()
  @Length(2, 32)
  courseCode!: string;

  @IsString()
  @Length(1, 150)
  semesterName!: string;

  @IsString()
  @Length(1, 100)
  className!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ArrayUnique((student: RosterStudentDto) => student.mssv?.toLowerCase(), {
    message: 'File có MSSV bị lặp lại',
  })
  @ValidateNested({ each: true })
  @Type(() => RosterStudentDto)
  students!: RosterStudentDto[];

  @IsOptional()
  @IsBoolean()
  removeMissing?: boolean;
}
