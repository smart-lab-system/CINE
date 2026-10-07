import { describe, expect, it } from 'vitest';
import {
  academicYearNameFromCode,
  cohortYearBounds,
  nominalClassNameFromCode,
  semesterNameFromCodeAndYear,
} from './master-data-defaults';

describe('master-data-defaults', () => {
  it('builds academic year name from code', () => {
    expect(academicYearNameFromCode('2026-2027')).toBe('Năm học 2026-2027');
    expect(academicYearNameFromCode('  ')).toBe('');
  });

  it('builds semester name from code and year', () => {
    expect(semesterNameFromCodeAndYear('HK1', '2026-2027')).toBe(
      'Học kỳ 1 năm học 2026-2027',
    );
    expect(semesterNameFromCodeAndYear('HE', undefined)).toBe('Học kỳ hè');
  });

  it('builds nominal class name from code', () => {
    expect(nominalClassNameFromCode('D21CQCN01')).toBe('Lớp D21CQCN01');
  });

  it('bounds cohort year from 2000 to current+1', () => {
    const { min, max } = cohortYearBounds(new Date('2026-10-07'));
    expect(min).toBe(2000);
    expect(max).toBe(2027);
  });
});
