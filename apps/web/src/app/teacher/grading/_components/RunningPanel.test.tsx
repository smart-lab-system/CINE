import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { RunningPanel } from './RunningPanel';
import type { GradingProgress, GradingResult } from '@/lib/api/grading';

vi.mock('./RegradeButton', () => ({
  RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
    <button type="button" data-scope={JSON.stringify(scope)}>
      {label}
    </button>
  ),
}));

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r', submissionId: 's', studentMssv: '1', studentName: 'A', homeClassId: 'c', homeClassName: 'N01',
  status: 'auto_approved', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: false, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 8, currentScoreSource: 'computation',
  ...over,
});

const progress = (over: Partial<GradingProgress> = {}): GradingProgress => ({
  total: 10, pending: 4, done: 6, byStatus: { ai_grading: 4 }, queue: { waiting: 0, active: 2, failed: 0 }, ...over,
});

const finished = [
  result({ id: '1' }), result({ id: '2' }),
  result({ id: '3', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', ungradableClass: 'system' }),
  result({ id: '4', status: 'flagged_for_review', ungradableReason: 'Môi trường chạy bài hết giờ', ungradableClass: 'system' }),
  result({ id: '5' }), result({ id: '6' }),
];

type Props = React.ComponentProps<typeof RunningPanel>;
const props = (over: Partial<Props> = {}): Props => ({
  progress: progress(),
  progressError: null,
  lastReadAt: new Date('2026-09-29T10:30:15').getTime(),
  onRetry: vi.fn(),
  results: finished,
  online: true,
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T10:30:15'));
});
afterEach(() => vi.useRealTimers());

describe('RunningPanel - the numbers (spec §3.8)', () => {
  it('splits the session into three parts that add up to the total', () => {
    render(<RunningPanel {...props()} />);
    const legend = screen.getByRole('list', { name: 'Các phần của lượt chấm' });
    expect(within(legend).getByText('Đã có kết quả').closest('li')).toHaveTextContent('4');
    expect(within(legend).getByText('Đang chấm').closest('li')).toHaveTextContent('4');
    expect(within(legend).getByText('Không chấm được / dừng').closest('li')).toHaveTextContent('2');
  });

  // T-UI-13: a result that stopped on a system error has no score; counting it as "done" is a lie.
  it('never counts a stopped-by-system result as "đã có kết quả"', () => {
    render(<RunningPanel {...props()} />);
    const legend = screen.getByRole('list', { name: 'Các phần của lượt chấm' });
    expect(within(legend).getByText('Đã có kết quả').closest('li')).not.toHaveTextContent('6');
  });

  it('is a progressbar with the total, and each part is a proportional segment', () => {
    render(<RunningPanel {...props()} />);
    const bar = screen.getByRole('progressbar', { name: 'Tiến độ chấm' });
    expect(bar).toHaveAttribute('aria-valuenow', '6');
    expect(bar).toHaveAttribute('aria-valuemax', '10');
    const widths = [...bar.querySelectorAll('[data-part]')].map((s) => [(s as HTMLElement).dataset.part, (s as HTMLElement).style.width]);
    expect(widths).toEqual([['result', '40%'], ['grading', '40%'], ['stopped', '20%']]);
  });

  it('tells the two "not finished" parts apart by pattern and words, not by colour alone', () => {
    render(<RunningPanel {...props()} />);
    expect(screen.getByRole('progressbar').querySelector('[data-part="stopped"]')).toHaveClass('bg-stripes');
    expect(screen.getByText('Không chấm được / dừng')).toBeInTheDocument();
  });

  it('says the finished results can already be opened', () => {
    render(<RunningPanel {...props()} />);
    expect(screen.getByText(/mở được ngay/i)).toBeInTheDocument();
  });

  describe('speed and time left', () => {
    it('says it cannot estimate yet', () => {
      render(<RunningPanel {...props()} />);
      expect(screen.getByText('Chưa ước tính được - cần đo thêm một lúc.')).toBeInTheDocument();
    });

    it('measures from successive reads, says it is an estimate and over what window', () => {
      const first = props({ progress: progress({ done: 0, pending: 12, total: 12 }), results: [], lastReadAt: Date.now() });
      const { rerender } = render(<RunningPanel {...first} />);
      act(() => void vi.advanceTimersByTime(60_000));
      rerender(<RunningPanel {...props({ progress: progress({ done: 6, pending: 6, total: 12 }), results: [], lastReadAt: Date.now() })} />);
      expect(screen.getByText(/Ước tính: khoảng 6 bài\/phút, còn khoảng 1 phút - đo trong 60 giây vừa qua\./)).toBeInTheDocument();
    });
  });
});

describe('RunningPanel - incidents: each banner says WHAT broke and whether the work is affected', () => {
  it('MY machine offline: the grading continues on the server, no result is affected, numbers dimmed with the last read, nothing to press', () => {
    render(<RunningPanel {...props({ online: false })} />);
    expect(screen.getByText('Máy bạn đang mất mạng.').closest('[role="status"]')).toHaveTextContent('Việc chấm vẫn chạy trên máy chủ');
    expect(screen.getByText('Máy bạn đang mất mạng.').closest('[role="status"]')).toHaveTextContent('không bài nào bị ảnh hưởng');
    expect(screen.getByText(/lần cuối lúc/)).toBeInTheDocument();
    expect(screen.getByRole('progressbar').closest('[data-stale]')).toHaveAttribute('data-stale', 'true');
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('SERVER not answering: says it does not know whether grading continues, and offers a retry that refetches', () => {
    const onRetry = vi.fn();
    render(<RunningPanel {...props({ progressError: new Error('Bad gateway'), onRetry })} />);
    expect(screen.getByText(/Không biết việc chấm có chạy tiếp không/).closest('[role="alert"]')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại ngay' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('does not blame the server while the machine itself is offline', () => {
    render(<RunningPanel {...props({ online: false, progressError: new Error('Failed to fetch') })} />);
    expect(screen.queryByText(/Không biết việc chấm có chạy tiếp không/)).not.toBeInTheDocument();
    expect(screen.getByText('Máy bạn đang mất mạng.').closest('[role="status"]')).toHaveTextContent('Việc chấm vẫn chạy trên máy chủ');
  });

  describe('a stuck result: pending work and a queue with nothing alive', () => {
    const stuck = () => props({ progress: progress({ pending: 3, done: 7, byStatus: { ai_grading: 3 }, queue: { waiting: 0, active: 0, failed: 0 } }) });

    it('says how many are stuck and points to the one regrade button at the top - no button of its own', () => {
      render(<RunningPanel {...stuck()} />);
      expect(screen.getByRole('status')).toHaveTextContent('3 bài đang bị kẹt');
      expect(screen.getByRole('status')).toHaveTextContent('Bấm nút chấm lại ở đầu trang');
      expect(screen.queryByRole('button', { name: /Chấm lại/ })).not.toBeInTheDocument();
    });

    it('says how long the count has stood still', () => {
      const { rerender } = render(<RunningPanel {...stuck()} lastReadAt={Date.now()} />);
      act(() => void vi.advanceTimersByTime(120_000));
      rerender(<RunningPanel {...stuck()} lastReadAt={Date.now()} />);
      expect(screen.getByRole('status')).toHaveTextContent('Không có bài nào hoàn thành trong 2 phút');
    });

    it('is NOT stuck while the queue still has live work', () => {
      render(<RunningPanel {...props({ progress: progress({ queue: { waiting: 0, active: 1, failed: 0 } }) })} />);
      expect(screen.queryByText(/đang bị kẹt/)).not.toBeInTheDocument();
    });

    it('is NOT stuck while jobs are waiting their turn', () => {
      render(<RunningPanel {...props({ progress: progress({ queue: { waiting: 5, active: 0, failed: 0 } }) })} />);
      expect(screen.queryByText(/đang bị kẹt/)).not.toBeInTheDocument();
    });

    it('offers nothing while the machine is offline', () => {
      render(<RunningPanel {...stuck()} online={false} />);
      expect(screen.queryByRole('button', { name: /Chấm lại/ })).not.toBeInTheDocument();
    });
  });
});

describe('RunningPanel - what the API cannot tell yet is labelled, not invented (T-UI-10)', () => {
  it('there is no "Đang chạy ngay lúc này" block any more, and no "cần backend" placeholder', () => {
    render(<RunningPanel {...props({ progress: progress({ pending: 4, done: 6, total: 10 }) })} />);
    expect(screen.queryByRole('region', { name: 'Đang chạy ngay lúc này' })).not.toBeInTheDocument();
    expect(screen.queryByText('cần backend')).not.toBeInTheDocument();
  });

  it('the stopped line says how many can be regraded and points to the one regrade button at the top - no second button here', () => {
    render(<RunningPanel {...props()} />);
    expect(screen.getByText(/2 bài trong số đó chấm lại được/)).toBeInTheDocument();
    expect(screen.getAllByText(/Bấm nút chấm lại ở đầu trang/)).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /lỗi hệ thống/ })).not.toBeInTheDocument();
  });

  it('a stopped result of class "submission" is not regradable: still said as stopped, but no button', () => {
    render(
      <RunningPanel
        {...props({
          results: [
            result({ id: '1' }),
            result({ id: '3', status: 'flagged_for_review', ungradableReason: 'Bài nộp rỗng', ungradableClass: 'submission' }),
          ],
        })}
      />,
    );
    expect(screen.getByText(/1 bài đã dừng/)).toBeInTheDocument();
    expect(screen.queryByText(/chấm lại được/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bấm nút chấm lại/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /lỗi hệ thống/ })).not.toBeInTheDocument();
  });

  it('offers no regrade of stopped results when none stopped', () => {
    render(<RunningPanel {...props({ results: [result()] })} />);
    expect(screen.queryByRole('button', { name: /lỗi hệ thống/ })).not.toBeInTheDocument();
  });
});

describe('RunningPanel - one status band, one incident block (Giai đoạn 2 §5.2)', () => {
  const stuckProgress = () =>
    progress({ pending: 3, done: 7, byStatus: { ai_grading: 3 }, queue: { waiting: 0, active: 0, failed: 0 } });

  it('headline says results out of total and how many are grading, from the same numbers as the legend', () => {
    render(<RunningPanel {...props()} />);
    expect(screen.getByText('4/10 bài đã có kết quả · 4 đang chấm')).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Các phần của lượt chấm' });
    expect(within(legend).getByText('Đã có kết quả').closest('li')).toHaveTextContent('4');
  });

  it('the progress bar announces the same numbers as the headline', () => {
    render(<RunningPanel {...props()} />);
    expect(screen.getByRole('progressbar', { name: 'Tiến độ chấm' })).toHaveAttribute('aria-valuetext', '4 có kết quả, 4 đang chấm, 2 dừng');
  });

  it('a running session with no incident has no alert at all', () => {
    render(<RunningPanel {...props({ results: [result()] })} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ chấm' })).toBeInTheDocument();
  });

  it('AI service, stuck and stopped share ONE alert inside the panel', () => {
    render(<RunningPanel {...props({ progress: stuckProgress() })} />);
    const alerts = screen.getAllByRole('status');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toHaveTextContent(/Dịch vụ AI lỗi - 2 bài không chấm được cùng một lý do/);
    expect(alerts[0]).toHaveTextContent(/3 bài đang bị kẹt/);
    expect(alerts[0]).toHaveTextContent(/2 bài đã dừng/);
    expect(screen.getAllByText(/Bấm nút chấm lại ở đầu trang/)).toHaveLength(1);
  });

  it('offline: the AI service incident stays, but stuck and stopped are not claimed', () => {
    render(<RunningPanel {...props({ online: false, progress: stuckProgress() })} />);
    expect(screen.getByText(/Dịch vụ AI lỗi - 2 bài/)).toBeInTheDocument();
    expect(screen.queryByText(/đang bị kẹt/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bài đã dừng/)).not.toBeInTheDocument();
  });

  it('a stopped count larger than the done count never goes negative and the headline matches the legend', () => {
    const stoppedThree = [1, 2, 3].map((n) =>
      result({ id: String(n), status: 'flagged_for_review', ungradableReason: 'Hết giờ', ungradableClass: 'system' }),
    );
    render(<RunningPanel {...props({ progress: progress({ total: 10, pending: 4, done: 1 }), results: stoppedThree })} />);
    const legend = screen.getByRole('list', { name: 'Các phần của lượt chấm' });
    expect(within(legend).getByText('Không chấm được / dừng').closest('li')).toHaveTextContent(/dừng\s*1$/);
    expect(within(legend).getByText('Đã có kết quả').closest('li')).toHaveTextContent(/kết quả\s*0$/);
    expect(screen.getByText('0/10 bài đã có kết quả · 4 đang chấm')).toBeInTheDocument();
    expect(screen.getByText(/1 bài đã dừng/)).toBeInTheDocument();
    expect(screen.getByText(/1 bài trong số đó chấm lại được/)).toBeInTheDocument();
    // Danh sách kết quả đi trước tiến độ: ba bài lỗi AI không được hiện thành "3 bài" khi chỉ 1 bài đã dừng.
    expect(screen.queryByText(/Dịch vụ AI lỗi/)).not.toBeInTheDocument();
  });
});
