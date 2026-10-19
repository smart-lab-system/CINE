import { render, screen, fireEvent } from '@testing-library/react';
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

  it('có ô lọc theo hành động', () => {
    withItems([ITEM]);
    render(<AuditLogPage />);
    fireEvent.change(screen.getByLabelText('Hành động'), { target: { value: 'grading.override' } });
    expect(screen.getByLabelText('Hành động')).toHaveValue('grading.override');
  });
});
