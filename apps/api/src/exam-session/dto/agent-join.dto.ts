import { IsString, Length } from 'class-validator';

// Validated shape of the `agent:join` WebSocket payload (see the WebSocket
// Event Contract in the exam-live demo plan's Global Constraints — do not
// rename these fields, other tasks (agent CLI, mock agent, frontend lobby)
// depend on this exact shape).
export class AgentJoinDto {
  @IsString()
  @Length(1, 100)
  fullName!: string;

  @IsString()
  @Length(1, 20)
  studentId!: string;

  // Bounded to `exam_session.code`'s column length (varchar(20)) — the
  // gateway upper-cases this before querying, this DTO only enforces
  // "required, non-empty, not absurdly long".
  @IsString()
  @Length(1, 20)
  sessionCode!: string;
}
