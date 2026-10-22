import { describe, expect, it } from 'vitest';
import {
  createExamSessionSchema,
  describeCreateError,
  replaceRequiredDeliverablesSchema,
} from './schema';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function scheduleBase(startTime: string, endTime: string) {
  return {
    name: 'Kiểm tra giữa kỳ',
    classId: VALID_UUID,
    roomName: 'P.A101',
    semesterName: 'HK1 2026-2027',
    examType: 'GK' as const,
    startTime,
    endTime,
  };
}

// QA-reported gap: nothing stopped a teacher from creating a session a few
// seconds long. Mirrors the backend's HasMinimumDurationConstraint.
describe('createExamSessionSchema — minimum duration', () => {
  it('rejects a session shorter than 15 minutes, pointing at endTime', () => {
    const start = futureStart();
    const end = new Date(start.getTime() + 5 * 60_000);

    const result = createExamSessionSchema.safeParse(
      scheduleBase(toLocalInput(start), toLocalInput(end)),
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
      scheduleBase(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(true);
  });

  it('does not stack the "too short" message on top of an invalid ordering', () => {
    const start = futureStart();
    const end = new Date(start.getTime() - 5 * 60_000);

    const result = createExamSessionSchema.safeParse(
      scheduleBase(toLocalInput(start), toLocalInput(end)),
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
  it('accepts a session declared a few minutes after it started', () => {
    const start = new Date(Date.now() - 10 * 60_000);
    const end = new Date(Date.now() + 60 * 60_000);

    const result = createExamSessionSchema.safeParse(
      scheduleBase(toLocalInput(start), toLocalInput(end)),
    );

    expect(result.success).toBe(true);
  });

  it('rejects a session backdated past the grace window, pointing at startTime', () => {
    const start = new Date(Date.now() - 45 * 60_000);
    const end = new Date(Date.now() + 60 * 60_000);

    const result = createExamSessionSchema.safeParse(
      scheduleBase(toLocalInput(start), toLocalInput(end)),
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

describe('createExamSessionSchema — create-slim (không filenames/rubric)', () => {
  it('hợp lệ chỉ với lịch + danh tính', () => {
    const start = futureStart();
    const end = new Date(start.getTime() + 60 * 60_000);
    const result = createExamSessionSchema.safeParse(
      scheduleBase(toLocalInput(start), toLocalInput(end)),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('requiredFilenames');
      expect(result.data).not.toHaveProperty('rubricId');
    }
  });
});

describe('replaceRequiredDeliverablesSchema — file bên trong', () => {
  function baseValues(requiredFilenames: unknown) {
    return { requiredFilenames };
  }

  it('cho khai entries khi tên file là .zip', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.zip', entries: [{ value: 'Main.java' }] }]),
    );
    expect(r.success).toBe(true);
  });

  it('TỪ CHỐI entries khi tên file là .docx — phải khớp DTO backend', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.docx', entries: [{ value: 'Main.java' }] }]),
    );
    expect(r.success).toBe(false);
  });

  it('TỪ CHỐI entry có dấu "/" — khớp theo tên nên đường dẫn là vô nghĩa', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.zip', entries: [{ value: 'src/Main.java' }] }]),
    );
    expect(r.success).toBe(false);
  });

  it('TỪ CHỐI quá 20 entry', () => {
    const entries = Array.from({ length: 21 }, (_, i) => ({ value: `f${i}.java` }));
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.zip', entries }]),
    );
    expect(r.success).toBe(false);
  });

  it('CHO ĐÚNG 20 entry', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({ value: `f${i}.java` }));
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.zip', entries }]),
    );
    expect(r.success).toBe(true);
  });

  it('.ZIP viết hoa vẫn được khai entries', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'BaiThi.ZIP', entries: [{ value: 'Main.java' }] }]),
    );
    expect(r.success).toBe(true);
  });

  it('.rar cũng được khai entries', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'BaiThi.rar', entries: [{ value: 'Main.java' }] }]),
    );
    expect(r.success).toBe(true);
  });

  it('không khai entries vẫn hợp lệ trên .zip — tuỳ chọn, không bắt buộc', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(baseValues([{ value: 'a.zip' }]));
    expect(r.success).toBe(true);
  });

  it('entries rỗng thì như không khai gì cả', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.zip', entries: [] }]),
    );
    expect(r.success).toBe(true);
  });

  it('TỪ CHỐI entry trùng tên trong cùng một deliverable', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.zip', entries: [{ value: 'M.java' }, { value: 'M.java' }] }]),
    );
    expect(r.success).toBe(false);
  });

  it('trộn deliverable có entries và không có entries trong cùng danh sách', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([
        { value: 'Cau1.docx' },
        { value: 'BaiThi.zip', entries: [{ value: 'Main.java' }] },
      ]),
    );
    expect(r.success).toBe(true);
  });

  it('TỪ CHỐI danh sách rỗng — hub phải lưu ≥ 1 file', () => {
    expect(replaceRequiredDeliverablesSchema.safeParse(baseValues([])).success).toBe(false);
  });
});

describe('replaceRequiredDeliverablesSchema — deliverableType/language', () => {
  function baseValues(requiredFilenames: unknown) {
    return { requiredFilenames };
  }

  it('mặc định deliverableType là document khi không khai', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'Cau1.docx' }]),
    );
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.requiredFilenames[0].deliverableType).toBe('document');
    }
  });

  it('nhận code_project kèm language hợp lệ', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'bai1.zip', deliverableType: 'code_project', language: 'cpp' }]),
    );
    expect(r.success).toBe(true);
  });

  it('TỪ CHỐI language trên deliverable KHÔNG phải code_project', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'Cau1.docx', deliverableType: 'document', language: 'cpp' }]),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join('.').includes('language'));
      expect(issue?.message).toBe('Chỉ khai ngôn ngữ khi loại bài nộp là "Mã nguồn"');
    }
  });

  it('code_project không khai language vẫn hợp lệ — không bắt buộc', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'bai1.zip', deliverableType: 'code_project' }]),
    );
    expect(r.success).toBe(true);
  });

  it('TỪ CHỐI ngôn ngữ ngoài python/cpp/java — node không có trong form', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'bai1.zip', deliverableType: 'code_project', language: 'node' }]),
    );
    expect(r.success).toBe(false);
  });

  it('nhận java — khai được, chấm bằng đọc mã', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'Main.java', deliverableType: 'code_project', language: 'java' }]),
    );
    expect(r.success).toBe(true);
  });
});

describe('describeCreateError', () => {
  it('shows the server’s own explanation when there is one', () => {
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
    expect(describeCreateError(null)).toBe(
      'Không tạo được phiên thi. Vui lòng kiểm tra lại thông tin và thử lại.',
    );
  });
});

function futureStart(): Date {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(8, 0, 0, 0);
  return start;
}

function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
