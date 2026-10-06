import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddStudentForm } from './add-student-form';

// Hook THẬT (không mock `useStudentLookup`), chỉ giả lớp gọi mạng: `add-student-form.test.tsx` mock hook nên không chứng minh được rằng form
// khoá đúng trong khoảng hook chờ giảng viên ngừng gõ (review B+G1 I1 đổi hook sang chờ 400 ms trong queryFn).
const lookupStudent = vi.fn();
vi.mock('@/lib/api/students', () => ({ lookupStudent: (...args: unknown[]) => lookupStudent(...args) }));

const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={client}>
      <AddStudentForm onSubmit={onSubmit} submitting={false} error={null} />
    </QueryClientProvider>,
  );
  return { onSubmit };
}
const mssv = () => screen.getByLabelText('MSSV');
const name = () => screen.getByLabelText('Họ và tên');
const add = () => screen.getByRole('button', { name: 'Thêm' });
const named = async (value: string) => ({ mssv: value, fullName: `Tên của ${value}` });

describe('AddStudentForm với useStudentLookup thật', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    lookupStudent.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it('trong lúc chờ ngừng gõ: ô tên khoá, nút Thêm tắt, CHƯA gọi server; tra xong thì tên đã lưu được điền và khoá', async () => {
    lookupStudent.mockImplementation(named);
    setup();

    fireEvent.change(mssv(), { target: { value: 'SV20120001' } });
    await tick(100);
    expect(name()).toBeDisabled();
    expect(add()).toBeDisabled();
    expect(screen.getByText(/đang tra tên/i)).toBeInTheDocument();
    expect(lookupStudent).not.toHaveBeenCalled();

    await tick(600);
    expect(lookupStudent).toHaveBeenCalledTimes(1);
    expect(name()).toHaveValue('Tên của SV20120001');
    expect(name()).toBeDisabled();
    expect(add()).toBeEnabled();
  });

  it('gõ từng ký tự: chỉ MỘT lần tra, và tên của MSSV trước KHÔNG nằm lại trong ô khi sang MSSV khác', async () => {
    lookupStudent.mockImplementation(named);
    setup();

    fireEvent.change(mssv(), { target: { value: 'SV20120001' } });
    await tick(700);
    expect(name()).toHaveValue('Tên của SV20120001');

    for (const typed of ['SV2012000', 'SV20120002']) {
      fireEvent.change(mssv(), { target: { value: typed } });
      await tick(80);
    }
    // Giữa chừng: MSSV mới chưa tra xong — ô tên không được mang tên của MSSV trước.
    expect(name()).not.toHaveValue('Tên của SV20120001');
    expect(name()).toBeDisabled();

    await tick(700);
    expect(name()).toHaveValue('Tên của SV20120002');
    expect(lookupStudent).toHaveBeenCalledTimes(2); // SV20120001 và SV20120002 — không có tiền tố nào
  });
});
