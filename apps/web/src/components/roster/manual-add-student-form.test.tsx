import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManualAddStudentForm } from './manual-add-student-form';

const lookupMock = vi.fn();

vi.mock('@/hooks/useDebouncedValue', () => ({
  useDebouncedValue: (value: unknown) => value,
}));

vi.mock('@/hooks/useMasterData', () => ({
  useNominalClasses: () => ({ data: { items: [] } }),
}));

vi.mock('@/lib/api/master-data', () => ({
  lookupStudentsByMssv: (...args: unknown[]) => lookupMock(...args),
  listStudents: vi.fn(),
  createStudent: vi.fn(),
  MasterDataHttpError: class extends Error {},
}));

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderForm(onAdd = vi.fn()) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ManualAddStudentForm directoryLookup isPending={false} onAdd={onAdd} />
    </QueryClientProvider>,
  );
  return onAdd;
}

describe('ManualAddStudentForm directoryLookup', () => {
  beforeEach(() => {
    lookupMock.mockReset();
  });

  it('chưa đủ 7 số thì không gợi ý và không thêm được', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('MSSV'), { target: { value: '226918' } });
    expect(lookupMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
  });

  it('từ 7 số hiện mssv - họ tên và chọn thì điền tên', async () => {
    lookupMock.mockImplementation(async (q: string) => {
      if (q === '2269186') {
        return {
          items: [
            { mssv: '22691861', fullName: 'Nguyễn Văn An' },
            { mssv: '22691862', fullName: 'Trần Thị Bình' },
          ],
        };
      }
      return { items: [{ mssv: '22691861', fullName: 'Nguyễn Văn An' }] };
    });
    const onAdd = renderForm();

    fireEvent.change(screen.getByLabelText('MSSV'), { target: { value: '2269186' } });

    expect(await screen.findByRole('option', { name: /22691861/ })).toHaveTextContent(
      '22691861 - Nguyễn Văn An',
    );
    expect(screen.getByRole('option', { name: /22691862/ })).toHaveTextContent(
      'Trần Thị Bình',
    );
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();

    fireEvent.click(screen.getByRole('option', { name: /22691861/ }));

    await waitFor(() => {
      expect(screen.getByLabelText('Họ và tên')).toHaveValue('Nguyễn Văn An');
    });
    expect(screen.getByLabelText('MSSV')).toHaveValue('22691861');
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith({ mssv: '22691861', name: 'Nguyễn Văn An' });
    });
  });

  it('MSSV không có trong DB thì không thêm được', async () => {
    lookupMock.mockResolvedValue({ items: [] });
    const onAdd = renderForm();

    fireEvent.change(screen.getByLabelText('MSSV'), { target: { value: '22691869' } });

    expect(
      await screen.findByText(/không có trong danh sách sinh viên/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm' })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
