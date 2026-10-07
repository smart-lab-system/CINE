import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  parsePage,
  parsePageSize,
  paginationQueryPatch,
  totalPages,
} from './list-pagination';

describe('list-pagination helpers', () => {
  it('parsePageSize accepts only 30/50/100', () => {
    expect(parsePageSize('30')).toBe(30);
    expect(parsePageSize('50')).toBe(50);
    expect(parsePageSize('100')).toBe(100);
    expect(parsePageSize('20')).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize('99')).toBe(DEFAULT_PAGE_SIZE);
    expect(parsePageSize(null)).toBe(DEFAULT_PAGE_SIZE);
  });

  it('parsePage requires integer ≥ 1', () => {
    expect(parsePage('3')).toBe(3);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-1')).toBe(1);
    expect(parsePage('1.5')).toBe(1);
    expect(parsePage(undefined)).toBe(1);
  });

  it('totalPages is at least 1', () => {
    expect(totalPages(0, 30)).toBe(1);
    expect(totalPages(30, 30)).toBe(1);
    expect(totalPages(31, 30)).toBe(2);
  });

  it('paginationQueryPatch omits defaults', () => {
    expect(paginationQueryPatch(1, 30)).toEqual({ page: null, pageSize: null });
    expect(paginationQueryPatch(2, 50)).toEqual({ page: '2', pageSize: '50' });
  });
});
