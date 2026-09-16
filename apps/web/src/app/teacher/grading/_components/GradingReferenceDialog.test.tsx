import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { GradingReferenceDialog } from './GradingReferenceDialog';
import type { GradingReadiness } from '@/lib/api/grading';

const setGradingReferenceMock = vi.fn();
const requestAnswerKeyUploadMock = vi.fn();
let materialsResult: { data?: unknown[]; isLoading: boolean } = { data: [], isLoading: false };

// Mock ở tầng HOOK, không ở tầng lib/api — đúng nếp của repo, và nhờ vậy
// không component nào phải dựng một QueryClientProvider riêng trong test.
vi.mock('@/hooks/useExamSession', () => ({
  useExamMaterials: () => materialsResult,
}));

vi.mock('@/hooks/useGrading', () => ({
  useSetGradingReference: () => ({
    mutateAsync: (body: unknown) => setGradingReferenceMock(body),
    isPending: false,
  }),
}));

vi.mock('@/lib/api/grading', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/grading')>()),
  requestAnswerKeyUpload: (...args: unknown[]) => requestAnswerKeyUploadMock(...args),
}));

const base: GradingReadiness = {
  level: 'rubric_only',
  warning: null,
  hasQuestion: false,
  hasModelAnswer: false,
};

function open(readiness: GradingReadiness = base) {
  return render(
    <GradingReferenceDialog
      examSessionId="s1"
      open
      onOpenChange={vi.fn()}
      readiness={readiness}
    />,
  );
}

/**
 * Màn đặt ngữ cảnh chấm — đây là thứ biến lượt phản biện từ code chết thành
 * code chạy, vì nó là đường duy nhất ghi được `grading_reference`.
 */
describe('GradingReferenceDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    materialsResult = {
      data: [
        { id: 'mat-1', fileName: 'de-thi-cuoi-ky.pdf', fileSize: 120_000, uploadedAt: '' },
        { id: 'mat-2', fileName: 'dataset.csv', fileSize: 4_000, uploadedAt: '' },
      ],
      isLoading: false,
    };
    setGradingReferenceMock.mockResolvedValue(undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
  });

  it('liệt kê tài liệu đã tải lên để chọn ĐÚNG MỘT file làm đề bài', async () => {
    open();
    expect(await screen.findByLabelText('de-thi-cuoi-ky.pdf')).toBeInTheDocument();
    expect(screen.getByLabelText('dataset.csv')).toBeInTheDocument();
  });

  it('KHÔNG tự chọn file nào theo tên — Security rule 9', async () => {
    open();
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');
    // Tên file trông hiển nhiên đến mấy cũng không được đoán: đoán sai một
    // lần là cả lượt chấm đọc nhầm tài liệu mà không ai biết.
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(radios.filter((r) => r.checked && r.value !== '')).toHaveLength(0);
  });

  it('lưu được ghi chú đáp án mà không cần file', async () => {
    open();
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');

    fireEvent.change(screen.getByLabelText(/Ghi chú đáp án/), {
      target: { value: 'Chấp nhận Outbox thay cho Saga.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));

    await waitFor(() =>
      expect(setGradingReferenceMock).toHaveBeenCalledWith({
        modelAnswerNote: 'Chấp nhận Outbox thay cho Saga.',
      }),
    );
  });

  it('CHỈ gửi trường đã đổi — sửa ghi chú không được xoá lựa chọn đề bài', async () => {
    open({ ...base, level: 'with_question', hasQuestion: true });
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');

    fireEvent.change(screen.getByLabelText(/Ghi chú đáp án/), {
      target: { value: 'chỉ sửa ghi chú' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));

    await waitFor(() => expect(setGradingReferenceMock).toHaveBeenCalled());
    // Không gửi questionMaterialId ⇒ server GIỮ NGUYÊN. Gửi cả object mỗi
    // lần sẽ gỡ mất đề bài, và giảng viên chỉ phát hiện ở lượt chấm sau.
    expect(setGradingReferenceMock.mock.calls[0][0]).not.toHaveProperty('questionMaterialId');
  });

  it('tải file đáp án lên kho TRƯỚC, rồi mới lưu tham chiếu', async () => {
    const order: string[] = [];
    requestAnswerKeyUploadMock.mockImplementation(async () => {
      order.push('request-url');
      return {
        storageKey: 'grading-reference/s1/answer-key',
        uploadUrl: 'https://kho/put',
        expiresIn: 900,
      };
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        order.push('put-object');
        return { ok: true } as Response;
      }),
    );
    setGradingReferenceMock.mockImplementation(async () => {
      order.push('save-reference');
    });

    open();
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');

    fireEvent.change(screen.getByLabelText(/File đáp án mẫu/), {
      target: { files: [new File(['x'], 'dap-an.docx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));

    await waitFor(() => expect(order).toEqual(['request-url', 'put-object', 'save-reference']));
  });

  it('tải file thất bại thì KHÔNG lưu tham chiếu', async () => {
    requestAnswerKeyUploadMock.mockResolvedValue({
      storageKey: 'grading-reference/s1/answer-key',
      uploadUrl: 'https://kho/put',
      expiresIn: 900,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response));

    open();
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');

    fireEvent.change(screen.getByLabelText(/File đáp án mẫu/), {
      target: { files: [new File(['x'], 'dap-an.docx')] },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));

    // Lưu tham chiếu trỏ tới một object không tồn tại sẽ cho ra một phiên
    // báo "Mức 3" mà lúc chấm lại tụt về Mức 2 — và chỉ một dòng log biết.
    expect(await screen.findByText(/chưa tải được file đáp án/i)).toBeInTheDocument();
    expect(setGradingReferenceMock).not.toHaveBeenCalled();
  });

  it('nói rõ đáp án mẫu không bao giờ tới màn chấm', async () => {
    open();
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');
    expect(screen.getByText(/không bao giờ hiển thị trên màn chấm/i)).toBeInTheDocument();
  });

  it('chọn "Không dùng đề bài" THẬT SỰ gửi lệnh gỡ', async () => {
    // Bản đầu so `questionId` với một giá trị ban đầu hardcode là NO_QUESTION,
    // nên bấm vào đây trùng giá trị khởi tạo, không được coi là thay đổi, và
    // không gửi gì. Một nút bấm được mà không có gì xảy ra.
    open({ ...base, level: 'with_question', hasQuestion: true });
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');

    fireEvent.click(screen.getByLabelText('Không dùng đề bài'));
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));

    await waitFor(() =>
      expect(setGradingReferenceMock).toHaveBeenCalledWith({ questionMaterialId: null }),
    );
  });

  it('chọn "Không dùng đề bài" rồi thì radio đó hiện ra là ĐANG CHỌN', async () => {
    open();
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');

    const none = screen.getByLabelText('Không dùng đề bài') as HTMLInputElement;
    expect(none.checked).toBe(false);

    fireEvent.click(none);
    expect((screen.getByLabelText('Không dùng đề bài') as HTMLInputElement).checked).toBe(true);
  });

  it('không động vào nhóm radio thì KHÔNG gửi questionMaterialId', async () => {
    open({ ...base, level: 'with_question', hasQuestion: true });
    await screen.findByLabelText('de-thi-cuoi-ky.pdf');

    fireEvent.change(screen.getByLabelText(/Ghi chú đáp án/), {
      target: { value: 'chỉ sửa ghi chú' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Lưu/ }));

    await waitFor(() => expect(setGradingReferenceMock).toHaveBeenCalled());
    expect(setGradingReferenceMock.mock.calls[0][0]).not.toHaveProperty('questionMaterialId');
  });
});
