import { Suspense } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EditRulePage from './page';
import { rule } from '../_components/fixtures';
import type { Rule } from '@/lib/api/rules';

let rules: { data?: Rule[]; isLoading: boolean; isError: boolean; error?: Error };

vi.mock('@/hooks/useRules', () => ({ useRules: () => rules }));
vi.mock('../_components/RuleForm', () => ({
  RuleForm: ({ rule: r }: { rule?: Rule }) => <div data-testid="rule-form">{r ? `sửa ${r.id}` : 'form trống'}</div>,
}));

beforeEach(() => {
  rules = { data: [rule({ id: 'r1' }), rule({ id: 'r2' })], isLoading: false, isError: false };
});

// The page reads `params` with React's `use()` (Next 15 hands it over as a Promise), which suspends on first
// render — it needs both a Suspense boundary and an awaited `act`.
async function page(ruleId: string) {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <EditRulePage params={Promise.resolve({ ruleId })} />
      </Suspense>,
    );
  });
}

describe('/teacher/rules/[ruleId]', () => {
  it('opens the form on the rule named in the URL', async () => {
    await page('r2');
    expect(screen.getByTestId('rule-form')).toHaveTextContent('sửa r2');
  });

  it('waits for the list before deciding whether the rule exists', async () => {
    rules = { isLoading: true, isError: false };
    await page('r1');
    expect(screen.queryByTestId('rule-form')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('says the rule was not found, with a way back to Bảng lỗi', async () => {
    await page('nope');
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy luật này');
    expect(screen.getByRole('link', { name: 'Về Bảng lỗi' })).toHaveAttribute('href', '/teacher/rules');
  });

  it('shows the load error rather than "not found"', async () => {
    rules = { isLoading: false, isError: true, error: new Error('Mất kết nối') };
    await page('r1');
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Không tìm thấy');
  });
});
