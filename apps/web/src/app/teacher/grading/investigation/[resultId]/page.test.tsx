import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ResultInvestigationPage from './page';

vi.mock('next/navigation', () => ({ useParams: () => ({ resultId: 'r1' }) }));
vi.mock('@/hooks/useGrading', () => ({
  useResultInvestigation: () => useResultInvestigationMock(),
}));

function baseData(
  over: {
    challengeNotes?: { lens: string; suspected: boolean; note: string }[];
    challengeVerdicts?: { lens: string; ruleKey: string; status: string; reason: string | null }[];
  } = {},
) {
  return {
    pipeline: 'investigator',
    currentScore: 8.5,
    currentScoreSource: 'computation',
    status: 'auto_approved',
    ungradableClass: null,
    ungradableReason: null,
    breakdown: {
      errors: [
        {
          ruleId: 'r1',
          ruleKey: 'sai_bien',
          ruleName: 'Sai ca biên',
          criterionKey: 'tinh_dung',
          source: 'deterministic',
          toolCallIds: ['tc-1'],
          deductionHundredths: 150,
          counted: 'counted',
        },
        {
          ruleId: 'r2',
          ruleKey: 'ten_bien',
          ruleName: 'Đặt tên biến',
          criterionKey: 'trinh_bay',
          source: 'llm_with_tools',
          toolCallIds: [],
          deductionHundredths: null,
          counted: 'unpriced',
        },
      ],
      perCriterion: [{ key: 'tinh_dung', maxHundredths: 600, deductedHundredths: 150, capped: false }],
      errorFlags: [{ ruleKey: 'ten_bien', code: 'unpriced' }],
      confidence: 0.8,
      mismatchedRules: [],
      notConsidered: [],
    },
    investigation: {
      kind: 'verdict',
      summary: 'Bài chạy đủ test, một lỗi đặt tên biến.',
      flags: [],
      investigation: {
        toolCalls: [
          {
            id: 'tc-1',
            tool: 'run_tests',
            args: {},
            status: 'ok',
            output: '',
            startedAt: '',
            wallMs: 120,
            injectionSuspected: false,
          },
        ],
      },
    },
    challengeNotes: over.challengeNotes ?? [],
    challengeVerdicts: over.challengeVerdicts ?? [],
  };
}

let useResultInvestigationMock = () => ({ isLoading: false, data: baseData() });

describe('Hồ sơ một bài', () => {
  it('hiện điểm hiện tại, lỗi chưa có giá, và đường điều tra', () => {
    useResultInvestigationMock = () => ({ isLoading: false, data: baseData() });
    render(<ResultInvestigationPage />);
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
    expect(screen.getByText(/chưa có giá/i)).toBeInTheDocument();
    expect(screen.getByText('run_tests')).toBeInTheDocument();
    expect(screen.getByText(/một lỗi đặt tên biến/i)).toBeInTheDocument();
  });

  it('có ghi chú lăng kính nghi ngờ (bước 6) → hiện khối cảnh báo phản biện', () => {
    useResultInvestigationMock = () => ({
      isLoading: false,
      data: baseData({ challengeNotes: [{ lens: 'gian_lan', suspected: true, note: 'đổi input vẫn ra cùng kết quả' }] }),
    });
    render(<ResultInvestigationPage />);
    expect(screen.getByText('Gian lận')).toBeInTheDocument();
    expect(screen.getByText(/lăng kính phản biện nghi ngờ/i)).toBeInTheDocument();
  });

  it('kết luận per-error của lăng kính (bước 6) đi từ dữ liệu API xuống danh sách lỗi', () => {
    useResultInvestigationMock = () => ({
      isLoading: false,
      data: baseData({ challengeVerdicts: [{ lens: 'qua_tay', ruleKey: 'ten_bien', status: 'confirmed', reason: null }] }),
    });
    render(<ResultInvestigationPage />);
    expect(screen.getByText('Quá tay: xác nhận')).toBeInTheDocument();
  });
});
