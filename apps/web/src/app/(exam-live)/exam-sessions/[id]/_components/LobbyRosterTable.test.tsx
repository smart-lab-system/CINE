import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ComponentProps } from 'react';
import type { AttendanceStudent } from '@/lib/api/attendance';
import type { LobbyRosterRow } from '@/lib/lobby-roster';
import { LobbyRosterTable } from './LobbyRosterTable';

const START_TIME = '2026-09-01T08:00:00.000Z';
const deliverables = [{ id: 'd1', requiredFilename: 'bai.zip' }];

function attendanceStudent(
  mssv: string,
  name: string,
  overrides: Partial<AttendanceStudent> = {},
): AttendanceStudent {
  return {
    mssv,
    name,
    connected: true,
    joinedLate: false,
    firstSeenAt: null,
    lastEventAt: null,
    afterHeadcount: null,
    ...overrides,
  };
}

function row(partial: Partial<LobbyRosterRow> & Pick<LobbyRosterRow, 'studentMssv' | 'fullName' | 'roomStatus'>): LobbyRosterRow {
  return {
    attendanceStudent: null,
    rosterSource: null,
    byDeliverable: {},
    ...partial,
  };
}

function renderTable(
  rows: LobbyRosterRow[],
  overrides: Partial<ComponentProps<typeof LobbyRosterTable>> = {},
) {
  const onFilterChange = vi.fn();
  const onConfirm = vi.fn();
  render(
    <LobbyRosterTable
      rows={rows}
      deliverables={deliverables}
      startTime={START_TIME}
      filter="all"
      onFilterChange={onFilterChange}
      canConfirm
      confirming={false}
      confirmError={null}
      onConfirm={onConfirm}
      confirmedAt={null}
      confirmedCount={null}
      noClass={false}
      discrepancy={null}
      {...overrides}
    />,
  );
  return { onFilterChange, onConfirm };
}

describe('LobbyRosterTable — toolbar', () => {
  it('shows Xác nhận sĩ số and calls onConfirm', () => {
    const { onConfirm } = renderTable([]);
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận sĩ số/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows Xác nhận lại sĩ số when already confirmed', () => {
    renderTable([], {
      confirmedAt: '2026-10-08T08:30:00.000Z',
      confirmedCount: 10,
    });
    expect(screen.getByRole('button', { name: /Xác nhận lại sĩ số/ })).toBeInTheDocument();
  });

  it('disables confirm when noClass', () => {
    renderTable([], { noClass: true });
    expect(screen.getByRole('button', { name: /Xác nhận sĩ số/ })).toBeDisabled();
  });

  it('hides Thi bổ sung filter when no makeup rows', () => {
    renderTable([row({ studentMssv: 'SV01', fullName: 'A', roomStatus: 'present' })]);
    expect(screen.queryByRole('button', { name: 'Thi bổ sung' })).not.toBeInTheDocument();
  });

  it('shows Thi bổ sung filter when makeup exists', () => {
    renderTable([
      row({ studentMssv: 'SV01', fullName: 'A', roomStatus: 'present' }),
      row({ studentMssv: 'SV90', fullName: 'B', roomStatus: 'makeup' }),
    ]);
    expect(screen.getByRole('button', { name: 'Thi bổ sung' })).toBeInTheDocument();
  });

  it('filter Chưa nộp keeps absent without files and drops fully submitted', () => {
    const onFilterChange = vi.fn();
    const rows = [
      row({
        studentMssv: 'SV01',
        fullName: 'Đủ bài',
        roomStatus: 'present',
        byDeliverable: { d1: { state: 'collected' } },
      }),
      row({
        studentMssv: 'SV02',
        fullName: 'Vắng',
        roomStatus: 'absent',
      }),
    ];
    render(
      <LobbyRosterTable
        rows={rows}
        deliverables={deliverables}
        startTime={START_TIME}
        filter="not_submitted"
        onFilterChange={onFilterChange}
        canConfirm
        confirming={false}
        confirmError={null}
        onConfirm={() => {}}
        confirmedAt={null}
        confirmedCount={null}
        noClass={false}
        discrepancy={null}
      />,
    );

    expect(screen.getByText('Vắng')).toBeInTheDocument();
    expect(screen.queryByText('Đủ bài')).not.toBeInTheDocument();
  });
});

describe('LobbyRosterTable — merged row', () => {
  it('shows Có mặt, late note, and Chưa nộp on one row', () => {
    renderTable([
      row({
        studentMssv: 'SV001',
        fullName: 'Nguyễn Văn A',
        roomStatus: 'present',
        attendanceStudent: attendanceStudent('SV001', 'Nguyễn Văn A', {
          joinedLate: true,
          firstSeenAt: '2026-09-01T08:15:00.000Z',
        }),
      }),
    ]);

    expect(screen.getByText('Nguyễn Văn A')).toBeInTheDocument();
    const roster = screen.getByRole('region', { name: 'Danh sách sinh viên phòng chờ' });
    expect(within(roster).getByText('Có mặt')).toBeInTheDocument();
    expect(within(roster).getByText(/Vào muộn lúc .+ \(trễ 15 phút\)/)).toBeInTheDocument();
    expect(within(roster).getByText('Chưa nộp')).toBeInTheDocument();
  });
});
