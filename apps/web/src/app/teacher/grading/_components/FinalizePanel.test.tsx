import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FinalizePanel } from './FinalizePanel';
import type { GradingResult } from '@/lib/api/grading';

const mutate = vi.fn();
let state: { isPending: boolean; isError: boolean; error: Error | null };
vi.mock('@/hooks/useGrading', () => ({ useFinalizeGrades: () => ({ mutate, ...state }) }));
vi.mock('./ReapplyPricesPanel', () => ({ ReapplyPricesPanel: () => <div data-testid="reapply-panel" /> }));

const result = (over: Partial<GradingResult> = {}): GradingResult => ({
  id: 'r', submissionId: 's', studentMssv: '1', studentName: 'A', homeClassId: 'c', homeClassName: 'N01',
  status: 'auto_approved', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: false, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 8, currentScoreSource: 'computation',
  ...over,
});

const list = (statuses: string[]) => statuses.map((status, i) => result({ id: `r${i}`, studentMssv: String(i), status }));
const session = { name: 'Giữa kỳ N01', code: 'GK-N01' };
const renderPanel = (results: GradingResult[]) => render(<FinalizePanel sessionId="s1" session={session} results={results} />);
const finalizeButton = () => screen.getByRole('button', { name: 'Chốt điểm phiên' });

beforeEach(() => {
  mutate.mockReset();
  state = { isPending: false, isError: false, error: null };
});

describe('FinalizePanel — the header claim (spec §3.10)', () => {
  it('says at the very top that finalising is a publication milestone that writes no file, and signs the clicker\'s name', () => {
    renderPanel(list(['auto_approved']));
    expect(screen.getByText(/Chốt là mốc công bố/)).toBeInTheDocument();
    expect(screen.getByText(/chốt không ghi file nào/)).toBeInTheDocument();
    expect(screen.getByText(/tên bạn được ghi lên từng bài/i)).toBeInTheDocument();
  });
});

describe('FinalizePanel — blocked: each blocking group, its count, and a way to act', () => {
  const blocked = () => list(['flagged_for_review', 'flagged_for_review', 'audit_pending', 'ai_grading', 'auto_approved']);

  it('lists only the groups that block, with counts', () => {
    renderPanel(blocked());
    const groups = screen.getByRole('list', { name: 'Đang chặn việc chốt' });
    expect(within(groups).getByText('2 bài cần bạn xem')).toBeInTheDocument();
    expect(within(groups).getByText('1 bài kiểm mẫu chưa kiểm')).toBeInTheDocument();
    expect(within(groups).getByText('1 bài đang chấm')).toBeInTheDocument();
    expect(within(groups).queryByText(/không chấm được/)).not.toBeInTheDocument();
  });

  it('each group links to the list filtered to it', () => {
    renderPanel(blocked());
    expect(screen.getByRole('link', { name: /Xem 2 bài cần bạn xem/ })).toHaveAttribute('href', '/teacher/grading?sessionId=s1&state=needsYou');
    expect(screen.getByRole('link', { name: /Xem 1 bài đang chấm/ })).toHaveAttribute('href', '/teacher/grading?sessionId=s1&state=grading');
  });

  it('a result that could not be graded blocks too (BLOCKS_FINALIZE holds it in flagged_for_review)', () => {
    renderPanel([result({ id: 'a', status: 'flagged_for_review', ungradableReason: 'x' })]);
    expect(screen.getByText('1 bài không chấm được')).toBeInTheDocument();
  });

  it('the sampling audit step is "cần backend" — the teacher cannot clear it from here', () => {
    renderPanel(blocked());
    expect(within(screen.getByText('1 bài kiểm mẫu chưa kiểm').closest('li')!).getByText('cần backend')).toBeInTheDocument();
  });

  it('the button is disabled, the reason is written next to it, and nothing is sent', () => {
    renderPanel(blocked());
    expect(finalizeButton()).toBeDisabled();
    expect(screen.getByText(/Còn 4 bài chưa xong/)).toBeInTheDocument();
    fireEvent.click(finalizeButton());
    expect(mutate).not.toHaveBeenCalled();
  });
});

describe('FinalizePanel — ready (T-UI-16: the two numbers add up to the session)', () => {
  const ready = () => list(['auto_approved', 'auto_approved', 'auto_approved', 'teacher_reviewed']);

  it('asks first; the dialog states exactly two numbers that add up to the size of the session', () => {
    renderPanel(ready());
    fireEvent.click(finalizeButton());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('3 bài theo điểm hệ thống tự quyết mà bạn chưa mở');
    expect(dialog).toHaveTextContent('1 bài bạn đã xem');
    expect(3 + 1).toBe(ready().length);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('states the consequence: from now every score change is logged; a price change does not move this session', () => {
    renderPanel(ready());
    fireEvent.click(finalizeButton());
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('mọi thay đổi điểm đều được ghi vào nhật ký');
    expect(dialog).toHaveTextContent('Đổi giá ở Bảng lỗi không tự đổi điểm phiên đã chốt');
  });

  it('confirming finalises once; cancelling sends nothing', () => {
    renderPanel(ready());
    fireEvent.click(finalizeButton());
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
    expect(mutate).not.toHaveBeenCalled();
    fireEvent.click(finalizeButton());
    fireEvent.click(screen.getByRole('button', { name: 'Chốt điểm' }));
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it('shows the server refusal verbatim inside the dialog', () => {
    state = { isPending: false, isError: true, error: new Error('1 bài không còn điểm theo bảng lỗi hiện hành (dưới sàn) — hãy chấm tay trước khi chốt điểm.') };
    renderPanel(ready());
    fireEvent.click(finalizeButton());
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('dưới sàn');
  });

  // Verified on the live API: finalize-grades answers {reviewedByHand: 3, acceptedAsProposed: 0, finalizedDirectly: 1}
  // for a session with one auto-decided code result — the auto-decided investigator results are counted in
  // `finalizedDirectly`, NOT in `acceptedAsProposed`. Reading only the first two under-reported the session.
  it('reads the outcome back after a successful finalise — counting results the system decided, incl. those finalised directly', () => {
    mutate.mockImplementation(
      (_v: void, opts: { onSuccess: (d: { reviewedByHand: number; acceptedAsProposed: number; finalizedDirectly: number }) => void }) =>
        opts.onSuccess({ reviewedByHand: 1, acceptedAsProposed: 1, finalizedDirectly: 2 }),
    );
    renderPanel(ready());
    fireEvent.click(finalizeButton());
    fireEvent.click(screen.getByRole('button', { name: 'Chốt điểm' }));
    expect(screen.getByRole('status')).toHaveTextContent('Đã chốt: 3 bài theo điểm hệ thống, 1 bài bạn đã xem.');
  });

  it('does not offer the score export or the reapply panel before the session is finalised (Review Focus 5)', () => {
    renderPanel(ready());
    expect(screen.queryByRole('button', { name: 'Xuất CSV' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('reapply-panel')).not.toBeInTheDocument();
  });
});

describe('FinalizePanel — finalised', () => {
  const finalised = () => list(['finalized', 'finalized', 'exported']);

  it('says the scores are final and that later changes are logged', () => {
    renderPanel(finalised());
    expect(screen.getByText(/Điểm của phiên này đã chốt/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chốt điểm phiên' })).not.toBeInTheDocument();
  });

  it('offers "Áp giá mới cho phiên đã chốt" as its own action', () => {
    renderPanel(finalised());
    expect(screen.getByTestId('reapply-panel')).toBeInTheDocument();
  });

  it('offers the CSV export only now, and the score-book writing as a "cần backend" placeholder that sends nothing', () => {
    renderPanel(finalised());
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeEnabled();
    const block = screen.getByRole('region', { name: 'Ghi điểm vào sổ điểm' });
    expect(within(block).getByText('cần backend')).toBeInTheDocument();
    expect(within(block).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('FinalizePanel — nothing graded', () => {
  it('says there is nothing to finalise and leads back', () => {
    renderPanel([]);
    expect(screen.getByText(/Chưa chấm bài nào/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Về danh sách bài' })).toHaveAttribute('href', '/teacher/grading?sessionId=s1');
    expect(screen.queryByRole('button', { name: 'Chốt điểm phiên' })).not.toBeInTheDocument();
  });
});
