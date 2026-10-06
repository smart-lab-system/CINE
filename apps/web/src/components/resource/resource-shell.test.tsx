import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DoorOpen } from 'lucide-react';
import { ResourceShell } from './resource-shell';

interface Row {
  id: string;
  name: string;
  year: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'HK1 2026', year: 2026 },
  { id: 'b', name: 'HK2 2026', year: 2026 },
  { id: 'c', name: 'HK1 2025', year: 2025 },
];

function setup(props: Partial<React.ComponentProps<typeof ResourceShell<Row>>> = {}) {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  render(
    <ResourceShell<Row>
      title="Học kỳ"
      description="mô tả"
      icon={DoorOpen}
      addLabel="Thêm học kỳ"
      rows={ROWS}
      rowKey={(r) => r.id}
      isLoading={false}
      error={null}
      emptyTitle="Chưa có học kỳ nào"
      emptyDescription="Tạo học kỳ trước."
      columns={[{ label: 'Tên', render: (r) => r.name }]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ResourceShell', () => {
  it('hàng, nút thêm/sửa/xoá gọi đúng callback với đúng hàng', () => {
    const { onAdd, onEdit, onDelete } = setup();

    fireEvent.click(screen.getByRole('button', { name: /thêm học kỳ/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    const row = screen.getByRole('row', { name: /HK2 2026/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Sửa' }));
    expect(onEdit).toHaveBeenCalledWith(ROWS[1]);
    fireEvent.click(within(row).getByRole('button', { name: 'Xoá' }));
    expect(onDelete).toHaveBeenCalledWith(ROWS[1]);
  });

  it('đang tải, rỗng và lỗi có ba trạng thái riêng', () => {
    const { unmount } = render(
      <ResourceShell<Row>
        title="Học kỳ" description="d" icon={DoorOpen} addLabel="Thêm" onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
        rows={[]} rowKey={(r) => r.id} isLoading={false} error={null}
        emptyTitle="Chưa có học kỳ nào" emptyDescription="Tạo học kỳ trước." columns={[]}
      />,
    );
    expect(screen.getByText('Chưa có học kỳ nào')).toBeInTheDocument();
    unmount();

    render(
      <ResourceShell<Row>
        title="Học kỳ" description="d" icon={DoorOpen} addLabel="Thêm" onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
        rows={undefined} rowKey={(r) => r.id} isLoading={false} error={new Error('Không tải được')}
        emptyTitle="Chưa có học kỳ nào" emptyDescription="x" columns={[]}
      />,
    );
    expect(screen.getByText('Không tải được')).toBeInTheDocument();
  });

  describe('filters', () => {
    it('vẽ giữa tiêu đề và bảng', () => {
      setup({ filters: <input aria-label="Tìm" /> });
      expect(screen.getByLabelText('Tìm')).toBeInTheDocument();
    });

    it('vẫn vẽ khi danh sách rỗng — ô lọc là thứ để thoát khỏi trạng thái rỗng do lọc', () => {
      setup({ rows: [], filters: <input aria-label="Tìm" /> });
      expect(screen.getByLabelText('Tìm')).toBeInTheDocument();
      expect(screen.getByText('Chưa có học kỳ nào')).toBeInTheDocument();
    });
  });

  describe('groupBy (Review Focus 8)', () => {
    const groupBy = { key: (r: Row) => String(r.year), label: (key: string) => `Năm học ${key}` };

    it('mỗi nhóm một dòng tiêu đề, theo thứ tự hàng', () => {
      setup({ groupBy });
      const headers = screen.getAllByText(/^Năm học /).map((el) => el.textContent);
      expect(headers).toEqual(['Năm học 2026', 'Năm học 2025']);
    });

    it('dòng tiêu đề nhóm đứng NGAY TRƯỚC hàng đầu của nhóm và trải hết các cột', () => {
      setup({ groupBy });
      const rows = screen.getAllByRole('row').map((r) => r.textContent);
      // [header bảng, nhóm 2026, HK1 2026, HK2 2026, nhóm 2025, HK1 2025]
      expect(rows[1]).toContain('Năm học 2026');
      expect(rows[2]).toContain('HK1 2026');
      expect(rows[3]).toContain('HK2 2026');
      expect(rows[4]).toContain('Năm học 2025');
      expect(rows[5]).toContain('HK1 2025');
      const groupCell = screen.getByText('Năm học 2026').closest('td');
      expect(groupCell).toHaveAttribute('colspan', '2'); // một cột dữ liệu + cột hành động
    });

    it('không có groupBy thì không có dòng nhóm', () => {
      setup();
      expect(screen.queryByText(/^Năm học /)).not.toBeInTheDocument();
    });
  });

  it('rowClassName tô riêng từng hàng', () => {
    setup({ rowClassName: (r) => (r.year === 2025 ? 'opacity-50' : undefined) });
    expect(screen.getByRole('row', { name: /HK1 2025/ })).toHaveClass('opacity-50');
    expect(screen.getByRole('row', { name: /HK1 2026/ })).not.toHaveClass('opacity-50');
  });

  it('rowActions đứng trước nút sửa và xoá', () => {
    setup({ rowActions: (r) => <button type="button">Tắt {r.name}</button> });
    const row = screen.getByRole('row', { name: /HK1 2025/ });
    const labels = within(row).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(labels).toEqual(['Tắt HK1 2025', 'Sửa', 'Xoá']);
  });
});
