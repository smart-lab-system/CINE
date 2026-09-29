import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { InvestigatorDossier } from './InvestigatorDossier';

let resultsMock = () => ({ data: [] as unknown[], isLoading: false, isError: false });
let detailMock: () => { data?: unknown; isLoading: boolean; isError?: boolean; error?: Error | null } = () => ({ data: undefined, isLoading: false });
let overviewMock = () => ({ data: [] as unknown[] });
let rubricsMock = () => ({ data: [] as unknown[] });
const manualMutate = vi.fn();

vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => resultsMock(),
  useResultInvestigation: () => detailMock(),
  useRubrics: () => rubricsMock(),
  useSubmissionText: () => ({ data: undefined, isLoading: true }),
  useSetManualScore: () => ({ mutate: manualMutate, isPending: false, isError: false, error: null }),
  useSetErrorException: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock('@/hooks/useSubmissionOverview', () => ({ useSessionOverview: () => overviewMock() }));

const baseResult = {
  id: 'r1', studentMssv: 'SV1', studentName: 'A', status: 'flagged_for_review',
  ungradableReason: null, pipeline: 'investigator' as const, currentScore: 6, currentScoreSource: 'computation',
};

describe('InvestigatorDossier', () => {
  it('shows a neutral loading state while the result is still grading (Review Focus #4) — never crashes on a null breakdown', () => {
    resultsMock = () => ({ data: [{ ...baseResult, status: 'ai_grading' }], isLoading: false, isError: false });
    detailMock = () => ({
      data: { pipeline: 'investigator', currentScore: null, currentScoreSource: 'none', status: 'ai_grading', ungradableClass: null, ungradableReason: null, breakdown: null, investigation: null, challengeNotes: [], challengeVerdicts: [] },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText(/chưa có dữ liệu để hiện/i)).toBeInTheDocument();
  });

  it('renders the Ungradable view when ungradableClass is set', () => {
    resultsMock = () => ({ data: [{ ...baseResult, ungradableReason: 'x' }], isLoading: false, isError: false });
    detailMock = () => ({
      data: { pipeline: 'investigator', currentScore: null, currentScoreSource: 'none', status: 'flagged_for_review', ungradableClass: 'system', ungradableReason: 'x', breakdown: null, investigation: { summary: 's', investigation: { toolCalls: [] } }, challengeNotes: [], challengeVerdicts: [] },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText(/chưa có điểm nào cho bài này/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Chấm lại bài này/ })).toBeDisabled();
  });

  it('renders the full dossier for a normal flagged result', () => {
    resultsMock = () => ({ data: [baseResult], isLoading: false, isError: false });
    detailMock = () => ({
      data: {
        pipeline: 'investigator', currentScore: 6, currentScoreSource: 'computation', status: 'flagged_for_review',
        ungradableClass: null, ungradableReason: null,
        breakdown: {
          errors: [{ ruleId: 'rule-1', ruleKey: 'sai_bien', ruleName: 'Sai biên', criterionKey: 'tinh_dung', source: 'deterministic', toolCallIds: [], deductionHundredths: 150, counted: 'counted' }],
          perCriterion: [{ key: 'tinh_dung', maxHundredths: 1000, deductedHundredths: 150, capped: false }],
          caseFlags: [], errorFlags: [], confidence: 0.9, mismatchedRules: [], notConsidered: [], ungradable: null,
        },
        investigation: { summary: 'x', verdict: { errors: [] }, replay: null, investigation: { toolCalls: [] } },
        challengeNotes: [], challengeVerdicts: [],
      },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getAllByText(/SV1/).length).toBeGreaterThan(0);
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
    expect(screen.getByText('Theo tiêu chí')).toBeInTheDocument();
  });

  it('hiện ghi chú của góc kiểm cấp bài (Bỏ sót / Gian lận), kể cả khi không nghi ngờ gì (§3.5)', () => {
    resultsMock = () => ({ data: [baseResult], isLoading: false, isError: false });
    detailMock = () => ({
      data: {
        pipeline: 'investigator', currentScore: 10, currentScoreSource: 'computation', status: 'auto_approved',
        ungradableClass: null, ungradableReason: null,
        breakdown: {
          errors: [], perCriterion: [{ key: 'tinh_dung', maxHundredths: 1000, deductedHundredths: 0, capped: false }],
          caseFlags: [], errorFlags: [], confidence: 1, mismatchedRules: [], notConsidered: [], ungradable: null,
        },
        investigation: { summary: 'x', verdict: { errors: [] }, replay: null, investigation: { toolCalls: [] } },
        challengeNotes: [{ lens: 'gian_lan', suspected: false, note: 'đã thử 12 input ngoài gói test' }],
        challengeVerdicts: [],
      },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText(/không thấy vấn đề \(1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/đã thử 12 input ngoài gói test/)).toBeInTheDocument();
  });


  // Review I5: a failed GET /investigation used to fall into "AI đang chấm" — telling the teacher to wait
  // for something that will never arrive.
  it('shows the server error, not "AI đang chấm", when the investigation cannot be loaded', () => {
    resultsMock = () => ({ data: [baseResult], isLoading: false, isError: false });
    detailMock = () => ({ data: undefined, isLoading: false, isError: true, error: new Error('Bạn không có quyền xem bài này') });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText(/Bạn không có quyền xem bài này/)).toBeInTheDocument();
    expect(screen.queryByText(/AI đang chấm/)).not.toBeInTheDocument();
  });

  // Review I2: setManualScore never clears ungradable_class, so after a hand-graded "không chấm được" result
  // the page kept saying "— chưa có điểm nào cho bài này" right under a "Đã duyệt" pill.
  describe('an ungradable result the teacher has since graded by hand', () => {
    const manualDetail = {
      data: {
        pipeline: 'investigator', currentScore: 7, currentScoreSource: 'manual', status: 'teacher_reviewed',
        ungradableClass: 'submission', ungradableReason: 'Bài nộp là file rỗng',
        breakdown: null,
        investigation: { summary: 's', investigation: { toolCalls: [] } },
        challengeNotes: [], challengeVerdicts: [],
      },
      isLoading: false, isError: false, error: null,
    };

    it('shows the hand-graded score, not "chưa có điểm nào"', () => {
      resultsMock = () => ({ data: [{ ...baseResult, status: 'teacher_reviewed' }], isLoading: false, isError: false });
      detailMock = () => manualDetail as never;
      render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      expect(screen.getByText('Điểm — do bạn chấm tay')).toBeInTheDocument();
      expect(screen.getByText('7,0')).toBeInTheDocument();
      expect(screen.queryByText(/chưa có điểm nào cho bài này/)).not.toBeInTheDocument();
    });

    it('still says why the system could not grade it, so the hand grade is not mistaken for an automatic one', () => {
      resultsMock = () => ({ data: [{ ...baseResult, status: 'teacher_reviewed' }], isLoading: false, isError: false });
      detailMock = () => manualDetail as never;
      render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      expect(screen.getByText(/Hệ thống không tự chấm được bài này/)).toBeInTheDocument();
      expect(screen.getByText(/Bài nộp là file rỗng/)).toBeInTheDocument();
    });

    it('opens the manual dialog pre-filled with the score already given', () => {
      resultsMock = () => ({ data: [{ ...baseResult, status: 'teacher_reviewed' }], isLoading: false, isError: false });
      detailMock = () => manualDetail as never;
      render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      fireEvent.click(screen.getByRole('button', { name: 'Chấm tay bài này' }));
      expect(screen.getByLabelText(/Điểm/i)).toHaveValue('7');
    });
  });

  // Review I6: the ceiling came from `find(r => r.version === session.rubricVersion)` — every rubric starts at
  // v1, so a 10-point session could be checked against a 5-point rubric and a valid score refused.
  describe('the score ceiling belongs to the rubric pinned to this session', () => {
    const detailFlagged = {
      data: {
        pipeline: 'investigator', currentScore: 6, currentScoreSource: 'computation', status: 'flagged_for_review',
        ungradableClass: null, ungradableReason: null,
        breakdown: { errors: [], perCriterion: [], caseFlags: [], errorFlags: [], confidence: 1, mismatchedRules: [], notConsidered: [], ungradable: null },
        investigation: null, challengeNotes: [], challengeVerdicts: [],
      },
      isLoading: false, isError: false, error: null,
    };
    const setup = () => {
      resultsMock = () => ({ data: [baseResult], isLoading: false, isError: false });
      detailMock = () => detailFlagged as never;
      manualMutate.mockClear();
    };
    const enter = (value: string) => {
      fireEvent.click(screen.getByRole('button', { name: 'Chấm tay bài này' }));
      fireEvent.change(screen.getByLabelText(/Điểm/i), { target: { value } });
      fireEvent.click(screen.getByRole('button', { name: 'Chấm tay' }));
    };

    it('picks the rubric by id, not by version', () => {
      setup();
      overviewMock = () => ({ data: [{ id: 's1', name: 'GK', roomName: 'B2', rubricId: 'rubric-b', rubricVersion: 1 }] });
      rubricsMock = () => ({ data: [
        { id: 'rubric-a', version: 1, totalPoints: 5 },
        { id: 'rubric-b', version: 1, totalPoints: 10 },
      ] });
      render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      enter('8');
      expect(manualMutate).toHaveBeenCalledWith({ resultId: 'r1', score: '8' }, expect.anything());
    });

    it('does not guess a ceiling while the session or its rubric is unknown — the server checks it', () => {
      setup();
      overviewMock = () => ({ data: [] });
      rubricsMock = () => ({ data: [] });
      render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
      enter('15');
      expect(manualMutate).toHaveBeenCalledWith({ resultId: 'r1', score: '15' }, expect.anything());
    });
  });

  // Review Focus #6 at page level (nothing pinned this before): "dưới sàn" = the investigation RAN but grading
  // refused a number; it is NOT "không chấm được" (nothing ran). Branching on breakdown.ungradable instead of
  // ungradableClass would tell the teacher the environment is broken when it is not.
  it('a below-floor result (breakdown.ungradable, no ungradableClass) shows the floor reason, not the "không chấm được" screen', () => {
    resultsMock = () => ({ data: [baseResult], isLoading: false, isError: false });
    detailMock = () => ({
      data: {
        pipeline: 'investigator', currentScore: null, currentScoreSource: 'none', status: 'flagged_for_review',
        ungradableClass: null, ungradableReason: null,
        breakdown: {
          errors: [], perCriterion: [], caseFlags: [], errorFlags: [], confidence: 0, mismatchedRules: [], notConsidered: [],
          ungradable: { class: 'submission', reason: 'Tiêu chí "hieu_nang" chưa có luật nào — không tự quyết được.' },
        },
        investigation: { summary: 's', verdict: { errors: [] }, replay: null, investigation: { toolCalls: [] } },
        challengeNotes: [], challengeVerdicts: [],
      },
      isLoading: false,
    });
    render(<InvestigatorDossier resultId="r1" sessionId="s1" />);
    expect(screen.getByText(/hieu_nang.*chưa có luật nào/)).toBeInTheDocument();
    expect(screen.queryByText(/chưa có điểm nào cho bài này/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Chấm lại bài này/ })).not.toBeInTheDocument();
  });

  it('shows "not found" when the result is missing from the session list', () => {
    resultsMock = () => ({ data: [], isLoading: false, isError: false });
    detailMock = () => ({ data: undefined, isLoading: false, isError: false, error: null });
    render(<InvestigatorDossier resultId="missing" sessionId="s1" />);
    expect(screen.getByText(/Không tìm thấy bài này/)).toBeInTheDocument();
  });
});
