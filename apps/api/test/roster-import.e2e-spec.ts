import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

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

  let headToken: string;
  let otherHeadToken: string;
  let teacherToken: string;
  let otherTeacherToken: string;
  let lecturerId: string;
  let courseId: string;
  let classId: string;
  let siblingClassId: string;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function makeAccount(prefix: string, role: 'department_admin' | 'teacher') {
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

    const head = await makeAccount('roster_head', 'department_admin');
    headToken = head.token;
    otherHeadToken = (await makeAccount('roster_other', 'department_admin')).token;

    const lecturer = await makeAccount('roster_lecturer', 'teacher');
    lecturerId = lecturer.id;
    teacherToken = lecturer.token;
    otherTeacherToken = (await makeAccount('roster_other_teacher', 'teacher')).token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-01-01', '2026-06-01') RETURNING id`,
      [`Roster Semester ${Date.now()}`],
    );
    const [course] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id, department_head_id)
       VALUES ($1, 'Môn có danh sách', $2, $3) RETURNING id`,
      [`RS${Date.now()}`.slice(0, 20), semester.id, head.id],
    );
    courseId = course.id;

    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, course_name, name, teacher_id)
       VALUES ($1, (SELECT name FROM examcollect.course WHERE id = $1), $2, $3) RETURNING id`,
      [courseId, `Nhóm chính ${Date.now()}`, lecturerId],
    );
    classId = klass.id;

    // A second class under the SAME course — the cross-class case the
    // unique key (course_id, student_mssv) makes possible.
    const [sibling] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, course_name, name, teacher_id)
       VALUES ($1, (SELECT name FROM examcollect.course WHERE id = $1), $2, $3) RETURNING id`,
      [courseId, `Nhóm phụ ${Date.now()}`, lecturerId],
    );
    siblingClassId = sibling.id;
  });

  afterAll(async () => {
    await app.close();
  });

  /** A fresh class per test, so one test's roster is never another's fixture. */
  async function freshClass(): Promise<string> {
    const [klass] = await dataSource.query(
      `INSERT INTO examcollect.class (course_id, course_name, name, teacher_id)
       VALUES ($1, (SELECT name FROM examcollect.course WHERE id = $1), $2, $3) RETURNING id`,
      [
        courseId,
        `Nhóm ${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
        lecturerId,
      ],
    );
    return klass.id as string;
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

  it('refuses a student who already belongs to another class of the course', async () => {
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
    expect(response.body.message).toContain('Nhóm phụ');
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

  it('refuses a Trưởng khoa writing the list, while letting them read it', async () => {
    const id = await freshClass();
    await importRoster(id, teacherToken, {
      students: [{ mssv: mssv('q'), name: 'Do giảng viên nhập' }],
    });

    // Read: a head needs their department's headcounts.
    const read = await readRoster(id, headToken);
    expect(read).toHaveLength(1);

    // Write: exactly ONE writer per list. Two roles maintaining the same
    // roster means two people who can disagree about who maintains it.
    const written = await importRoster(id, headToken, {
      students: [{ mssv: mssv('r'), name: 'Trưởng khoa sửa' }],
    });
    expect(written.status).toBe(403);
  });

  it('refuses a head reading a class outside their own courses', async () => {
    const id = await freshClass();

    const response = await request(app.getHttpServer())
      .get(`/classes/${id}/roster`)
      .set('Authorization', `Bearer ${otherHeadToken}`);

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

    it('refuses a student who already sits in a sibling class', async () => {
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
