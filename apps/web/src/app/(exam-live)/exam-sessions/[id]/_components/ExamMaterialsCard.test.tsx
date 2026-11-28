import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mutateUpload = vi.fn();
const parseCourseExamDocx = vi.fn();

vi.mock('@/hooks/useExamSession', () => ({
  useExamMaterials: () => ({ data: [], isLoading: false, isError: false }),
  useUploadExamMaterial: () => ({
    mutate: mutateUpload,
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  useDeleteExamMaterial: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock('@/lib/api/exam-bank', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/exam-bank')>(
    '@/lib/api/exam-bank',
  );
  return {
    ...actual,
    parseCourseExamDocx: (...args: unknown[]) => parseCourseExamDocx(...args),
  };
});

vi.mock('@/hooks/useExamBank', () => ({
  useExamBankCourses: () => ({
    data: [{ id: 'course-1', code: 'CT101', name: 'Lập trình' }],
    isLoading: false,
  }),
  useExamBankMutations: () => ({
    create: { mutateAsync: vi.fn(), isPending: false },
    update: { mutateAsync: vi.fn() },
    remove: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('./UploadExamPreviewDialog', () => ({
  UploadExamPreviewDialog: ({
    open,
    draft,
  }: {
    open: boolean;
    draft: { examType: string } | null;
  }) =>
    open && draft ? (
      <div role="dialog" aria-label="Xem trước đề mới">
        Preview {draft.examType}
      </div>
    ) : null,
}));

import { ExamMaterialsCard } from './ExamMaterialsCard';

describe('ExamMaterialsCard - menu tải file', () => {
  beforeEach(() => {
    mutateUpload.mockReset();
    parseCourseExamDocx.mockReset();
  });

  it('nút Tải file là menu; có input đề Word và tài liệu', () => {
    render(
      <ExamMaterialsCard
        examSessionId="s1"
        releaseAt="01/01/2026 08:00"
        canEdit
        courseId="course-1"
      />,
    );
    expect(screen.getByRole('button', { name: /Tải file/i })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );
    expect(
      document.querySelector('input[type="file"][accept*="docx"]'),
    ).toBeTruthy();
    expect(document.querySelector('input[type="file"]:not([accept])')).toBeTruthy();
  });

  it('không courseId → chọn Word không gọi parse', async () => {
    render(
      <ExamMaterialsCard
        examSessionId="s1"
        releaseAt="01/01/2026 08:00"
        canEdit
      />,
    );
    const input = document.querySelector(
      'input[type="file"][accept*="docx"]',
    ) as HTMLInputElement;
    const file = new File(['docx'], 'de.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(parseCourseExamDocx).not.toHaveBeenCalled();
    });
  });

  it('Tải tài liệu → gọi upload', async () => {
    render(
      <ExamMaterialsCard
        examSessionId="s1"
        releaseAt="01/01/2026 08:00"
        canEdit
        courseId="course-1"
      />,
    );

    const input = document.querySelector(
      'input[type="file"]:not([accept])',
    ) as HTMLInputElement;
    const file = new File(['x'], 'data.csv', { type: 'text/csv' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(mutateUpload).toHaveBeenCalledWith(file, expect.anything());
    });
  });

  it('Tải đề mới → parse rồi mở preview', async () => {
    parseCourseExamDocx.mockResolvedValue({
      examType: 'GK',
      language: 'cpp',
      description: null,
      totalPoints: 10,
      questions: [{ statement: 'Câu 1', points: 10 }],
      warnings: [],
    });

    render(
      <ExamMaterialsCard
        examSessionId="s1"
        releaseAt="01/01/2026 08:00"
        canEdit
        courseId="course-1"
      />,
    );

    const input = document.querySelector(
      'input[type="file"][accept*="docx"]',
    ) as HTMLInputElement;
    const file = new File(['docx'], 'de.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(parseCourseExamDocx).toHaveBeenCalledWith('course-1', file);
    });
    expect(
      await screen.findByRole('dialog', { name: /Xem trước đề mới/i }),
    ).toBeInTheDocument();
    expect(screen.getByText('Preview GK')).toBeInTheDocument();
  });
});
