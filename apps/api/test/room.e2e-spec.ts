import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { seedClass, seedExamSession } from './helpers/seed';

describe('Rooms (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let teacherId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(app.getHttpServer()).post('/rooms').set(auth(token)).send(body);
  const patch = (id: string, body: object, token = adminToken) =>
    request(app.getHttpServer()).patch(`/rooms/${id}`).set(auth(token)).send(body);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function auditCount(action: string) {
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`, [action, adminId]);
    return row.n as number;
  }

  /** Tên phòng duy nhất, ASCII, và đủ xa mọi tên khác để không dính luật "gần giống". */
  const roomName = () => `Phong ZZ${randomTag(12)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const tag = randomTag();
    const adminEmail = `room_admin_${tag}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: 'correct-horse-battery', role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `room_teacher_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email: teacherEmail, password: 'correct-horse-battery', role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    try {
      await ds.query(`DELETE FROM examcollect.exam_session WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
      await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
    } finally {
      await app.close();
    }
  });

  describe('phân quyền', () => {
    it('giảng viên đọc được nhưng không nhận sessionCount; ghi thì 403', async () => {
      const name = roomName();
      const created = await post({ name }).expect(201);
      const list = await request(app.getHttpServer()).get('/rooms').set(auth(teacherToken)).expect(200);
      const row = list.body.find((r: { id: string }) => r.id === created.body.id);
      expect(row).toMatchObject({ name, isActive: true });
      expect(row).not.toHaveProperty('sessionCount');

      await post({ name: roomName() }, teacherToken).expect(403);
      await patch(created.body.id, { capacity: 10 }, teacherToken).expect(403);
      await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(teacherToken)).expect(403);
    });

    it('không token là 401', async () => {
      await request(app.getHttpServer()).get('/rooms').expect(401);
    });
  });

  describe('tạo', () => {
    it('chuẩn hoá tên (cắt đầu-cuối, gộp khoảng trắng), mặc định hoạt động, và ghi ĐÚNG MỘT dòng audit', async () => {
      const tag = randomTag(12);
      const before = await auditCount('room.create');
      const response = await post({ name: `  Phong   ZZ${tag}  `, capacity: 40 }).expect(201);

      expect(response.body).toMatchObject({ name: `Phong ZZ${tag}`, capacity: 40, isActive: true, sessionCount: 0 });
      expect(await auditCount('room.create')).toBe(before + 1);
      const [row] = await ds.query(`SELECT new_value FROM examcollect.audit_log WHERE target_id = $1`, [response.body.id]);
      expect(row.new_value).toMatchObject({ targetLabel: `Phong ZZ${tag}`, capacity: 40, isActive: true });
    });

    it('sức chứa tuỳ chọn (không biết sức chứa không được chặn việc ghi nhận phòng)', async () => {
      const response = await post({ name: roomName() }).expect(201);
      expect(response.body.capacity).toBeNull();
    });

    it('trùng tên không phân biệt hoa-thường và khoảng trắng thừa là 409 nêu tên (Review Focus 3)', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong zz${tag}` }).expect(201);
      const dup = await post({ name: `  PHONG   ZZ${tag} ` }).expect(409);
      expect(dup.body.message).toContain('đã tồn tại');
      expect(dup.body).not.toHaveProperty('error', 'NEAR_DUPLICATE');
    });

    it('đầu vào sai là 400: rỗng, quá dài, sức chứa ngoài 1–1000', async () => {
      await post({ name: '   ' }).expect(400);
      await post({ name: 'x'.repeat(101) }).expect(400);
      await post({ name: roomName(), capacity: 0 }).expect(400);
      await post({ name: roomName(), capacity: 1001 }).expect(400);
      await post({}).expect(400);
    });

    it('T-IMP-8 (nhập tay): tên gần giống phòng có sẵn bị chặn bằng 409 NEAR_DUPLICATE kèm phòng giống; xác nhận thì ghi được', async () => {
      const tag = randomTag(12);
      const existing = await post({ name: `Phong ZZ${tag}` }).expect(201);
      const before = await auditCount('room.create');

      // Chỉ khác dấu chấm và hoa-thường sau chuẩn hoá: cùng tên theo luật "gần giống", khác theo citext.
      const warn = await post({ name: `PHONG.ZZ${tag}` }).expect(409);
      expect(warn.body).toMatchObject({ error: 'NEAR_DUPLICATE' });
      expect(warn.body.similar).toEqual([{ id: existing.body.id, name: `Phong ZZ${tag}` }]);
      // Cảnh báo không phải ghi: không dòng audit, không phòng mới.
      expect(await auditCount('room.create')).toBe(before);

      const confirmed = await post({ name: `PHONG.ZZ${tag}`, confirmSimilar: true }).expect(201);
      expect(confirmed.body.name).toBe(`PHONG.ZZ${tag}`);
      expect(await auditCount('room.create')).toBe(before + 1);
    });

    it('KHÔNG cảnh báo trên các cặp phòng thật khác nhau (A1/B1, Review Focus 4)', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong may ZZ${tag}A1` }).expect(201);
      await post({ name: `Phong may ZZ${tag}B1` }).expect(201);
    });

    it('thêm lỗi gõ liền kề đổi chỗ cũng bị cảnh báo', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong ZZ${tag}AB` }).expect(201);
      const warn = await post({ name: `Phong ZZ${tag}BA` }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
    });
  });

  describe('sửa', () => {
    it('đổi sức chứa và tắt hoạt động; audit chỉ ghi các trường đổi', async () => {
      const created = await post({ name: roomName(), capacity: 40 }).expect(201);
      const response = await patch(created.body.id, { capacity: 45, isActive: false }).expect(200);
      expect(response.body).toMatchObject({ capacity: 45, isActive: false });

      const rows = await ds.query(
        `SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'room.update'`,
        [created.body.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].old_value).toEqual({ capacity: 40, isActive: true });
      expect(Object.keys(rows[0].new_value).sort()).toEqual(['capacity', 'isActive', 'targetLabel']);
    });

    it('xoá sức chứa bằng null', async () => {
      const created = await post({ name: roomName(), capacity: 40 }).expect(201);
      const response = await patch(created.body.id, { capacity: null }).expect(200);
      expect(response.body.capacity).toBeNull();
    });

    it('đổi tên: trùng tên phòng khác là 409; một phòng không "trùng" với chính nó', async () => {
      const a = await post({ name: roomName() }).expect(201);
      const b = await post({ name: roomName() }).expect(201);
      await patch(a.body.id, { name: a.body.name.toUpperCase() }).expect(200); // đổi hoa-thường của chính mình
      const clash = await patch(b.body.id, { name: a.body.name }).expect(409);
      expect(clash.body.message).toContain('đã tồn tại');
    });

    it('đổi tên gần giống phòng khác bị cảnh báo; thêm khoảng trắng thừa vào tên của chính mình thì không', async () => {
      const tag = randomTag(12);
      await post({ name: `Phong ZZ${tag}` }).expect(201);
      const other = await post({ name: roomName() }).expect(201);
      // Dấu chấm thay khoảng trắng: khác nhau với citext (không phải trùng cứng) nhưng bằng nhau sau chuẩn hoá.
      const warn = await patch(other.body.id, { name: `Phong.ZZ${tag}` }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
      // Hai khoảng trắng cuối bị cắt: chuẩn hoá cho ra đúng tên cũ, nên không đổi gì và không cảnh báo.
      await patch(other.body.id, { name: `${other.body.name}  ` }).expect(200);
    });

    it('đổi tên không đổi bản chụp trên phiên cũ (T-ROOM-3 phần phòng; phần phiên ở plan D)', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 20 * 24 * 3_600_000);
      const session = await seedExamSession(ds, {
        teacherId,
        classId: klass.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        status: 'completed',
        roomId: created.body.id,
        roomName: created.body.name,
      });
      const newName = roomName();
      await patch(created.body.id, { name: newName }).expect(200);
      const [row] = await ds.query(`SELECT room_name FROM examcollect.exam_session WHERE id = $1`, [session.id]);
      expect(row.room_name).toBe(created.body.name);
    });

    it('404 cho phòng không tồn tại', async () => {
      await patch('00000000-0000-4000-8000-000000000000', { capacity: 5 }).expect(404);
    });
  });

  describe('danh sách', () => {
    it('?active=true chỉ trả phòng đang hoạt động; mặc định trả cả hai (cho trang quản trị)', async () => {
      const on = await post({ name: roomName() }).expect(201);
      const off = await post({ name: roomName() }).expect(201);
      await patch(off.body.id, { isActive: false }).expect(200);

      const active = await request(app.getHttpServer()).get('/rooms?active=true').set(auth(teacherToken)).expect(200);
      const ids = active.body.map((r: { id: string }) => r.id);
      expect(ids).toContain(on.body.id);
      expect(ids).not.toContain(off.body.id);

      const all = await request(app.getHttpServer()).get('/rooms').set(auth(adminToken)).expect(200);
      const allIds = all.body.map((r: { id: string }) => r.id);
      expect(allIds).toEqual(expect.arrayContaining([on.body.id, off.body.id]));
    });

    it('sessionCount của admin đếm đúng số phiên của phòng', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 21 * 24 * 3_600_000);
      await seedExamSession(ds, {
        teacherId,
        classId: klass.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        status: 'completed',
        roomId: created.body.id,
      });
      const list = await request(app.getHttpServer()).get('/rooms').set(auth(adminToken)).expect(200);
      expect(list.body.find((r: { id: string }) => r.id === created.body.id).sessionCount).toBe(1);
    });

    it('sắp theo tên: hai phòng chỉ khác ký tự cuối thì A đứng trước B', async () => {
      // Không so với một thứ tự tính bằng JS: DB sắp theo collation của nó (bỏ qua
      // khoảng trắng và dấu câu ở lượt đầu), còn `localeCompare` theo luật ICU — hai bên
      // lệch nhau ở tên có khoảng trắng. Hai tên khác nhau đúng ở ký tự cuối thì
      // collation nào cũng cho cùng một thứ tự.
      const tag = randomTag(12);
      const b = await post({ name: `Phong ZZ${tag}B` }).expect(201);
      const a = await post({ name: `Phong ZZ${tag}A` }).expect(201);
      const list = await request(app.getHttpServer()).get('/rooms').set(auth(adminToken)).expect(200);
      const ids = list.body.map((r: { id: string }) => r.id);
      expect(ids.indexOf(a.body.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(a.body.id)).toBeLessThan(ids.indexOf(b.body.id));
    });

    it('tham số active lạ là 400', async () => {
      await request(app.getHttpServer()).get('/rooms?active=maybe').set(auth(adminToken)).expect(400);
    });
  });

  describe('xoá', () => {
    it('xoá được phòng chưa có phiên; audit mang tên trong oldValue', async () => {
      const created = await post({ name: roomName(), capacity: 30 }).expect(201);
      await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(adminToken)).expect(204);
      const [row] = await ds.query(`SELECT old_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'room.delete'`, [created.body.id]);
      expect(row.old_value).toMatchObject({ targetLabel: created.body.name, capacity: 30 });
    });

    it('T-MD-8: phòng đã có phiên không xoá được; báo số phiên và gợi ý tắt hoạt động', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 22 * 24 * 3_600_000);
      await seedExamSession(ds, {
        teacherId,
        classId: klass.id,
        startTime: start,
        endTime: new Date(start.getTime() + 3_600_000),
        status: 'completed',
        roomId: created.body.id,
      });
      const blocked = await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toMatch(/1 phiên/);
      expect(blocked.body.message).toMatch(/hoạt động/);
    });

    it('xoá thất bại không để lại dòng audit', async () => {
      const created = await post({ name: roomName() }).expect(201);
      const klass = await seedClass(ds, { teacherId });
      const start = new Date(Date.now() - 23 * 24 * 3_600_000);
      await seedExamSession(ds, {
        teacherId, classId: klass.id, startTime: start, endTime: new Date(start.getTime() + 3_600_000), status: 'completed', roomId: created.body.id,
      });
      const before = await auditCount('room.delete');
      await request(app.getHttpServer()).delete(`/rooms/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(await auditCount('room.delete')).toBe(before);
    });
  });
});
