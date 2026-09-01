import { describe, expect, it } from 'vitest';
import { createExamSessionSchema } from './page';

// QA-reported gap: nothing stopped a teacher from creating a session a few
// seconds long. Mirrors the backend's HasMinimumDurationConstraint (see
// apps/api/src/exam-session/dto/create-exam-session.dto.ts) — tested here
// directly against the exported schema rather than through a full render,
// since this form has no other test coverage yet.
describe('createExamSessionSchema — minimum duration', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  function baseValues(startTime: string, endTime: string) {
    return {
      name: 'Kiểm tra giữa kỳ',
      classId: VALID_UUID,
      roomId: VALID_UUID,
      examType: 'GK' as const,
      startTime,
      endTime,
      requiredFilenames: [{ value: 'Cau1.docx' }],
    };
  }

  it('rejects a session shorter than 15 minutes, pointing at endTime', () => {
    const start = new Date('2026-09-01T08:00:00');
    const end = new Date(start.getTime() + 5 * 60_000); // 5 minutes

    const result = createExamSessionSchema.safeParse(
      baseValues(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'endTime');
      expect(issue?.message).toBe('Phiên thi phải kéo dài ít nhất 15 phút');
    }
  });

  it('accepts a session exactly 15 minutes long — the floor is inclusive', () => {
    const start = new Date('2026-09-01T08:00:00');
    const end = new Date(start.getTime() + 15 * 60_000);

    const result = createExamSessionSchema.safeParse(
      baseValues(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(true);
  });

  it('does not stack the "too short" message on top of an invalid ordering', () => {
    const start = new Date('2026-09-01T08:00:00');
    const end = new Date(start.getTime() - 5 * 60_000); // before start

    const result = createExamSessionSchema.safeParse(
      baseValues(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain('Thời gian kết thúc phải sau thời gian bắt đầu');
      expect(messages).not.toContain('Phiên thi phải kéo dài ít nhất 15 phút');
    }
  });
});

// Matches the "YYYY-MM-DDTHH:mm" shape <input type="datetime-local"> produces —
// the schema validates this raw local-time string, not an ISO string.
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
