import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadStudentsFromFile,
  studentsFromJson,
} from './seed-sample-data.mjs';

const ORIGINAL_CODES = [
  '24000318',
  '24000245',
  '24000402',
  '24000187',
  '24000511',
  '24000073',
  '24000360',
  '24000429',
  '24000156',
  '24000288',
  '24000334',
  '23000091',
  '23000217',
  '23000164',
  '23000305',
  '23000442',
  '25000028',
  '25000119',
  '25000076',
  '25000203',
  '22000088',
  '24000501',
];

test('maps danh_sach_sinh_vien rows to API student payloads', () => {
  assert.deepEqual(
    studentsFromJson([
      {
        ma: '24000318',
        hoTen: 'Nguyễn Hoàng Minh',
        trangThai: 'Đang học',
      },
    ]),
    [
      {
        studentCode: '24000318',
        fullName: 'Nguyễn Hoàng Minh',
        status: 'active',
      },
    ],
  );
});

test('maps trangThai to student status', () => {
  const rows = studentsFromJson([
    { ma: '24000001', hoTen: 'A', trangThai: 'đang học' },
    { ma: '24000004', hoTen: 'D', trangThai: 'Tốt nghiệp' },
  ]);
  assert.equal(rows[0].status, 'active');
  assert.equal(rows[1].status, 'graduated');
});

test('rejects statuses other than Đang học and Tốt nghiệp', () => {
  assert.throws(
    () =>
      studentsFromJson([
        { ma: '24000002', hoTen: 'B', trangThai: 'Đình chỉ' },
      ]),
    /Đang học|Tốt nghiệp/,
  );
  assert.throws(
    () =>
      studentsFromJson([
        { ma: '24000003', hoTen: 'C', trangThai: 'Bảo Lưu' },
      ]),
    /Đang học|Tốt nghiệp/,
  );
});

test('rejects ma that is not 8 digits', () => {
  assert.throws(
    () => studentsFromJson([{ ma: 'B24DCCN318', hoTen: 'A', trangThai: 'Đang học' }]),
    /8 digits/,
  );
  assert.throws(
    () => studentsFromJson([{ ma: '2400318', hoTen: 'A', trangThai: 'Đang học' }]),
    /8 digits/,
  );
});

test('loads danh_sach_sinh_vien.json into API student payloads', () => {
  const students = loadStudentsFromFile();
  assert.equal(students.length, 50);
  assert.equal(students[0].studentCode, '24000318');
  assert.equal(students[0].fullName, 'Nguyễn Hoàng Minh');
  assert.equal(students[0].status, 'active');
  assert.equal(students[0].classCode, undefined);
  assert.equal(students[0].dateOfBirth, undefined);
  assert.equal(students[0].phone, undefined);
  assert.equal(students[0].email, undefined);
  assert.equal(students[0].cohortYear, undefined);

  for (const code of ORIGINAL_CODES) {
    assert.ok(
      students.find((s) => s.studentCode === code),
      `missing original student ${code}`,
    );
  }

  const graduated = students.find((s) => s.studentCode === '22000088');
  assert.equal(graduated.status, 'graduated');
  const formerlyOther = students.find((s) => s.studentCode === '24000501');
  assert.equal(formerlyOther.status, 'active');
  assert.equal(
    students.filter((s) => s.status === 'graduated').length,
    2,
  );

  const codes = students.map((s) => s.studentCode);
  assert.equal(new Set(codes).size, codes.length);

  for (const student of students) {
    assert.match(student.studentCode, /^\d{8}$/);
    assert.ok(student.fullName.length >= 1);
    assert.ok(student.fullName.length <= 150);
    assert.ok(['active', 'graduated'].includes(student.status));
  }
});

test('rejects duplicate student codes', () => {
  assert.throws(
    () =>
      studentsFromJson([
        { ma: '24000318', hoTen: 'A', trangThai: 'Đang học' },
        { ma: '24000318', hoTen: 'B', trangThai: 'Đang học' },
      ]),
    /Duplicate student code/,
  );
});
