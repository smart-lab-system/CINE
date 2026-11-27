import { describe, expect, it } from 'vitest';
import type { GradingProgress } from '@/lib/api/grading';
import { isStuck, stuckCountOf } from './stuck';

const progress = (over: Partial<GradingProgress> = {}): GradingProgress => ({
  total: 10, pending: 3, done: 7, byStatus: { ai_grading: 3 }, queue: { waiting: 0, active: 0, failed: 0 }, ...over,
});

describe('isStuck / stuckCountOf', () => {
  it('pending work with a dead queue is stuck, counted by ai_grading', () => {
    expect(isStuck(progress(), true, null)).toBe(true);
    expect(stuckCountOf(progress(), true, null)).toBe(3);
  });

  it('falls back to the pending count when the status breakdown has no ai_grading entry', () => {
    expect(stuckCountOf(progress({ byStatus: {} }), true, null)).toBe(3);
  });

  it('is not stuck while the queue has an active or waiting job', () => {
    expect(isStuck(progress({ queue: { waiting: 0, active: 1, failed: 0 } }), true, null)).toBe(false);
    expect(isStuck(progress({ queue: { waiting: 5, active: 0, failed: 0 } }), true, null)).toBe(false);
    expect(stuckCountOf(progress({ queue: { waiting: 5, active: 0, failed: 0 } }), true, null)).toBe(0);
  });

  it('is not stuck when nothing is pending', () => {
    expect(isStuck(progress({ pending: 0 }), true, null)).toBe(false);
  });

  it('cannot tell while offline or while the server is not answering', () => {
    expect(isStuck(progress(), false, null)).toBe(false);
    expect(isStuck(progress(), true, new Error('Failed to fetch'))).toBe(false);
  });
});
