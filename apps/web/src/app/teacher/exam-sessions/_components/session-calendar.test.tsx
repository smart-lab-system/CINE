import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { startOfWeek } from '@/lib/exam-calendar';
import { SessionCalendar } from './session-calendar';

function sessionAt(weekStart: Date, overrides: Partial<ExamSessionListItem> = {}): ExamSessionListItem {
  const start = new Date(weekStart);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  return {
    id: 's1',
    name: 'Giữa kỳ CTDL',
    code: 'ABC123',
    courseName: 'CTDL&GT',
    classLabel: 'DHKTPM18A – Nhóm 1',
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
    roomName: 'Phòng máy A1',
    semesterName: 'HK1 2026-2027',
    examType: 'GK',
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    status: 'scheduled',
    ...overrides,
  };
}

describe('SessionCalendar', () => {
  it('Review Focus 3: thẻ phiên hiện phòng · NHÃN LỚP · loại kỳ thi (không phải "undefined")', () => {
    const weekStart = startOfWeek(new Date());
    render(<SessionCalendar sessions={[sessionAt(weekStart)]} weekStart={weekStart} />);

    const grid = screen.getByRole('table');
    expect(within(grid).getByText(/Phòng máy A1 · DHKTPM18A – Nhóm 1 ·/)).toBeInTheDocument();
    expect(within(grid).queryByText(/undefined/)).not.toBeInTheDocument();
  });
});
