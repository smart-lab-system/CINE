import { describe, expect, it } from 'vitest';
import {
  createExamSessionSchema,
  describeCreateError,
  replaceRequiredDeliverablesSchema,
} from './schema';

const VALID_UUID = '11111111-1111-4111-8111-111111111111';

function scheduleBase(
  examDate: string,
  startPeriod: number,
  endPeriod: number,
  durationMinutes: number,
) {
  return {
    name: 'Kiểm tra giữa kỳ',
    classId: VALID_UUID,
    roomName: 'P.A101',
    semesterName: 'HK1 2026-2027',
    examType: 'GK' as const,
    examDate,
    startPeriod,
    endPeriod,
    durationMinutes,
  };
}

function futureExamDate(daysAhead = 2): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function pastExamDate(daysAgo = 2): string {
  return futureExamDate(-daysAgo);
}

describe('createExamSessionSchema - duration', () => {
  it('từ chối thời lượng không thuộc 45/60/75/90', () => {
    const result = createExamSessionSchema.safeParse(scheduleBase(futureExamDate(), 1, 3, 50));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join('.') === 'durationMinutes')).toBe(
        true,
      );
    }
  });

  it('từ chối tiết kết thúc trước tiết bắt đầu', () => {
    const result = createExamSessionSchema.safeParse(scheduleBase(futureExamDate(), 5, 2, 90));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.message)).toContain(
        'Tiết kết thúc phải từ tiết bắt đầu trở đi',
      );
    }
  });

  it('nhận tiết 1-3 + 90 phút', () => {
    const result = createExamSessionSchema.safeParse(scheduleBase(futureExamDate(), 1, 3, 90));
    expect(result.success).toBe(true);
  });

  it('nhận 45/60/75 phút với khung tiết đủ rộng', () => {
    for (const minutes of [45, 60, 75] as const) {
      expect(
        createExamSessionSchema.safeParse(scheduleBase(futureExamDate(), 1, 3, minutes)).success,
      ).toBe(true);
    }
  });
});

describe('createExamSessionSchema - backdating', () => {
  it('nhận ngày thi trong tương lai', () => {
    const result = createExamSessionSchema.safeParse(scheduleBase(futureExamDate(3), 7, 9, 90));
    expect(result.success).toBe(true);
  });

  it('từ chối ngày thi quá khứ ngoài cửa sổ 30 phút', () => {
    const result = createExamSessionSchema.safeParse(scheduleBase(pastExamDate(2), 1, 3, 90));
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.join('.') === 'examDate');
      expect(issue?.message).toBe(
        'Thời gian bắt đầu không được sớm hơn hiện tại quá 30 phút',
      );
    }
  });
});

describe('createExamSessionSchema - create-slim (không filenames/rubric)', () => {
  it('hợp lệ chỉ với lịch + danh tính', () => {
    const result = createExamSessionSchema.safeParse(scheduleBase(futureExamDate(), 1, 3, 90));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('requiredFilenames');
      expect(result.data).not.toHaveProperty('rubricId');
    }
  });
});

describe('replaceRequiredDeliverablesSchema - một gói archive', () => {
  function baseValues(requiredFilenames: unknown) {
    return { requiredFilenames };
  }

  it('cho khai entries khi tên file là .zip', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.zip', entries: [{ value: 'Main.java' }] }]),
    );
    expect(r.success).toBe(true);
  });

  it('TỪ CHỐI file lẻ .docx - hub chỉ nhận .zip|.rar', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.docx' }]),
    );
    expect(r.success).toBe(false);
  });

  it('TỪ CHỐI entries trên .docx', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'a.docx', entries: [{ value: 'Main.java' }] }]),
    );
    expect(r.success).toBe(false);
  });

  it('TỪ CHỐI entry có dấu "/" - khớp theo tên nên đường dẫn là vô nghĩa', () => {
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

  it('không khai entries vẫn hợp lệ trên .zip - tuỳ chọn, không bắt buộc', () => {
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

  it('TỪ CHỐI hai gói - mỗi phiên chỉ một gói nộp', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([
        { value: 'Cau1.zip' },
        { value: 'BaiThi.zip', entries: [{ value: 'Main.java' }] },
      ]),
    );
    expect(r.success).toBe(false);
  });

  it('TỪ CHỐI danh sách rỗng', () => {
    expect(replaceRequiredDeliverablesSchema.safeParse(baseValues([])).success).toBe(false);
  });

  it('nhận mẫu mặc định {SOMAY}_{MSSV}_{HOTEN}.zip', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: '{SOMAY}_{MSSV}_{HOTEN}.zip' }]),
    );
    expect(r.success).toBe(true);
  });
});

describe('replaceRequiredDeliverablesSchema - deliverableType/language', () => {
  function baseValues(requiredFilenames: unknown) {
    return { requiredFilenames };
  }

  it('mặc định deliverableType là document khi không khai', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'BaiThi.zip' }]),
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
      baseValues([{ value: 'BaiThi.zip', deliverableType: 'document', language: 'cpp' }]),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path.join('.').includes('language'));
      expect(issue?.message).toBe('Chỉ khai ngôn ngữ khi loại bài nộp là "Mã nguồn"');
    }
  });

  it('code_project không khai language vẫn hợp lệ - không bắt buộc', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'bai1.zip', deliverableType: 'code_project' }]),
    );
    expect(r.success).toBe(true);
  });

  it('TỪ CHỐI ngôn ngữ ngoài python/cpp/java - node không có trong form', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([{ value: 'bai1.zip', deliverableType: 'code_project', language: 'node' }]),
    );
    expect(r.success).toBe(false);
  });

  it('nhận java trên gói zip - khai được, chấm bằng đọc mã', () => {
    const r = replaceRequiredDeliverablesSchema.safeParse(
      baseValues([
        { value: 'BaiThi.zip', deliverableType: 'code_project', language: 'java' },
      ]),
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
