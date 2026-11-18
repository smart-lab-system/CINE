'use client';

import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAcademicYears, useSemesters } from '@/hooks/useMasterData';
import { fold } from '@/lib/rubric-board';
import { resolveSemester, type SemesterRange } from '@/lib/resolve-semester';

export const ALL = '__all';

export type BankPickerFiltersState = {
  search: string;
  type: string;
  yearId: string;
  semesterId: string;
};

export const EMPTY_BANK_FILTERS: BankPickerFiltersState = {
  search: '',
  type: ALL,
  yearId: ALL,
  semesterId: ALL,
};

export function BankPickerFiltersBar({
  value,
  onChange,
  typeOptions,
  typeLabel = 'Loại',
}: {
  value: BankPickerFiltersState;
  onChange: (next: BankPickerFiltersState) => void;
  typeOptions: { value: string; label: string }[];
  typeLabel?: string;
}) {
  const years = useAcademicYears({ page: 1, pageSize: 50 });
  const semesters = useSemesters({
    page: 1,
    pageSize: 50,
    academicYearId: value.yearId !== ALL ? value.yearId : undefined,
  });

  const yearItems = years.data?.items ?? [];
  const semesterItems = semesters.data?.items ?? [];

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <div className="min-w-[12rem] flex-1">
        <Label htmlFor="bank-picker-search">Tìm theo tên</Label>
        <Input
          id="bank-picker-search"
          value={value.search}
          placeholder="Nhập tên…"
          onChange={(e) => onChange({ ...value, search: e.target.value })}
        />
      </div>
      <div className="w-full sm:w-40">
        <Label>{typeLabel}</Label>
        <Select
          value={value.type}
          onValueChange={(type) => onChange({ ...value, type })}
        >
          <SelectTrigger>
            <SelectValue placeholder={typeLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            {typeOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-full sm:w-44">
        <Label>Năm học</Label>
        <Select
          value={value.yearId}
          onValueChange={(yearId) =>
            onChange({ ...value, yearId, semesterId: ALL })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Năm học" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            {yearItems.map((y) => (
              <SelectItem key={y.id} value={y.id}>
                {y.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="w-full sm:w-48">
        <Label>Học kỳ</Label>
        <Select
          value={value.semesterId}
          onValueChange={(semesterId) => onChange({ ...value, semesterId })}
          disabled={value.yearId === ALL && semesterItems.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="Học kỳ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Tất cả</SelectItem>
            {semesterItems.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

export function useSemesterRanges(yearId: string): SemesterRange[] {
  const semesters = useSemesters({
    page: 1,
    pageSize: 100,
    academicYearId: yearId !== ALL ? yearId : undefined,
  });
  return useMemo(
    () =>
      (semesters.data?.items ?? []).map((s) => ({
        id: s.id,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      })),
    [semesters.data?.items],
  );
}

/** Lọc theo tên + loại + kỳ suy từ ngày tạo. */
export function matchesBankRow(
  row: {
    name: string;
    type: string;
    createdAt: string;
    updatedAt?: string;
  },
  filters: BankPickerFiltersState,
  ranges: SemesterRange[],
): boolean {
  const q = fold(filters.search.trim());
  if (q && !fold(row.name).includes(q)) return false;
  if (filters.type !== ALL && row.type !== filters.type) return false;
  if (filters.semesterId !== ALL) {
    const resolved = resolveSemester(row.createdAt, row.updatedAt ?? row.createdAt, ranges);
    if (!resolved || resolved.id !== filters.semesterId) return false;
  } else if (filters.yearId !== ALL) {
    const resolved = resolveSemester(row.createdAt, row.updatedAt ?? row.createdAt, ranges);
    if (!resolved || !ranges.some((r) => r.id === resolved.id)) return false;
  }
  return true;
}
