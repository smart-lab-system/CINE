import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import { groupByCourseClass } from '@/lib/submission-attention';
import { SessionTable } from './SessionTable';

const NOW = Date.now();
const HOUR = 3_600_000;

function make(o: Partial<SessionOverviewItem> = {}): SessionOverviewItem {
  return {
    id: 's1', name: 'Giữa kỳ #2', code: 'GK2',
    courseId: 'c1', courseName: 'Nhập môn lập trình', classId: 'k1', className: 'Nhóm 01',
    roomName: 'A3-01', examType: 'GK',
    startTime: new Date(NOW - 4 * HOUR).toISOString(),
    endTime: new Date(NOW - 2 * HOUR).toISOString(),
    status: 'completed',
    semesterId: 'sem-1', semesterName: 'Học kỳ 1 2026-2027',
    requiredDeliverableCount: 2, expectedCount: 22, rosterKnown: true,
    fullySubmittedCount: 22, partialCount: 0,
    attendedNoSubmissionCount: 0, neverAttendedCount: 0, invalidFileCount: 0,
    archivedAt: null, attentionClosedAt: null,
    rubricId: null, rubricVersion: null,
    ...o,
  };
}

const onArchive = vi.fn();
const onClose = vi.fn();
beforeEach(() => { onArchive.mockReset(); onClose.mockReset(); });

function renderTable(items: SessionOverviewItem[]) {
  return render(
    <SessionTable
      groups={groupByCourseClass(items, NOW)}
      now={NOW}
      onArchive={onArchive}
      onCloseAttention={onClose}
    />,
  );
}

describe('SessionTable — cấu trúc', () => {
  it('CẢ TRANG LÀ MỘT <table> — nhóm là dòng gộp cột bên trong', () => {
    const { container } = renderTable([
      make({ id: 'a' }),
      make({ id: 'b', courseId: 'c2', courseName: 'CTDL', classId: 'k2', className: 'N05' }),
    ]);
    // Nếu mỗi nhóm là một <table> riêng thì cột lệch nhau và toàn bộ lợi thế
    // quét mắt biến mất — đó là lý do chọn bảng. Test này khoá điều đó.
    expect(container.querySelectorAll('table')).toHaveLength(1);
  });

  it('tiêu đề nhóm hiện sĩ số, và KHÔNG dòng nào hiện tỉ lệ x/y', () => {
    renderTable([make({ expectedCount: 22 })]);
    expect(screen.getByText(/22 sinh viên/)).toBeInTheDocument();
    expect(screen.queryByText(/\d+\/\d+/)).not.toBeInTheDocument();
  });
});

describe('SessionTable — cột Tình trạng', () => {
  it('phiên đủ bài hiện ✓ Đủ, không để trống', () => {
    renderTable([make()]);
    expect(screen.getByText('✓ Đủ')).toBeInTheDocument();
  });

  it('phiên đang thu bài hiện tên pha, KHÔNG hiện lý do', () => {
    renderTable([make({
      endTime: new Date(NOW - 60_000).toISOString(),
      neverAttendedCount: 5, fullySubmittedCount: 17,
    })]);
    expect(screen.getByText('Đang thu bài')).toBeInTheDocument();
    expect(screen.queryByText(/vắng thi/)).not.toBeInTheDocument();
  });

  it('phiên đã kết thúc hiện đủ mọi lý do theo thứ tự ưu tiên', () => {
    renderTable([make({
      attendedNoSubmissionCount: 3, partialCount: 2, neverAttendedCount: 1,
      fullySubmittedCount: 16,
    })]);
    expect(screen.getByText('3 sinh viên vào phòng nhưng không có bài')).toBeInTheDocument();
    expect(screen.getByText('2 sinh viên nộp thiếu file')).toBeInTheDocument();
    expect(screen.getByText('1 sinh viên vắng thi')).toBeInTheDocument();
  });

  it('phiên đã khép hiện nhãn Đã khép', () => {
    renderTable([make({ attentionClosedAt: '2026-09-01T00:00:00.000Z' })]);
    expect(screen.getByText('Đã khép')).toBeInTheDocument();
  });
});

describe('SessionTable — thao tác', () => {
  // Hai thao tác điều hướng là <a>, hai thao tác đổi trạng thái là <button>.
  // Phân biệt này có chủ đích: điều hướng phải mở được tab mới / chuột phải,
  // còn lưu trữ và khép thì không được là link vì chúng ghi dữ liệu.
  it('bốn nút icon đều có aria-label, đúng vai điều hướng vs. hành động', () => {
    renderTable([make()]);
    expect(screen.getByRole('link', { name: 'Xem chi tiết phiên' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Chấm điểm' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khép phiên' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu trữ phiên' })).toBeInTheDocument();
  });

  it('link điều hướng trỏ đúng chỗ', () => {
    renderTable([make({ id: 'abc' })]);
    expect(screen.getByRole('link', { name: 'Xem chi tiết phiên' }))
      .toHaveAttribute('href', '/teacher/submissions/abc');
    expect(screen.getByRole('link', { name: 'Chấm điểm' }))
      .toHaveAttribute('href', '/teacher/grading?sessionId=abc');
  });

  it('nhãn đảo khi phiên đã ở trạng thái đó', () => {
    renderTable([make({
      archivedAt: '2026-09-01T00:00:00.000Z',
      attentionClosedAt: '2026-09-01T00:00:00.000Z',
    })]);
    expect(screen.getByRole('button', { name: 'Bỏ lưu trữ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mở lại phiên' })).toBeInTheDocument();
  });

  it('bấm Lưu trữ gọi onArchive với on=true', () => {
    renderTable([make({ id: 'abc' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu trữ phiên' }));
    expect(onArchive).toHaveBeenCalledWith('abc', true);
  });

  it('bấm Bỏ lưu trữ gọi onArchive với on=false', () => {
    renderTable([make({ id: 'abc', archivedAt: '2026-09-01T00:00:00.000Z' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lưu trữ' }));
    expect(onArchive).toHaveBeenCalledWith('abc', false);
  });
});
