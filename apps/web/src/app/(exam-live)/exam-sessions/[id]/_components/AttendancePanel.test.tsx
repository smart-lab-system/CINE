import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AttendancePanel } from './AttendancePanel';
import type { Attendance, AttendanceStudent } from '@/lib/api/attendance';
import { nearestScrollport, scrollportsAbove } from '@/test-utils/scrollports';

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
      rosterFrozen: true,
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

/**
 * Bố cục: ba nhóm sinh viên từng làm thẻ này cao vô hạn. Một lớp 40 người
 * đẩy bảng "Trạng thái nộp bài" xuống dưới màn hình cả một trang, và hàng
 * badge sĩ số — thứ giảng viên cần nhìn liên tục — trôi mất theo. Ba nhóm
 * giờ nằm trong một vùng cuộn có chiều cao trần; hàng badge và nút chốt sĩ
 * số ở NGOÀI nó.
 *
 * Test ở đây khoá đúng chỗ dễ làm sai khi implement: thứ gì rơi vào bên
 * nào của vùng cuộn. jsdom không tính layout nên không thể kiểm "có cuộn
 * thật" — cái kiểm được, và cũng là cái quyết định đúng/sai, là quan hệ
 * cha–con giữa vùng cuộn và từng phần tử.
 */
describe('AttendancePanel — vùng cuộn danh sách', () => {
  const START = '2026-09-01T08:00:00.000Z';
  const SCROLL_REGION_LABEL = 'Danh sách điểm danh theo nhóm';

  function roster(count: number, prefix: string): AttendanceStudent[] {
    return Array.from({ length: count }, (_, i) => ({
      mssv: `${prefix}${String(i + 1).padStart(3, '0')}`,
      name: `Sinh viên ${prefix}${i + 1}`,
      connected: true,
      joinedLate: false,
      firstSeenAt: START,
      lastEventAt: START,
      afterHeadcount: null,
    }));
  }

  /** Một lớp 40 người: 32 có mặt, 8 chưa vào — đúng cỡ gây ra vấn đề. */
  function renderFullClass() {
    render(
      <AttendancePanel
        attendance={{
          classId: 'class-1',
          className: 'CNTT2',
          rosterSize: 40,
          rosterFrozen: true,
          confirmedAt: null,
          confirmedCount: null,
          present: roster(32, 'A'),
          absent: roster(8, 'B'),
          makeup: [],
          discrepancy: null,
        }}
        isLoading={false}
        error={null}
        canConfirm
        confirming={false}
        confirmError={null}
        onConfirm={() => {}}
        startTime={START}
      />,
    );
    return screen.getByRole('region', { name: SCROLL_REGION_LABEL });
  }

  it('đặt các nhóm sinh viên bên trong một vùng cuộn focus được bằng bàn phím', () => {
    const region = renderFullClass();

    // Cuộn được mà không focus được thì người dùng bàn phím không tới nơi
    // (WCAG 2.1.1) — nên tabIndex là yêu cầu thật, không phải chỗ bám test.
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region.className).toContain('overflow-y-auto');
    expect(region).toContainElement(screen.getByText('Sinh viên A1'));
    expect(region).toContainElement(screen.getByText('Sinh viên B8'));
  });

  it('giữ hàng badge sĩ số NGOÀI vùng cuộn, để nó không bao giờ trôi mất', () => {
    const region = renderFullClass();

    expect(region).not.toContainElement(screen.getByText(/Có mặt 32\/40/));
    expect(region).not.toContainElement(screen.getByText(/Chưa vào 8/));
  });

  it('giữ nút Chốt sĩ số ngoài vùng cuộn', () => {
    const region = renderFullClass();

    expect(region).not.toContainElement(screen.getByRole('button', { name: /Chốt sĩ số/ }));
  });

  it('ghim tiêu đề nhóm để biết đang đọc nhóm nào khi cuộn giữa danh sách', () => {
    const region = renderFullClass();
    const band = screen.getByRole('heading', { name: /Có mặt \(32\)/ })
      .parentElement as HTMLElement;

    expect(band.className).toContain('sticky');
    expect(band.className).toContain('top-0');

    // Đục, cùng lý do như thead của bảng nộp bài: dải trong suốt sẽ để lộ
    // tên sinh viên trượt xuyên qua nó.
    expect(band.className).toMatch(/\bbg-card\b/);
    expect(band.className).not.toMatch(/bg-card\//);

    // Điều KHIẾN nó dính, chứ không phải việc nó có class `sticky`: một
    // phần tử sticky giải offset theo scrollport GẦN NHẤT phía trên nó.
    // Bọc thêm một div cuộn nào giữa hai cái này thì `top-0` sẽ giải theo
    // div đó và tiêu đề âm thầm thôi dính — không có gì khác đổ vỡ để
    // báo hiệu. Đây là hồi quy mà cả bố cục này dựa vào, nên nó phải
    // được assert trực tiếp thay vì suy ra từ sự có mặt của một class.
    expect(nearestScrollport(band)).toBe(region);
  });

  it('không có scrollport nào lồng giữa vùng cuộn và bảng của từng nhóm', () => {
    const region = renderFullClass();

    // Bảng của mỗi nhóm vẫn có scrollport NGANG riêng do primitive Table
    // bọc — đó là đúng, và cũng chính là lý do header cột của nhóm không
    // thể dính (xem ghi chú trong AttendancePanel.tsx). Cái phải đúng là
    // không có scrollport nào KHÁC ngoài nó và vùng cuộn.
    for (const table of screen.getAllByRole('table')) {
      expect(scrollportsAbove(table)).toEqual([table.parentElement, region]);
    }
  });
});
