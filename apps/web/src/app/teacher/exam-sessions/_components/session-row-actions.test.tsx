import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { EDIT_STARTED_MESSAGE } from '@/lib/exam-session-actions';
import { SessionRowActions } from './session-row-actions';

const NOW = new Date(2026, 9, 6, 9, 0).getTime();
const at = (hour: number) => new Date(2026, 9, 6, hour).toISOString();

function item(over: Partial<ExamSessionListItem> = {}): ExamSessionListItem {
  return {
    id: 's1', name: 'Giữa kỳ N01', code: 'ABC123', courseName: 'CTDL&GT', classLabel: 'DHKTPM18A – Nhóm 1',
    semesterId: 's1', academicYear: 2026, term: 1, roomName: 'Phòng máy A1', semesterName: 'HK1 2026-2027',
    examType: 'GK', startTime: at(10), endTime: at(12), status: 'active', ...over,
  };
}
function setup(session: ExamSessionListItem) {
  const onCancel = vi.fn();
  render(<SessionRowActions session={session} now={NOW} onCancel={onCancel} />);
  return onCancel;
}

describe('SessionRowActions', () => {
  it('phiên active chưa bắt đầu: "Sửa" là liên kết tới trang sửa, "Huỷ phiên" gọi onCancel với phiên đó', () => {
    const onCancel = setup(item());
    expect(screen.getByRole('link', { name: 'Sửa phiên Giữa kỳ N01' })).toHaveAttribute('href', '/teacher/exam-sessions/s1/edit');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên Giữa kỳ N01' }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('Review Focus 5: phiên ĐÃ bắt đầu — "Sửa" không còn là liên kết, không bấm được, và nói vì sao; "Huỷ phiên" vẫn bật', () => {
    const onCancel = setup(item({ startTime: at(8), endTime: at(10) }));
    expect(screen.queryByRole('link', { name: /Sửa phiên/ })).not.toBeInTheDocument();
    const edit = screen.getByRole('button', { name: 'Sửa phiên Giữa kỳ N01' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    // Lý do đi theo `aria-describedby` (có mặt cả khi tooltip chưa mở): bàn phím và trình đọc màn hình đọc được lý do.
    expect(edit).toHaveAccessibleDescription(EDIT_STARTED_MESSAGE);
    fireEvent.click(edit);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Huỷ phiên Giữa kỳ N01' })).not.toHaveAttribute('aria-disabled');
  });

  it.each([
    ['collecting', 'Phiên đang thu bài, không sửa được.', 'Phiên đang thu bài, không huỷ được. Hãy Xác nhận kết thúc ở phòng chờ.'],
    ['completed', 'Phiên đã kết thúc, không sửa được.', 'Phiên đã kết thúc, không huỷ được.'],
    ['cancelled', 'Phiên đã huỷ, không sửa được.', 'Phiên này đã được huỷ.'],
  ])('trạng thái %s: cả hai nút bị chặn, mỗi nút kèm lý do riêng, bấm không làm gì', (status, editReason, cancelReason) => {
    const onCancel = setup(item({ status }));
    const edit = screen.getByRole('button', { name: 'Sửa phiên Giữa kỳ N01' });
    const cancel = screen.getByRole('button', { name: 'Huỷ phiên Giữa kỳ N01' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    expect(edit).toHaveAccessibleDescription(editReason);
    expect(cancel).toHaveAccessibleDescription(cancelReason);
    fireEvent.click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('nút bị chặn vẫn nhận focus bàn phím (không dùng `disabled`) để đọc được lý do', () => {
    setup(item({ status: 'completed' }));
    const edit = screen.getByRole('button', { name: 'Sửa phiên Giữa kỳ N01' });
    edit.focus();
    expect(edit).toHaveFocus();
  });
});
