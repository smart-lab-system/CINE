import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AnswerSourceForm } from './AnswerSourceForm';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  state: { isPending: false, isSuccess: false, isError: false, error: null as Error | null },
}));
vi.mock('@/hooks/useTestBundle', () => ({
  useUploadAnswerSource: () => ({ mutate: h.mutate, ...h.state }),
}));

beforeEach(() => {
  h.mutate.mockReset();
  h.state = { isPending: false, isSuccess: false, isError: false, error: null };
});

const pick = (file: File) => fireEvent.change(screen.getByLabelText(/Mã đáp án/), { target: { files: [file] } });

describe('AnswerSourceForm — tải mã đáp án của giảng viên (G2b-R)', () => {
  it('chỉ nhận .cpp và .py; nút tải chưa bấm được khi chưa chọn file', () => {
    render(<AnswerSourceForm sessionId="s1" />);
    expect(screen.getByLabelText(/Mã đáp án/)).toHaveAttribute('accept', '.cpp,.py');
    expect(screen.getByRole('button', { name: 'Tải mã đáp án lên' })).toBeDisabled();
  });

  it('chọn file rồi bấm: gọi tải đúng file đó một lần', () => {
    render(<AnswerSourceForm sessionId="s1" />);
    const file = new File(['int main() {}'], 'dap-an.cpp');

    pick(file);
    fireEvent.click(screen.getByRole('button', { name: 'Tải mã đáp án lên' }));

    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(h.mutate.mock.calls[0][0]).toBe(file);
  });

  it('đang tải: nút khoá và đổi chữ; thành công: nói rõ bước tiếp theo; hỏng: hiện lỗi nguyên văn', () => {
    h.state = { ...h.state, isPending: true };
    const { rerender } = render(<AnswerSourceForm sessionId="s1" />);
    expect(screen.getByRole('button', { name: /Đang tải/ })).toBeDisabled();

    h.state = { isPending: false, isSuccess: true, isError: false, error: null };
    rerender(<AnswerSourceForm sessionId="s1" />);
    expect(screen.getByRole('status')).toHaveTextContent('Đã tải mã đáp án');
    expect(screen.getByRole('status')).toHaveTextContent('Sinh gói test từ đáp án của bạn');

    h.state = { isPending: false, isSuccess: false, isError: true, error: new Error('Mã đáp án vượt trần 256 KiB') };
    rerender(<AnswerSourceForm sessionId="s1" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mã đáp án vượt trần 256 KiB');
  });

  it('nói rõ mã đi thẳng lên kho và chỉ máy chạy bài đọc nó', () => {
    render(<AnswerSourceForm sessionId="s1" />);
    expect(screen.getByText(/không hiện cho sinh viên/i)).toBeInTheDocument();
  });
});
