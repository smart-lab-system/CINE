import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { startDraft } from '@/lib/test-case-draft';
import { CaseForm } from './CaseForm';

const rows = startDraft([
  { caseKey: 'ca1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '6', constraintQuote: null, autoDroppedReason: null },
]);

function setup(over: Partial<React.ComponentProps<typeof CaseForm>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <CaseForm
      mode="add"
      initial={{ caseKey: 'ca2', group: 'co_ban', input: '', expectedOutput: '' }}
      rows={rows}
      editingIndex={null}
      knownGroups={['co_ban', 'bien', 'lon']}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onSubmit, onCancel };
}

const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('CaseForm — thêm và sửa một ca (mock-up v2)', () => {
  it('có bốn ô có nhãn; ô bắt buộc đánh dấu *; tên ca được đề xuất sẵn', () => {
    setup();
    expect(screen.getByLabelText(/^Tên ca/)).toHaveValue('ca2');
    expect(screen.getByLabelText(/^Input/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Output mong đợi/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Nhóm/ })).toHaveValue('co_ban');
    expect(screen.getAllByText('*').length).toBeGreaterThanOrEqual(3);
  });

  it('gửi khi còn ô thiếu: KHÔNG gọi onSubmit, hiện lỗi cạnh từng ô và dòng tổng kết, đưa con trỏ về ô lỗi đầu tiên', () => {
    const { onSubmit } = setup({ initial: { caseKey: '', group: '', input: '', expectedOutput: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Còn 3 lỗi');
    const key = screen.getByLabelText(/^Tên ca/);
    expect(key).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(key.getAttribute('aria-describedby')!)).toHaveTextContent('Nhập tên ca');
    expect(screen.getByLabelText(/^Output mong đợi/)).toHaveAttribute('aria-invalid', 'true');
    expect(key).toHaveFocus();
  });

  it('sau lần gửi hỏng, sửa ô nào thì lỗi của ô đó mất ngay (không đợi gửi lại)', () => {
    setup({ initial: { caseKey: 'ca2', group: 'co_ban', input: '', expectedOutput: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));
    expect(screen.getByLabelText(/^Output mong đợi/)).toHaveAttribute('aria-invalid', 'true');

    type(/^Output mong đợi/, '7');

    expect(screen.getByLabelText(/^Output mong đợi/)).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tên ca trùng một ca đang dùng → lỗi cạnh ô; gửi hợp lệ gọi onSubmit với giá trị đã nhập', () => {
    const { onSubmit } = setup();
    type(/^Tên ca/, 'ca1');
    type(/^Output mong đợi/, '7');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Tên ca "ca1" đã có trong gói.')).toBeInTheDocument();

    type(/^Tên ca/, 'ca3');
    type(/^Input/, '1\n7');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm vào bản nháp' }));
    expect(onSubmit).toHaveBeenCalledWith({ caseKey: 'ca3', group: 'co_ban', input: '1\n7', expectedOutput: '7' }, false);
  });

  it('"Thêm và nhập tiếp" gửi với again=true; chỉ có ở chế độ thêm', () => {
    const { onSubmit } = setup();
    type(/^Output mong đợi/, '7');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm và nhập tiếp' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ caseKey: 'ca2' }), true);
  });

  it('chọn nhóm bằng nút gợi ý, hay gõ nhóm mới', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'bien' }));
    expect(screen.getByRole('textbox', { name: /^Nhóm/ })).toHaveValue('bien');
    expect(screen.getByRole('button', { name: 'bien' })).toHaveAttribute('aria-pressed', 'true');
    type(/^Nhóm/, 'moi');
    expect(screen.getByRole('button', { name: 'bien' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('Ctrl+Enter lưu nhanh, Esc huỷ', () => {
    const { onSubmit, onCancel } = setup();
    type(/^Output mong đợi/, '7');

    fireEvent.keyDown(screen.getByLabelText(/^Input/), { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByLabelText(/^Input/), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('chế độ sửa: tiêu đề nêu tên ca, nút là "Lưu ca", ca đang sửa không tự báo trùng với chính nó', () => {
    const { onSubmit } = setup({
      mode: 'edit',
      editingIndex: 0,
      initial: { caseKey: 'ca1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '6' },
    });
    expect(screen.getByRole('heading', { name: 'Sửa ca ca1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm và nhập tiếp' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu ca' }));

    expect(onSubmit).toHaveBeenCalledWith({ caseKey: 'ca1', group: 'co_ban', input: '3\n1 2 3\n', expectedOutput: '6' }, false);
  });

  it('dòng xem trước nêu tên ca, nhóm, số dòng input và output; nút Huỷ gọi onCancel', () => {
    const { onCancel } = setup();
    type(/^Input/, 'a\nb\nc');
    type(/^Output mong đợi/, '9');
    expect(screen.getByText(/Sẽ hiện là/)).toHaveTextContent('ca2');
    expect(screen.getByText(/Sẽ hiện là/)).toHaveTextContent('3 dòng vào');
    expect(screen.getByText(/Sẽ hiện là/)).toHaveTextContent('output 9');

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
