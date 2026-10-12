import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { toast } from 'sonner';
import { CopyFromRubric } from './CopyFromRubric';
import { criterion, mutation, overview } from './fixtures';

const h = vi.hoisted(() => ({ copy: undefined as unknown }));
vi.mock('@/hooks/useRubricErrors', () => ({ useCopyErrors: () => h.copy }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const target = overview({ rubricName: 'Đích', criteria: [criterion({ key: 'a', errorCount: 0 }), criterion({ key: 'b', errorCount: 0 })] });
const sources = [
  overview({ rubricName: 'Nguồn 1', criteria: [criterion({ key: 'a', errorCount: 3 }), criterion({ key: 'b', errorCount: 2 }), criterion({ key: 'z', errorCount: 4 })] }),
  overview({ rubricName: 'Nguồn 2', criteria: [criterion({ key: 'a', errorCount: 1 })] }),
];

beforeEach(() => {
  vi.clearAllMocks();
  h.copy = mutation();
});

describe('CopyFromRubric (D3: giảng viên TỰ chọn nguồn)', () => {
  it('không chọn sẵn nguồn nào; nút Sao chép khoá tới khi chọn; chưa có dòng xem trước', () => {
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    expect(screen.getByLabelText('Sao chép lỗi và điểm trừ từ')).toHaveValue('');
    expect(screen.getByRole('button', { name: /Sao chép/ })).toBeDisabled();
    expect(screen.queryByText(/Sẽ sao chép/)).not.toBeInTheDocument();
  });

  it('mỗi nguồn ghi số lỗi; chọn nguồn thì hiện xem trước đúng số và mở nút', () => {
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    const select = screen.getByLabelText('Sao chép lỗi và điểm trừ từ');
    expect(screen.getByRole('option', { name: 'Nguồn 1 — 9 lỗi' })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'Nguồn 1' } });
    expect(screen.getByText(/Sẽ sao chép 5 lỗi vào 2 tiêu chí trùng tên/)).toBeInTheDocument();
    expect(screen.getByText(/4 lỗi thuộc tiêu chí không có ở rubric này sẽ không được sao chép/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sao chép/ })).toBeEnabled();
  });

  it('Sao chép gửi đúng nguồn → đích; thành công báo bằng lời, kể cả số lỗi bị bỏ', () => {
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Sao chép lỗi và điểm trừ từ'), { target: { value: 'Nguồn 1' } });
    fireEvent.click(screen.getByRole('button', { name: /Sao chép/ }));
    const m = (h.copy as ReturnType<typeof mutation>).mutate;
    expect(m).toHaveBeenCalledWith({ from: 'Nguồn 1', to: 'Đích' }, expect.anything());
    m.mock.calls[0][1].onSuccess({ copied: 5, skippedNoCriterion: 4, skippedExisting: 0, recompute: null });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Đã sao chép 5 lỗi từ “Nguồn 1”. Hai rubric từ giờ độc lập'));
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('4 lỗi thuộc tiêu chí không có ở rubric này nên không sao chép'));
  });

  it('lỗi của máy chủ hiện nguyên văn ngay dưới', () => {
    (h.copy as ReturnType<typeof mutation>).isError = true;
    (h.copy as ReturnType<typeof mutation>).error = new Error('Không tìm thấy rubric');
    render(<CopyFromRubric target={target} sources={sources} onAddManually={vi.fn()} />);
    expect(screen.getByText('Không tìm thấy rubric')).toBeInTheDocument();
  });

  it('"Tự thêm từng lỗi" mở ngăn kéo thêm lỗi', () => {
    const onAddManually = vi.fn();
    render(<CopyFromRubric target={target} sources={sources} onAddManually={onAddManually} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tự thêm từng lỗi' }));
    expect(onAddManually).toHaveBeenCalled();
  });

  it('không có nguồn nào: nói rõ và chỉ còn lối tự thêm — không hiện ô chọn', () => {
    render(<CopyFromRubric target={target} sources={[]} onAddManually={vi.fn()} />);
    expect(screen.getByText('Chưa có rubric nào khác có lỗi để sao chép.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Sao chép lỗi và điểm trừ từ')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tự thêm từng lỗi' })).toBeInTheDocument();
  });
});
