import { ArrayMinSize, IsArray, IsUUID } from 'class-validator';

export class EnrollStudentDto {
  @IsUUID()
  studentId!: string;
}

export class BulkEnrollStudentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  studentIds!: string[];
}
