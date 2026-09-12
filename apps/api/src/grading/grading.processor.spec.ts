import { Job, UnrecoverableError } from 'bullmq';
import { GradingProcessor } from './grading.processor';
import { GradingService } from './grading.service';
import { GradeSubmissionJob, GRADE_JOB_TIMEOUT_MS } from './grading.queue';

/**
 * Processor chỉ có ba việc, và cả ba đều là thứ hỏng âm thầm nếu sai:
 * uỷ quyền cho service, phân loại lỗi trước khi để BullMQ retry, và
 * không để một lời gọi treo giữ slot mãi.
 */
describe('GradingProcessor', () => {
  const gradeOneById = jest.fn();
  let processor: GradingProcessor;

  function jobFor(overrides: Partial<GradeSubmissionJob> = {}): Job<GradeSubmissionJob> {
    return {
      data: {
        submissionId: 's1',
        requiredFilename: 'Cau1.docx',
        rubricId: 'r1',
        teacherId: 't1',
        ...overrides,
      },
    } as unknown as Job<GradeSubmissionJob>;
  }

  beforeEach(() => {
    gradeOneById.mockReset();
    gradeOneById.mockResolvedValue(undefined);
    processor = new GradingProcessor({ gradeOneById } as unknown as GradingService);
  });

  it('uỷ quyền một job cho GradingService.gradeOneById', async () => {
    await processor.process(jobFor());

    expect(gradeOneById).toHaveBeenCalledWith({
      submissionId: 's1',
      requiredFilename: 'Cau1.docx',
      rubricId: 'r1',
      teacherId: 't1',
    });
  });

  it('để lỗi TẠM THỜI thoát ra để BullMQ retry', async () => {
    // Bắt và log ở đây là cách im lặng biến một bài chưa chấm thành một
    // bài "đã xong".
    gradeOneById.mockRejectedValue(new Error('model timeout'));

    await expect(processor.process(jobFor())).rejects.toThrow('model timeout');
  });

  it('rate limit (429) vẫn retry được — nó tự hết', async () => {
    gradeOneById.mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));

    const caught = await processor.process(jobFor()).catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(UnrecoverableError);
  });

  it('5xx vẫn retry được', async () => {
    gradeOneById.mockRejectedValue(Object.assign(new Error('upstream down'), { status: 503 }));

    const caught = await processor.process(jobFor()).catch((error: unknown) => error);

    expect(caught).not.toBeInstanceOf(UnrecoverableError);
  });

  it('400 KHÔNG retry — sai cấu hình thì thử lại vẫn sai', async () => {
    // Đây là ca đắt nhất nếu bỏ sót: deploy nhầm một model id thì 40 bài
    // × 3 lần = 120 lời gọi chắc chắn thất bại, mỗi lần chiếm một slot,
    // trước khi có ai kịp biết.
    gradeOneById.mockRejectedValue(
      Object.assign(new Error('invalid model id'), { status: 400 }),
    );

    await expect(processor.process(jobFor())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('KHÔNG đưa văn bản lỗi của API vào chỗ nào đọc được', async () => {
    // Ca rò rỉ thật sắp tới ở Task 5: `Anthropic.APIError.message` ở một
    // số shape 400 được dựng từ body server trả về — mà body đó là
    // request của CHÍNH TA, tức chứa lại bài làm của sinh viên. Nhánh
    // catch này đứng ở tầng đã cầm dữ liệu đó, nên nó không được in
    // nguyên văn lời của tầng dưới.
    //
    // `failedReason` của `UnrecoverableError` nằm trong Redis và hiện ra
    // ở mọi bảng quản trị hàng đợi — nên nó là đích cần kiểm, không phải
    // chỉ dòng log.
    const essay = 'Thuật toán sắp xếp nổi bọt hoạt động bằng cách MSSV 2011060123';
    gradeOneById.mockRejectedValue(
      Object.assign(new Error(`400 invalid_request_error: {"content":"${essay}"}`), {
        status: 400,
        type: 'invalid_request_error',
      }),
    );

    const caught = (await processor.process(jobFor()).catch((e: unknown) => e)) as Error;

    expect(caught).toBeInstanceOf(UnrecoverableError);
    expect(caught.message).not.toContain(essay);
    // Vẫn phải đủ để đi sửa: hai thứ đó nói được đi đọc chỗ nào.
    expect(caught.message).toContain('400');
    expect(caught.message).toContain('invalid_request_error');
  });

  it('GIỮ NGUYÊN message của lỗi do chính repo này dựng', async () => {
    // Lỗi không có `status` là lỗi của ta — timeout, file quá lớn, lỗi
    // lập trình. Message của chúng đã an toàn và là thứ duy nhất có ích;
    // cắt luôn cả nhóm này sẽ làm mọi sự cố nội bộ trở nên mù.
    gradeOneById.mockRejectedValue(new Error('file vượt 200k ký tự'));

    const caught = (await processor.process(jobFor()).catch((e: unknown) => e)) as Error;

    expect(caught.message).toContain('file vượt 200k ký tự');
  });

  it('404 KHÔNG retry', async () => {
    gradeOneById.mockRejectedValue(Object.assign(new Error('not found'), { status: 404 }));

    await expect(processor.process(jobFor())).rejects.toBeInstanceOf(UnrecoverableError);
  });

  it('408 VẪN retry — timeout là thứ tự hết, khác hẳn 4xx còn lại', async () => {
    gradeOneById.mockRejectedValue(Object.assign(new Error('request timeout'), { status: 408 }));

    const caught = await processor.process(jobFor()).catch((error: unknown) => error);

    expect(caught).not.toBeInstanceOf(UnrecoverableError);
  });

  it('bỏ một lời gọi treo thay vì giữ slot vô hạn', async () => {
    // BullMQ 6 không có `timeout` ở cấp job (đã kiểm base-job-options),
    // nên trần này do processor tự dựng. Không có nó, với concurrency 5
    // thì 5 bài treo là dừng cả hàng đợi và không gì tự gỡ ra.
    jest.useFakeTimers();
    try {
      gradeOneById.mockReturnValue(new Promise(() => {}));

      const running = processor.process(jobFor());
      const assertion = expect(running).rejects.toThrow(/quá 120000ms/);
      await jest.advanceTimersByTimeAsync(GRADE_JOB_TIMEOUT_MS + 1);
      await assertion;
    } finally {
      jest.useRealTimers();
    }
  });

  it('không để timer treo lại sau một bài chấm nhanh', async () => {
    // Quên `clearTimeout` thì mỗi bài giữ event loop sống thêm hai phút,
    // và `app.close()` trong e2e treo vì đúng lý do đó.
    jest.useFakeTimers();
    try {
      await processor.process(jobFor());

      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
