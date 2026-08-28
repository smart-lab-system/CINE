import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SeatingEditorToolbar } from './seating-editor-toolbar';
import type { SeatingEditorController } from './use-seating-editor';
import type { EditorSeat } from './seating-editor-utils';

function seat(overrides: Partial<EditorSeat> = {}): EditorSeat {
  return {
    clientId: 'c1',
    seatCode: 'A01',
    workstationId: null,
    rowNo: 1,
    columnNo: 1,
    positionX: 10,
    positionY: 20,
    rotationDegrees: 0,
    isDisabled: false,
    notes: null,
    ...overrides,
  };
}

function mockEditor(
  patch?: Partial<SeatingEditorController>,
): SeatingEditorController {
  const seats = [seat()];
  return {
    state: {
      seats,
      selectedIds: [],
      isEditing: true,
      rowQty: '10',
      rowPrefix: 'A',
      rowStart: '1',
      rowEnd: '10',
      rowError: null,
      ...patch?.state,
    },
    derived: {
      selectedSet: new Set(),
      selectedSeats: [],
      selected: null,
      hasSelection: false,
      deleteLabel: 'Xóa ghế',
      rowPreview: 'A01 → A10 (10 ghế)',
      ...patch?.derived,
    },
    actions: {
      setEditing: vi.fn(),
      commitSelection: vi.fn(),
      updateSeat: vi.fn(),
      addSeat: vi.fn(),
      addRow: vi.fn(),
      addStar: vi.fn(),
      removeSelected: vi.fn(),
      rotateSelected: vi.fn(),
      selectAll: vi.fn(),
      clearSelection: vi.fn(),
      moveSeats: vi.fn(),
      onRowQtyChange: vi.fn(),
      onRowStartChange: vi.fn(),
      onRowEndChange: vi.fn(),
      setRowPrefix: vi.fn(),
      ...patch?.actions,
    },
  };
}

describe('SeatingEditorToolbar', () => {
  it('renders create and multi-select actions in the toolbar', () => {
    render(
      <SeatingEditorToolbar editor={mockEditor()} onSave={vi.fn()} />,
    );

    expect(
      screen.getByRole('region', { name: /công cụ chỉnh sửa sơ đồ/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thêm ghế/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tạo hàng/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tạo cụm sao/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /chọn tất cả/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /bỏ chọn/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xóa ghế/i })).toBeDisabled();
  });

  it('calls create and selection actions from the toolbar', () => {
    const editor = mockEditor({
      state: {
        seats: [seat(), seat({ clientId: 'c2', seatCode: 'A02' })],
        selectedIds: ['c1', 'c2'],
        isEditing: true,
        rowQty: '2',
        rowPrefix: 'A',
        rowStart: '1',
        rowEnd: '2',
        rowError: null,
      },
      derived: {
        selectedSet: new Set(['c1', 'c2']),
        selectedSeats: [seat(), seat({ clientId: 'c2', seatCode: 'A02' })],
        selected: null,
        hasSelection: true,
        deleteLabel: 'Xóa 2 ghế',
        rowPreview: 'A01 → A02 (2 ghế)',
      },
    });
    const onSave = vi.fn();
    render(<SeatingEditorToolbar editor={editor} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /thêm ghế/i }));
    fireEvent.click(screen.getByRole('button', { name: /tạo hàng/i }));
    fireEvent.click(screen.getByRole('button', { name: /tạo cụm sao/i }));
    fireEvent.click(screen.getByRole('button', { name: /chọn tất cả/i }));
    fireEvent.click(screen.getByRole('button', { name: /xóa 2 ghế/i }));
    fireEvent.click(screen.getByRole('button', { name: /lưu sơ đồ/i }));

    expect(editor.actions.addSeat).toHaveBeenCalled();
    expect(editor.actions.addRow).toHaveBeenCalled();
    expect(editor.actions.addStar).toHaveBeenCalled();
    expect(editor.actions.selectAll).toHaveBeenCalled();
    expect(editor.actions.removeSelected).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalled();
  });

  it('switches back to view mode from the toolbar', () => {
    const editor = mockEditor();
    render(<SeatingEditorToolbar editor={editor} onSave={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /xem sơ đồ/i }));
    expect(editor.actions.setEditing).toHaveBeenCalledWith(false);
  });
});
