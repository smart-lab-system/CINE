import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';
import { ExamType, ExamSessionStatus } from '../entities/exam-session.entity';

const EXAM_TYPES: ExamType[] = ['TK', 'GK', 'CK'];
const EXAM_SESSION_STATUSES: ExamSessionStatus[] = [
  'draft',
  'scheduled',
  'active',
  'completed',
  'cancelled',
];

/**
 * QA-reported gap: "Tạo filter cho cả trang quản lý kỳ thi và bài thu" —
 * this list only ever took page/pageSize. Three filters, each optional
 * and AND-ed together in the service, matching a teacher's actual
 * question ("which of MY sessions are still active", "find the one named
 * X") — not exposed as a generic query builder, so nothing here can ever
 * reach past `s.teacherId = :teacherId`.
 */
export class SearchExamSessionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;

  /** Matches session name OR code, case-insensitive — the two things a
   *  teacher actually has in hand when looking for one session. */
  @IsOptional()
  @IsString()
  @Length(1, 200)
  search?: string;

  @IsOptional()
  @IsIn(EXAM_SESSION_STATUSES)
  status?: ExamSessionStatus;

  @IsOptional()
  @IsIn(EXAM_TYPES)
  examType?: ExamType;

  /**
   * Lọc, không phải phạm vi — service AND nó vào `s.teacherId`. Spec §5.1.
   *
   * Phiên thi không mang `semester_id`: nó thừa hưởng học kỳ từ môn, nên bộ lọc
   * đi qua `course.semesterId`.
   */
  @IsOptional()
  @IsUUID()
  semesterId?: string;
}
