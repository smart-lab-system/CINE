import { describe, expect, it } from 'vitest';
import {
  ALL,
  EMPTY_BANK_FILTERS,
  matchesBankRow,
} from './bank-picker-filters';

const ranges = [
  {
    id: 'sem-1',
    startDate: '2026-01-01',
    endDate: '2026-06-30',
    status: 'active' as const,
  },
];

describe('matchesBankRow', () => {
  const row = {
    name: 'Đề giữa kỳ CTDL',
    type: 'GK',
    createdAt: '2026-03-15T10:00:00.000Z',
    updatedAt: '2026-03-16T10:00:00.000Z',
  };

  it('lọc theo tên (không dấu)', () => {
    expect(
      matchesBankRow(row, { ...EMPTY_BANK_FILTERS, search: 'giua ky' }, ranges),
    ).toBe(true);
    expect(
      matchesBankRow(row, { ...EMPTY_BANK_FILTERS, search: 'cuoi' }, ranges),
    ).toBe(false);
  });

  it('lọc theo loại', () => {
    expect(
      matchesBankRow(row, { ...EMPTY_BANK_FILTERS, type: 'GK' }, ranges),
    ).toBe(true);
    expect(
      matchesBankRow(row, { ...EMPTY_BANK_FILTERS, type: 'CK' }, ranges),
    ).toBe(false);
  });

  it('lọc theo học kỳ suy diễn', () => {
    expect(
      matchesBankRow(
        row,
        { ...EMPTY_BANK_FILTERS, yearId: ALL, semesterId: 'sem-1' },
        ranges,
      ),
    ).toBe(true);
    expect(
      matchesBankRow(
        row,
        { ...EMPTY_BANK_FILTERS, yearId: ALL, semesterId: 'sem-x' },
        ranges,
      ),
    ).toBe(false);
  });
});
