import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DiagnosedErrorList } from './DiagnosedErrorList';
import type { ResultDetail, ResultDetailError } from '@/lib/api/grading';

function error(over: Partial<ResultDetailError> = {}): ResultDetailError {
  return {
    ruleId: 'r1',
    ruleKey: 'sai_ca_co_ban',
    ruleName: 'Sai ca cơ bản',
    criterionKey: 'tinh_dung',
    source: 'llm_with_tools',
    toolCallIds: [],
    deductionHundredths: 100,
    counted: 'counted',
    ...over,
  };
}

function breakdown(over: Partial<NonNullable<ResultDetail['breakdown']>> = {}): NonNullable<ResultDetail['breakdown']> {
  return {
    errors: [error()],
    perCriterion: [],
    errorFlags: [],
    confidence: 0.9,
    mismatchedRules: [],
    notConsidered: [],
    ...over,
  };
}

describe('DiagnosedErrorList', () => {
  it('đếm đúng số lỗi trong tiêu đề', () => {
    render(<DiagnosedErrorList breakdown={breakdown({ errors: [error(), error({ ruleId: 'r2' })] })} />);
    expect(screen.getByText(/Lỗi chẩn đoán \(2\)/)).toBeInTheDocument();
  });

  it('hiện đúng nhãn nguồn gốc theo source', () => {
    render(<DiagnosedErrorList breakdown={breakdown({ errors: [error({ source: 'deterministic' })] })} />);
    expect(screen.getByText('Máy quyết')).toBeInTheDocument();
  });

  it('counted="excluded" → badge "Đã bỏ cho bài này"', () => {
    render(<DiagnosedErrorList breakdown={breakdown({ errors: [error({ counted: 'excluded' })] })} />);
    expect(screen.getByText(/đã bỏ cho bài này/i)).toBeInTheDocument();
  });

  it('errorFlag code="unpriced" → badge "chưa có giá"', () => {
    render(<DiagnosedErrorList breakdown={breakdown({ errorFlags: [{ ruleKey: 'sai_ca_co_ban', code: 'unpriced' }] })} />);
    expect(screen.getByText(/chưa có giá/i)).toBeInTheDocument();
  });

  it('lỗi counted="refuted" → badge "Bị bác bỏ (phản biện)", KHÔNG hiện badge "Đã bỏ cho bài này"', () => {
    render(
      <DiagnosedErrorList
        breakdown={breakdown({
          errors: [error({ counted: 'refuted' })],
          errorFlags: [{ ruleKey: 'sai_ca_co_ban', code: 'refuted' }],
        })}
      />,
    );
    expect(screen.getByText(/bị bác bỏ/i)).toBeInTheDocument();
    expect(screen.queryByText(/đã bỏ cho bài này/i)).not.toBeInTheDocument();
  });

  it('errorFlag code="unverified" → badge "Chưa xác minh"', () => {
    render(
      <DiagnosedErrorList
        breakdown={breakdown({ errorFlags: [{ ruleKey: 'sai_ca_co_ban', code: 'unverified' }] })}
      />,
    );
    expect(screen.getByText(/chưa xác minh/i)).toBeInTheDocument();
  });

  it('W9 — MỘT lỗi vừa có cờ "unpriced" vừa có cờ "unverified" → hiện CẢ HAI badge, không mất cái nào', () => {
    render(
      <DiagnosedErrorList
        breakdown={breakdown({
          errorFlags: [
            { ruleKey: 'sai_ca_co_ban', code: 'unpriced' },
            { ruleKey: 'sai_ca_co_ban', code: 'unverified' },
          ],
        })}
      />,
    );
    expect(screen.getByText(/chưa có giá/i)).toBeInTheDocument();
    expect(screen.getByText(/chưa xác minh/i)).toBeInTheDocument();
  });

  it('mismatchedRules > 0 → hiện ghi chú trỏ về Trang kiến thức', () => {
    render(
      <DiagnosedErrorList
        breakdown={breakdown({ mismatchedRules: [{ ruleId: 'r9', ruleKey: 'la', criterionKey: 'khong_co' }] })}
      />,
    );
    expect(screen.getByText(/Trang\s*kiến thức/i)).toBeInTheDocument();
  });
});
