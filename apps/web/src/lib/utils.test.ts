import { describe, expect, it } from 'vitest';
import tailwindConfig from '../../tailwind.config';
import { cn } from './utils';

describe('cn', () => {
  it('keeps a named font size when a text colour follows it (what Button and Badge rely on)', () => {
    expect(cn('text-caption font-semibold text-success-strong')).toBe('text-caption font-semibold text-success-strong');
    expect(cn('text-body bg-accent-strong text-accent-foreground')).toBe('text-body bg-accent-strong text-accent-foreground');
  });

  it('still lets a later named size replace an earlier one', () => {
    expect(cn('h-8 text-body', 'text-small')).toBe('h-8 text-small');
  });

  it('still lets a later colour replace an earlier colour', () => {
    expect(cn('text-foreground', 'text-muted-foreground')).toBe('text-muted-foreground');
  });

  it('treats a named size and a stock size as the same property', () => {
    expect(cn('text-small', 'text-lg')).toBe('text-lg');
    expect(cn('text-lg', 'text-small')).toBe('text-small');
  });

  it('a named size does not strip an earlier leading-* (CardTitle keeps its leading-none when a caller picks text-h3)', () => {
    expect(cn('text-h2 leading-none', 'text-h3')).toBe('leading-none text-h3');
    // Cỡ chữ GỐC của Tailwind thì giữ nguyên hành vi cũ của tailwind-merge: nó mang line-height theo nên gỡ leading-*.
    expect(cn('text-h2 leading-none', 'text-base')).toBe('text-base');
  });

  // Guard against drift: add a size to tailwind.config.ts without teaching cn() about it and this goes red.
  it('every size named in tailwind.config.ts is known to the merge', () => {
    const sizes = Object.keys(tailwindConfig.theme?.extend?.fontSize ?? {});
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(cn(`text-${size}`, 'text-foreground')).toBe(`text-${size} text-foreground`);
    }
  });
});
