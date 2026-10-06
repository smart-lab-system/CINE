import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FormProvider, useForm } from 'react-hook-form';

const h = vi.hoisted(() => ({
  rooms: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  roomsArgs: [] as unknown[],
}));
vi.mock('@/hooks/useRooms', () => ({
  useRooms: (options: unknown) => {
    h.roomsArgs.push(options);
    return h.rooms;
  },
}));

import {
  SessionExamTypeField,
  SessionNameField,
  SessionRoomField,
  SessionSemesterReadout,
  SessionTimeFields,
  type SessionBasicsValues,
} from './session-fields';

const ROOMS = [
  { id: 'r1', name: 'Phòng máy A1', capacity: null, isActive: true },
  { id: 'r2', name: 'Phòng máy B1', capacity: 40, isActive: true },
];

function Harness({ defaults = {}, keep, roomError }: { defaults?: Partial<SessionBasicsValues>; keep?: { id: string; name: string } | null; roomError?: string }) {
  const form = useForm<SessionBasicsValues>({ defaultValues: { name: '', roomId: '', examType: '', startTime: '', endTime: '', ...defaults } });
  useEffect(() => {
    if (roomError) form.setError('roomId', { message: roomError });
  }, [roomError, form]);
  return (
    <FormProvider {...form}>
      <SessionNameField />
      <SessionRoomField keep={keep} />
      <SessionExamTypeField />
      <SessionTimeFields />
      <SessionSemesterReadout text="HK1 2026-2027" />
      <output data-testid="values">{JSON.stringify(form.watch())}</output>
    </FormProvider>
  );
}

const values = () => JSON.parse(screen.getByTestId('values').textContent ?? '{}') as SessionBasicsValues;
const choose = (name: string, option: string) => {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};

describe('session-fields', () => {
  beforeEach(() => {
    h.rooms = { data: ROOMS, isLoading: false, isError: false, refetch: vi.fn() };
    h.roomsArgs.length = 0;
  });

  it('phòng: chỉ hỏi phòng ĐANG HOẠT ĐỘNG, kèm sức chứa khi có; chọn thì ghi roomId', () => {
    render(<Harness />);
    expect(h.roomsArgs.at(-1)).toEqual({ activeOnly: true });
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng máy A1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Phòng máy B1 (40 chỗ)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Phòng máy B1 (40 chỗ)' }));
    expect(values().roomId).toBe('r2');
  });

  it('Review Focus 1: phòng không phải ô gõ chữ', () => {
    render(<Harness />);
    expect(screen.queryByRole('textbox', { name: 'Phòng thi' })).not.toBeInTheDocument();
  });

  it('Review Focus 3: phòng hiện tại đã NGỪNG hoạt động vẫn là một lựa chọn, gắn rõ, và là giá trị đang chọn', () => {
    render(<Harness keep={{ id: 'r9', name: 'Phòng cũ' }} defaults={{ roomId: 'r9' }} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng cũ (đã ngừng hoạt động)' })).toHaveAttribute('data-state', 'checked');
    expect(values().roomId).toBe('r9');
  });

  it('phòng hiện tại còn hoạt động thì KHÔNG bị liệt kê hai lần', () => {
    render(<Harness keep={{ id: 'r1', name: 'Phòng máy A1' }} defaults={{ roomId: 'r1' }} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getAllByRole('option', { name: /Phòng máy A1/ })).toHaveLength(1);
  });

  it('chưa có phòng đang hoạt động → nói rõ; nhưng đang giữ một phòng cũ thì còn lựa chọn nên không nói vậy', () => {
    h.rooms = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    const { unmount } = render(<Harness />);
    expect(screen.getByText(/Chưa có phòng thi nào đang hoạt động nên chưa tạo được phiên thi/)).toBeInTheDocument();
    unmount();
    render(<Harness keep={{ id: 'r9', name: 'Phòng cũ' }} defaults={{ roomId: 'r9' }} />);
    expect(screen.queryByText(/Chưa có phòng thi nào đang hoạt động/)).not.toBeInTheDocument();
  });

  it('không tải được danh sách phòng → báo và có "Thử lại"', () => {
    h.rooms = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách phòng');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(h.rooms.refetch).toHaveBeenCalled();
  });

  it('lỗi của form hiện ngay ở ô phòng', async () => {
    render(<Harness roomError="Vui lòng chọn phòng thi" />);
    expect(await screen.findByText('Vui lòng chọn phòng thi')).toBeInTheDocument();
  });

  it('loại kỳ thi: ba lựa chọn theo nhãn tiếng Việt', () => {
    render(<Harness />);
    choose('Loại kỳ thi', 'Giữa kỳ');
    expect(values().examType).toBe('GK');
    fireEvent.click(screen.getByRole('combobox', { name: 'Loại kỳ thi' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Thường kỳ', 'Giữa kỳ', 'Cuối kỳ']);
  });

  it('tên và hai ô giờ ghi vào form', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu'), { target: { value: '2026-10-06T08:00' } });
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: '2026-10-06T10:00' } });
    expect(values()).toMatchObject({ name: 'Giữa kỳ N01', startTime: '2026-10-06T08:00', endTime: '2026-10-06T10:00' });
  });

  it('học kỳ chỉ để xem: ô chỉ đọc, hiện đúng chữ được truyền vào', () => {
    render(<Harness />);
    const semester = screen.getByLabelText('Học kỳ');
    expect(semester).toHaveAttribute('readonly');
    expect(semester).toHaveValue('HK1 2026-2027');
  });
});
