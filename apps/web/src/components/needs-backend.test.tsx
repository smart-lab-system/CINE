import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { NeedsBackend } from './needs-backend';

describe('NeedsBackend', () => {
  it('says "cần backend" in words (colour and a dashed border are never the only signal)', () => {
    render(<NeedsBackend />);
    expect(screen.getByText('cần backend')).toBeInTheDocument();
  });

  it('accepts extra classes for spacing without losing its own', () => {
    render(<NeedsBackend className="ml-2" />);
    expect(screen.getByText('cần backend')).toHaveClass('ml-2', 'border-dashed');
  });
});
