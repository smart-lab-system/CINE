import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import AuditLogPage from './page';

const state = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('@/hooks/useAuditLog', () => ({ useAuditLog: () => state.value }));

const ITEM = {
  id: '1',
  occurredAt: '2026-10-18T08:00:00.000Z',
  actorType: 'user',
  actorName: 'Admin A',
  action: 'grading.override',
  targetType: 'error_rule',
  targetId: '9a445e90-f306-4751-a3b7-5936cb531518',
  changedFields: ['deduction', 'note'],
};

function withItems(items: unknown[], extra: Record<string, unknown> = {}) {
  state.value = {
    data: { pages: [{ items, nextBefore: extra.nextBefore ?? null }] },
    isLoading: false,
    isError: false,
    hasNextPage: Boolean(extra.hasNextPage),
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  };
}

describe('AuditLogPage', () => {
  it('hiện người làm, hành động, đối tượng và TÊN các trường đã đổi', () => {
    withItems([ITEM]);
    render(<AuditLogPage />);
    expect(screen.getByText('Admin A')).toBeInTheDocument();
    expect(screen.getByText('grading.override')).toBeInTheDocument();
    expect(screen.getByText('deduction')).toBeInTheDocument();
    expect(screen.getByText('note')).toBeInTheDocument();
    expect(screen.getByText(/giá trị cũ và mới không hiện ở đây/i)).toBeInTheDocument();
  });

  it('thao tác do hệ thống làm không có tên người', () => {
    withItems([{ ...ITEM, id: '2', actorType: 'system', actorName: null }]);
    render(<AuditLogPage />);
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
  });

  it('còn trang sau thì có nút Tải thêm; hết thì không có', () => {
    withItems([ITEM], { hasNextPage: true, nextBefore: '2026-10-18T08:00:00.000Z' });
    const { unmount } = render(<AuditLogPage />);
    expect(screen.getByRole('button', { name: 'Tải thêm' })).toBeInTheDocument();
    unmount();
    withItems([ITEM]);
    render(<AuditLogPage />);
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).not.toBeInTheDocument();
  });

  it('không có thao tác nào khớp → thông báo trống', () => {
    withItems([]);
    render(<AuditLogPage />);
    expect(screen.getByText('Chưa có thao tác nào khớp bộ lọc.')).toBeInTheDocument();
  });

  it('hành động đã biết hiện nhãn tiếng Việt, mã thô chỉ nằm trong tooltip; trường và đối tượng cũng có nhãn', () => {
    withItems([
      {
        ...ITEM,
        action: 'grading_result.score_edited_after_finalize',
        targetType: 'grading_result',
        changedFields: ['finalScore', 'appliedRule'],
      },
    ]);
    render(<AuditLogPage />);
    const action = within(screen.getByRole('table')).getByText('Sửa điểm sau khi chốt');
    expect(action).toHaveAttribute('title', 'grading_result.score_edited_after_finalize');
    expect(screen.queryByText('grading_result.score_edited_after_finalize')).not.toBeInTheDocument();
    expect(screen.queryByText('grading_result.score_edited_after_finalize', { selector: 'option' })).not.toBeInTheDocument();
    expect(screen.getByText('Điểm chốt')).toBeInTheDocument();
    expect(screen.getByText('Quy tắc áp dụng')).toBeInTheDocument();
    expect(screen.queryByText('finalScore')).not.toBeInTheDocument();
    expect(screen.getByText(/Kết quả chấm/)).toBeInTheDocument();
  });

  it('mã chưa có nhãn giữ nguyên mã thay vì bịa nhãn', () => {
    withItems([{ ...ITEM, action: 'hanh_dong.moi', targetType: 'loai_moi', changedFields: ['truongMoi'] }]);
    render(<AuditLogPage />);
    expect(screen.getByText('hanh_dong.moi')).toBeInTheDocument();
    expect(screen.getByText(/loai_moi/)).toBeInTheDocument();
    expect(screen.getByText('truongMoi')).toBeInTheDocument();
  });

  it('ô lọc hành động là danh sách nhãn tiếng Việt và gửi đúng mã khi chọn', () => {
    withItems([ITEM]);
    render(<AuditLogPage />);
    const select = screen.getByLabelText('Hành động');
    expect(screen.getByRole('option', { name: 'Tất cả hành động' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sửa điểm sau khi chốt' })).toHaveValue('grading_result.score_edited_after_finalize');
    fireEvent.change(select, { target: { value: 'exam_session.reassign_teacher' } });
    expect(select).toHaveValue('exam_session.reassign_teacher');
  });
});
