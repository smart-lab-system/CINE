import { IsUUID } from 'class-validator';

/** Admin-only escape hatch — xem `ExamSessionReassignService`. */
export class ReassignTeacherDto {
  @IsUUID()
  teacherId!: string;
}
