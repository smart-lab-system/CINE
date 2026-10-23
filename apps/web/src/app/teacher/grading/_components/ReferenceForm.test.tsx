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
  render(<ReferenceForm sessionId="s1" readiness={readiness} onDirtyChange={onDirtyChange} hasPinnedBundle={false} {...over} />);
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

  describe('where each document came from (G2 §4.4)', () => {
    const stamp = (iso: string) => new Date(iso).toLocaleString('vi-VN');
    const sources = (over: Record<string, unknown> = {}) => ({
      question: { present: true, kind: 'teacher_upload' as const, fileName: 'de-thi-cuoi-ky.pdf', setAt: '2026-09-29T01:14:00.000Z' },
      modelAnswer: { present: true, kind: 'authoring' as const, fileName: 'dap-an-va-test.docx', setAt: '2026-09-29T01:05:00.000Z', unverified: true },
      ...over,
    });
    const withSources = (s = sources()) => ({ ...readiness, hasQuestion: true, hasModelAnswer: true, sources: s });

    it('no "cần backend" badge is left on this form', () => {
      renderForm({ readiness: withSources() });
      expect(screen.queryByText('cần backend')).not.toBeInTheDocument();
    });

    it('says who supplied the question file, when, and its name', () => {
      renderForm({ readiness: withSources() });
      expect(screen.getByText(`Nguồn: bạn tải lên lúc ${stamp('2026-09-29T01:14:00.000Z')} (de-thi-cuoi-ky.pdf).`)).toBeInTheDocument();
    });

    it('an answer key attached from Soạn đề says so', () => {
      renderForm({ readiness: withSources(), hasPinnedBundle: true });
      expect(screen.getByText(`Nguồn: gắn từ Soạn đề lúc ${stamp('2026-09-29T01:05:00.000Z')} (dap-an-va-test.docx).`)).toBeInTheDocument();
    });

    it('an unverified answer key with no pinned bundle gets the gold band, with the consequence', () => {
      renderForm({ readiness: withSources(), hasPinnedBundle: false });
      expect(screen.getByRole('status')).toHaveTextContent(/chưa từng chạy thử/);
      expect(screen.getByRole('status')).toHaveTextContent(/thước bạn chưa đọc/);
    });

    // G2b A2a: ghim gói không làm thước thành đã kiểm chứng. Phiên cũ đã ghim gói do model viết vẫn phải có cảnh báo.
    it('a pinned bundle does not hide the band while the ruler is still unverified', () => {
      renderForm({ readiness: withSources(), hasPinnedBundle: true });
      expect(screen.getByRole('status')).toHaveTextContent(/chưa từng chạy thử/);
      expect(screen.getByRole('status')).toHaveTextContent(/về giảng viên/);
      expect(screen.getByText(/Nguồn: gắn từ Soạn đề lúc/)).toBeInTheDocument();
    });

    it('a note is not called an upload', () => {
      renderForm({
        readiness: withSources(sources({
          modelAnswer: { present: true, kind: 'teacher_upload' as const, fileName: null, setAt: '2026-09-29T02:00:00.000Z', unverified: false },
        })),
      });
      expect(screen.getByText(`Nguồn: bạn ghi chú lúc ${stamp('2026-09-29T02:00:00.000Z')}.`)).toBeInTheDocument();
    });

    it('an API without `sources` still renders — no source lines, nothing thrown', () => {
      renderForm({ readiness });
      expect(screen.queryByText(/^Nguồn:/)).not.toBeInTheDocument();
    });
  });

  describe('read-only review', () => {
    const stamp = (iso: string) => new Date(iso).toLocaleString('vi-VN');
    const saved = {
      ...readiness,
      hasQuestion: true,
      hasModelAnswer: true,
      modelAnswerNote: 'chấp nhận Outbox',
      sources: {
        question: { present: true, kind: 'teacher_upload' as const, fileName: 'de-thi-cuoi-ky.pdf', setAt: '2026-09-29T01:14:00.000Z' },
        modelAnswer: { present: true, kind: 'authoring' as const, fileName: 'dap-an.docx', setAt: '2026-09-29T01:05:00.000Z', unverified: true },
      },
    };

    it('shows the saved question, answer file, note, and unverified band — with no write controls', () => {
      renderForm({ readiness: saved, readOnly: true });
      expect(screen.getByText('de-thi-cuoi-ky.pdf')).toBeInTheDocument();
      expect(screen.getByText(`Nguồn: bạn tải lên lúc ${stamp('2026-09-29T01:14:00.000Z')} (de-thi-cuoi-ky.pdf).`)).toBeInTheDocument();
      expect(screen.getByText('dap-an.docx')).toBeInTheDocument();
      expect(screen.getByText('chấp nhận Outbox')).toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent(/chưa từng chạy thử/);
      expect(screen.getByRole('status')).toHaveTextContent(/về giảng viên/);
      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('File đáp án mẫu (tuỳ chọn)')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Lưu tài liệu chấm' })).not.toBeInTheDocument();
    });

    it('says when there is no note', () => {
      renderForm({ readiness: { ...saved, modelAnswerNote: null }, readOnly: true });
      expect(screen.getByText('Chưa có ghi chú.')).toBeInTheDocument();
    });

    it('says when the question and the answer were never set', () => {
      renderForm({ readiness, readOnly: true });
      expect(screen.getByText('Chưa chỉ định đề bài.')).toBeInTheDocument();
      expect(screen.getByText('Chưa có đáp án mẫu.')).toBeInTheDocument();
      expect(screen.getByText('Chưa có ghi chú.')).toBeInTheDocument();
    });
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
