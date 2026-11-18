import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WizardStepper } from './WizardStepper';

const items = () => within(screen.getByRole('list', { name: 'Các bước' })).getAllByRole('listitem');

describe('WizardStepper', () => {
  it('names all three steps and marks only the current one', () => {
    render(<WizardStepper step={2} />);
    expect(items()).toHaveLength(3);
    expect(items()[0]).toHaveTextContent('Tải file');
    expect(items()[1]).toHaveTextContent('Chọn cột');
    expect(items()[2]).toHaveTextContent('Xem trước và ghi');
    expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent('Chọn cột');
  });

  it('tells a screen reader which steps are already done, not by colour alone', () => {
    render(<WizardStepper step={3} />);
    expect(items()[0]).toHaveTextContent('Tải file (đã xong)');
    expect(items()[1]).toHaveTextContent('Chọn cột (đã xong)');
    expect(items()[2]).not.toHaveTextContent('đã xong');
    expect(items().map((li) => li.getAttribute('data-state'))).toEqual(['done', 'done', 'current']);
  });

  it('at step 1 nothing is done and the later steps are still to do', () => {
    render(<WizardStepper step={1} />);
    expect(items().map((li) => li.getAttribute('data-state'))).toEqual(['current', 'todo', 'todo']);
    expect(screen.getByRole('list', { name: 'Các bước' })).not.toHaveTextContent('đã xong');
  });

  it('on a narrow screen the other steps keep their names for a screen reader (sr-only, not display:none)', () => {
    render(<WizardStepper step={2} />);
    const label = (li: HTMLElement) => li.querySelectorAll('span')[1]!;
    expect(label(items()[0]!)).toHaveClass('max-sm:sr-only');
    expect(label(items()[2]!)).toHaveClass('max-sm:sr-only');
    expect(label(items()[1]!)).not.toHaveClass('max-sm:sr-only');
    expect(label(items()[0]!)).not.toHaveClass('hidden');
  });
});
