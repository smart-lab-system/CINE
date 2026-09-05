import { IsUUID, ValidateIf } from 'class-validator';

/**
 * One field, deliberately.
 *
 * NOT a general "update the exam session" DTO. Opening
 * `PATCH /exam-sessions/:id` would open a way to edit startTime/endTime/
 * roomId, and that is exactly the area ScheduleConflictService.assertNone
 * does not yet handle: it takes no excludeSessionId, so a reschedule would
 * report the session clashing with where it already is. Keeping this
 * endpoint to `rubricId` keeps it clear of that.
 */
export class SetSessionRubricDto {
  /**
   * `null` detaches the rubric — a real request, not a missing field, which
   * is why the UUID rule is skipped for it rather than the field being
   * optional.
   */
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  rubricId!: string | null;
}
