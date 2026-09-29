import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReferenceForm } from './ReferenceForm';

const saveMock = vi.fn();
const requestUploadMock = vi.fn();
let materials: { data?: unknown[]; isLoading: boolean };

vi.mock('@/hooks/useExamSession', () => ({ useExamMaterials: () => materials }));
vi.mock('@/hooks/useGrading', () => ({
  useSetGradingReference: () => ({ mutateAsync: (body: unknown) => saveMock(body), isPending: false }),
}));
vi.mock('@/lib/api/grading', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api/grading')>()),
  requestAnswerKeyUpload: (...args: unknown[]) => requestUploadMock(...args),
}));

const readiness = { level: 'rubric_only' as const, warning: null, hasQuestion: false, hasModelAnswer: false };

beforeEach(() => {
  vi.clearAllMocks();
  materials = {
    data: [
      { id: 'mat-1', fileName: 'de-thi-cuoi-ky.pdf', fileSize: 1, uploadedAt: '' },
      { id: 'mat-2', fileName: 'dataset.csv', fileSize: 1, uploadedAt: '' },
    ],
    isLoading: false,
  };
  saveMock.mockResolvedValue(undefined);
  requestUploadMock.mockResolvedValue({ storageKey: 'grading-reference/s1/answer', uploadUrl: 'https://kho/put', expiresIn: 60 });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
});

const renderForm = (over: Partial<React.ComponentProps<typeof ReferenceForm>> = {}) => {
  const onDirtyChange = vi.fn();
  render(<ReferenceForm sessionId="s1" readiness={readiness} onDirtyChange={onDirtyChange} {...over} />);
  return { onDirtyChange };
};
const saveButton = () => screen.getByRole('button', { name: 'Lưu tài liệu chấm' });

describe('ReferenceForm (spec §3.7 — replaces GradingReferenceDialog, same write rules)', () => {
  it('lists the session materials as radios and preselects NONE — the system never guesses the question by file name (Security rule 9)', () => {
    renderForm();
    const radios = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(screen.getByLabelText('de-thi-cuoi-ky.pdf')).toBeInTheDocument();
    expect(radios.filter((r) => r.checked)).toHaveLength(0);
  });

  it('offers "Không dùng đề bài" only when there is something to choose from', () => {
    renderForm();
    expect(screen.getByLabelText('Không dùng đề bài')).toBeInTheDocument();
  });

  it('with no material at all, says so and points to where to upload it', () => {
    materials = { data: [], isLoading: false };
    renderForm();
    expect(screen.getByText(/Phiên này chưa có tài liệu nào/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở màn quản lý phiên thi' })).toHaveAttribute('href', '/exam-sessions/s1');
    expect(screen.queryByLabelText('Không dùng đề bài')).not.toBeInTheDocument();
  });

  it('says whether a question is already set', () => {
    renderForm({ readiness: { ...readiness, hasQuestion: true } });
    expect(screen.getByText('Đã chỉ định')).toBeInTheDocument();
  });

  it('the "where did this come from" line has no data behind it yet — labelled "cần backend"', () => {
    renderForm();
    expect(screen.getAllByText('cần backend').length).toBeGreaterThan(0);
  });

  it('saving is disabled until something changed', () => {
    renderForm();
    expect(saveButton()).toBeDisabled();
  });

  describe('only what changed is sent', () => {
    it('a note alone', async () => {
      renderForm();
      fireEvent.change(screen.getByLabelText('Ghi chú đáp án'), { target: { value: 'chấp nhận Outbox' } });
      fireEvent.click(saveButton());
      await waitFor(() => expect(saveMock).toHaveBeenCalledWith({ modelAnswerNote: 'chấp nhận Outbox' }));
    });

    it('a chosen question alone', async () => {
      renderForm();
      fireEvent.click(screen.getByLabelText('de-thi-cuoi-ky.pdf'));
      fireEvent.click(saveButton());
      await waitFor(() => expect(saveMock).toHaveBeenCalledWith({ questionMaterialId: 'mat-1' }));
    });

    it('"Không dùng đề bài" sends an explicit null', async () => {
      renderForm();
      fireEvent.click(screen.getByLabelText('Không dùng đề bài'));
      fireEvent.click(saveButton());
      await waitFor(() => expect(saveMock).toHaveBeenCalledWith({ questionMaterialId: null }));
    });
  });

  describe('answer key file', () => {
    const choose = () => fireEvent.change(screen.getByLabelText('File đáp án mẫu (tuỳ chọn)'), {
      target: { files: [new File(['x'], 'dap-an.py')] },
    });

    it('goes to storage FIRST, then the reference is saved with the server-issued key and the file name', async () => {
      renderForm();
      choose();
      fireEvent.click(saveButton());
      await waitFor(() => expect(saveMock).toHaveBeenCalledWith({
        modelAnswerStorageKey: 'grading-reference/s1/answer',
        modelAnswerFilename: 'dap-an.py',
      }));
      expect(vi.mocked(fetch).mock.invocationCallOrder[0]).toBeLessThan(saveMock.mock.invocationCallOrder[0]);
      expect(fetch).toHaveBeenCalledWith('https://kho/put', expect.objectContaining({ method: 'PUT' }));
    });

    it('if the upload fails nothing is saved — a reference pointing at a missing object would fake level 3', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false } as Response));
      renderForm();
      choose();
      fireEvent.click(saveButton());
      expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được file đáp án lên kho lưu trữ');
      expect(saveMock).not.toHaveBeenCalled();
    });

    it('states that the answer key is never shown on the grading screen', () => {
      renderForm();
      expect(screen.getByText(/không bao giờ hiển thị trên màn chấm/)).toBeInTheDocument();
    });
  });

  it('shows the server message verbatim when saving is refused (e.g. the session is locked)', async () => {
    saveMock.mockRejectedValue(new Error('Phiên thi này đã có bài mang điểm hoặc đang chấm — không đổi được tài liệu tham chiếu nữa.'));
    renderForm();
    fireEvent.change(screen.getByLabelText('Ghi chú đáp án'), { target: { value: 'x' } });
    fireEvent.click(saveButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('không đổi được tài liệu tham chiếu nữa');
  });

  describe('dirty state (Review Focus 2: starting to grade locks the documents)', () => {
    it('reports dirty as soon as anything is touched, and clean again after a successful save', async () => {
      const { onDirtyChange } = renderForm();
      expect(onDirtyChange).toHaveBeenLastCalledWith(false);
      fireEvent.change(screen.getByLabelText('Ghi chú đáp án'), { target: { value: 'x' } });
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
      fireEvent.click(saveButton());
      await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
      expect(screen.getByRole('status')).toHaveTextContent('Đã lưu');
    });

    it('a failed save stays dirty', async () => {
      saveMock.mockRejectedValue(new Error('lỗi'));
      const { onDirtyChange } = renderForm();
      fireEvent.change(screen.getByLabelText('Ghi chú đáp án'), { target: { value: 'x' } });
      fireEvent.click(saveButton());
      await screen.findByRole('alert');
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });

    it('a chosen but not yet uploaded file counts as unsaved', () => {
      const { onDirtyChange } = renderForm();
      fireEvent.change(screen.getByLabelText('File đáp án mẫu (tuỳ chọn)'), { target: { files: [new File(['x'], 'a.py')] } });
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });
  });
});
