import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AttendancePanel } from './AttendancePanel';
import type { Attendance, AttendanceStudent } from '@/lib/api/attendance';

// QA-reported gap: "sinh viên ghi chú vào muộn nhưng không nói vào lúc
// mấy giờ, trễ mấy giờ" — the badge used to just say "Vào muộn", with
// nothing derived from firstSeenAt/startTime even though both were
// already flowing to this page. No dedicated test file existed for this
// component before (only exercised indirectly through the parent page's
// test) — it takes no data-fetching dependency of its own, so it renders
// directly here.
describe('AttendancePanel — late-join detail', () => {
  const START_TIME = '2026-09-01T08:00:00.000Z';

  function student(overrides: Partial<AttendanceStudent> = {}): AttendanceStudent {
    return {
      mssv: 'SV001',
      name: 'Nguyễn Văn A',
      connected: true,
      joinedLate: false,
      firstSeenAt: null,
      lastEventAt: null,
      afterHeadcount: null,
      ...overrides,
    };
  }

  function attendance(overrides: Partial<Attendance> = {}): Attendance {
    return {
      classId: 'class-1',
      className: 'Nhóm 01',
      rosterSize: 1,
      confirmedAt: null,
      confirmedCount: null,
      present: [],
      absent: [],
      makeup: [],
      discrepancy: null,
      ...overrides,
    };
  }

  function renderPanel(data: Attendance) {
    render(
      <AttendancePanel
        attendance={data}
        isLoading={false}
        error={null}
        canConfirm={false}
        confirming={false}
        confirmError={null}
        onConfirm={() => {}}
        startTime={START_TIME}
      />,
    );
  }

  it('shows the clock time and how many minutes late, not just "Vào muộn"', () => {
    renderPanel(
      attendance({
        present: [
          student({
            joinedLate: true,
            // 8:15 AM UTC — 15 minutes after an 8:00 AM start. Formatted
            // in vi-VN local time by the component itself; the exact
            // clock string isn't asserted here (that's formatTime's own
            // concern), only that SOME time and the derived duration show.
            firstSeenAt: '2026-09-01T08:15:00.000Z',
          }),
        ],
      }),
    );

    expect(screen.getByText(/Vào muộn lúc .+ \(trễ 15 phút\)/)).toBeInTheDocument();
  });

  it('rounds a sub-minute lateness down to 0, never a negative or fractional number', () => {
    renderPanel(
      attendance({
        present: [
          student({
            joinedLate: true,
            firstSeenAt: '2026-09-01T08:00:20.000Z', // 20s after start
          }),
        ],
      }),
    );

    expect(screen.getByText(/Vào muộn lúc .+ \(trễ 0 phút\)/)).toBeInTheDocument();
  });

  it('falls back to the bare "Vào muộn" label when firstSeenAt is somehow missing', () => {
    renderPanel(
      attendance({
        present: [student({ joinedLate: true, firstSeenAt: null })],
      }),
    );

    expect(screen.getByText('Vào muộn')).toBeInTheDocument();
  });

  it('does not add a late mark at all for a student who joined on time', () => {
    renderPanel(
      attendance({
        present: [student({ joinedLate: false, firstSeenAt: '2026-09-01T08:00:00.000Z' })],
      }),
    );

    expect(screen.queryByText(/Vào muộn/)).not.toBeInTheDocument();
  });
});
