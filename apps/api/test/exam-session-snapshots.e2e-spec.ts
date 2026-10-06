import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { semesterLabel } from '../src/common/semester-label';
import { createTestAccount } from './helpers/create-account';
import { ensurePastSemester, ensureTestSemester, randomTag } from './helpers/master-data';
import { ensureRoom, seedClass } from './helpers/seed';

/**
 * `room_name`, `semester_name` — ảnh chụp lúc tạo phiên (spec §2.4, CLAUDE.md §7.1.5).
 *
 * Từ khi phòng và học kỳ là thực thể, hai chuỗi này KHÔNG còn do giảng viên gõ: server chép tên phòng và nhãn học
 * kỳ của lớp vào lúc tạo. Test thứ hai và thứ ba của mỗi nhóm là toàn bộ lý do cột tồn tại — nếu chúng xanh cả khi
 * bỏ cột đi (đọc tên bằng join) thì cột đó không cần thiết, và bảng điểm cũ sẽ đổi theo mỗi lần admin đổi tên phòng.
 */
describe('Phiên thi: bản chụp phòng và học kỳ (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let teacherToken: string;
  let teacherId: string;
  let adminToken: string;
  let semesterId: string;
  let semesterText: string;

  const tag = randomTag(8);
  let windowCursor = 0;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Mỗi phiên một khung giờ riêng và một lớp riêng: hai phiên cùng lớp chồng giờ bị 409. */
  function create(body: Record<string, unknown>, token = teacherToken) {
    windowCursor += 1;
    const start = Date.now() + (windowCursor * 3 + 1) * 3_600_000;
    return request(app.getHttpServer())
      .post('/exam-sessions')
      .set(auth(token))
      .send({
        name: `Snapshot ${tag} ${windowCursor}`,
        examType: 'CK',
        startTime: new Date(start).toISOString(),
        endTime: new Date(start + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
        ...body,
      });
  }

  async function account(prefix: string, role: 'teacher' | 'admin') {
    const email = `${prefix}_${tag}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: login.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const teacher = await account('snap_gv', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    adminToken = (await account('snap_admin', 'admin')).token;

    semesterId = await ensureTestSemester(ds, 1);
    const [{ academic_year_start: year, term }] = await ds.query(
      `SELECT academic_year_start, term FROM examcollect.semester WHERE id = $1`,
      [semesterId],
    );
    semesterText = semesterLabel(year, term);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('chụp lúc tạo', () => {
    it('server chép tên phòng và nhãn học kỳ của LỚP vào phiên, và trả roomId + classLabel', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong chup ${tag} A`);

      const res = await create({ classId: klass.id, roomId: room.id }).expect(201);

      expect(res.body).toMatchObject({
        roomId: room.id,
        roomName: room.name,
        semesterName: semesterText,
        classLabel: klass.label,
      });
      const [row] = await ds.query(`SELECT room_id, room_name, semester_name FROM examcollect.exam_session WHERE id = $1`, [res.body.id]);
      expect(row).toEqual({ room_id: room.id, room_name: room.name, semester_name: semesterText });
    });

    it('client cũ gửi roomName/semesterName: bị bỏ qua, và không có roomId thì 400 — không tạo phòng, không dùng tên đó (Review Focus 2)', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.room`);

      const res = await create({ classId: klass.id, roomName: `Phong gõ tay ${tag}`, semesterName: 'HK tự khai' }).expect(400);

      expect(JSON.stringify(res.body.message)).toMatch(/roomId/);
      const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.room`);
      expect(after).toBe(before);
    });

    it('semesterName và roomName gửi KÈM roomId hợp lệ vẫn bị bỏ qua: bản chụp luôn đến từ server', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong chup ${tag} B`);

      const res = await create({ classId: klass.id, roomId: room.id, roomName: 'GIẢ', semesterName: 'GIẢ' }).expect(201);

      expect(res.body.roomName).toBe(room.name);
      expect(res.body.semesterName).toBe(semesterText);
    });

    it('roomId không phải uuid, hoặc không có thật: 400; lớp không có học kỳ: 409 và không ghi gì (Review Focus 4)', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      await create({ classId: klass.id, roomId: 'khong-phai-uuid' }).expect(400);
      const ghost = await create({ classId: klass.id, roomId: '00000000-0000-4000-8000-0000000000ee' }).expect(400);
      expect(ghost.body.message).toMatch(/phòng/i);

      const legacy = await seedClass(ds, { teacherId, semesterId: null }); // lớp cũ chưa backfill
      const room = await ensureRoom(ds, `Phong chup ${tag} C`);
      const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_session WHERE class_id = $1`, [legacy.id]);
      const blocked = await create({ classId: legacy.id, roomId: room.id }).expect(409);
      expect(blocked.body.message).toMatch(/học kỳ/);
      const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_session WHERE class_id = $1`, [legacy.id]);
      expect(after).toBe(before);
    });
  });

  describe('T-ROOM-3: đổi tên phòng không đổi phiên cũ', () => {
    it('bản chụp giữ tên cũ; phiên TẠO SAU mang tên mới (Review Focus 1)', async () => {
      const room = await ensureRoom(ds, `Phong doi ten ${tag}`);
      const klass = await seedClass(ds, { teacherId, semesterId });
      const old = await create({ classId: klass.id, roomId: room.id }).expect(201);

      const newName = `Phong da doi ten ${tag}`;
      await request(app.getHttpServer()).patch(`/rooms/${room.id}`).set(auth(adminToken)).send({ name: newName }).expect(200);

      const [row] = await ds.query(`SELECT room_name FROM examcollect.exam_session WHERE id = $1`, [old.body.id]);
      expect(row.room_name).toBe(room.name);

      const klass2 = await seedClass(ds, { teacherId, semesterId });
      const fresh = await create({ classId: klass2.id, roomId: room.id }).expect(201);
      expect(fresh.body.roomName).toBe(newName);
    });
  });

  describe('T-MD-9: bản chụp học kỳ không đổi theo học kỳ', () => {
    it('admin sửa ngày của học kỳ thì semester_name trên phiên không đổi', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong T-MD-9 ${tag}`);
      const created = await create({ classId: klass.id, roomId: room.id }).expect(201);
      const [{ end_date: end }] = await ds.query(`SELECT to_char(end_date, 'YYYY-MM-DD') AS end_date FROM examcollect.semester WHERE id = $1`, [semesterId]);

      // Ngày sửa được (năm/kỳ thì không khi đã có lớp). Co ngày kết thúc lùi một ngày rồi trả lại.
      const shorter = new Date(`${end}T00:00:00Z`);
      shorter.setUTCDate(shorter.getUTCDate() - 1);
      const shorterText = shorter.toISOString().slice(0, 10);
      await request(app.getHttpServer()).patch(`/semesters/${semesterId}`).set(auth(adminToken)).send({ endDate: shorterText }).expect(200);
      await request(app.getHttpServer()).patch(`/semesters/${semesterId}`).set(auth(adminToken)).send({ endDate: end }).expect(200);

      const [row] = await ds.query(`SELECT semester_name FROM examcollect.exam_session WHERE id = $1`, [created.body.id]);
      expect(row.semester_name).toBe(semesterText);
    });

    it('cột không ghi đè được, kể cả khi save() mang giá trị khác', async () => {
      // `{ update: false }` ở tầng TypeORM. JSDoc "KHÔNG BAO GIỜ sửa" chỉ là lời hứa; một cột kỳ bị ghi đè làm bảng
      // điểm ghi sai kỳ, vĩnh viễn, không triệu chứng.
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong update false ${tag}`);
      const created = await create({ classId: klass.id, roomId: room.id }).expect(201);

      const repo = ds.getRepository('ExamSessionEntity');
      await repo.save({ id: created.body.id, semesterName: 'KỲ BỊ GHI ĐÈ', name: 'Tên mới' });

      const [row] = await ds.query(`SELECT semester_name, name FROM examcollect.exam_session WHERE id = $1`, [created.body.id]);
      expect(row.semester_name).toBe(semesterText);
      // Cột thường vẫn ghi được — nếu cả hai cùng không đổi thì test xanh vì save() không chạy, không phải vì cột được bảo vệ.
      expect(row.name).toBe('Tên mới');
    });
  });

  describe('T-ROOM-2: phòng ngừng hoạt động', () => {
    it('không chọn được cho phiên MỚI (400 nêu tên), nhưng phiên cũ vẫn tham chiếu được (Review Focus 3)', async () => {
      const room = await ensureRoom(ds, `Phong ngung ${tag}`);
      const klass = await seedClass(ds, { teacherId, semesterId });
      const before = await create({ classId: klass.id, roomId: room.id }).expect(201);

      await request(app.getHttpServer()).patch(`/rooms/${room.id}`).set(auth(adminToken)).send({ isActive: false }).expect(200);

      const klass2 = await seedClass(ds, { teacherId, semesterId });
      const blocked = await create({ classId: klass2.id, roomId: room.id }).expect(400);
      expect(blocked.body.message).toContain(room.name);
      expect(blocked.body.message).toMatch(/ngừng hoạt động/);

      // Phiên cũ không bị đụng: đọc lại được, vẫn mang phòng.
      const old = await request(app.getHttpServer()).get(`/exam-sessions/${before.body.id}`).set(auth(teacherToken)).expect(200);
      expect(old.body.roomId).toBe(room.id);
      expect(old.body.roomName).toBe(room.name);

      // Và danh sách phòng cho form tạo phiên không còn nó.
      const active = await request(app.getHttpServer()).get('/rooms?active=true').set(auth(teacherToken)).expect(200);
      expect(active.body.map((r: { id: string }) => r.id)).not.toContain(room.id);
    });
  });

  describe('T-FLT-3: học kỳ không bao giờ chặn thao tác', () => {
    it('lớp của kỳ ĐÃ KẾT THÚC vẫn tạo được phiên thi', async () => {
      const pastSemester = await ensurePastSemester(ds);
      const klass = await seedClass(ds, { teacherId, semesterId: pastSemester });
      const room = await ensureRoom(ds, `Phong ky cu ${tag}`);
      const res = await create({ classId: klass.id, roomId: room.id }).expect(201);
      expect(res.body.semesterName).toBe('HK1 2001-2002');
    });
  });
});
