import { describe, expect, it } from 'vitest';
import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from './datetime-local';

describe('datetime-local helpers', () => {
  it('round-trips an ISO timestamp through a datetime-local value', () => {
    const iso = '2026-08-27T08:00:00.000Z';
    const local = toDatetimeLocalValue(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromDatetimeLocalValue(local)).toBe(new Date(local).toISOString());
  });

  it('returns an empty string for missing or invalid input', () => {
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue('not-a-date')).toBe('');
  });
});
