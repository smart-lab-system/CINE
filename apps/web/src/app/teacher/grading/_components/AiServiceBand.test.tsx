import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { GradingResult } from '@/lib/api/grading';
import { AiServiceBand } from './AiServiceBand';

vi.mock('./RegradeButton', () => ({
  RegradeButton: ({ scope, label }: { scope: unknown; label: string }) => (
    <button type="button" data-scope={JSON.stringify(scope)}>
      {label}
    </button>
  ),
}));

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r', submissionId: 's', studentMssv: '1', studentName: 'An', homeClassId: 'c', homeClassName: 'N01',
  status: 'flagged_for_review', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: true,
  ungradableReason: 'Dịch vụ AI không phản hồi.', criterionResults: [], advocateOpinion: null,
  contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null, reviewedAt: null,
  reviewedByName: null, editedCriteria: null, pipeline: 'one_shot', currentScore: null,
  currentScoreSource: 'computation', ungradableClass: 'system', ...over,
});
const band = (results: GradingResult[]) => render(<AiServiceBand sessionId="s1" results={results} />);

describe('AiServiceBand (G3 D12)', () => {
  it('two system-class results with the same reason → says so, quotes the reason, offers to regrade exactly those', () => {
    band([result({ id: 'a' }), result({ id: 'b' })]);
    expect(screen.getByText(/Dịch vụ AI lỗi — 2 bài không chấm được cùng một lý do/)).toBeInTheDocument();
    expect(screen.getByText(/“Dịch vụ AI không phản hồi\.”/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chấm lại 2 bài này' })).toHaveAttribute(
      'data-scope',
      JSON.stringify({ kind: 'session', sessionId: 's1', reason: 'Dịch vụ AI không phản hồi.', count: 2 }),
    );
  });

  it('says plainly what it measures — the same reason, not a time window (the list carries no stop time)', () => {
    band([result({ id: 'a' }), result({ id: 'b' })]);
    expect(screen.getByText(/không đo được khoảng thời gian/)).toBeInTheDocument();
  });

  it('one stopped result is an ordinary failure — no band', () => {
    const { container } = band([result({ id: 'a' })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('two stopped results with DIFFERENT reasons — no band', () => {
    const { container } = band([result({ id: 'a' }), result({ id: 'b', ungradableReason: 'Hết giờ' })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('submission-class results and results without a class never make a band, even with the same text', () => {
    const { container } = band([
      result({ id: 'a', ungradableClass: 'submission' }),
      result({ id: 'b', ungradableClass: 'submission' }),
      result({ id: 'c', ungradableClass: undefined }),
      result({ id: 'd', ungradableClass: undefined }),
    ]);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers the LARGEST group when there are several', () => {
    band([
      result({ id: 'a', ungradableReason: 'Hết giờ' }),
      result({ id: 'b', ungradableReason: 'Hết giờ' }),
      result({ id: 'c', ungradableReason: 'Hết giờ' }),
      result({ id: 'd', ungradableReason: 'AI lỗi' }),
      result({ id: 'e', ungradableReason: 'AI lỗi' }),
    ]);
    expect(screen.getByRole('button', { name: 'Chấm lại 3 bài này' })).toBeInTheDocument();
  });
});
