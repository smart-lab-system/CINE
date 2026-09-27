import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ExportCsvButton } from './ExportCsvButton';
import type { GradingResult } from '@/lib/api/grading';

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    homeClassId: 'class-a',
    homeClassName: 'N01',
    status: 'auto_approved',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 8,
    confidence: 0.9,
    flagForReview: false,
    ungradableReason: null,
    criterionResults: [],
    advocateOpinion: null,
    contextUsedQuestion: null,
    contextUsedModelAnswer: null,
    finalScore: null,
    reviewedAt: null,
    reviewedByName: null,
    editedCriteria: null,
    currentScore: 8,
    ...over,
  } as GradingResult;
}

describe('ExportCsvButton', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:mock-url');
  const revokeObjectURL = vi.fn();
  // Gán thẳng vào prototype thay vì `vi.spyOn`: overload spyOn của vitest ở
  // đây chỉ nhận tên THUỘC TÍNH dữ liệu của HTMLAnchorElement, không nhận
  // "click" (một phương thức) — gán trực tiếp né được ràng buộc kiểu đó.
  const anchorClick = vi.fn(function (this: HTMLAnchorElement) {});
  const originalClick = HTMLAnchorElement.prototype.click;

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    anchorClick.mockClear();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    // jsdom không cài đặt điều hướng thật — nút <a download> vẫn gọi click()
    // được, chỉ cần chặn log "Not implemented: navigation" làm ồn output.
    HTMLAnchorElement.prototype.click = anchorClick;
  });

  afterEach(() => {
    HTMLAnchorElement.prototype.click = originalClick;
  });

  it('chưa có bài nào → nút tắt, không tạo file', () => {
    render(<ExportCsvButton sessionName="Phiên A" sessionCode="ABCDEF" results={[]} />);
    expect(screen.getByRole('button', { name: /xuất csv/i })).toBeDisabled();
  });

  it('bấm nút → tạo một Blob CSV và kích hoạt tải xuống đúng một lần', () => {
    render(
      <ExportCsvButton sessionName="Phiên A" sessionCode="ABCDEF" results={[result()]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /xuất csv/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const [blob] = createObjectURL.mock.calls[0];
    expect(blob.type).toContain('text/csv');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('đặt tên file theo tên phiên thi, không phải tên chung chung', () => {
    render(
      <ExportCsvButton sessionName="Kiểm tra giữa kỳ" sessionCode="ABCDEF" results={[result()]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /xuất csv/i }));
    // `this` trong lời gọi click() chính là <a> vừa được set `download`.
    const anchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/^diem-kiem-tra-giua-ky-\d{4}-\d{2}-\d{2}\.csv$/);
  });
});
