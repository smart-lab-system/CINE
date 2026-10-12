import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { PreparePanel } from './PreparePanel';
import { criterion, overview } from '@/app/teacher/rules/_components/fixtures';
import type { SessionOverviewItem } from '@/lib/api/submissions';
import type { Rubric } from '@/lib/api/grading';

const h = vi.hoisted(() => ({
  start: vi.fn(),
  startState: { isPending: false, isError: false, isSuccess: false, error: null as Error | null, data: undefined as unknown },
  rubrics: { data: [] as unknown[] },
  readiness: { data: undefined as unknown },
  detail: { data: undefined as unknown },
  overview: { data: [] as unknown[] },
  bundles: { data: [] as unknown[] },
}));

vi.mock('@/hooks/useGrading', () => ({
  useRubrics: () => h.rubrics,
  useGradingReadiness: () => h.readiness,
  useStartGrading: () => ({ mutate: h.start, ...h.startState }),
}));
vi.mock('@/hooks/useExamSession', () => ({ useExamSessionDetail: () => h.detail }));
vi.mock('@/hooks/useRubricErrors', () => ({ useRubricOverview: () => h.overview }));
vi.mock('@/hooks/useTestBundle', () => ({ useTestBundles: () => h.bundles }));

// Their own tests cover them; here only how the panel wires them matters.
vi.mock('./ReferenceForm', () => ({
  ReferenceForm: ({ onDirtyChange, hasPinnedBundle }: { onDirtyChange: (d: boolean) => void; hasPinnedBundle: boolean }) => (
    <button type="button" data-pinned={String(hasPinnedBundle)} onClick={() => onDirtyChange(true)}>
      mô phỏng thay đổi chưa lưu
    </button>
  ),
}));
vi.mock('./RubricRow', () => ({ RubricRow: () => <div data-testid="rubric-row" /> }));
vi.mock('./TestBundleCard', () => ({ TestBundleCard: () => <div data-testid="bundle-card" /> }));
vi.mock('./DeliverableLanguages', () => ({ DeliverableLanguages: () => <div data-testid="deliverable-languages" /> }));

const rubric: Rubric = {
  id: 'ru-1', teacherId: 't', name: 'CTDL', version: 2, isActive: true, totalPoints: 10,
  criteria: [{ id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 10 }],
};

const session = (over: Partial<SessionOverviewItem> = {}) =>
  ({
    id: 's1', name: 'Giữa kỳ N01', rubricId: 'ru-1', rubricVersion: 2,
    fullySubmittedCount: 30, partialCount: 2, attendedNoSubmissionCount: 0, neverAttendedCount: 0, ...over,
  }) as SessionOverviewItem;

const detail = (over: Record<string, unknown> = {}) => ({
  data: { testBundleId: null, requiredDeliverables: [{ id: 'd1', requiredFilename: 'bai.pdf', deliverableType: 'document', entries: [], language: null, pipeline: 'one_shot' }], ...over },
});

beforeEach(() => {
  h.start.mockReset();
  h.startState = { isPending: false, isError: false, isSuccess: false, error: null, data: undefined };
  h.rubrics = { data: [rubric] };
  h.readiness = { data: { level: 'with_model_answer', warning: null, hasQuestion: true, hasModelAnswer: true } };
  h.detail = detail();
  h.overview = { data: [overview({ rubricName: 'CTDL', criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 10, errorCount: 1 })] })] };
  h.bundles = { data: [] };
});

const startButton = () => screen.getByRole('button', { name: /^Bắt đầu chấm/ });
const renderPanel = (over: Partial<SessionOverviewItem> = {}, extra: Partial<React.ComponentProps<typeof PreparePanel>> = {}) =>
  render(<PreparePanel sessionId="s1" session={session(over)} {...extra} />);

describe('PreparePanel — start button (spec §3.7)', () => {
  it('a prepared session: the button carries the number of results and starting sends ONE request', () => {
    renderPanel();
    expect(startButton()).toHaveTextContent('Bắt đầu chấm 32 bài');
    expect(startButton()).toBeEnabled();
    fireEvent.click(startButton());
    expect(h.start).toHaveBeenCalledTimes(1);
  });

  it('tells ReferenceForm whether the session already has a pinned test bundle', () => {
    const { unmount } = renderPanel();
    expect(screen.getByRole('button', { name: 'mô phỏng thay đổi chưa lưu' })).toHaveAttribute('data-pinned', 'false');
    unmount();

    h.detail = detail({ testBundleId: 'b1' });
    renderPanel();
    expect(screen.getByRole('button', { name: 'mô phỏng thay đổi chưa lưu' })).toHaveAttribute('data-pinned', 'true');
  });

  it('says the consequence right under it: documents and ceilings lock, closing the page does not stop grading', () => {
    renderPanel();
    expect(screen.getByText(/tài liệu chấm và rubric khoá lại/)).toBeInTheDocument();
    expect(screen.getByText(/đóng trang không dừng việc chấm/)).toBeInTheDocument();
  });

  // Review Focus 2 / T-UI-11: starting locks the session for good, so a blocked start must send NOTHING.
  describe.each([
    ['no rubric pinned', () => { h.rubrics = { data: [rubric] }; }, { rubricId: null } as Partial<SessionOverviewItem>, /chưa gắn rubric/],
    ['no question chosen', () => { h.readiness = { data: { level: 'rubric_only', warning: null, hasQuestion: false, hasModelAnswer: false } }; }, {}, /Chưa chọn đề bài/],
    ['nothing collected', () => {}, { fullySubmittedCount: 0, partialCount: 0 }, /Chưa có bài nào đã thu/],
    ['code without a pinned bundle', () => { h.detail = detail({ requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: 'python', pipeline: 'investigator' }] }); }, {}, /khối "Gói test"/],
  ])('blocked: %s', (_name, arrange, sessionOver, reasonText) => {
    beforeEach(() => arrange());

    it('the button is disabled, the reason is written beside it, and no start request is sent', () => {
      renderPanel(sessionOver);
      expect(startButton()).toBeDisabled();
      expect(screen.getByTestId('start-reason')).toHaveTextContent(reasonText);
      fireEvent.click(startButton());
      expect(h.start).not.toHaveBeenCalled();
    });
  });

  it('a code session with a pinned bundle can start', () => {
    h.detail = detail({ testBundleId: 'b1', requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: 'python', pipeline: 'investigator' }] });
    h.bundles = { data: [{ id: 'b1', version: 1, approvedAt: '2026-09-29T00:00:00Z', caseCount: 22 }] };
    renderPanel();
    expect(startButton()).toBeEnabled();
  });

  it('shows the language picker for a session with a code deliverable', () => {
    h.detail = detail({ requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: null, pipeline: 'one_shot' }] });
    renderPanel();
    expect(screen.getByTestId('deliverable-languages')).toBeInTheDocument();
  });

  // The server demands a pinned bundle only for investigator-path submissions (start-grading-test-bundle-guard).
  it('a code deliverable graded by reading does NOT block starting for want of a bundle', () => {
    h.detail = detail({ requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: 'java', pipeline: 'one_shot' }] });
    renderPanel();
    expect(startButton()).toBeEnabled();
  });

  it('unsaved reference changes block it — "Lưu tài liệu trước" — until saved', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'mô phỏng thay đổi chưa lưu' }));
    expect(startButton()).toBeDisabled();
    expect(screen.getByTestId('start-reason')).toHaveTextContent('Lưu tài liệu chấm');
    fireEvent.click(startButton());
    expect(h.start).not.toHaveBeenCalled();
  });

  it('cảnh báo (lỗi chưa có điểm trừ, tiêu chí chưa có lỗi) KHÔNG chặn — chỉ nói trước khi bắt đầu', () => {
    h.overview = {
      data: [overview({ rubricName: 'CTDL', unpricedCount: 1, errorCount: 1, criteria: [criterion({ key: 'tinh_dung', description: 'Tính đúng', maxPoints: 10, errorCount: 0 })] })],
    };
    renderPanel();
    expect(startButton()).toBeEnabled();
    expect(screen.getByText(/1 lỗi chưa có điểm trừ/)).toBeInTheDocument();
    expect(screen.getByText(/Tính đúng chưa có lỗi nào/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Mở Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules?rubric=CTDL');
  });

  it('reads the result of starting back, and shows a refusal verbatim', () => {
    h.startState = { isPending: false, isError: false, isSuccess: true, error: null, data: { queued: 32, alreadyGraded: 0, rubricVersion: 2 } };
    const { unmount } = renderPanel();
    expect(screen.getByRole('status')).toHaveTextContent('Đã xếp 32 bài vào hàng đợi chấm (rubric phiên bản 2)');
    unmount();
    h.startState = { isPending: false, isError: true, isSuccess: false, error: new Error('Phiên này có bài chấm bằng đường điều tra nhưng chưa ghim gói test'), data: undefined };
    renderPanel();
    expect(screen.getByRole('alert')).toHaveTextContent('chưa ghim gói test');
  });
});

describe('PreparePanel — the column "Trước khi bắt đầu"', () => {
  it('shows every row with its state in words, not only an icon', () => {
    renderPanel();
    const list = screen.getByRole('list', { name: 'Trước khi bắt đầu' });
    expect(within(list).getAllByText('Ổn').length).toBeGreaterThan(0);
    expect(within(list).getByText('Rubric')).toBeInTheDocument();
    expect(within(list).getByText('CTDL — phiên bản 2, 10,0 điểm, 1 tiêu chí')).toBeInTheDocument();
  });

  it('marks blockers as "Chặn"', () => {
    renderPanel({ rubricId: null });
    expect(within(screen.getByRole('list', { name: 'Trước khi bắt đầu' })).getByText('Chặn')).toBeInTheDocument();
  });
});

describe('PreparePanel — blocks and controls that need the backend (T-UI-10)', () => {
  it('the bundle block appears only for a session with a code deliverable', () => {
    renderPanel();
    expect(screen.queryByTestId('bundle-card')).not.toBeInTheDocument();
    h.detail = detail({ requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: 'python', pipeline: 'investigator' }] });
    renderPanel();
    expect(screen.getByTestId('bundle-card')).toBeInTheDocument();
  });

  it('generating the model answer / test bundle is disabled + "cần backend" and sends nothing', () => {
    h.detail = detail({ requiredDeliverables: [{ id: 'd', requiredFilename: 'a.zip', deliverableType: 'code_project', entries: [], language: 'python', pipeline: 'investigator' }] });
    renderPanel();
    for (const name of [/Sinh đáp án mẫu và gói test từ đề/, /Sinh gói test từ đáp án của bạn/, /Chạy thử đáp án mẫu với gói test/]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      fireEvent.click(button);
    }
    expect(h.start).not.toHaveBeenCalled();
  });

  it('shows the reopen banner when every result was "không chấm được"', () => {
    renderPanel({}, { allUngradable: true });
    expect(screen.getByRole('status')).toHaveTextContent('Mọi bài đều không chấm được');
  });
});
