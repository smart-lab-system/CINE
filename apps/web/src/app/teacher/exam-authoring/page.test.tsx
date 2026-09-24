import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import ExamAuthoringPage from './page';

const useGenerateExamMock = vi.fn();
vi.mock('@/hooks/useExamAuthoring', () => ({
  useGenerateExam: () => useGenerateExamMock(),
}));

const attachMock = vi.fn();
const useExamSessionsMock = vi.fn();
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessions: () => useExamSessionsMock(),
}));
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: pushMock }) }));

const downloadExamPaperMock = vi.fn();
const downloadAnswerKeyMock = vi.fn();
vi.mock('@/lib/api/exam-authoring', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/exam-authoring')>('@/lib/api/exam-authoring');
  return {
    ...actual,
    downloadExamPaper: (...a: unknown[]) => downloadExamPaperMock(...a),
    downloadAnswerKey: (...a: unknown[]) => downloadAnswerKeyMock(...a),
    attachExamToSession: (...a: unknown[]) => attachMock(...a),
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

function question(overrides: Record<string, unknown> = {}) {
  return {
    statement: 'Sắp xếp mảng tăng dần',
    points: 5,
    topic: 'sorting',
    requiredComplexity: 'O(n log n)',
    modelAnswer: 'def solve(xs):\n    return sorted(xs)\n',
    testBundle: [],
    resemblesKnownProblem: null,
    ...overrides,
  };
}

/**
 * Giờ bắt đầu là THAM SỐ, không phải hằng số: luật gắn đề đo thời gian chứ
 * không đọc `status` (xem `isAttachable`), nên một phiên "đang diễn ra" mà
 * giờ bắt đầu ở ngày mai là một fixture tự mâu thuẫn — và trước đây nó làm
 * bài test bên dưới xanh vì lý do sai.
 */
function session(
  id: string,
  name: string,
  status: string,
  startsInMs = 86_400_000,
) {
  return {
    id,
    name,
    code: 'ABC123',
    courseName: 'CTDL&GT',
    className: 'Nhóm 01',
    roomName: 'B2.07',
    semesterName: 'HK1',
    examType: 'GK',
    startTime: new Date(Date.now() + startsInMs).toISOString(),
    endTime: new Date(Date.now() + startsInMs + 3_600_000).toISOString(),
    status,
  };
}

const exam = {
  title: 'Giữa kỳ CTDL&GT',
  language: 'python',
  questions: [question(), question({ statement: 'Tìm k', resemblesKnownProblem: 'Kadane' })],
  verification: { status: 'unverified', reason: 'sandbox_unavailable' },
};

let mutate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  mutate = vi.fn();
  useGenerateExamMock.mockReset();
  useGenerateExamMock.mockReturnValue({ mutate, isPending: false });
  downloadExamPaperMock.mockReset();
  downloadAnswerKeyMock.mockReset();
  attachMock.mockReset();
  attachMock.mockResolvedValue(undefined);
  pushMock.mockReset();
  // Sonner: reset để một test kiểm "KHÔNG gọi" không thừa hưởng lượt gọi
  // của test chạy trước nó — lỗ hổng lộ ra ngay khi test `toast.warning`
  // đầu tiên kiểm `not.toHaveBeenCalled()` (chưa test nào của `success`/
  // `error` từng kiểm điều đó, nên lỗ hổng nằm im tới giờ).
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.warning).mockClear();
  useExamSessionsMock.mockReset();
  useExamSessionsMock.mockReturnValue({
    data: {
      items: [
        session('s-draft', 'Cuối kỳ N03', 'draft'),
        session('s-sched', 'Giữa kỳ N01', 'scheduled'),
                // Đã bắt đầu một giờ trước — đó mới là "đang diễn ra".
        session('s-live', 'Kiểm tra tuần 6', 'active', -3_600_000),
      ],
      total: 3,
      semesterNames: [],
    },
  });
});

const DRAFT_PROMPT = 'hai câu về cây nhị phân tìm kiếm, mức giữa kỳ';

/** Đổ sẵn một bộ ba vào màn hình qua đường nháp — nhanh hơn diễn lại cả lượt
 *  sinh. Bốn trường, không chỉ `exam`: xem doc của `ExamDraft`
 *  (`lib/exam-draft.ts`) — thiếu `prompt` là chính bug 2026-09-24. */
function renderWithDraft() {
  window.localStorage.setItem(
    'examcollect:exam-draft',
    JSON.stringify({
      savedAt: Date.now(),
      exam,
      prompt: DRAFT_PROMPT,
      questionCount: 2,
      language: 'python',
    }),
  );
  render(<ExamAuthoringPage />);
}

describe('ExamAuthoringPage', () => {
  it('khôi phục bản nháp đã lưu khi mở lại trang', async () => {
    renderWithDraft();
    expect(await screen.findByDisplayValue('Sắp xếp mảng tăng dần')).toBeInTheDocument();
  });

  it('hiện băng CHƯA KIỂM CHỨNG và KHÔNG có cách nào tắt nó', async () => {
    renderWithDraft();
    const banner = await screen.findByRole('status', { name: /chưa kiểm chứng/i });
    // Không có nút đóng: một cảnh báo tắt được là một cảnh báo sẽ bị tắt, và
    // bên dưới nó là đáp án chưa ai chạy.
    expect(within(banner).queryByRole('button')).toBeNull();
  });

  it('gập một câu thì chip cảnh báo VẪN hiện — gập không giấu được nó', async () => {
    renderWithDraft();
    await screen.findByDisplayValue('Tìm k');
    fireEvent.click(screen.getByRole('button', { name: /gập lại câu 2/i }));

    expect(screen.queryByDisplayValue('Tìm k')).not.toBeVisible();
    expect(screen.getByText(/cần bạn quyết/i)).toBeVisible();
  });

  it('nút sinh lại bị KHOÁ tới khi có ghi chú đổi gì', async () => {
    renderWithDraft();
    await screen.findByDisplayValue('Tìm k');
    fireEvent.click(screen.getByRole('button', { name: /sinh lại riêng câu này/i }));

    const go = screen.getByRole('button', { name: /^sinh lại câu 2$/i });
    expect(go).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/cần đổi gì ở câu 2/i), {
      target: { value: 'đổi sang đếm số lần so sánh' },
    });
    expect(go).toBeEnabled();
  });

  it('sinh lại gửi kèm bài phải tránh VÀ đề của câu đang giữ', async () => {
    renderWithDraft();
    await screen.findByDisplayValue('Tìm k');
    fireEvent.click(screen.getByRole('button', { name: /sinh lại riêng câu này/i }));
    fireEvent.change(screen.getByLabelText(/cần đổi gì ở câu 2/i), {
      target: { value: 'khó hơn' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sinh lại câu 2$/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        questionCount: 1,
        avoid: ['Kadane'],
        refineNote: 'khó hơn',
        existingStatements: ['Sắp xếp mảng tăng dần'],
      }),
      expect.anything(),
    );
  });

  /**
   * Bug thật 2026-09-24: mở trang qua đường nháp (tải lại trang, không phải
   * gõ prompt rồi bấm Sinh đề trong CÙNG một lượt) rồi bấm "Sinh lại riêng
   * câu này" ngay — request gửi `prompt: ""`, bị API từ chối 400 vì
   * `GenerateExamDto.prompt` đòi tối thiểu 10 ký tự. Root cause: nháp trước
   * đây chỉ nhớ `exam`, không nhớ `prompt`. Test này KHÔNG gõ lại prompt —
   * đúng kịch bản gây lỗi — và kiểm `prompt` gửi lên khớp prompt đã lưu
   * trong nháp, không phải chuỗi rỗng.
   */
  it('mở qua đường nháp rồi sinh lại MỘT câu vẫn gửi đúng prompt gốc, không rỗng', async () => {
    renderWithDraft();
    await screen.findByDisplayValue('Tìm k');
    fireEvent.click(screen.getByRole('button', { name: /sinh lại riêng câu này/i }));
    fireEvent.change(screen.getByLabelText(/cần đổi gì ở câu 2/i), {
      target: { value: 'khó hơn' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^sinh lại câu 2$/i }));

    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: DRAFT_PROMPT }),
      expect.anything(),
    );
  });

  it('hai nút xuất file là HAI nút riêng biệt', async () => {
    renderWithDraft();
    await screen.findByDisplayValue('Tìm k');

    fireEvent.click(screen.getByRole('button', { name: /xuất đề/i }));
    expect(downloadExamPaperMock).toHaveBeenCalledTimes(1);
    expect(downloadAnswerKeyMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /xuất đáp án/i }));
    expect(downloadAnswerKeyMock).toHaveBeenCalledTimes(1);
  });

  it('sửa đề rồi xuất thì file mang bản ĐÃ SỬA', async () => {
    renderWithDraft();
    const box = await screen.findByLabelText(/đề bài câu 1/i);
    fireEvent.change(box, { target: { value: 'Đề đã sửa tay' } });
    fireEvent.click(screen.getByRole('button', { name: /xuất đề/i }));

    expect(downloadExamPaperMock.mock.calls[0][0].questions[0].statement).toBe('Đề đã sửa tay');
  });

  it('xoá bản nháp thì localStorage sạch và màn hình trở về form', async () => {
    renderWithDraft();
    await screen.findByDisplayValue('Tìm k');
    fireEvent.click(screen.getByRole('button', { name: /xoá bản nháp/i }));

    await waitFor(() => expect(window.localStorage.length).toBe(0));
    expect(screen.queryByDisplayValue('Tìm k')).toBeNull();
  });

  it('nút Sinh đề bị khoá khi prompt quá ngắn', () => {
    render(<ExamAuthoringPage />);
    const go = screen.getByRole('button', { name: /sinh đề/i });
    expect(go).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/yêu cầu của bạn/i), {
      target: { value: 'hai câu về cây nhị phân tìm kiếm' },
    });
    expect(go).toBeEnabled();
  });

  /**
   * `failedCount` chỉ xuất hiện khi API fan-out có worker hỏng (xem
   * `apps/api/.../claude-authoring.provider.ts`). Giảng viên phải BIẾT đề
   * đang thiếu câu — im lặng bớt câu là cách một đề 10 câu phát ra chỉ còn
   * 8 mà không ai để ý tới lúc in.
   */
  it('sinh đề mà thiếu vài câu thì báo rõ số câu lỗi, không im lặng bớt câu', () => {
    render(<ExamAuthoringPage />);
    fireEvent.change(screen.getByLabelText(/yêu cầu của bạn/i), {
      target: { value: 'ba câu về cây nhị phân tìm kiếm' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sinh đề/i }));

    const onSuccess = mutate.mock.calls[0][1].onSuccess as (r: unknown) => void;
    onSuccess({ ...exam, questions: [question()], failedCount: 2 });

    expect(toast.warning).toHaveBeenCalledTimes(1);
    expect((toast.warning as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/2/);
  });

  it('sinh đủ đề thì KHÔNG hiện cảnh báo thiếu câu', () => {
    render(<ExamAuthoringPage />);
    fireEvent.change(screen.getByLabelText(/yêu cầu của bạn/i), {
      target: { value: 'ba câu về cây nhị phân tìm kiếm' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sinh đề/i }));

    const onSuccess = mutate.mock.calls[0][1].onSuccess as (r: unknown) => void;
    onSuccess(exam);

    expect(toast.warning).not.toHaveBeenCalled();
  });
});

describe('ExamAuthoringPage — gắn vào phiên thi', () => {
  async function openPicker() {
    window.localStorage.setItem(
      'examcollect:exam-draft',
      JSON.stringify({
        savedAt: Date.now(),
        exam,
        prompt: DRAFT_PROMPT,
        questionCount: 2,
        language: 'python',
      }),
    );
    render(<ExamAuthoringPage />);
    await screen.findByDisplayValue('Tìm k');
    fireEvent.click(screen.getByRole('button', { name: /gắn vào phiên thi/i }));
  }

  it('phiên ĐANG DIỄN RA hiện nhưng KHÔNG chọn được, kèm lý do', async () => {
    await openPicker();

    expect(screen.getByRole('radio', { name: /nháp/i })).toBeEnabled();
    expect(screen.getByRole('radio', { name: /đã lên lịch/i })).toBeEnabled();

    const live = screen.getByRole('radio', { name: /đang diễn ra/i });
    expect(live).toBeDisabled();
    // Vẫn HIỆN, kèm lý do: ẩn hẳn thì giảng viên tưởng hệ thống quên phiên
    // của họ rồi đi tìm ở chỗ khác.
    expect(screen.getByText(/đã phát tài liệu cho sinh viên/i)).toBeInTheDocument();
  });

  it('chưa chọn phiên thì nút Tiếp tục bị khoá', async () => {
    await openPicker();
    expect(screen.getByRole('button', { name: /tiếp tục/i })).toBeDisabled();
  });

  it('bộ ba unverified thì phải qua bước cảnh báo trước khi gắn', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('radio', { name: /đã lên lịch/i }));
    fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));

    expect(await screen.findByText(/chưa từng được chạy/i)).toBeInTheDocument();
    expect(attachMock).not.toHaveBeenCalled();
  });

  it('xác nhận xong thì gắn và đi tới phòng chờ', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('radio', { name: /đã lên lịch/i }));
    fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));
    fireEvent.click(await screen.findByRole('button', { name: /vẫn gắn/i }));

    await waitFor(() => expect(attachMock).toHaveBeenCalledWith('s-sched', exam));
    // Việc gắn chỉ coi là xong khi giảng viên kiểm lại ở phòng chờ.
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/exam-sessions/s-sched'));
  });

  it('bấm Huỷ ở bước cảnh báo thì quay về chọn phiên, KHÔNG gắn gì', async () => {
    await openPicker();
    fireEvent.click(screen.getByRole('radio', { name: /đã lên lịch/i }));
    fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^huỷ$/i }));

    expect(await screen.findByRole('radio', { name: /đã lên lịch/i })).toBeInTheDocument();
    expect(attachMock).not.toHaveBeenCalled();
  });
});
