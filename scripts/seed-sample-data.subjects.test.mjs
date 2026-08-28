import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSubjectsFromFile,
  subjectsFromJson,
} from './seed-sample-data.mjs';

test('maps maHocPhan and tenMonHoc to API subject payloads', () => {
  assert.deepEqual(
    subjectsFromJson([{ maHocPhan: '4220002793', tenMonHoc: 'Nhập môn Tin học' }]),
    [{ code: '4220002793', name: 'Nhập môn Tin học' }],
  );
});

test('loads danh_sach_mon_hoc.json into API subject payloads', () => {
  const subjects = loadSubjectsFromFile();
  assert.equal(subjects.length, 40);
  assert.equal(subjects[0].code, '4220002793');
  assert.equal(subjects[0].name, 'Nhập môn Tin học');

  const oop = subjects.find((s) => s.name === 'Lập trình hướng đối tượng');
  assert.ok(oop);
  assert.equal(oop.code, '4220004119');

  const dsa = subjects.find(
    (s) => s.name === 'Cấu trúc dữ liệu và giải thuật',
  );
  assert.ok(dsa);
  assert.equal(dsa.code, '4220001611');

  const codes = subjects.map((s) => s.code);
  assert.equal(new Set(codes).size, codes.length);

  for (const subject of subjects) {
    assert.match(subject.code, /^[A-Za-z0-9._-]{2,32}$/);
    assert.ok(subject.name.length >= 1);
    assert.ok(subject.name.length <= 200);
  }
});

test('rejects duplicate course codes', () => {
  assert.throws(
    () =>
      subjectsFromJson([
        { maHocPhan: '4220002793', tenMonHoc: 'A' },
        { maHocPhan: '4220002793', tenMonHoc: 'B' },
      ]),
    /Duplicate subject code/,
  );
});
