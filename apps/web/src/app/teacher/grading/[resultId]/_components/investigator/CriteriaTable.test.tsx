import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { CriteriaTable } from './CriteriaTable';

describe('CriteriaTable', () => {
  it('shows trần/bị trừ/còn and a "chạm trần" note, plus the total row', () => {
    render(
      <CriteriaTable
        perCriterion={[
          { key: 'tinh_dung', maxHundredths: 400, deductedHundredths: 150, capped: false },
          { key: 'hieu_nang', maxHundredths: 100, deductedHundredths: 100, capped: true },
        ]}
      />,
    );
    expect(screen.getByText('tinh_dung')).toBeInTheDocument();
    expect(screen.getByText(/chạm trần/)).toBeInTheDocument();
    // "2,5" also legitimately appears in the tinh_dung row (400-150) — assert on the TOTAL row only.
    const totalRow = screen.getByText('Tổng').closest('tr')!;
    expect(within(totalRow).getByText('2,5')).toBeInTheDocument(); // (400+100-150-100)/100
    expect(within(totalRow).getByText('−2,5')).toBeInTheDocument(); // deducted 150+100
  });
});
