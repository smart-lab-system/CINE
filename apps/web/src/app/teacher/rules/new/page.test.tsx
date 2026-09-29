import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import NewRulePage from './page';
import { rule } from '../_components/fixtures';
import type { Rule } from '@/lib/api/rules';

let search = '';
let missing: { data?: Rule[]; isLoading: boolean; isError: boolean; error?: Error };

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(search) }));
vi.mock('@/hooks/useRules', () => ({ useMissingRules: () => missing }));
vi.mock('../_components/RuleForm', () => ({
  RuleForm: ({ rule: r }: { rule?: Rule }) => <div data-testid="rule-form">{r ? `từ ${r.id}` : 'form trống'}</div>,
}));

const proposed = rule({ id: 'p1', state: 'proposed', origin: 'agent_reported', deduction: null });

beforeEach(() => {
  search = '';
  missing = { data: [proposed], isLoading: false, isError: false };
});

describe('/teacher/rules/new', () => {
  it('opens a blank form when there is no ?from', () => {
    render(<NewRulePage />);
    expect(screen.getByTestId('rule-form')).toHaveTextContent('form trống');
  });

  it('?from=<id> opens the form prefilled from the rule the agent reported', () => {
    search = 'from=p1';
    render(<NewRulePage />);
    expect(screen.getByTestId('rule-form')).toHaveTextContent('từ p1');
  });

  it('waits for the list of missing rules instead of flashing a blank form the teacher might fill in', () => {
    search = 'from=p1';
    missing = { isLoading: true, isError: false };
    render(<NewRulePage />);
    expect(screen.queryByTestId('rule-form')).not.toBeInTheDocument();
    expect(screen.getByText('Đang tải…')).toBeInTheDocument();
  });

  it('says so — with a way out — when the reported rule is gone (already handled)', () => {
    search = 'from=zzz';
    render(<NewRulePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy luật agent đề xuất này');
    expect(screen.getByRole('link', { name: 'Tạo luật mới từ đầu' })).toHaveAttribute('href', '/teacher/rules/new');
    expect(screen.queryByTestId('rule-form')).not.toBeInTheDocument();
  });

  it('shows a load failure instead of pretending the rule does not exist', () => {
    search = 'from=p1';
    missing = { isLoading: false, isError: true, error: new Error('Mất kết nối') };
    render(<NewRulePage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Mất kết nối');
  });

  // Activating the rule removes it from "Luật còn thiếu"; the refetch must not swap the form (and the
  // "Đã lưu" message inside it) for a "not found" alert.
  it('keeps the form mounted after saving makes the rule drop out of the missing list', () => {
    search = 'from=p1';
    const { rerender } = render(<NewRulePage />);
    expect(screen.getByTestId('rule-form')).toHaveTextContent('từ p1');
    missing = { data: [], isLoading: false, isError: false };
    rerender(<NewRulePage />);
    expect(screen.getByTestId('rule-form')).toHaveTextContent('từ p1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
