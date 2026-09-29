import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RubricDialog } from './RubricDialog';
import type { Rubric } from '@/lib/api/grading';

const mutate = vi.fn();
let saveState: { isPending: boolean; isError: boolean; error: Error | null };
vi.mock('@/hooks/useGrading', () => ({ useSaveRubric: () => ({ mutate, ...saveState }) }));

const rubric: Rubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 8.5,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 2.5 },
  ],
};
const saved: Rubric = { ...rubric, id: 'ru-3', version: 3 };

type Props = React.ComponentProps<typeof RubricDialog>;
const props = (over: Partial<Props> = {}): Props => ({
  open: true, onOpenChange: vi.fn(), rubric, existingNames: ['CTDL'], ruleCounts: {}, onSaved: vi.fn(), ...over,
});
const saveButton = () => screen.getByRole('button', { name: /^Lưu/ });

beforeEach(() => {
  mutate.mockReset();
  saveState = { isPending: false, isError: false, error: null };
});

describe('RubricDialog — editing the ceilings of an existing rubric', () => {
  it('shows the rubric name as text (a name is what makes a rubric the same rubric), rows prefilled', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByRole('heading', { name: /Sửa trần điểm/ })).toHaveTextContent('CTDL');
    expect(screen.queryByLabelText('Tên rubric')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
    expect(screen.getByLabelText('Trần điểm 2')).toHaveValue('2.5');
  });

  it('shows the key of an existing criterion read-only — there is no field to change it', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByText('tinh_dung')).toHaveClass('font-mono');
    expect(screen.queryByLabelText(/Khoá tiêu chí 1/)).not.toBeInTheDocument();
  });

  it('says every save is a NEW version and old results keep the old one', () => {
    render(<RubricDialog {...props()} />);
    expect(screen.getByText(/Mỗi lần lưu tạo một phiên bản mới/)).toBeInTheDocument();
  });

  it('Lưu is disabled until something changes', () => {
    render(<RubricDialog {...props()} />);
    expect(saveButton()).toBeDisabled();
  });

  // Review Focus 1 — the whole reason this dialog is not the old RubricEditor.
  it('rewriting a description sends the ORIGINAL key for that criterion, and for every other one', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Chương trình chạy đúng trên mọi test' } });
    fireEvent.click(saveButton());
    expect(mutate).toHaveBeenCalledWith(
      {
        name: 'CTDL',
        criteria: [
          { description: 'Chương trình chạy đúng trên mọi test', maxPoints: 6, key: 'tinh_dung' },
          { description: 'Trình bày', maxPoints: 2.5, key: 'trinh_bay' },
        ],
      },
      expect.anything(),
    );
  });

  it('accepts a ceiling typed with a comma and sends a number', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Trần điểm 2'), { target: { value: '3,25' } });
    fireEvent.click(saveButton());
    expect(mutate.mock.calls[0][0].criteria[1]).toMatchObject({ maxPoints: 3.25, key: 'trinh_bay' });
  });

  it('a new criterion can carry a typed key, or none (the server then derives it)', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 3'), { target: { value: 'Xử lý ngoại lệ' } });
    fireEvent.change(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'), { target: { value: 'ngoai_le' } });
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 4'), { target: { value: 'Đặt tên biến rõ nghĩa' } });
    fireEvent.click(saveButton());
    const criteria = mutate.mock.calls[0][0].criteria;
    expect(criteria[2]).toEqual({ description: 'Xử lý ngoại lệ', maxPoints: 1, key: 'ngoai_le' });
    expect('key' in criteria[3]).toBe(false);
  });

  it('removing a criterion drops it from the request', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    fireEvent.click(saveButton());
    expect(mutate.mock.calls[0][0].criteria).toHaveLength(1);
  });

  it('warns — without blocking — that rules pointing at a removed criterion will report a mismatch', () => {
    render(<RubricDialog {...props({ ruleCounts: { trinh_bay: 3 } })} />);
    expect(screen.queryByText(/lệch tiêu chí/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    // The key sits in its own mono <span>, so match on the alert's whole text.
    expect(screen.getByRole('alert')).toHaveTextContent(/3 luật đang trỏ vào tiêu chí trinh_bay/);
    expect(saveButton()).toBeEnabled();
  });

  it('cannot remove the last criterion', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Xoá tiêu chí 2' }));
    expect(screen.getByRole('button', { name: 'Xoá tiêu chí 1' })).toBeDisabled();
  });

  it('an invalid ceiling shows its message beside the field, disables Lưu, and sends nothing', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Trần điểm 1'), { target: { value: '0' } });
    fireEvent.blur(screen.getByLabelText('Trần điểm 1'));
    expect(screen.getByText('Trần điểm: từ 0,25 đến 100, tối đa hai chữ số lẻ.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
    fireEvent.click(saveButton());
    expect(mutate).not.toHaveBeenCalled();
  });

  it('a duplicate typed key is caught before it reaches the server', () => {
    render(<RubricDialog {...props()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Thêm tiêu chí' }));
    fireEvent.change(screen.getByLabelText('Tiêu chí 3'), { target: { value: 'Một tiêu chí mới' } });
    fireEvent.change(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'), { target: { value: 'tinh_dung' } });
    fireEvent.blur(screen.getByLabelText('Khoá tiêu chí 3 (tuỳ chọn)'));
    expect(screen.getByText('Trùng khoá với một tiêu chí khác.')).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('on success: reports the saved version and closes', () => {
    mutate.mockImplementation((_input: unknown, opts: { onSuccess: (r: Rubric) => void }) => opts.onSuccess(saved));
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    render(<RubricDialog {...props({ onSaved, onOpenChange })} />);
    fireEvent.change(screen.getByLabelText('Trần điểm 1'), { target: { value: '7' } });
    fireEvent.click(saveButton());
    expect(onSaved).toHaveBeenCalledWith(saved);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows the server message verbatim when saving fails', () => {
    saveState = { isPending: false, isError: true, error: new Error('Hai tiêu chí cùng khai key "x"') };
    render(<RubricDialog {...props()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Hai tiêu chí cùng khai key "x"');
  });

  it('every opening starts from the rubric as it is NOW, not from what was left half-typed', () => {
    const { rerender } = render(<RubricDialog {...props()} />);
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'dang dở' } });
    rerender(<RubricDialog {...props({ open: false })} />);
    rerender(<RubricDialog {...props({ open: true })} />);
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('Tính đúng');
  });
});

describe('RubricDialog — creating a new rubric', () => {
  const create = (over: Partial<Props> = {}) => props({ rubric: undefined, ...over });

  it('asks for a name and starts with one empty criterion', () => {
    render(<RubricDialog {...create()} />);
    expect(screen.getByRole('heading', { name: 'Rubric mới' })).toBeInTheDocument();
    expect(screen.getByLabelText('Tên rubric')).toHaveValue('');
    expect(screen.getByLabelText('Tiêu chí 1')).toHaveValue('');
    expect(saveButton()).toBeDisabled();
  });

  it('refuses a name that already exists: it would silently make a new version and re-derive every key', () => {
    render(<RubricDialog {...create()} />);
    fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'CTDL' } });
    fireEvent.blur(screen.getByLabelText('Tên rubric'));
    expect(screen.getByText(/Đã có rubric tên này/)).toBeInTheDocument();
    expect(saveButton()).toBeDisabled();
  });

  it('sends the name and criteria without keys', () => {
    render(<RubricDialog {...create()} />);
    fireEvent.change(screen.getByLabelText('Tên rubric'), { target: { value: 'Giữa kỳ Toán rời rạc' } });
    fireEvent.change(screen.getByLabelText('Tiêu chí 1'), { target: { value: 'Chứng minh đúng' } });
    fireEvent.change(screen.getByLabelText('Trần điểm 1'), { target: { value: '5' } });
    fireEvent.click(saveButton());
    expect(mutate).toHaveBeenCalledWith(
      { name: 'Giữa kỳ Toán rời rạc', criteria: [{ description: 'Chứng minh đúng', maxPoints: 5 }] },
      expect.anything(),
    );
  });
});
