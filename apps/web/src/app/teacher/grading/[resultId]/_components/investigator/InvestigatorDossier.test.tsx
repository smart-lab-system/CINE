import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { InvestigatorDossier } from './InvestigatorDossier';

let resultsMock = () => ({ data: [] as unknown[], isLoading: false, isError: false });
let detailMock = () => ({ data: undefined as unknown, isLoading: false });
const overviewMock = () => ({ data: [] as unknown[] });
const rubricsMock = () => ({ data: [] as unknown[] });

vi.mock('@/hooks/useGrading', () => ({
  useGradingResults: () => resultsMock(),
  useResultInvestigation: () => detailMock(),
  useRubrics: () => rubricsMock(),
  useSubmissionText: () => ({ data: undefined, isLoading: true }),
  useSetManualScore: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
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

  it('shows "not found" when the result is missing from the session list', () => {
    resultsMock = () => ({ data: [], isLoading: false, isError: false });
    detailMock = () => ({ data: undefined, isLoading: false });
    render(<InvestigatorDossier resultId="missing" sessionId="s1" />);
    expect(screen.getByText(/Không tìm thấy bài này/)).toBeInTheDocument();
  });
});
