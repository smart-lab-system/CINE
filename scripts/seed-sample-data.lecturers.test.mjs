import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  employeeCodeFromIndex,
  lecturerAccountFromLecturer,
  lecturersFromJson,
  loadLecturersFromFile,
  parseLecturerText,
} from './seed-sample-data.mjs';

test('parses title, name, and parenthetical role', () => {
  assert.deepEqual(parseLecturerText('ThS. Phạm Quảng Tri'), {
    academicTitle: 'ThS.',
    fullName: 'Phạm Quảng Tri',
  });
  assert.deepEqual(parseLecturerText('PGS.TS Huỳnh Tường Nguyên'), {
    academicTitle: 'PGS.TS',
    fullName: 'Huỳnh Tường Nguyên',
  });
  assert.deepEqual(parseLecturerText('GS.TS. Huỳnh Trung Hiếu'), {
    academicTitle: 'GS.TS.',
    fullName: 'Huỳnh Trung Hiếu',
  });
  assert.deepEqual(parseLecturerText('ThS. Đặng Thị Thu Hà (Phó bộ môn)'), {
    academicTitle: 'ThS.',
    fullName: 'Đặng Thị Thu Hà',
  });
  assert.deepEqual(parseLecturerText('ThS. NCS. Võ Công Minh (Phó bộ môn)'), {
    academicTitle: 'ThS. NCS.',
    fullName: 'Võ Công Minh',
  });
});

test('assigns a 6-digit employeeCode from list order', () => {
  assert.equal(employeeCodeFromIndex(0), '000001');
  assert.equal(employeeCodeFromIndex(19), '000020');
  assert.equal(employeeCodeFromIndex(76), '000077');
});

test('loads danh_sach_giang_vienn.json into API lecturer payloads', () => {
  const lecturers = loadLecturersFromFile();
  assert.equal(lecturers.length, 77);
  assert.equal(lecturers[0].employeeCode, '000001');
  assert.equal(lecturers[0].fullName, 'Phạm Quảng Tri');
  assert.equal(lecturers[0].academicTitle, 'ThS.');
  assert.equal(lecturers[0].email, 'phamquangtri@fit.edu.vn');
  assert.equal(lecturers[0].department, 'Khoa Công nghệ thông tin');

  const thiet = lecturers.find((l) => l.fullName === 'Phạm Thị Thiết');
  assert.ok(thiet);
  assert.equal(thiet.employeeCode, '000020');
  assert.equal(thiet.email, 'phamthithiet@fit.edu.vn');

  const codes = lecturers.map((l) => l.employeeCode);
  assert.equal(new Set(codes).size, codes.length);

  for (const lecturer of lecturers) {
    assert.match(lecturer.employeeCode, /^\d{6}$/);
    assert.ok(lecturer.fullName.length >= 1);
    assert.match(lecturer.email, /^[a-z0-9._-]+@fit\.edu\.vn$/);
  }
});

test('builds lecturer account payloads from employee code', () => {
  const lecturer = {
    employeeCode: '000001',
    fullName: 'Phạm Quảng Tri',
    email: 'phamquangtri@fit.edu.vn',
  };
  assert.deepEqual(lecturerAccountFromLecturer(lecturer), {
    username: '000001',
    password: '000001',
    displayName: 'Phạm Quảng Tri',
    email: 'phamquangtri@fit.edu.vn',
    roleCodes: ['lecturer'],
  });
});

test('rejects duplicate slugs', () => {
  assert.throws(
    () =>
      lecturersFromJson([
        { text: 'TS. A', href: 'giangvien@same' },
        { text: 'TS. B', href: 'giangvien@same' },
      ]),
    /Duplicate lecturer slug/,
  );
});
