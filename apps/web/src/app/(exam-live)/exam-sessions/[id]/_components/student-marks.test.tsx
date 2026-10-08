import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { AttendanceStudent } from '@/lib/api/attendance';
import { StudentMarks } from './student-marks';

describe('StudentMarks — late-join detail', () => {
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

  it('shows the clock time and how many minutes late, not just "Vào muộn"', () => {
    render(
      <StudentMarks
        student={student({
          joinedLate: true,
          firstSeenAt: '2026-09-01T08:15:00.000Z',
        })}
        startTime={START_TIME}
      />,
    );

    expect(screen.getByText(/Vào muộn lúc .+ \(trễ 15 phút\)/)).toBeInTheDocument();
  });

  it('rounds a sub-minute lateness down to 0, never a negative or fractional number', () => {
    render(
      <StudentMarks
        student={student({
          joinedLate: true,
          firstSeenAt: '2026-09-01T08:00:20.000Z',
        })}
        startTime={START_TIME}
      />,
    );

    expect(screen.getByText(/Vào muộn lúc .+ \(trễ 0 phút\)/)).toBeInTheDocument();
  });

  it('falls back to the bare "Vào muộn" label when firstSeenAt is somehow missing', () => {
    render(
      <StudentMarks student={student({ joinedLate: true, firstSeenAt: null })} startTime={START_TIME} />,
    );

    expect(screen.getByText('Vào muộn')).toBeInTheDocument();
  });

  it('does not add a late mark at all for a student who joined on time', () => {
    render(
      <StudentMarks
        student={student({ joinedLate: false, firstSeenAt: '2026-09-01T08:00:00.000Z' })}
        startTime={START_TIME}
      />,
    );

    expect(screen.queryByText(/Vào muộn/)).not.toBeInTheDocument();
  });

  it('uses "sau khi xác nhận sĩ số" wording for after-headcount marks', () => {
    const { rerender } = render(
      <StudentMarks
        student={student({ afterHeadcount: 'returned' })}
        startTime={START_TIME}
      />,
    );
    expect(screen.getByText('Kết nối lại sau khi xác nhận sĩ số')).toBeInTheDocument();

    rerender(
      <StudentMarks student={student({ afterHeadcount: 'new' })} startTime={START_TIME} />,
    );
    expect(screen.getByText('Mới vào sau khi xác nhận sĩ số')).toBeInTheDocument();
  });
});
