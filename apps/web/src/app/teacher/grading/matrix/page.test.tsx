import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import MatrixPage from './page';
import { agreed, noAdvocate, rubric, withAdvocate } from './_components/fixtures';

const bulkReviewMock = vi.fn();
let searchParams = new URLSearchParams('sessionId=s1');

const allResults = [withAdvocate, noAdvocate, agreed];

/** Cùng môn, phiên bản MỚI hơn, id tiêu chí khác hẳn. */
const rubricV5 = {
  ...rubric,
  id: 'rub-2',
  version: 5,
  criteria: [
    { id: 'c1-v5', description: 'Mô tả cơ chế bù trừ', maxPoints: 4 },
    { id: 'c2-v5', description: 'Dẫn ví dụ cụ thể', maxPoints: 3 },
  ],
};

vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams }));

// Mock ở tầng HOOK, đúng nếp repo — và phải liệt kê ĐỦ mọi export trang
// import, vì thiếu một cái thì lỗi đọc ra như "component không render".
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => ({ data: allResults, isLoading: false }),
  useRubrics: () => ({ data: [rubric, rubricV5], isLoading: false }),
  useGradingProgress: () => ({ data: { pending: 0, queue: { active: 0 } } }),
  useBulkReview: () => ({ mutateAsync: bulkReviewMock, isPending: false }),
}));

vi.mock('@/hooks/useSubmissionOverview', () => ({
  useSessionOverview: () => ({
    data: [
      {
        id: 's1',
        courseId: 'course-1',
        // Phiên này chấm bằng v3, dù môn đã có v5.
        rubricVersion: 3,
        fullySubmittedCount: 3,
        partialCount: 0,
      },
    ],
    isLoading: false,
  }),
}));

/**
 * `useSearchParams` của Next 15 SUSPEND, nên cần CẢ `<Suspense>` bên trong
 * page lẫn `await act(...)` ở đây. Thiếu một trong hai thì triệu chứng đọc
 * ra như "component không render".
 */
async function page() {
  await act(async () => {
    render(<MatrixPage />);
  });
}

describe('Màn Ma trận điều hành', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bulkReviewMock.mockResolvedValue({ applied: 2, skipped: [], audited: 0 });
    searchParams = new URLSearchParams('sessionId=s1');
  });

  it('áp luật cho ĐÚNG các dòng đang chọn', async () => {
    await page();
    // Nhóm mặc định là "cần đọc kỹ" — chỉ có `withAdvocate` trong đó.
    fireEvent.click(screen.getByLabelText('Chọn tất cả'));
    fireEvent.click(screen.getByRole('button', { name: /Giữ điểm lượt chấm/ }));

    expect(bulkReviewMock).toHaveBeenCalledWith({
      resultIds: ['r1'],
      rule: { kind: 'keep_ai' },
    });
  });

  it('can thiệp tiêu chí áp cho MỌI bài của phiên, không chỉ nhóm đang lọc', async () => {
    await page();
    fireEvent.click(screen.getAllByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })[0]);

    expect(bulkReviewMock.mock.calls[0][0].resultIds).toHaveLength(allResults.length);
  });

  it('can thiệp tiêu chí dùng rubric ĐÃ GHIM của phiên, không dùng bản mới nhất', async () => {
    // Phiên chấm bằng v3; môn đã có v5 với id tiêu chí khác hẳn. Lấy nhầm v5
    // thì server trả 400 — may là ồn ào. Nhưng nếu hai phiên bản TÌNH CỜ có
    // chung một id thì nó áp đúng route, sai tiêu chí, và không ai biết.
    await page();
    fireEvent.click(screen.getAllByRole('button', { name: /Cho điểm tối đa cho cả lớp/ })[0]);

    expect(bulkReviewMock.mock.calls[0][0].rule.criterionId).toBe('c1');
  });

  it('đổi nhóm thì bỏ chọn hết', async () => {
    await page();
    fireEvent.click(screen.getByLabelText('Chọn tất cả'));
    expect(screen.getByRole('button', { name: /Giữ điểm lượt chấm/ })).toBeInTheDocument();

    // Giữ lựa chọn qua một lần đổi nhóm sẽ áp luật cho những bài không còn
    // nhìn thấy trên màn hình.
    fireEvent.click(screen.getByRole('button', { name: /Không lệch/ }));
    expect(screen.queryByRole('button', { name: /Giữ điểm lượt chấm/ })).not.toBeInTheDocument();
  });

  it('chưa chọn phiên thì chỉ đường quay lại', async () => {
    searchParams = new URLSearchParams();
    await page();
    expect(screen.getByText(/Chọn một phiên thi ở màn Điều phối/)).toBeInTheDocument();
  });

  it('giữ panel gom cụm ở dạng chưa có, không vẽ nó như đang chạy', async () => {
    await page();
    expect(screen.getByText(/Gom nhóm bài trả lời giống nhau/)).toBeInTheDocument();
  });
});
