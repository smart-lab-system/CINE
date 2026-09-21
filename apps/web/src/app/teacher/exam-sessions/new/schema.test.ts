import { describe, expect, it } from 'vitest';
import { createExamSessionSchema, describeCreateError } from './schema';

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
      roomName: 'P.A101',
      semesterName: 'HK1 2026-2027',
      examType: 'GK' as const,
      startTime,
      endTime,
      requiredFilenames: [{ value: 'Cau1.docx' }],
    };
  }

  it('rejects a session shorter than 15 minutes, pointing at endTime', () => {
    const start = futureStart();
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
    const start = futureStart();
    const end = new Date(start.getTime() + 15 * 60_000);

    const result = createExamSessionSchema.safeParse(
      baseValues(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(true);
  });

  it('does not stack the "too short" message on top of an invalid ordering', () => {
    const start = futureStart();
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

describe('createExamSessionSchema — backdating', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  function baseValues(startTime: string, endTime: string) {
    return {
      name: 'Kiểm tra giữa kỳ',
      classId: VALID_UUID,
      roomName: 'P.A101',
      semesterName: 'HK1 2026-2027',
      examType: 'GK' as const,
      startTime,
      endTime,
      requiredFilenames: [{ value: 'Cau1.docx' }],
    };
  }

  it('accepts a session declared a few minutes after it started', () => {
    // The lecturer forgot to create the session and is now entering the
    // time the exam really began. Refusing this would make them record a
    // start time they know is wrong.
    const start = new Date(Date.now() - 10 * 60_000);
    const end = new Date(Date.now() + 60 * 60_000);

    const result = createExamSessionSchema.safeParse(
      baseValues(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a session backdated past the grace window, pointing at startTime', () => {
    const start = new Date(Date.now() - 45 * 60_000);
    const end = new Date(Date.now() + 60 * 60_000);

    const result = createExamSessionSchema.safeParse(
      baseValues(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'startTime');
      expect(issue?.message).toBe(
        'Thời gian bắt đầu không được sớm hơn hiện tại quá 30 phút',
      );
    }
  });
});

describe('createExamSessionSchema — rubric', () => {
  const VALID_UUID = '11111111-1111-4111-8111-111111111111';

  function baseValues(extra: Record<string, unknown> = {}) {
    const start = futureStart();
    const end = new Date(start.getTime() + 60 * 60_000);
    return {
      name: 'Kiểm tra giữa kỳ',
      classId: VALID_UUID,
      roomName: 'P.A101',
      semesterName: 'HK1 2026-2027',
      examType: 'GK' as const,
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
      requiredFilenames: [{ value: 'Cau1.docx' }],
      ...extra,
    };
  }

  it('cho phép bỏ trống rubric — rubric là tuỳ chọn', () => {
    expect(createExamSessionSchema.safeParse(baseValues()).success).toBe(true);
  });

  it('giữ rubricId hợp lệ đi xuyên qua schema', () => {
    // Khẳng định GIÁ TRỊ, không chỉ success: zod mặc định loại bỏ key lạ,
    // nên `success === true` vẫn đúng kể cả khi schema không hề biết tới
    // rubricId — và form sẽ âm thầm gửi đi thiếu field.
    const rubricId = '22222222-2222-4222-8222-222222222222';

    const result = createExamSessionSchema.safeParse(baseValues({ rubricId }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rubricId).toBe(rubricId);
    }
  });

  it('coi chuỗi rỗng là "không chọn", không phải uuid hỏng', () => {
    // <Select> trả '' khi chưa chọn gì. Không xử lý thì một form hoàn toàn
    // hợp lệ bị chặn bằng lỗi "uuid không hợp lệ" — mà người dùng thì không
    // hề chọn gì sai cả.
    const result = createExamSessionSchema.safeParse(baseValues({ rubricId: '' }));

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rubricId).toBeUndefined();
    }
  });
});

describe('describeCreateError', () => {
  it('shows the server’s own explanation when there is one', () => {
    // A room clash names the room and the session holding it. Replacing
    // that with a generic sentence is what the old hardcoded banner did,
    // and it sent lecturers looking at their filename list instead.
    const message = 'Phòng A1-05 đã có phiên thi "Ca sáng" lúc 08:00–10:00 ngày 12/09.';

    expect(describeCreateError({ statusCode: 409, message })).toBe(message);
  });

  it('joins the list Nest returns for a failed validation', () => {
    expect(
      describeCreateError({
        statusCode: 400,
        message: ['startTime must not be more than 30 minutes in the past', 'name too long'],
      }),
    ).toBe('startTime must not be more than 30 minutes in the past. name too long');
  });

  it('falls back when the failure carried no message at all', () => {
    // Network failure, or a status openapi-fetch could not parse a body
    // from — there is nothing specific to say, so say something true.
    expect(describeCreateError(null)).toBe(
      'Không tạo được phiên thi. Vui lòng kiểm tra lại thông tin và thử lại.',
    );
  });
});

// A day out, so nothing here trips the backdating rule as the calendar
// moves — the earlier fixed 2026-09-01 date silently became a past date.
function futureStart(): Date {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(8, 0, 0, 0);
  return start;
}

// Matches the "YYYY-MM-DDTHH:mm" shape <input type="datetime-local"> produces —
// the schema validates this raw local-time string, not an ISO string.
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
