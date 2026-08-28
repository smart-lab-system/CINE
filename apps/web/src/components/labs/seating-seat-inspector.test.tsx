import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SeatingSeatInspector } from './seating-seat-inspector';
import type { EditorSeat } from './seating-editor-utils';

const seat: EditorSeat = {
  clientId: 'c1',
  seatCode: 'A01',
  workstationId: null,
  rowNo: 1,
  columnNo: 1,
  positionX: 40,
  positionY: 80,
  rotationDegrees: 15,
  isDisabled: false,
  notes: null,
};

describe('SeatingSeatInspector', () => {
  it('edits a single selected seat in the properties dialog', () => {
    const onUpdateSeat = vi.fn();
    render(
      <SeatingSeatInspector
        open
        selected={seat}
        workstations={[]}
        onClose={vi.fn()}
        onUpdateSeat={onUpdateSeat}
      />,
    );

    expect(screen.getByRole('dialog', { name: /thuộc tính ghế/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/mã ghế/i), {
      target: { value: 'B02' },
    });
    expect(onUpdateSeat).toHaveBeenCalledWith('c1', { seatCode: 'B02' });
    expect(screen.getByText(/vị trí: \(40, 80\)/i)).toBeInTheDocument();
  });

  it('disables fields in read-only view mode', () => {
    render(
      <SeatingSeatInspector
        open
        selected={seat}
        workstations={[]}
        readOnly
        onClose={vi.fn()}
        onUpdateSeat={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/mã ghế/i)).toBeDisabled();
    expect(screen.getByText(/chế độ xem/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(
      <SeatingSeatInspector
        open={false}
        selected={seat}
        workstations={[]}
        onClose={vi.fn()}
        onUpdateSeat={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes from the dialog actions', () => {
    const onClose = vi.fn();
    render(
      <SeatingSeatInspector
        open
        selected={seat}
        workstations={[]}
        onClose={onClose}
        onUpdateSeat={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^đóng$/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows assigned workstation hostname in the properties form', () => {
    render(
      <SeatingSeatInspector
        open
        selected={{ ...seat, workstationId: 'w1' }}
        workstations={[
          {
            id: 'w1',
            assetCode: 'PC-01',
            hostname: 'lab-pc-01',
            type: 'client',
          },
        ]}
        onClose={vi.fn()}
        onUpdateSeat={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/máy trạm/i)).toHaveValue('w1');
    expect(screen.getByRole('option', { name: /lab-pc-01/ })).toBeInTheDocument();
  });
});
