import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { BulkAcceptEssays } from './BulkAcceptEssays';
import type { GradingResult } from '@/lib/api/grading';

const mutate = vi.fn();
let state: { isPending: boolean; isError: boolean; error: Error | null; data?: unknown };
vi.mock('@/hooks/useGrading', () => ({ useBulkReview: () => ({ mutate, ...state }) }));

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r1', submissionId: 's1', studentMssv: '1', studentName: 'A', homeClassId: 'c1', homeClassName: 'N01',
  status: 'flagged_for_review', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: true, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'one_shot', currentScore: 6, currentScoreSource: 'computation',
  ...over,
});

beforeEach(() => {
  mutate.mockReset();
  state = { isPending: false, isError: false, error: null };
});

describe('BulkAcceptEssays (spec §3.11: essays never self-approve, so the teacher accepts them in bulk — knowingly)', () => {
  it('renders nothing when there is no essay waiting for review', () => {
    const { container } = render(
      <BulkAcceptEssays sessionId="s1" results={[result({ pipeline: 'investigator' }), result({ id: 'x', status: 'auto_approved' })]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('counts only essays that are waiting AND have something to accept (an ungradable essay has no score)', () => {
    render(
      <BulkAcceptEssays
        sessionId="s1"
        results={[result({ id: 'a' }), result({ id: 'b' }), result({ id: 'c', ungradableReason: 'file rỗng', currentScore: null }), result({ id: 'd', pipeline: 'investigator' })]}
      />,
    );
    expect(screen.getByRole('button', { name: 'Duyệt hàng loạt 2 bài tự luận' })).toBeInTheDocument();
  });

  it('asks first, states the exact number, and sends nothing yet', () => {
    render(<BulkAcceptEssays sessionId="s1" results={[result({ id: 'a' }), result({ id: 'b' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt hàng loạt 2 bài tự luận' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('2 bài tự luận');
    expect(screen.getByRole('dialog')).toHaveTextContent('chưa mở xem');
    expect(mutate).not.toHaveBeenCalled();
  });

  it('confirming sends keep_ai with exactly those ids', () => {
    render(<BulkAcceptEssays sessionId="s1" results={[result({ id: 'a' }), result({ id: 'b' }), result({ id: 'z', pipeline: 'investigator' })]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt hàng loạt 2 bài tự luận' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài' }));
    expect(mutate).toHaveBeenCalledWith({ resultIds: ['a', 'b'], rule: { kind: 'keep_ai' } }, expect.anything());
  });

  it('cancelling sends nothing', () => {
    render(<BulkAcceptEssays sessionId="s1" results={[result()]} />);
    fireEvent.click(screen.getByRole('button', { name: /Duyệt hàng loạt/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(mutate).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads the outcome back: applied, logged, and every skip with its reason', () => {
    mutate.mockImplementation((_body: unknown, opts: { onSuccess: (d: unknown) => void }) =>
      opts.onSuccess({ applied: 3, audited: 1, skipped: [{ resultId: 'b', reason: 'not_reviewable' }] }),
    );
    render(<BulkAcceptEssays sessionId="s1" results={[result({ id: 'a' }), result({ id: 'b', studentName: 'Bình' })]} />);
    fireEvent.click(screen.getByRole('button', { name: /Duyệt hàng loạt/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài' }));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Đã duyệt 3 bài');
    expect(status).toHaveTextContent('1 bài đã công bố — mỗi bài một dòng nhật ký');
    expect(status).toHaveTextContent('1 bài bỏ qua: Bình — đang được chấm lại');
  });

  it('shows the server message verbatim when it fails', () => {
    state = { isPending: false, isError: true, error: new Error('Có id không thuộc phiên này') };
    render(<BulkAcceptEssays sessionId="s1" results={[result()]} />);
    fireEvent.click(screen.getByRole('button', { name: /Duyệt hàng loạt/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Có id không thuộc phiên này');
  });
});
