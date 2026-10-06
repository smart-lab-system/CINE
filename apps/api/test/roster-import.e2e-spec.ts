import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { seedClass } from './helpers/seed';
import { ensureTestSemester } from './helpers/master-data';

/**
 * The roster import is what makes a headcount mean anything: until a class
 * has a list, "45 connected" is a number with nothing to compare against.
 *
 * Spec §7.3 — a bad row blocks the whole file — and §7.4 — a re-import is a
 * diff, and removal is never the default — are the two rules these tests
 * exist for. Both are about being wrong loudly instead of quietly: a class
 * imported at 38/40 produces a headcount that looks healthy and isn't, and
 * an enrollment deleted by accident only surfaces on exam day, when the
 * student is standing at a machine that will not let them in.
 */
describe('Roster import (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  let teacherToken: string;
  let otherTeacherToken: string;
  let lecturerId: string;
  let courseName: string;
  let classId: string;
  let siblingClassId: string;
  let siblingLabel: string;
  let semesterId: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function makeAccount(prefix: string, role: 'admin' | 'teacher') {
    const email = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}@example.com`;
    const id = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role,
    });
    return { id, token: await login(email) };
  }

  /** The roster as the API reports it, sorted so comparisons are stable. */
  async function readRoster(id: string, token: string = teacherToken) {
    const response = await request(app.getHttpServer())
      .get(`/classes/${id}/roster`)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return (response.body as { mssv: string; name: string }[])
      .map((entry) => `${entry.mssv}|${entry.name}`)
      .sort();
  }

  function importRoster(
    id: string,
    token: string,
    body: Record<string, unknown>,
  ) {
    return request(app.getHttpServer())
      .post(`/classes/${id}/roster`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const lecturer = await makeAccount('roster_lecturer', 'teacher');
    lecturerId = lecturer.id;
    teacherToken = lecturer.token;
    otherTeacherToken = (await makeAccount('roster_other_teacher', 'teacher')).token;

    courseName = 'Môn có danh sách';
    // Phạm vi "đã ở lớp khác" là HỌC KỲ (spec §2.3 mục 3): mọi lớp của spec này cùng một học kỳ.
    semesterId = await ensureTestSemester(dataSource);

    const klass = await seedClass(dataSource, {
      teacherId: lecturerId,
      courseName,
      semesterId,
      groupName: `Nhóm chính ${Date.now()}`,
    });
    classId = klass.id;

    // A second class under the SAME course — the cross-class case the
    // unique key (course_id, student_mssv) makes possible.
    const sibling = await seedClass(dataSource, {
      teacherId: lecturerId,
      courseName,
      semesterId,
      groupName: `Nhóm phụ ${Date.now()}`,
    });
    siblingClassId = sibling.id;
    siblingLabel = sibling.label;
  });

  afterAll(async () => {
    await app.close();
  });

  /** A fresh class per test, so one test's roster is never another's fixture. */
  async function freshClass(): Promise<string> {
    const klass = await seedClass(dataSource, {
      teacherId: lecturerId,
      courseName,
      semesterId,
      groupName: `Nhóm ${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
    });
    return klass.id;
  }

  /** Unique per run: enrollment is keyed by course, and the course is shared. */
  function mssv(suffix: string): string {
    return `S${Date.now().toString(36)}${suffix}`.slice(0, 20);
  }

  it('imports a file and lists the roster back', async () => {
    const id = await freshClass();
    const a = mssv('a');
    const b = mssv('b');

    const response = await importRoster(id, teacherToken, {
      students: [
        { mssv: a, name: 'Nguyễn Văn A' },
        { mssv: b, name: 'Trần Thị B' },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ added: 2, updated: 0, unchanged: 0, removed: 0 });
    expect(await readRoster(id)).toEqual(
      [`${a}|Nguyễn Văn A`, `${b}|Trần Thị B`].sort(),
    );
  });

  it('changes nothing when the same file is imported twice', async () => {
    const id = await freshClass();
    const students = [
      { mssv: mssv('c'), name: 'Nguyễn Văn C' },
      { mssv: mssv('d'), name: 'Trần Thị D' },
    ];

    await importRoster(id, teacherToken, { students });
    const before = await readRoster(id);

    const second = await importRoster(id, teacherToken, { students });

    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ added: 0, updated: 0, unchanged: 2, removed: 0 });
    expect(await readRoster(id)).toEqual(before);
  });

  it('writes nothing at all when one row in the file is bad', async () => {
    const id = await freshClass();
    const good = mssv('e');
    await importRoster(id, teacherToken, { students: [{ mssv: good, name: 'Đã có sẵn' }] });
    const before = await readRoster(id);

    // 19 valid rows and one MSSV with a space in it. Importing the 19 would
    // leave a roster that looks complete and is not.
    const students = Array.from({ length: 19 }, (_, index) => ({
      mssv: mssv(`f${index}`),
      name: `Sinh viên ${index}`,
    }));
    students.push({ mssv: 'SV 001', name: 'Có dấu cách' });

    const response = await importRoster(id, teacherToken, { students });

    expect(response.status).toBe(400);
    expect(await readRoster(id)).toEqual(before);
  });

  it('rejects a file that lists the same MSSV twice', async () => {
    const id = await freshClass();
    const twice = mssv('g');

    const response = await importRoster(id, teacherToken, {
      students: [
        { mssv: twice, name: 'Nguyễn Văn G' },
        { mssv: twice, name: 'Nguyễn Văn G (dòng 2)' },
      ],
    });

    expect(response.status).toBe(400);
    expect(await readRoster(id)).toEqual([]);
  });

  it('rejects a row with no name', async () => {
    const id = await freshClass();

    const response = await importRoster(id, teacherToken, {
      students: [{ mssv: mssv('h'), name: '' }],
    });

    expect(response.status).toBe(400);
    expect(await readRoster(id)).toEqual([]);
  });

  it('updates a name that changed and leaves the rest alone', async () => {
    const id = await freshClass();
    const changed = mssv('i');
    const same = mssv('j');

    await importRoster(id, teacherToken, {
      students: [
        { mssv: changed, name: 'Nguyen Van I' },
        { mssv: same, name: 'Trần Thị J' },
      ],
    });

    const response = await importRoster(id, teacherToken, {
      students: [
        { mssv: changed, name: 'Nguyễn Văn I' },
        { mssv: same, name: 'Trần Thị J' },
      ],
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ added: 0, updated: 1, unchanged: 1 });
    expect(response.body.renamed).toEqual([{ mssv: changed, from: 'Nguyen Van I', to: 'Nguyễn Văn I' }]);
    expect(await readRoster(id)).toContain(`${changed}|Nguyễn Văn I`);
  });

  it('reports students missing from the file without deleting them', async () => {
    const id = await freshClass();
    const kept = mssv('k');
    const dropped = mssv('l');

    await importRoster(id, teacherToken, {
      students: [
        { mssv: kept, name: 'Ở lại' },
        { mssv: dropped, name: 'Vắng trong file' },
      ],
    });

    const response = await importRoster(id, teacherToken, {
      students: [{ mssv: kept, name: 'Ở lại' }],
    });

    expect(response.status).toBe(200);
    expect(response.body.removed).toBe(0);
    // student_mssv is citext: it COMPARES case-insensitively but STORES what
    // was written, so what comes back is the spelling from the file.
    expect(response.body.missing).toEqual([{ mssv: dropped, name: 'Vắng trong file' }]);
    // Deleting this student locks them out of the exam, and the mistake
    // surfaces on exam day. It takes an explicit decision, not a re-import.
    expect(await readRoster(id)).toHaveLength(2);
  });

  it('removes them only when asked explicitly', async () => {
    const id = await freshClass();
    const kept = mssv('m');
    const dropped = mssv('n');

    await importRoster(id, teacherToken, {
      students: [
        { mssv: kept, name: 'Ở lại' },
        { mssv: dropped, name: 'Thôi học' },
      ],
    });

    const response = await importRoster(id, teacherToken, {
      students: [{ mssv: kept, name: 'Ở lại' }],
      removeMissing: true,
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ added: 0, updated: 0, unchanged: 1, removed: 1 });
    expect(await readRoster(id)).toEqual([`${kept}|Ở lại`]);
  });

  it('refuses a student who already belongs to another class of the SEMESTER', async () => {
    const shared = mssv('o');
    await importRoster(siblingClassId, teacherToken, {
      students: [{ mssv: shared, name: 'Đã ở nhóm phụ' }],
    });

    // Typed differently in the second file on purpose: citext makes these
    // the same student, so the clash must be caught by the database's own
    // notion of equality rather than by a string compare in application code.
    const response = await importRoster(classId, teacherToken, {
      students: [{ mssv: shared.toLowerCase(), name: 'Đã ở nhóm phụ' }],
    });

    // Moving a student between classes changes where their submission is
    // routed. It is not something a roster import should do as a side
    // effect of a file someone dragged in.
    expect(response.status).toBe(409);
    expect(response.body.message).toContain(shared);
    expect(response.body.message).toContain(siblingLabel);
  });

  it('T-STU-3: file ghi tên khác tên đã lưu thì FILE THẮNG, và kết quả liệt kê ai bị đổi tên — kể cả ở lớp khác', async () => {
    const idA = await freshClass();
    const shared = mssv('q');
    await importRoster(idA, teacherToken, { students: [{ mssv: shared, name: 'Tên cũ ở lớp A' }] });

    // Lớp B ở KỲ KHÁC nên em nhập được vào đó (T-STU-4); file của B mang tên mới.
    const otherSemester = await ensureTestSemester(dataSource, 2);
    const klassB = await seedClass(dataSource, { teacherId: lecturerId, semesterId: otherSemester });
    const response = await importRoster(klassB.id, teacherToken, {
      students: [{ mssv: shared, name: 'Tên mới theo file' }],
    });

    expect(response.status).toBe(200);
    expect(response.body.renamed).toEqual([{ mssv: shared, from: 'Tên cũ ở lớp A', to: 'Tên mới theo file' }]);
    // Chỉ có MỘT tên: lớp A cũng đọc ra tên mới.
    expect(await readRoster(idA)).toContain(`${shared}|Tên mới theo file`);
  });

  it('T-STU-4: sinh viên học lại ở kỳ sau được nhập vào lớp của kỳ mới (Review Focus 5)', async () => {
    const shared = mssv('r');
    await importRoster(classId, teacherToken, { students: [{ mssv: shared, name: 'Học lại' }] });

    const nextSemester = await ensureTestSemester(dataSource, 3);
    const nextTerm = await seedClass(dataSource, { teacherId: lecturerId, semesterId: nextSemester });
    const response = await importRoster(nextTerm.id, teacherToken, {
      students: [{ mssv: shared, name: 'Học lại' }],
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ added: 1, updated: 0, unchanged: 0 });
    // Và ở kỳ cũ em vẫn còn nguyên.
    expect(await readRoster(classId)).toContain(`${shared}|Học lại`);
  });

  it('cùng kỳ thì vẫn bị chặn — cùng một sinh viên ở hai lớp một kỳ làm bài nộp định tuyến sai', async () => {
    const shared = mssv('s2');
    await importRoster(siblingClassId, teacherToken, { students: [{ mssv: shared, name: 'Cùng kỳ' }] });
    const response = await importRoster(classId, teacherToken, { students: [{ mssv: shared, name: 'Cùng kỳ' }] });
    expect(response.status).toBe(409);
  });

  it('lớp chưa có học kỳ (dữ liệu cũ chưa backfill) chỉ so với chính nó, không chặn nhầm', async () => {
    const legacy = await seedClass(dataSource, { teacherId: lecturerId }); // semester_id NULL
    const shared = mssv('s3');
    await importRoster(siblingClassId, teacherToken, { students: [{ mssv: shared, name: 'Ở lớp có kỳ' }] });
    const response = await importRoster(legacy.id, teacherToken, { students: [{ mssv: shared, name: 'Ở lớp có kỳ' }] });
    expect(response.status).toBe(200);
  });

  it('MSSV gõ khác hoa-thường là CÙNG MỘT sinh viên: không sinh thêm hàng student (Review Focus 2)', async () => {
    const person = mssv('s4');
    const nextSemester = await ensureTestSemester(dataSource, 2);
    const first = await freshClass();
    await importRoster(first, teacherToken, { students: [{ mssv: person, name: 'Một Người' }] });
    const other = await seedClass(dataSource, { teacherId: lecturerId, semesterId: nextSemester });
    await importRoster(other.id, teacherToken, { students: [{ mssv: person.toLowerCase(), name: 'Một Người' }] });

    const rows = await dataSource.query(`SELECT count(*)::int AS n FROM examcollect.student WHERE mssv = $1`, [person]);
    expect(rows[0].n).toBe(1);
  });

  it('refuses a lecturer importing into a class they do not teach', async () => {
    const id = await freshClass();

    const response = await importRoster(id, otherTeacherToken, {
      students: [{ mssv: mssv('p'), name: 'Không phải lớp của tôi' }],
    });

    // class.teacher_id is the whole of a lecturer's scope. It is the only
    // thing standing between them and rewriting a colleague's class list.
    expect(response.status).toBe(403);
  });

  describe('adding and removing one student by hand', () => {
    it('adds a late transfer without re-sending the whole file', async () => {
      const id = await freshClass();
      const existing = mssv('s');
      await importRoster(id, teacherToken, {
        students: [{ mssv: existing, name: 'Có sẵn' }],
      });

      const added = mssv('t');
      const response = await request(app.getHttpServer())
        .post(`/classes/${id}/roster/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ mssv: added, name: 'Chuyển lớp muộn' });

      expect(response.status).toBe(201);
      expect(await readRoster(id)).toHaveLength(2);
    });

    it('holds a typed student to the same MSSV rule as a file row', async () => {
      const id = await freshClass();

      const response = await request(app.getHttpServer())
        .post(`/classes/${id}/roster/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ mssv: 'SV 001', name: 'Có dấu cách' });

      // A hand-typed row is not a looser row.
      expect(response.status).toBe(400);
      expect(await readRoster(id)).toEqual([]);
    });

    it('refuses a student who already sits in a sibling class of the semester', async () => {
      const shared = mssv('u');
      await importRoster(siblingClassId, teacherToken, {
        students: [{ mssv: shared, name: 'Đã ở nhóm phụ' }],
      });

      const response = await request(app.getHttpServer())
        .post(`/classes/${classId}/roster/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ mssv: shared, name: 'Đã ở nhóm phụ' });

      // Same rule as the import: moving a student changes where their
      // submission is routed, and it is not a side effect of typing a name.
      expect(response.status).toBe(409);
    });

    it('T-STU-2: nhập tay MSSV đã có thì GIỮ tên đã lưu, không ghi đè bằng tên gõ (Review Focus 3)', async () => {
      const id = await freshClass();
      const known = mssv('s5');
      // Tên đã lưu từ một lớp trước, ở KỲ KHÁC (không bị chặn thành "ở lớp khác").
      const earlier = await seedClass(dataSource, { teacherId: lecturerId, semesterId: await ensureTestSemester(dataSource, 3) });
      await importRoster(earlier.id, teacherToken, { students: [{ mssv: known, name: 'Tên đã lưu đúng' }] });

      const response = await request(app.getHttpServer())
        .post(`/classes/${id}/roster/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ mssv: known, name: 'Tên gõ lệch' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ mssv: known, name: 'Tên đã lưu đúng' });
      expect(await readRoster(id)).toContain(`${known}|Tên đã lưu đúng`);
      const [stored] = await dataSource.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [known]);
      expect(stored.full_name).toBe('Tên đã lưu đúng');
    });

    it('MSSV chưa có thì tạo sinh viên bằng tên gõ', async () => {
      const id = await freshClass();
      const fresh = mssv('s6');
      const response = await request(app.getHttpServer())
        .post(`/classes/${id}/roster/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ mssv: fresh, name: 'Sinh viên mới tinh' });
      expect(response.status).toBe(201);
      const [stored] = await dataSource.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [fresh]);
      expect(stored.full_name).toBe('Sinh viên mới tinh');
    });

    it('removes one student — the undo for a mistyped MSSV', async () => {
      const id = await freshClass();
      const keep = mssv('v');
      const drop = mssv('w');
      await importRoster(id, teacherToken, {
        students: [
          { mssv: keep, name: 'Ở lại' },
          { mssv: drop, name: 'Gõ nhầm' },
        ],
      });

      const response = await request(app.getHttpServer())
        .delete(`/classes/${id}/roster/students/${drop}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(204);
      expect(await readRoster(id)).toEqual([`${keep}|Ở lại`]);
    });

    it('will not delete a student who is in a different class', async () => {
      const shared = mssv('x');
      await importRoster(siblingClassId, teacherToken, {
        students: [{ mssv: shared, name: 'Ở nhóm phụ' }],
      });

      const response = await request(app.getHttpServer())
        .delete(`/classes/${classId}/roster/students/${shared}`)
        .set('Authorization', `Bearer ${teacherToken}`);

      // A valid MSSV from a sibling class reads as not-found, never as
      // permission to delete someone else's student.
      expect(response.status).toBe(404);
      // The sibling class is a shared fixture that several tests import
      // into, so its size is not the assertion — that THIS student is
      // still on it is.
      expect(await readRoster(siblingClassId)).toContain(`${shared}|Ở nhóm phụ`);
    });
  });
});
