import { ExamSessionStatus } from '../entities/exam-session.entity';
import { DeliverableType } from '../entities/required-deliverable.entity';

export class RequiredDeliverableResponseDto {
  id!: string;
  requiredFilename!: string;
  deliverableType!: DeliverableType;
}

export class ExamSessionResponseDto {
  id!: string;
  name!: string;
  code!: string;
  teacherId!: string;
  courseId!: string | null;
  startTime!: Date;
  endTime!: Date;
  status!: ExamSessionStatus;
  requiredDeliverables!: RequiredDeliverableResponseDto[];
}
