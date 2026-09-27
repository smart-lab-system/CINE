import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import ResultInvestigationPage from './page';

vi.mock('next/navigation', () => ({ useParams: () => ({ resultId: 'r1' }) }));
vi.mock('@/hooks/useGrading', () => ({
  useResultInvestigation: () => ({
    isLoading: false,
    data: {
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
    },
  }),
}));

describe('Hồ sơ một bài', () => {
  it('hiện điểm hiện tại, lỗi chưa có giá, và đường điều tra', () => {
    render(<ResultInvestigationPage />);
    expect(screen.getByText('8.5')).toBeInTheDocument();
    expect(screen.getByText('sai_bien')).toBeInTheDocument();
    expect(screen.getByText(/chưa có giá/i)).toBeInTheDocument();
    expect(screen.getByText('run_tests')).toBeInTheDocument();
    expect(screen.getByText(/một lỗi đặt tên biến/i)).toBeInTheDocument();
  });
});
