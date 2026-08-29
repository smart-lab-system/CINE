import { ExamSessionStatus, ExamType } from '../entities/exam-session.entity';
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
  courseId!: string;
  // Null only for the sessions created before a session named a class.
  classId!: string | null;
  roomId!: string;
  examType!: ExamType;
  startTime!: Date;
  endTime!: Date;
  status!: ExamSessionStatus;
  requiredDeliverables!: RequiredDeliverableResponseDto[];
}

// Deliberately leaner than ExamSessionResponseDto — GET /exam-sessions
// (the "Quản lý kỳ thi" list) doesn't need requiredDeliverables per row,
// so the query behind it never fetches them (avoids an N+1 the detail
// view's single-session fetch doesn't have to worry about). courseName/
// roomName are denormalized here (via a single JOIN in the list query) so
// the frontend table doesn't need a second round-trip per row either.
export class ExamSessionListItemDto {
  id!: string;
  name!: string;
  code!: string;
  courseName!: string;
  className!: string | null;
  roomName!: string;
  examType!: ExamType;
  startTime!: Date;
  endTime!: Date;
  status!: ExamSessionStatus;
}
