import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SeatingEditor } from './seating-editor';
import type { EditorSeat } from './seating-editor-utils';

vi.mock('./seating-canvas', () => ({
  SeatingCanvas: ({
    onSeatDblClick,
    seats,
  }: {
    onSeatDblClick?: (id: string) => void;
    seats: EditorSeat[];
  }) => (
    <div data-testid="seating-canvas">
      <button
        type="button"
        onDoubleClick={() => onSeatDblClick?.(seats[0]?.clientId)}
      >
        seat-dblclick
      </button>
    </div>
  ),
}));

const initialSeats: EditorSeat[] = [
  {
    clientId: 's1',
    seatCode: 'A01',
    workstationId: null,
    rowNo: 1,
    columnNo: 1,
    positionX: 10,
    positionY: 10,
    rotationDegrees: 0,
    isDisabled: false,
    notes: null,
  },
];

describe('SeatingEditor layout', () => {
  it('keeps edit actions in a dedicated toolbar above the canvas', () => {
    render(
      <SeatingEditor
        canvasWidth={800}
        canvasHeight={600}
        initialSeats={initialSeats}
        workstations={[]}
        onSave={vi.fn()}
      />,
    );

    const toolbar = screen.getByRole('region', {
      name: /công cụ chỉnh sửa sơ đồ/i,
    });
    const canvas = screen.getByTestId('seating-canvas');

    expect(toolbar).toBeInTheDocument();
    expect(canvas).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      toolbar.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /thêm ghế/i }),
    ).toBeInTheDocument();
  });

  it('hides the editor toolbar in view mode', () => {
    render(
      <SeatingEditor
        canvasWidth={800}
        canvasHeight={600}
        initialSeats={initialSeats}
        workstations={[]}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /xem sơ đồ/i }));

    expect(
      screen.queryByRole('region', { name: /công cụ chỉnh sửa sơ đồ/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /thêm ghế/i })).not.toBeInTheDocument();
    expect(screen.getByTestId('seating-canvas')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /chỉnh sửa sơ đồ/i }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /chỉnh sửa sơ đồ/i }));
    expect(
      screen.getByRole('region', { name: /công cụ chỉnh sửa sơ đồ/i }),
    ).toBeInTheDocument();
  });

  it('opens seat properties in a dialog on double-click instead of a side panel', () => {
    render(
      <SeatingEditor
        canvasWidth={800}
        canvasHeight={600}
        initialSeats={initialSeats}
        workstations={[]}
        onSave={vi.fn()}
      />,
    );

    expect(
      screen.queryByRole('region', { name: /thuộc tính ghế/i }),
    ).not.toBeInTheDocument();

    fireEvent.doubleClick(screen.getByRole('button', { name: /seat-dblclick/i }));

    const dialog = screen.getByRole('dialog', { name: /thuộc tính ghế/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText(/mã ghế/i)).toHaveValue('A01');

    fireEvent.click(screen.getByRole('button', { name: /^đóng$/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a read-only properties dialog from view mode', () => {
    render(
      <SeatingEditor
        canvasWidth={800}
        canvasHeight={600}
        initialSeats={initialSeats}
        workstations={[]}
        onSave={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /xem sơ đồ/i }));
    fireEvent.doubleClick(screen.getByRole('button', { name: /seat-dblclick/i }));

    expect(screen.getByRole('dialog', { name: /thuộc tính ghế/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/mã ghế/i)).toBeDisabled();
  });
});
