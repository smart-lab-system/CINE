import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { STUDENT_MSSV_REGEX } from '../../common/student-mssv';

// Re-exported so the WebSocket event contract's own DTO file still reads
// as the one place the join payload is described. The rule itself lives in
// common/, next to the other module that has to spell it identically.
export { STUDENT_MSSV_REGEX };

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

  /**
   * The lab machine's own name, if the agent knows it. Fills {SOMAY} in a
   * filename pattern.
   *
   * Optional, and read from the OS rather than typed: CLAUDE.md forbids
   * adding a step for the student, and a seat number they type is a value
   * nobody can check. A missing one renders as UNKNOWN, visibly.
   */
  @IsOptional()
  @IsString()
  @Length(1, 64)
  machineName?: string;
}
