import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ExamAuthoringPage from './page';

const useGenerateExamMock = vi.fn();
vi.mock('@/hooks/useExamAuthoring', () => ({
  useGenerateExam: () => useGenerateExamMock(),
}));

const downloadExamPaperMock = vi.fn();
const downloadAnswerKeyMock = vi.fn();
vi.mock('@/lib/api/exam-authoring', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/api/exam-authoring')>('@/lib/api/exam-authoring');
  return {
    ...actual,
    downloadExamPaper: (...a: unknown[]) => downloadExamPaperMock(...a),
    downloadAnswerKey: (...a: unknown[]) => downloadAnswerKeyMock(...a),
  };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
});

/** Đổ sẵn một bộ ba vào màn hình qua đường nháp — nhanh hơn diễn lại cả lượt sinh. */
function renderWithDraft() {
  window.localStorage.setItem(
    'examcollect:exam-draft',
    JSON.stringify({ savedAt: Date.now(), exam }),
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
});
