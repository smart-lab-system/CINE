import { IsOptional, IsString, Length, Matches } from 'class-validator';

// Exactly ck_submission_mssv / ck_enrollment_mssv. Enforced at join, not
// at submission time, so a student with a malformed id finds out in the
// first ten seconds instead of when their work fails to save at the end
// of the exam — by which point nothing can be done about it.
export const STUDENT_MSSV_REGEX = /^[A-Za-z0-9]{4,20}$/;

// Validated shape of the `agent:join` WebSocket payload (see the WebSocket
// Event Contract in the exam-live demo plan's Global Constraints — do not
// rename these fields, other tasks (agent CLI, mock agent, frontend lobby)
// depend on this exact shape).
export class AgentJoinDto {
  /**
   * Accepted for backward compatibility and ignored. Identity now comes from
   * the Enrollment the server resolves by MSSV — a typed name would have to
   * be reconciled against the roster spelling, which is the fuzzy matching
   * this design removes rather than solves. Agents may stop sending it.
   */
  @IsOptional()
  @IsString()
  @Length(1, 100)
  fullName?: string;

  @IsString()
  @Matches(STUDENT_MSSV_REGEX, {
    message: 'studentId must be 4-20 letters or digits',
  })
  studentId!: string;

  // Bounded to `exam_session.code`'s column length (varchar(20)) — the
  // gateway upper-cases this before querying, this DTO only enforces
  // "required, non-empty, not absurdly long".
  @IsString()
  @Length(1, 20)
  sessionCode!: string;
}
