#!/usr/bin/env node
/**
 * Seeds a representative Khoa CNTT roster, timetable, and computer-lab
 * inventory against a running API. Requires API_URL (default
 * http://localhost:4000) and Docker Postgres for the one-time admin
 * role grant. Lecturers are loaded from danh_sach_giang_vienn.json.
 * Subjects are loaded from danh_sach_mon_hoc.json. Labs are loaded from
 * danh_sach_phong_may.json; each lab gets sucChua workstations named
 * ToàTầngSTT.XX (01-99). Students are loaded from danh_sach_sinh_vien.json
 * (8-digit ma, full name, status). Course sections are loaded from
 * danh_sach_lop_hoc_phan.json. Section codes and maLopDanhNghia are
 * maHocPhan + 01-99; the same code may repeat across academic terms
 * but not within a term. Each lecturer also gets a login account
 * (username/password = employee code, role lecturer) linked to their
 * lecturer profile.
 *
 * Usage:
 *   node scripts/seed-sample-data.mjs
 *   API_URL=http://localhost:4000 node scripts/seed-sample-data.mjs
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const LECTURERS_JSON = join(SCRIPT_DIR, 'danh_sach_giang_vienn.json');
const SUBJECTS_JSON = join(SCRIPT_DIR, 'danh_sach_mon_hoc.json');
const LABS_JSON = join(SCRIPT_DIR, 'danh_sach_phong_may.json');
const STUDENTS_JSON = join(SCRIPT_DIR, 'danh_sach_sinh_vien.json');
const COURSE_SECTIONS_JSON = join(SCRIPT_DIR, 'danh_sach_lop_hoc_phan.json');
const EMPLOYEE_CODE_RE = /^\d{6}$/;
const SUBJECT_CODE_RE = /^[A-Za-z0-9._-]{2,32}$/;
const LAB_CODE_RE = /^[A-Za-z0-9._-]{2,32}$/;
const STUDENT_CODE_RE = /^\d{8}$/;
const TERM_CODE_RE = /^HK[12]-\d{4}$/;
const LECTURER_SLUG_RE = /^[a-z0-9._-]+$/;
const ROOM_CODE_RE = /^([A-Za-z]+)(\d+)\.(\d+)$/;
const LECTURER_TITLE_RE =
  /^(ThS\.\s*NCS\.|GS\.TS\.|PGS\.TS\.?|ThS\.|TS\.|GS\.)\s+/i;

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const ADMIN = {
  username: '691861',
  password: 'Bao@0412',
  displayName: 'Admin',
};

async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function assertSchemaReady() {
  let rel;
  try {
    rel = execSync(
      `docker compose exec -T postgres psql -U lab_admin -d lab_management -tAc "SELECT to_regclass('lab_management.user_roles');"`,
      { encoding: 'utf8' },
    ).trim();
  } catch (e) {
    throw new Error(
      'Postgres is not reachable via docker compose. Start it with: docker compose up -d postgres',
      { cause: e },
    );
  }
  if (!rel) {
    throw new Error(
      'Database schema is empty (lab_management.user_roles missing). After wiping Docker volumes, apply migrations before seeding:\n  pnpm --filter api migration:run',
    );
  }
}

function grantAdminRole(username) {
  // Single-line SQL — multiline -c breaks under Windows docker compose quoting.
  const sql = `INSERT INTO lab_management.user_roles (user_id, role_id) SELECT u.id, r.id FROM lab_management.users u, lab_management.roles r WHERE u.username = '${username}' AND r.code = 'admin' AND NOT EXISTS (SELECT 1 FROM lab_management.user_roles ur WHERE ur.user_id = u.id AND ur.role_id = r.id AND ur.deleted_at IS NULL);`;
  execSync(
    `docker compose exec -T postgres psql -U lab_admin -d lab_management -c "${sql}"`,
    { stdio: 'inherit' },
  );
}

async function ensureAdmin() {
  try {
    await api('POST', '/auth/register', { body: ADMIN });
    console.log('Registered phòng quản trị mạng account.');
  } catch (e) {
    if (e.status === 409) {
      console.log('Admin account already registered.');
    } else if (e.status !== 401) {
      // ignore other races; login below will tell us
    }
  }

  grantAdminRole(ADMIN.username);

  const login = await api('POST', '/auth/login', { body: ADMIN });
  console.log('Logged in as admin.');
  return login.accessToken;
}

async function ensure(token, path, body, label, { search, match, extraQuery } = {}) {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '100',
    ...(search ? { search } : {}),
    ...extraQuery,
  });
  const list = await api('GET', `${path}?${params}`, { token });
  const existing = (list.items ?? []).find(match);
  if (existing) {
    console.log(`= ${label}: ${existing.id}`);
    return existing.id;
  }

  try {
    const data = await api('POST', path, { token, body });
    console.log(`+ ${label}: ${data.id}`);
    return data.id;
  } catch (e) {
    if (e.status === 409) {
      const again = await api('GET', `${path}?${params}`, { token });
      const item = (again.items ?? []).find(match);
      if (item) {
        console.log(`= ${label}: ${item.id}`);
        return item.id;
      }
    }
    console.error(`! ${label} failed`, e.status, e.data);
    throw e;
  }
}

function byCode(field, value) {
  const expected = String(value).toLowerCase();
  return (item) => String(item[field] ?? '').toLowerCase() === expected;
}

export function parseLecturerText(text) {
  const trimmed = String(text ?? '').trim();
  const titleMatch = trimmed.match(LECTURER_TITLE_RE);
  let academicTitle;
  let rest = trimmed;
  if (titleMatch) {
    academicTitle = titleMatch[1].replace(/\s+/g, ' ').trim();
    rest = trimmed.slice(titleMatch[0].length).trim();
  }
  const withoutRole = rest.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return { academicTitle, fullName: withoutRole };
}

export function employeeCodeFromIndex(index) {
  const code = String(index + 1).padStart(6, '0');
  if (!EMPLOYEE_CODE_RE.test(code)) {
    throw new Error(`Cannot derive 6-digit employeeCode from index: ${index}`);
  }
  return code;
}

function lecturerSlugFromHref(href) {
  const raw = String(href ?? '');
  const slug = raw.includes('@') ? raw.slice(raw.indexOf('@') + 1) : raw;
  return slug.replace(/[^A-Za-z0-9._-]/g, '').toLowerCase().replace(/[-.]+$/g, '');
}

function lecturerEmail(href) {
  const local = lecturerSlugFromHref(href);
  if (!local) {
    throw new Error(`Cannot derive email from href: ${href}`);
  }
  return `${local}@fit.edu.vn`;
}

export function lecturersFromJson(rows) {
  const seenSlugs = new Set();
  return rows.map((row, index) => {
    const { academicTitle, fullName } = parseLecturerText(row.text);
    if (!fullName) {
      throw new Error(`Lecturer #${index} has empty name (${row.text})`);
    }
    const slug = lecturerSlugFromHref(row.href);
    if (!slug) {
      throw new Error(`Lecturer #${index} has empty slug (${row.href})`);
    }
    if (seenSlugs.has(slug)) {
      throw new Error(`Duplicate lecturer slug: ${slug}`);
    }
    seenSlugs.add(slug);
    return {
      employeeCode: employeeCodeFromIndex(index),
      fullName,
      department: 'Khoa Công nghệ thông tin',
      ...(academicTitle ? { academicTitle } : {}),
      email: lecturerEmail(row.href),
    };
  });
}

export function lecturerAccountFromLecturer(lecturer, roleCodes = ['lecturer']) {
  return {
    username: lecturer.employeeCode,
    password: lecturer.employeeCode,
    displayName: lecturer.fullName,
    email: lecturer.email,
    roleCodes,
  };
}

export function loadLecturersFromFile(filePath = LECTURERS_JSON) {
  return lecturersFromJson(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function subjectsFromJson(rows) {
  const seenCodes = new Set();
  return rows.map((row, index) => {
    const code = String(row?.maHocPhan ?? '').trim();
    const name = String(row?.tenMonHoc ?? '').trim();
    if (!code) {
      throw new Error(`Subject #${index} has empty maHocPhan`);
    }
    if (!SUBJECT_CODE_RE.test(code)) {
      throw new Error(`Subject #${index} has invalid code: ${code}`);
    }
    if (!name) {
      throw new Error(`Subject #${index} has empty tenMonHoc (${code})`);
    }
    if (name.length > 200) {
      throw new Error(`Subject #${index} name exceeds 200 characters (${code})`);
    }
    const key = code.toLowerCase();
    if (seenCodes.has(key)) {
      throw new Error(`Duplicate subject code: ${code}`);
    }
    seenCodes.add(key);
    return { code, name };
  });
}

export function loadSubjectsFromFile(filePath = SUBJECTS_JSON) {
  return subjectsFromJson(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function parseRoomCode(roomCode) {
  const match = String(roomCode ?? '').trim().match(ROOM_CODE_RE);
  if (!match) {
    throw new Error(`Invalid room code: ${roomCode}`);
  }
  return { building: match[1], floor: match[2], sequence: match[3] };
}

export function hostPrefixFromRoomCode(roomCode) {
  const { building, floor, sequence } = parseRoomCode(roomCode);
  return `${building}${floor}${sequence}`;
}

export function workstationHostname(roomCode, n) {
  const prefix = hostPrefixFromRoomCode(roomCode);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new Error(`Workstation number must be 1-99, got: ${n}`);
  }
  return `${prefix}.${pad(n)}`;
}

export function labsFromJson(rows) {
  const seenCodes = new Set();
  return rows.map((row, index) => {
    const code = String(row?.ma ?? '').trim();
    const name = String(row?.ten ?? '').trim();
    const building = String(row?.toa ?? '').trim();
    const capacity = Number(row?.sucChua);
    const status = String(row?.trangThai ?? '').trim();
    if (!code) {
      throw new Error(`Lab #${index} has empty ma`);
    }
    if (!LAB_CODE_RE.test(code)) {
      throw new Error(`Lab #${index} has invalid code: ${code}`);
    }
    const parsed = parseRoomCode(code);
    if (!building) {
      throw new Error(`Lab #${index} has empty toa (${code})`);
    }
    if (building !== parsed.building) {
      throw new Error(`Lab #${index} toa ${building} does not match ma ${code}`);
    }
    if (!name) {
      throw new Error(`Lab #${index} has empty ten (${code})`);
    }
    if (name.length > 150) {
      throw new Error(`Lab #${index} name exceeds 150 characters (${code})`);
    }
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 99) {
      throw new Error(`Lab #${index} sucChua must be 1-99, got: ${row?.sucChua}`);
    }
    const key = code.toLowerCase();
    if (seenCodes.has(key)) {
      throw new Error(`Duplicate lab code: ${code}`);
    }
    seenCodes.add(key);
    return {
      code,
      name,
      building,
      floor: parsed.floor,
      capacity,
      isActive: status === 'Hoạt động',
    };
  });
}

export function loadLabsFromFile(filePath = LABS_JSON) {
  return labsFromJson(JSON.parse(readFileSync(filePath, 'utf8')));
}

function studentStatusFromText(text) {
  const status = String(text ?? '').trim().toLocaleLowerCase('vi');
  if (status === 'đang học') {
    return 'active';
  }
  if (status === 'tốt nghiệp') {
    return 'graduated';
  }
  throw new Error(
    `Student status must be Đang học or Tốt nghiệp, got: ${text}`,
  );
}

export function studentsFromJson(rows) {
  const seenCodes = new Set();
  return rows.map((row, index) => {
    const studentCode = String(row?.ma ?? '').trim();
    const fullName = String(row?.hoTen ?? '').trim();
    if (!studentCode) {
      throw new Error(`Student #${index} has empty ma`);
    }
    if (!STUDENT_CODE_RE.test(studentCode)) {
      throw new Error(`Student #${index} ma must be 8 digits, got: ${studentCode}`);
    }
    if (!fullName) {
      throw new Error(`Student #${index} has empty hoTen (${studentCode})`);
    }
    if (fullName.length > 150) {
      throw new Error(`Student #${index} name exceeds 150 characters (${studentCode})`);
    }
    const key = studentCode.toLowerCase();
    if (seenCodes.has(key)) {
      throw new Error(`Duplicate student code: ${studentCode}`);
    }
    seenCodes.add(key);
    return {
      studentCode,
      fullName,
      status: studentStatusFromText(row?.trangThai),
    };
  });
}

export function loadStudentsFromFile(filePath = STUDENTS_JSON) {
  return studentsFromJson(JSON.parse(readFileSync(filePath, 'utf8')));
}

export function courseSectionsFromJson(rows) {
  const seenKeys = new Set();
  return rows.map((row, index) => {
    const subjectCode = String(row?.maHocPhan ?? '').trim();
    const termCode = String(row?.hocKy ?? '').trim();
    if (!subjectCode) {
      throw new Error(`Course section #${index} has empty maHocPhan`);
    }
    if (!SUBJECT_CODE_RE.test(subjectCode)) {
      throw new Error(`Course section #${index} has invalid maHocPhan: ${subjectCode}`);
    }
    if (!termCode) {
      throw new Error(`Course section #${index} has empty hocKy`);
    }
    if (!TERM_CODE_RE.test(termCode)) {
      throw new Error(`Course section #${index} has invalid hocKy: ${termCode}`);
    }

    const sectionCode = sectionCodeFrom(subjectCode, row?.nhom);
    const nominalClassCode = sectionCode;
    const providedNominal = String(row?.maLopDanhNghia ?? '').trim();
    if (
      providedNominal &&
      providedNominal.toLowerCase() !== nominalClassCode.toLowerCase()
    ) {
      throw new Error(
        `Course section #${index} maLopDanhNghia must be maHocPhan + 01-99 (${nominalClassCode}), got: ${providedNominal}`,
      );
    }
    const key = `${termCode.toLowerCase()}|${nominalClassCode.toLowerCase()}`;
    if (seenKeys.has(key)) {
      throw new Error(
        `Duplicate maLopDanhNghia: ${termCode} ${nominalClassCode}`,
      );
    }
    seenKeys.add(key);

    const lecturerRaw = String(row?.giangVien ?? '').trim();
    const lecturerSlug = lecturerRaw ? lecturerRaw.toLowerCase() : undefined;
    if (lecturerSlug && !LECTURER_SLUG_RE.test(lecturerSlug)) {
      throw new Error(
        `Course section #${index} has invalid giangVien: ${row.giangVien}`,
      );
    }

    let maxEnrollment;
    if (row?.siSoToiDa != null && row.siSoToiDa !== '') {
      maxEnrollment = Number(row.siSoToiDa);
      if (!Number.isInteger(maxEnrollment) || maxEnrollment < 1) {
        throw new Error(
          `Course section #${index} siSoToiDa must be >= 1, got: ${row.siSoToiDa}`,
        );
      }
    }

    const roster = row?.sinhVien == null ? [] : row.sinhVien;
    if (!Array.isArray(roster)) {
      throw new Error(`Course section #${index} sinhVien must be an array`);
    }
    const seenStudents = new Set();
    const studentCodes = roster.map((code, studentIndex) => {
      const studentCode = String(code ?? '').trim();
      if (!STUDENT_CODE_RE.test(studentCode)) {
        throw new Error(
          `Course section #${index} student #${studentIndex} ma must be 8 digits, got: ${code}`,
        );
      }
      if (seenStudents.has(studentCode)) {
        throw new Error(
          `Duplicate student ${studentCode} in course section ${termCode} ${sectionCode}`,
        );
      }
      seenStudents.add(studentCode);
      return studentCode;
    });

    if (maxEnrollment != null && studentCodes.length > maxEnrollment) {
      throw new Error(
        `Course section #${index} roster exceeds siSoToiDa (${studentCodes.length} > ${maxEnrollment})`,
      );
    }

    return {
      subjectCode,
      termCode,
      sectionCode,
      nominalClassCode,
      ...(lecturerSlug ? { lecturerSlug } : {}),
      ...(maxEnrollment != null ? { maxEnrollment } : {}),
      studentCodes,
    };
  });
}

export function loadCourseSectionsFromFile(filePath = COURSE_SECTIONS_JSON) {
  return courseSectionsFromJson(JSON.parse(readFileSync(filePath, 'utf8')));
}

function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}

export function sectionCodeFrom(maHocPhan, groupNo) {
  const code = String(maHocPhan ?? '').trim();
  if (!SUBJECT_CODE_RE.test(code)) {
    throw new Error(`Invalid maHocPhan for section code: ${maHocPhan}`);
  }
  const n = Number(groupNo);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new Error(`Section group must be 1-99, got: ${groupNo}`);
  }
  return `${code}${pad(n)}`;
}

function macAddr(labOctet, n) {
  return `02:1a:${pad(labOctet)}:00:${pad(n)}:01`;
}

function gridSeats({
  rows,
  cols,
  originX,
  originY,
  gapX,
  gapY,
  aisleAfterCol = 0,
  aisleWidth = 0,
  workstationIds = [],
  disabled = new Set(),
  notes = {},
}) {
  const seats = [];
  let i = 0;
  for (let r = 1; r <= rows; r++) {
    const rowLetter = String.fromCharCode(64 + r);
    for (let c = 1; c <= cols; c++) {
      const seatCode = `${rowLetter}${pad(c)}`;
      const isDisabled = disabled.has(seatCode);
      seats.push({
        seatCode,
        rowNo: r,
        columnNo: c,
        positionX:
          originX + (c - 1) * gapX + (aisleAfterCol && c > aisleAfterCol ? aisleWidth : 0),
        positionY: originY + (r - 1) * gapY,
        rotationDegrees: 0,
        isDisabled,
        workstationId: isDisabled ? null : (workstationIds[i++] ?? null),
        notes: notes[seatCode] ?? (isDisabled ? 'Khu vực tủ rack, không bố trí máy sinh viên' : null),
      });
    }
  }
  return seats;
}

const SUBJECTS = loadSubjectsFromFile();
const LABS = loadLabsFromFile();
const COURSE_SECTIONS = loadCourseSectionsFromFile();

const TERMS = [
  {
    code: 'HK2-2025',
    name: 'Học kỳ 2 năm học 2025–2026',
    startsOn: '2026-02-09',
    endsOn: '2026-06-20',
    isActive: false,
  },
  {
    code: 'HK1-2026',
    name: 'Học kỳ 1 năm học 2026–2027',
    startsOn: '2026-08-31',
    endsOn: '2027-01-16',
    isActive: true,
  },
  {
    code: 'HK2-2026',
    name: 'Học kỳ 2 năm học 2026–2027',
    startsOn: '2027-02-08',
    endsOn: '2027-06-19',
    isActive: false,
  },
];

const LECTURERS = loadLecturersFromFile();
const STUDENTS = loadStudentsFromFile();

function sectionDisplayName(section, subjectName) {
  return `${section.sectionCode} — ${subjectName}`;
}

function lecturerSlugFromEmail(email) {
  const at = String(email ?? '').indexOf('@');
  return at === -1 ? '' : String(email).slice(0, at);
}

async function ensureWorkstations(token, labId, machines) {
  const ids = [];
  for (const machine of machines) {
    ids.push(
      await ensure(
        token,
        `/labs/${labId}/workstations`,
        machine,
        `workstation ${machine.assetCode}`,
        {
          search: machine.assetCode,
          match: byCode('assetCode', machine.assetCode),
        },
      ),
    );
  }
  return ids;
}

function labMachines({ roomCode, count, labOctet, subnet, os, overrides = {} }) {
  const hostPrefix = hostPrefixFromRoomCode(roomCode);
  const machines = [];
  for (let n = 1; n <= count; n++) {
    const extra = overrides[n] ?? {};
    machines.push({
      assetCode: `TSCD.${hostPrefix}.${pad(n, 3)}`,
      hostname: workstationHostname(roomCode, n),
      macAddress: macAddr(labOctet, n),
      staticIpAddress: `${subnet}.${10 + n}`,
      serialNumber: `5CG24${hostPrefix}${pad(n, 3)}`,
      operatingSystem: extra.operatingSystem ?? os,
      isEnabled: extra.isEnabled ?? true,
      status: extra.status ?? 'available',
      notes: extra.notes ?? null,
    });
  }
  return machines;
}

function layoutSeatsForCapacity(capacity, workstationIds) {
  const cols = 8;
  const rows = Math.ceil(capacity / cols);
  return gridSeats({
    rows,
    cols,
    originX: 90,
    originY: 80,
    gapX: 140,
    gapY: 110,
    aisleAfterCol: 4,
    aisleWidth: 70,
    workstationIds,
  });
}

async function ensureLayoutWithSeats(token, labId, layoutBody, seats, label) {
  const layoutId = await ensure(
    token,
    `/labs/${labId}/layouts`,
    layoutBody,
    label,
    { search: layoutBody.name, match: byCode('name', layoutBody.name) },
  );

  const detail = await api('GET', `/labs/${labId}/layouts/${layoutId}`, { token });
  if (detail.seats?.length) {
    console.log(`= seats ${label} (${detail.seats.length})`);
    return layoutId;
  }

  await api('PUT', `/labs/${labId}/layouts/${layoutId}/seats`, {
    token,
    body: { seats },
  });
  console.log(`+ seats ${label} (${seats.length})`);
  return layoutId;
}

async function enrollMissing(token, sectionId, studentIds, label) {
  const current = await api('GET', `/course-sections/${sectionId}/enrollments`, {
    token,
  });
  const have = new Set((current.items ?? []).map((e) => e.studentId));
  const missing = studentIds.filter((id) => id && !have.has(id));
  if (missing.length === 0) {
    console.log(`= ${label}`);
    return;
  }
  await api('POST', `/course-sections/${sectionId}/enrollments/bulk`, {
    token,
    body: { studentIds: missing },
  });
  console.log(`+ ${label} (${missing.length} sinh viên)`);
}

async function ensureLecturerAccount(token, lecturer, lecturerId) {
  const account = lecturerAccountFromLecturer(lecturer);
  const userId = await ensure(
    token,
    '/accounts',
    account,
    `tài khoản GV ${lecturer.employeeCode}`,
    {
      search: lecturer.employeeCode,
      match: byCode('username', lecturer.employeeCode),
    },
  );

  const detail = await api('GET', `/lecturers/${lecturerId}`, { token });
  if (detail.userId === userId) {
    console.log(`= liên kết GV ${lecturer.employeeCode}`);
    return userId;
  }

  await api('PATCH', `/lecturers/${lecturerId}`, {
    token,
    body: { userId },
  });
  console.log(`+ liên kết GV ${lecturer.employeeCode}`);
  return userId;
}

async function main() {
  console.log(`Seeding against ${API_URL}`);
  assertSchemaReady();
  const token = await ensureAdmin();

  const subjectIds = {};
  for (const subject of SUBJECTS) {
    subjectIds[subject.code] = await ensure(
      token,
      '/subjects',
      subject,
      `học phần ${subject.code}`,
      { search: subject.code, match: byCode('code', subject.code) },
    );
  }

  const termIds = {};
  for (const term of TERMS) {
    termIds[term.code] = await ensure(
      token,
      '/academic-terms',
      term,
      `học kỳ ${term.code}`,
      { search: term.code, match: byCode('code', term.code) },
    );
  }

  const lecturerIds = {};
  for (const lecturer of LECTURERS) {
    lecturerIds[lecturer.employeeCode] = await ensure(
      token,
      '/lecturers',
      lecturer,
      `giảng viên ${lecturer.employeeCode}`,
      {
        search: lecturer.employeeCode,
        match: byCode('employeeCode', lecturer.employeeCode),
      },
    );
    await ensureLecturerAccount(
      token,
      lecturer,
      lecturerIds[lecturer.employeeCode],
    );
  }

  const studentIds = {};
  for (const student of STUDENTS) {
    studentIds[student.studentCode] = await ensure(
      token,
      '/students',
      student,
      `sinh viên ${student.studentCode}`,
      {
        search: student.studentCode,
        match: byCode('studentCode', student.studentCode),
      },
    );
  }

  const subjectByCode = Object.fromEntries(
    SUBJECTS.map((subject) => [subject.code.toLowerCase(), subject]),
  );
  const lecturerIdBySlug = {};
  for (const lecturer of LECTURERS) {
    lecturerIdBySlug[lecturerSlugFromEmail(lecturer.email)] =
      lecturerIds[lecturer.employeeCode];
  }

  for (const section of COURSE_SECTIONS) {
    const subject = subjectByCode[section.subjectCode.toLowerCase()];
    if (!subject) {
      throw new Error(`Unknown maHocPhan: ${section.subjectCode}`);
    }
    const academicTermId = termIds[section.termCode];
    if (!academicTermId) {
      throw new Error(`Unknown hocKy: ${section.termCode}`);
    }
    let lecturerId;
    if (section.lecturerSlug) {
      lecturerId = lecturerIdBySlug[section.lecturerSlug];
      if (!lecturerId) {
        throw new Error(`Unknown giangVien: ${section.lecturerSlug}`);
      }
    }
    const enrollIds = section.studentCodes.map((code) => {
      const id = studentIds[code];
      if (!id) {
        throw new Error(
          `Unknown student ${code} in ${section.termCode} ${section.sectionCode}`,
        );
      }
      return id;
    });
    const key = `${section.sectionCode}@${section.termCode}`;
    const body = {
      subjectId: subjectIds[subject.code],
      academicTermId,
      sectionCode: section.sectionCode,
      ...(section.nominalClassCode
        ? { nominalClassCode: section.nominalClassCode }
        : {}),
      name: sectionDisplayName(section, subject.name),
      ...(lecturerId ? { lecturerId } : {}),
      ...(section.maxEnrollment != null
        ? { maxEnrollment: section.maxEnrollment }
        : {}),
    };
    const sectionId = await ensure(
      token,
      '/course-sections',
      body,
      `lớp học phần ${key}`,
      {
        search: body.sectionCode,
        extraQuery: {
          subjectId: body.subjectId,
          academicTermId: body.academicTermId,
        },
        match: byCode('sectionCode', body.sectionCode),
      },
    );
    await enrollMissing(token, sectionId, enrollIds, `đăng ký ${key}`);
  }

  for (let i = 0; i < LABS.length; i++) {
    const lab = LABS[i];
    const labId = await ensure(
      token,
      '/labs',
      lab,
      `phòng máy ${lab.code}`,
      { search: lab.code, match: byCode('code', lab.code) },
    );
    const machines = labMachines({
      roomCode: lab.code,
      count: lab.capacity,
      labOctet: i + 1,
      subnet: `10.18.${i + 1}`,
      os: 'Windows 11 Education 23H2',
    });
    const workstationIds = await ensureWorkstations(token, labId, machines);
    await ensureLayoutWithSeats(
      token,
      labId,
      {
        name: 'Bố trí chuẩn',
        canvasWidth: 1280,
        canvasHeight: 720,
        isActive: true,
      },
      layoutSeatsForCapacity(lab.capacity, workstationIds),
      `sơ đồ ${lab.code}`,
    );
  }

  console.log('\nXong. Đăng nhập tại http://localhost:3000/login');
  console.log(`  tài khoản quản trị: ${ADMIN.username}`);
  console.log(`  mật khẩu quản trị: ${ADMIN.password}`);
  console.log('  giảng viên: tên đăng nhập = mã GV, mật khẩu = mã GV');
}

function isDirectRun() {
  const entry = process.argv[1];
  return Boolean(entry) && resolve(entry) === fileURLToPath(import.meta.url);
}

if (isDirectRun()) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
