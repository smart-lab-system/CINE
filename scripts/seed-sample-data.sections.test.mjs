import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  courseSectionsFromJson,
  loadCourseSectionsFromFile,
  loadLecturersFromFile,
  loadStudentsFromFile,
  loadSubjectsFromFile,
  sectionCodeFrom,
} from './seed-sample-data.mjs';

test('builds section code as maHocPhan + two-digit group 01-99', () => {
  assert.equal(sectionCodeFrom('4220002793', 1), '422000279301');
  assert.equal(sectionCodeFrom('4220002793', 2), '422000279302');
  assert.equal(sectionCodeFrom('4220002793', 99), '422000279399');
});

test('rejects group numbers outside 1-99', () => {
  assert.throws(() => sectionCodeFrom('4220002793', 0), /1-99/);
  assert.throws(() => sectionCodeFrom('4220002793', 100), /1-99/);
  assert.throws(() => sectionCodeFrom('4220002793', 1.5), /1-99/);
});

test('maps danh_sach_lop_hoc_phan rows to seed section payloads', () => {
  assert.deepEqual(
    courseSectionsFromJson([
      {
        maHocPhan: '4220004247',
        hocKy: 'HK1-2026',
        nhom: 1,
        maLopDanhNghia: '422000424701',
        giangVien: 'PhamQuangTri',
        siSoToiDa: 40,
        sinhVien: ['24000318', '24000245'],
      },
    ]),
    [
      {
        subjectCode: '4220004247',
        termCode: 'HK1-2026',
        sectionCode: '422000424701',
        nominalClassCode: '422000424701',
        lecturerSlug: 'phamquangtri',
        maxEnrollment: 40,
        studentCodes: ['24000318', '24000245'],
      },
    ],
  );
});

test('derives maLopDanhNghia as maHocPhan + two-digit group when omitted', () => {
  const [section] = courseSectionsFromJson([
    { maHocPhan: '4220001922', hocKy: 'HK1-2026', nhom: 1 },
  ]);
  assert.equal(section.sectionCode, '422000192201');
  assert.equal(section.nominalClassCode, '422000192201');
  assert.equal(section.lecturerSlug, undefined);
  assert.equal(section.maxEnrollment, undefined);
  assert.deepEqual(section.studentCodes, []);
});

test('rejects maLopDanhNghia that is not maHocPhan + 01-99', () => {
  assert.throws(
    () =>
      courseSectionsFromJson([
        {
          maHocPhan: '4220004247',
          hocKy: 'HK1-2026',
          nhom: 1,
          maLopDanhNghia: 'D24CQCN01-N',
        },
      ]),
    /maHocPhan.*01-99/,
  );
  assert.throws(
    () =>
      courseSectionsFromJson([
        {
          maHocPhan: '4220004247',
          hocKy: 'HK1-2026',
          nhom: 1,
          maLopDanhNghia: '422000424702',
        },
      ]),
    /maHocPhan.*01-99/,
  );
});

test('rejects duplicate maLopDanhNghia in the same term', () => {
  assert.throws(
    () =>
      courseSectionsFromJson([
        { maHocPhan: '4220004247', hocKy: 'HK1-2026', nhom: 1 },
        { maHocPhan: '4220004247', hocKy: 'HK1-2026', nhom: 1 },
      ]),
    /Duplicate maLopDanhNghia/,
  );
});

test('allows the same maLopDanhNghia in a different term', () => {
  const rows = courseSectionsFromJson([
    { maHocPhan: '4220004247', hocKy: 'HK1-2026', nhom: 1 },
    { maHocPhan: '4220004247', hocKy: 'HK2-2026', nhom: 1 },
  ]);
  assert.equal(rows[0].termCode, 'HK1-2026');
  assert.equal(rows[1].termCode, 'HK2-2026');
  assert.equal(rows[0].nominalClassCode, '422000424701');
  assert.equal(rows[1].nominalClassCode, '422000424701');
});

test('rejects student codes that are not 8 digits', () => {
  assert.throws(
    () =>
      courseSectionsFromJson([
        {
          maHocPhan: '4220004247',
          hocKy: 'HK1-2026',
          nhom: 1,
          sinhVien: ['B24DCCN318'],
        },
      ]),
    /8 digits/,
  );
});

test('rejects duplicate students in a section roster', () => {
  assert.throws(
    () =>
      courseSectionsFromJson([
        {
          maHocPhan: '4220004247',
          hocKy: 'HK1-2026',
          nhom: 1,
          sinhVien: ['24000318', '24000318'],
        },
      ]),
    /Duplicate student/,
  );
});

test('rejects a roster larger than siSoToiDa', () => {
  assert.throws(
    () =>
      courseSectionsFromJson([
        {
          maHocPhan: '4220004247',
          hocKy: 'HK1-2026',
          nhom: 1,
          siSoToiDa: 1,
          sinhVien: ['24000318', '24000245'],
        },
      ]),
    /siSoToiDa/,
  );
});

test('loads danh_sach_lop_hoc_phan.json into seed section payloads', () => {
  const sections = loadCourseSectionsFromFile();
  const subjects = new Set(loadSubjectsFromFile().map((s) => s.code.toLowerCase()));
  const students = new Set(loadStudentsFromFile().map((s) => s.studentCode));
  const lecturerSlugs = new Set(
    loadLecturersFromFile().map((l) => l.email.split('@')[0]),
  );

  assert.equal(sections.length, 42);
  assert.equal(
    new Set(sections.map((s) => s.subjectCode.toLowerCase())).size,
    40,
  );

  const intro01 = sections.find(
    (s) => s.sectionCode === '422000424701' && s.termCode === 'HK1-2026',
  );
  assert.ok(intro01);
  assert.equal(intro01.nominalClassCode, '422000424701');
  assert.equal(intro01.lecturerSlug, 'phamquangtri');
  assert.equal(intro01.maxEnrollment, 40);
  assert.ok(intro01.studentCodes.length > 0);

  const keys = sections.map(
    (s) => `${s.termCode}|${s.nominalClassCode.toLowerCase()}`,
  );
  assert.equal(new Set(keys).size, keys.length);

  for (const section of sections) {
    assert.ok(subjects.has(section.subjectCode.toLowerCase()));
    assert.match(section.termCode, /^HK[12]-\d{4}$/);
    assert.equal(
      section.nominalClassCode,
      sectionCodeFrom(section.subjectCode, Number(section.sectionCode.slice(-2))),
    );
    assert.equal(section.sectionCode, section.nominalClassCode);
    assert.match(section.sectionCode, /^[A-Za-z0-9._-]{1,64}$/);
    if (section.lecturerSlug) {
      assert.ok(lecturerSlugs.has(section.lecturerSlug), section.lecturerSlug);
    }
    if (section.maxEnrollment != null) {
      assert.ok(Number.isInteger(section.maxEnrollment));
      assert.ok(section.maxEnrollment >= 1);
      assert.ok(section.studentCodes.length <= section.maxEnrollment);
    }
    for (const code of section.studentCodes) {
      assert.ok(students.has(code), code);
    }
  }
});
