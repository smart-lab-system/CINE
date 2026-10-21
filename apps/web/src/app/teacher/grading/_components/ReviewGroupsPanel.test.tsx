import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewGroupsPanel } from './ReviewGroupsPanel';
import { ApiStatusError } from '@/lib/api/error';
import type { GradingResult, Rubric } from '@/lib/api/grading';
import type { OpenAutoBreaker, ReviewGroup } from '@/lib/api/review-groups';

const h = vi.hoisted(() => ({
  groups: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  breakers: { data: [] as unknown[], isLoading: false, isError: false, error: null as Error | null, refetch: vi.fn() },
  results: [] as unknown[],
  rubrics: [] as unknown[],
  opened: new Set<string>(),
  confirmMutate: vi.fn(),
  confirmReset: vi.fn(),
  confirm: { isPending: false, isError: false, error: null as Error | null },
  resetMutate: vi.fn(),
  resetReset: vi.fn(),
  resetState: { isPending: false, isError: false, error: null as Error | null },
}));

vi.mock('@/hooks/useReviewGroups', () => ({
  useReviewGroups: () => h.groups,
  useAutoBreakers: () => h.breakers,
  useOpenedResults: () => h.opened,
  useConfirmReviewGroup: () => ({ mutate: h.confirmMutate, reset: h.confirmReset, ...h.confirm }),
  useResetAutoBreaker: () => ({ mutate: h.resetMutate, reset: h.resetReset, ...h.resetState }),
}));
vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => ({ data: h.results, isLoading: false, isError: false, error: null }),
  useRubrics: () => ({ data: h.rubrics, isLoading: false, isError: false, error: null }),
}));

const RV1 = '11111111-1111-4111-8111-111111111111';
const RV2 = '22222222-2222-4222-8222-222222222222';

const group = (over: Partial<ReviewGroup> = {}): ReviewGroup => ({
  key: `${RV1}:rule-leak`,
  label: 'Rò rỉ bộ nhớ',
  description: 'Trừ điểm khi bộ nhớ cấp phát động không được giải phóng.',
  sources: ['llm_only'],
  kind: 'single',
  ruleId: 'rule-leak',
  resultIds: ['a', 'b'],
  sampleResultIds: ['a', 'b'],
  ...over,
});

const multi = (over: Partial<ReviewGroup> = {}): ReviewGroup =>
  group({ key: 'multi', label: 'multi', description: null, kind: 'multi', ruleId: null, sources: ['deterministic', 'llm_with_tools'], resultIds: ['c', 'd'], sampleResultIds: ['c', 'd'], ...over });

const none = (over: Partial<ReviewGroup> = {}): ReviewGroup =>
  group({ key: 'none', label: 'none', description: null, kind: 'none', ruleId: null, sources: [], resultIds: ['e', 'f'], sampleResultIds: ['e', 'f'], ...over });

const result = (id: string, over: Partial<GradingResult> = {}): GradingResult => ({
  id, submissionId: `s-${id}`, studentMssv: `HS-${id}`, studentName: `Sinh viên ${id.toUpperCase()}`, homeClassId: 'c1', homeClassName: 'N01',
  status: 'flagged_for_review', modelUsed: null, aiTotalScore: null, confidence: null, flagForReview: true, ungradableReason: null,
  criterionResults: [], advocateOpinion: null, contextUsedQuestion: null, contextUsedModelAnswer: null, finalScore: null,
  reviewedAt: null, reviewedByName: null, editedCriteria: null, pipeline: 'investigator', currentScore: 9, currentScoreSource: 'computation',
  triage: { caseFlags: [], errorFlags: [], counts: { counted: 1, unpriced: 0, refuted: 0, excluded: 0 } },
  ...over,
});

const rubric = (id: string, name: string, version: number): Rubric => ({ id, teacherId: 't1', name, version, isActive: true, totalPoints: 10, criteria: [] });

const breaker = (over: Partial<OpenAutoBreaker> = {}): OpenAutoBreaker => ({
  id: 'br-1', scope: 'rule', ruleId: 'rule-comment', ruleKey: 'thieu_chu_thich', trippedAt: '2026-10-21T08:00:00.000Z', n: 4, disagreements: 3,
  ...over,
});

beforeEach(() => {
  h.groups = { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() };
  h.breakers = { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn() };
  h.results = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => result(id));
  h.rubrics = [rubric(RV1, 'CTDL cuối kỳ', 2)];
  h.opened = new Set();
  h.confirmMutate.mockReset();
  h.confirmReset.mockReset();
  h.confirm = { isPending: false, isError: false, error: null };
  h.resetMutate.mockReset();
  h.resetReset.mockReset();
  h.resetState = { isPending: false, isError: false, error: null };
});

const rowOf = (heading: string | RegExp) => screen.getByRole('heading', { name: heading }).closest('article') as HTMLElement;

describe('ReviewGroupsPanel (spec duyệt nhanh §5.4: duyệt theo nhóm lỗi, chỉ nhóm một lỗi được duyệt cả loạt)', () => {
  it('renders nothing when there is no group and nothing is paused', () => {
    const { container } = render(<ReviewGroupsPanel sessionId="s1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows one row per group: count, rule description, source label, certainty, rubric version and sample links', () => {
    h.groups.data = [group()];
    render(<ReviewGroupsPanel sessionId="s1" />);
    const row = rowOf('Rò rỉ bộ nhớ');
    expect(row).toHaveTextContent('Trừ điểm khi bộ nhớ cấp phát động không được giải phóng.');
    expect(row).toHaveTextContent('Đọc code, nhận định');
    expect(row).toHaveTextContent('50% chắc chắn');
    expect(row).toHaveTextContent('Thang chấm CTDL cuối kỳ (bản 2)');
    expect(within(row).getByTestId('group-count')).toHaveTextContent('2');
    expect(within(row).getByRole('link', { name: 'HS-a' })).toHaveAttribute('href', '/teacher/grading/a?sessionId=s1');
    expect(within(row).getByRole('link', { name: 'HS-b' })).toHaveAttribute('href', '/teacher/grading/b?sessionId=s1');
    expect(row).toHaveTextContent('đã xem 0/2');
  });

  it('counts samples the teacher already opened', () => {
    h.groups.data = [group()];
    h.opened = new Set(['b']);
    render(<ReviewGroupsPanel sessionId="s1" />);
    expect(rowOf('Rò rỉ bộ nhớ')).toHaveTextContent('đã xem 1/2');
  });

  it('tells apart two groups of the SAME rule under two rubric versions', () => {
    h.rubrics = [rubric(RV1, 'CTDL cuối kỳ', 2), rubric(RV2, 'CTDL cuối kỳ', 3)];
    h.groups.data = [group(), group({ key: `${RV2}:rule-leak`, resultIds: ['c'], sampleResultIds: ['c'] })];
    render(<ReviewGroupsPanel sessionId="s1" />);
    const rows = screen.getAllByRole('heading', { name: 'Rò rỉ bộ nhớ' }).map((el) => el.closest('article') as HTMLElement);
    expect(rows[0]).toHaveTextContent('(bản 2)');
    expect(rows[1]).toHaveTextContent('(bản 3)');
  });

  it('falls back to a short rubric version id when the rubric list has no name for it', () => {
    h.rubrics = [];
    h.groups.data = [group()];
    render(<ReviewGroupsPanel sessionId="s1" />);
    expect(rowOf('Rò rỉ bộ nhớ')).toHaveTextContent('Thang chấm mã 11111111');
  });

  it('offers "Duyệt N bài…" ONLY on a one-rule group; multi and none only get "Xem từng bài"', () => {
    h.groups.data = [group(), multi(), none()];
    render(<ReviewGroupsPanel sessionId="s1" />);
    expect(within(rowOf('Rò rỉ bộ nhớ')).getByRole('button', { name: 'Duyệt 2 bài…' })).toBeInTheDocument();

    const multiRow = rowOf('Nhiều lỗi khác nhau');
    expect(within(multiRow).queryByRole('button', { name: /Duyệt/ })).not.toBeInTheDocument();
    expect(within(multiRow).getByRole('link', { name: 'Xem từng bài' })).toHaveAttribute('href', '/teacher/grading/c?sessionId=s1');
    expect(multiRow).toHaveTextContent('85% đến 100% chắc chắn');

    const noneRow = rowOf('Hệ thống không thấy lỗi nhưng vẫn cần bạn xem');
    expect(within(noneRow).queryByRole('button', { name: /Duyệt/ })).not.toBeInTheDocument();
    expect(within(noneRow).getByRole('link', { name: 'Xem từng bài' })).toHaveAttribute('href', '/teacher/grading/e?sessionId=s1');
    expect(screen.getAllByRole('button', { name: /Duyệt/ })).toHaveLength(1);
  });

  it('the no-error group says "Chưa đo được" (never a %) and lists why its papers were flagged', () => {
    h.groups.data = [none()];
    h.results = [
      result('e', { triage: { caseFlags: [{ code: 'investigation_flag', detail: 'injection_suspected:submission_pattern,tool_output' }, { code: 'challenge_suspected', detail: 'gian_lan: x' }], errorFlags: [], counts: { counted: 0, unpriced: 0, refuted: 0, excluded: 0 } } }),
      result('f', { triage: { caseFlags: [{ code: 'investigation_flag', detail: 'injection_suspected' }], errorFlags: [], counts: { counted: 0, unpriced: 0, refuted: 0, excluded: 0 } } }),
    ];
    render(<ReviewGroupsPanel sessionId="s1" />);
    const row = rowOf('Hệ thống không thấy lỗi nhưng vẫn cần bạn xem');
    expect(row).toHaveTextContent('Chưa đo được');
    expect(row).not.toHaveTextContent('%');
    expect(row).toHaveTextContent('bài có chỗ giống lời dặn gửi cho hệ thống chấm × 2');
    expect(row).toHaveTextContent('bước kiểm tra lại thấy đáng ngờ × 1');
    expect(row).toHaveTextContent('kết luận “không có lỗi” là kết luận khó chắc chắn nhất');
  });

  it('marks a group whose rule is paused, and the no-error group when that class is paused', () => {
    h.groups.data = [group(), none()];
    h.breakers.data = [breaker({ ruleId: 'rule-leak', ruleKey: 'ro_ri_bo_nho' }), breaker({ id: 'br-2', scope: 'no_error', ruleId: null, ruleKey: null })];
    render(<ReviewGroupsPanel sessionId="s1" />);
    expect(rowOf('Rò rỉ bộ nhớ')).toHaveTextContent('Đã tạm dừng tự chốt');
    expect(rowOf('Hệ thống không thấy lỗi nhưng vẫn cần bạn xem')).toHaveTextContent('Đã tạm dừng tự chốt cho loại bài này');
  });

  describe('hộp duyệt', () => {
    it('lists every paper with its system score and "Chưa xem", warns when none was opened, and does NOT block', () => {
      h.groups.data = [group()];
      h.results = [result('a', { currentScore: 9 }), result('b', { currentScore: 7.5 })];
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài…' }));
      const dialog = screen.getByRole('dialog');
      const items = within(dialog).getAllByRole('listitem').filter((li) => li.textContent?.includes('Điểm hệ thống'));
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('HS-a');
      expect(items[0]).toHaveTextContent('Điểm hệ thống 9');
      expect(items[0]).toHaveTextContent('Chưa xem');
      expect(items[1]).toHaveTextContent('Điểm hệ thống 7,5');
      expect(dialog).toHaveTextContent('Bạn chưa mở bài nào trong 2 bài này');
      expect(within(dialog).getByRole('button', { name: 'Duyệt 2 bài' })).toBeEnabled();
      expect(h.confirmMutate).not.toHaveBeenCalled();
    });

    it('drops the warning once a paper in the group was opened, and says which', () => {
      h.groups.data = [group()];
      h.opened = new Set(['a']);
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài…' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).not.toHaveTextContent('Bạn chưa mở bài nào');
      const [first, second] = within(dialog).getAllByRole('listitem').filter((li) => li.textContent?.includes('Điểm hệ thống'));
      expect(first).toHaveTextContent('Đã xem');
      expect(second).toHaveTextContent('Chưa xem');
    });

    it('confirming sends the group key and exactly the papers shown', () => {
      h.groups.data = [group()];
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài…' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duyệt 2 bài' }));
      expect(h.confirmMutate).toHaveBeenCalledWith({ key: `${RV1}:rule-leak`, resultIds: ['a', 'b'] }, expect.anything());
    });

    it('cancelling sends nothing', () => {
      h.groups.data = [group()];
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài…' }));
      fireEvent.click(screen.getByRole('button', { name: 'Huỷ' }));
      expect(h.confirmMutate).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('reads the outcome back: how many were approved, and every skipped paper with its reason', () => {
      h.groups.data = [group({ resultIds: ['a', 'b', 'c'], sampleResultIds: ['a', 'b', 'c'] })];
      h.confirmMutate.mockImplementation((_body: unknown, opts: { onSuccess: (d: unknown) => void }) =>
        opts.onSuccess({ confirmed: 1, skipped: [{ resultId: 'b', reason: 'has_manual' }, { resultId: 'c', reason: 'not_flagged' }] }),
      );
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt 3 bài…' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duyệt 3 bài' }));
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Đã duyệt 1 bài');
      expect(status).toHaveTextContent('1 bài bỏ qua — bạn đã chấm tay bài này: Sinh viên B');
      expect(status).toHaveTextContent('1 bài bỏ qua — bài không còn ở trạng thái cần xem: Sinh viên C');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('a 404 (the group is already gone, e.g. a double click) is "already done": neutral note, list reloaded, no error', () => {
      h.groups.data = [group()];
      h.confirmMutate.mockImplementation((_body: unknown, opts: { onError: (e: unknown) => void }) =>
        opts.onError(new ApiStatusError('Nhóm này không còn bài nào gắn cờ trong phiên', 404, {})),
      );
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài…' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duyệt 2 bài' }));
      expect(h.groups.refetch).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('Nhóm này không còn bài nào cần duyệt');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('any other failure stays in the dialog with the server message, and the list is reloaded', () => {
      h.groups.data = [group()];
      h.confirm = { isPending: false, isError: true, error: new ApiStatusError('Có bài không còn thuộc nhóm này', 409, {}) };
      h.confirmMutate.mockImplementation((_body: unknown, opts: { onError: (e: unknown) => void }) => opts.onError(h.confirm.error));
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài…' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Duyệt 2 bài' }));
      expect(h.groups.refetch).toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toHaveTextContent('Có bài không còn thuộc nhóm này');
    });
  });

  describe('khối "Tự chốt đang tạm dừng"', () => {
    it('is absent when nothing is paused', () => {
      h.groups.data = [group()];
      render(<ReviewGroupsPanel sessionId="s1" />);
      expect(screen.queryByRole('heading', { name: 'Tự chốt đang tạm dừng' })).not.toBeInTheDocument();
    });

    it('shows each paused scope (a rule, or papers with no error) with n and disagreements, even with no group', () => {
      h.breakers.data = [breaker(), breaker({ id: 'br-2', scope: 'no_error', ruleId: null, ruleKey: null, n: 2, disagreements: 2 })];
      render(<ReviewGroupsPanel sessionId="s1" />);
      const block = screen.getByRole('heading', { name: 'Tự chốt đang tạm dừng' }).closest('section') as HTMLElement;
      const [ruleItem, noErrorItem] = within(block).getAllByRole('listitem');
      expect(ruleItem).toHaveTextContent('thieu_chu_thich');
      expect(ruleItem).toHaveTextContent('3/4 bài kiểm tra ngẫu nhiên');
      expect(noErrorItem).toHaveTextContent('Bài hệ thống cho là không có lỗi');
      expect(noErrorItem).toHaveTextContent('2/2 bài kiểm tra ngẫu nhiên');
    });

    it('"Bật lại" asks first, then resets exactly that one', () => {
      h.breakers.data = [breaker(), breaker({ id: 'br-2', scope: 'no_error', ruleId: null, ruleKey: null })];
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Bật lại tự chốt cho lỗi thieu_chu_thich' }));
      expect(h.resetMutate).not.toHaveBeenCalled();
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveTextContent('thieu_chu_thich');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Bật lại' }));
      expect(h.resetMutate).toHaveBeenCalledWith('br-1', expect.anything());
    });

    it('a reset that was already done (409) is reported neutrally and the list reloaded', () => {
      h.breakers.data = [breaker()];
      h.resetMutate.mockImplementation((_id: unknown, opts: { onError: (e: unknown) => void }) =>
        opts.onError(new ApiStatusError('Cầu dao này đã được bật lại.', 409, {})),
      );
      render(<ReviewGroupsPanel sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Bật lại tự chốt cho lỗi thieu_chu_thich' }));
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Bật lại' }));
      expect(h.breakers.refetch).toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('status')).toHaveTextContent('đã được bật lại');
    });
  });

  it('speaks to teachers (spec §5.8a): no "model", "AI", "agent", "phản biện", "lăng kính", "tin cậy", "cầu dao", "kiểm mẫu"', () => {
    h.groups.data = [group(), multi(), none()];
    h.breakers.data = [breaker(), breaker({ id: 'br-2', scope: 'no_error', ruleId: null, ruleKey: null })];
    h.results = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) =>
      result(id, { triage: { caseFlags: [{ code: 'investigation_flag', detail: 'injection_suspected' }, { code: 'challenge_suspected', detail: '' }], errorFlags: [], counts: { counted: 0, unpriced: 0, refuted: 0, excluded: 0 } } }),
    );
    render(<ReviewGroupsPanel sessionId="s1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Duyệt 2 bài…' }));
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bmodel\b|\bAI\b|\bagent\b|phản biện|lăng kính|tin cậy|cầu dao|kiểm mẫu/i);
  });
});
