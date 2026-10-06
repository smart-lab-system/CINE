import { describe, expect, it } from 'vitest';
import type { AdminClass } from '@/lib/api/admin-classes';
import {
  EMPTY_CLASS_FORM,
  EMPTY_ROOM_FORM,
  EMPTY_SEMESTER_FORM,
  classCreateBody,
  classFormComplete,
  classFormOf,
  classUpdateBody,
  roomCreatePayload,
  roomFormOf,
  roomUpdatePayload,
  semesterFormComplete,
  semesterFormOf,
  semesterPayload,
  semesterTextOf,
} from './master-data-forms';

describe('học kỳ', () => {
  it('form rỗng chưa đủ; đủ năm/kỳ/hai ngày thì đủ', () => {
    expect(semesterFormComplete(EMPTY_SEMESTER_FORM)).toBe(false);
    expect(
      semesterFormComplete({ academicYearStart: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' }),
    ).toBe(true);
  });

  it('năm phải đủ 4 chữ số, kỳ phải là 1–3', () => {
    const base = { academicYearStart: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' };
    expect(semesterFormComplete({ ...base, academicYearStart: '26' })).toBe(false);
    expect(semesterFormComplete({ ...base, term: '4' })).toBe(false);
  });

  it('thân là số thật, ngày giữ yyyy-mm-dd', () => {
    expect(
      semesterPayload({ academicYearStart: '2026', term: '2', startDate: '2027-02-01', endDate: '2027-05-31' }),
    ).toEqual({ academicYearStart: 2026, term: 2, startDate: '2027-02-01', endDate: '2027-05-31' });
  });

  it('form từ học kỳ có sẵn: ngày được cắt về yyyy-mm-dd cho ô <input type="date">', () => {
    expect(
      semesterFormOf({
        id: 's1',
        academicYearStart: 2026,
        term: 1,
        label: 'HK1 2026-2027',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2027-01-31',
      }),
    ).toEqual({ academicYearStart: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' });
  });
});

describe('phòng (Review Focus 4)', () => {
  it('THÊM: sức chứa trống thì bỏ khỏi thân (chưa biết sức chứa không chặn việc ghi nhận phòng)', () => {
    expect(roomCreatePayload({ name: 'H3.03', capacity: '' })).toEqual({ name: 'H3.03' });
    expect(roomCreatePayload({ name: 'H3.03', capacity: '  ' })).toEqual({ name: 'H3.03' });
    expect(roomCreatePayload({ name: 'H3.03', capacity: '40' })).toEqual({ name: 'H3.03', capacity: 40 });
  });

  it('SỬA: sức chứa trống nghĩa là XOÁ sức chứa (null), không phải "đừng đổi"', () => {
    expect(roomUpdatePayload({ name: 'H3.03', capacity: '' })).toEqual({ name: 'H3.03', capacity: null });
    expect(roomUpdatePayload({ name: 'H3.03', capacity: '45' })).toEqual({ name: 'H3.03', capacity: 45 });
  });

  it('form từ phòng có sẵn: sức chứa null thành chuỗi rỗng', () => {
    expect(roomFormOf({ id: 'r', name: 'A1', capacity: null, isActive: true })).toEqual({ name: 'A1', capacity: '' });
    expect(roomFormOf({ id: 'r', name: 'A1', capacity: 40, isActive: true })).toEqual({ name: 'A1', capacity: '40' });
    expect(EMPTY_ROOM_FORM).toEqual({ name: '', capacity: '' });
  });
});

describe('lớp', () => {
  const KLASS: AdminClass = {
    id: 'c1',
    label: 'DHKTPM18A – Nhóm 1',
    labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
    administrativeClassId: 'a1',
    administrativeClassCode: 'DHKTPM18A',
    groupName: 'Nhóm 1',
    teacherId: 't1',
    teacherName: 'GV A',
    studentCount: 40,
    sessionCount: 2,
  };

  it('đủ khi có học kỳ, lớp danh nghĩa và giảng viên; nhóm không bắt buộc', () => {
    expect(classFormComplete(EMPTY_CLASS_FORM)).toBe(false);
    expect(classFormComplete({ semesterId: 's1', administrativeClassId: 'a1', groupName: '', teacherId: '' })).toBe(false);
    expect(classFormComplete({ semesterId: 's1', administrativeClassId: 'a1', groupName: '', teacherId: 't1' })).toBe(true);
  });

  it('thân tạo: nhóm đã cắt khoảng trắng; nhóm trống thì bỏ khỏi thân', () => {
    expect(classCreateBody({ semesterId: 's1', administrativeClassId: 'a1', groupName: '  Nhóm 2 ', teacherId: 't1' })).toEqual({
      semesterId: 's1',
      administrativeClassId: 'a1',
      groupName: 'Nhóm 2',
      teacherId: 't1',
    });
    expect(classCreateBody({ semesterId: 's1', administrativeClassId: 'a1', groupName: '   ', teacherId: 't1' })).toEqual({
      semesterId: 's1',
      administrativeClassId: 'a1',
      teacherId: 't1',
    });
  });

  it('Review Focus 5: thân sửa chỉ có các trường ĐÃ ĐỔI', () => {
    expect(classUpdateBody(classFormOf(KLASS), KLASS)).toEqual({});
    expect(classUpdateBody({ ...classFormOf(KLASS), teacherId: 't2' }, KLASS)).toEqual({ teacherId: 't2' });
    expect(classUpdateBody({ ...classFormOf(KLASS), groupName: ' Nhóm 3 ' }, KLASS)).toEqual({ groupName: 'Nhóm 3' });
    expect(
      classUpdateBody({ semesterId: 's2', administrativeClassId: 'a2', groupName: 'Nhóm 1', teacherId: 't1' }, KLASS),
    ).toEqual({ semesterId: 's2', administrativeClassId: 'a2' });
  });

  it('sửa nhóm về rỗng thì gửi chuỗi rỗng (bỏ nhóm), không phải "không đổi"', () => {
    expect(classUpdateBody({ ...classFormOf(KLASS), groupName: '' }, KLASS)).toEqual({ groupName: '' });
  });

  it('lớp cũ chưa có học kỳ/lớp danh nghĩa: form rỗng ở hai ô đó cho tới khi admin chọn', () => {
    const legacy = { ...KLASS, semesterId: null, administrativeClassId: null };
    expect(classFormOf(legacy)).toEqual({ semesterId: '', administrativeClassId: '', groupName: 'Nhóm 1', teacherId: 't1' });
    expect(classFormComplete(classFormOf(legacy))).toBe(false);
  });

  it('chữ học kỳ của một dòng', () => {
    expect(semesterTextOf({ academicYear: 2026, term: 1 })).toBe('HK1 2026-2027');
    expect(semesterTextOf({ academicYear: null, term: null })).toBe('Chưa gán học kỳ');
  });
});
