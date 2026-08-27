import { IsUUID } from 'class-validator';

// Validated shape of the `teacher:subscribe` WebSocket payload (see the
// WebSocket Event Contract in the exam-live demo plan's Global
// Constraints). `examSessionId` is `exam_session.id`, a uuid primary key.
export class TeacherSubscribeDto {
  @IsUUID()
  examSessionId!: string;
}
