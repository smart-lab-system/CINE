import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const createMutateAsync = vi.fn();
const uploadMutateAsync = vi.fn();
const fetchCourseExamDocx = vi.fn();
const onClose = vi.fn();
const onAttached = vi.fn();

vi.mock('@/hooks/useExamBank', () => ({
  useExamBankCourses: () => ({
    data: [{ id: 'course-1', code: 'CT101', name: 'Lập trình' }],
    isLoading: false,
  }),
  useExamBankMutations: () => ({
    create: { mutateAsync: createMutateAsync, isPending: false },
    update: { mutateAsync: vi.fn() },
    remove: { mutateAsync: vi.fn() },
  }),
}));

vi.mock('@/hooks/useExamSession', () => ({
  useUploadExamMaterial: () => ({
    mutateAsync: uploadMutateAsync,
    isPending: false,
  }),
}));

vi.mock('@/lib/api/exam-bank', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/exam-bank')>(
    '@/lib/api/exam-bank',
  );
  return {
    ...actual,
    fetchCourseExamDocx: (...args: unknown[]) => fetchCourseExamDocx(...args),
  };
});

vi.mock('@/hooks/useGrading', () => ({
  useRubrics: () => ({ data: [], isLoading: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { UploadExamPreviewDialog } from './UploadExamPreviewDialog';

const DRAFT = {
  examType: 'GK' as const,
  language: 'cpp' as const,
  description: 'Ghi chú',
  totalPoints: 10,
  questions: [{ statement: 'Viết chương trình Hello', points: 10 }],
  warnings: ['Cảnh báo mẫu'],
};

describe('UploadExamPreviewDialog', () => {
  beforeEach(() => {
    createMutateAsync.mockReset();
    uploadMutateAsync.mockReset();
    fetchCourseExamDocx.mockReset();
    onClose.mockReset();
    onAttached.mockReset();
  });

  it('hiện form preview và cảnh báo parse', () => {
    render(
      <UploadExamPreviewDialog
        open
        sessionId="s1"
        courseId="course-1"
        draft={DRAFT}
        warnings={DRAFT.warnings}
        onClose={onClose}
        onAttached={onAttached}
      />,
    );
    expect(screen.getByText('Xem trước đề mới')).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo mẫu')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Viết chương trình Hello')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Tạo đề và gắn vào phiên/i }),
    ).toBeInTheDocument();
  });

  it('xác nhận → create rồi upload material', async () => {
    createMutateAsync.mockResolvedValue({
      id: 'exam-9',
      title: 'Đề thi giữa kỳ - Lập trình',
    });
    fetchCourseExamDocx.mockResolvedValue({
      blob: new Blob(['docx']),
      filename: 'de.docx',
    });
    uploadMutateAsync.mockResolvedValue({});

    render(
      <UploadExamPreviewDialog
        open
        sessionId="s1"
        courseId="course-1"
        draft={DRAFT}
        warnings={[]}
        onClose={onClose}
        onAttached={onAttached}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: /Tạo đề và gắn vào phiên/i }),
    );

    await waitFor(() => {
      expect(createMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: 'course-1',
          examType: 'GK',
          language: 'cpp',
          totalPoints: 10,
        }),
      );
    });
    expect(fetchCourseExamDocx).toHaveBeenCalledWith('exam-9');
    expect(uploadMutateAsync).toHaveBeenCalled();
    expect(onAttached).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});
