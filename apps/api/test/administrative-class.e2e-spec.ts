import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { seedClass } from './helpers/seed';

describe('Danh mục lớp danh nghĩa (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let teacherId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) =>
    request(app.getHttpServer()).post('/administrative-classes').set(auth(token)).send(body);
  const patch = (id: string, body: object, token = adminToken) =>
    request(app.getHttpServer()).patch(`/administrative-classes/${id}`).set(auth(token)).send(body);

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

  /** Mã duy nhất, ngẫu nhiên, đủ xa mọi mã khác để không dính luật "gần giống". */
  const code = () => `ZZ${randomTag(12)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const tag = randomTag();
    const adminEmail = `adm_admin_${tag}@example.com`;
    adminId = await createTestAccount(ds, { email: adminEmail, password: 'correct-horse-battery', role: 'admin' });
    adminToken = await login(adminEmail);
    const teacherEmail = `adm_teacher_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email: teacherEmail, password: 'correct-horse-battery', role: 'teacher' });
    teacherToken = await login(teacherEmail);
  });

  afterAll(async () => {
    try {
      await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = $1`, [teacherId]).catch(() => undefined);
    } finally {
      await app.close();
    }
  });

  it('T-ADM-5: giảng viên không đọc cũng không ghi được Danh mục (mọi route đều 403)', async () => {
    const created = await post({ code: code() }).expect(201);
    await request(app.getHttpServer()).get('/administrative-classes').set(auth(teacherToken)).expect(403);
    await post({ code: code() }, teacherToken).expect(403);
    await patch(created.body.id, { code: code() }, teacherToken).expect(403);
    await request(app.getHttpServer()).delete(`/administrative-classes/${created.body.id}`).set(auth(teacherToken)).expect(403);
    await request(app.getHttpServer()).get('/administrative-classes').expect(401);
  });

  describe('tạo', () => {
    it('T-MD-3 (service): viết hoa và cắt khoảng trắng; mã gõ lại ở dạng khác là 409', async () => {
      const base = code();
      const before = await auditCount('administrative_class.create');
      const created = await post({ code: ` ${base.toLowerCase()} ` }).expect(201);
      expect(created.body).toMatchObject({ code: base, classCount: 0 });
      expect(await auditCount('administrative_class.create')).toBe(before + 1);

      const dup = await post({ code: base }).expect(409);
      expect(dup.body.message).toContain('đã tồn tại');
      expect(dup.body).not.toHaveProperty('error', 'NEAR_DUPLICATE');
      const dup2 = await post({ code: `  ${base.toLowerCase()}` }).expect(409);
      expect(dup2.body.message).toContain('đã tồn tại');
      // Trùng cứng không để lại dòng audit nào thêm.
      expect(await auditCount('administrative_class.create')).toBe(before + 1);
    });

    it('audit mang targetLabel và code', async () => {
      const value = code();
      const created = await post({ code: value }).expect(201);
      const [row] = await ds.query(`SELECT new_value FROM examcollect.audit_log WHERE target_id = $1`, [created.body.id]);
      expect(row.new_value).toEqual({ targetLabel: value, code: value });
    });

    it('mã dạng Tên(mã) như danh sách của trường được đọc thành mã trong ngoặc (quyết định của user 06/10)', async () => {
      const value = code();
      const created = await post({ code: `Anh van 4(${value.toLowerCase()})` }).expect(201);
      expect(created.body.code).toBe(value);
      const [row] = await ds.query(`SELECT new_value FROM examcollect.audit_log WHERE target_id = $1`, [created.body.id]);
      expect(row.new_value).toEqual({ targetLabel: value, code: value });
    });

    it('mã sai định dạng là 400 kèm lý do: quá ngắn, quá dài, ký tự lạ, khoảng trắng giữa', async () => {
      await post({ code: 'AB' }).expect(400);
      await post({ code: 'A'.repeat(31) }).expect(400);
      await post({ code: 'DHK-TPM18' }).expect(400);
      const spaced = await post({ code: 'DHK TPM18' }).expect(400);
      expect(spaced.body.message).toMatch(/chữ và số/);
      await post({ code: '   ' }).expect(400);
      await post({}).expect(400);
    });

    it('T-ADM-3: mã gần giống mã có sẵn bị cảnh báo 409 NEAR_DUPLICATE; xác nhận thì ghi được', async () => {
      const base = `ZZ${randomTag(10)}AB`;
      const existing = await post({ code: base }).expect(201);
      const before = await auditCount('administrative_class.create');

      const similar = `${base.slice(0, -2)}BA`; // hai ký tự cuối đổi chỗ
      const warn = await post({ code: similar }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
      expect(warn.body.similar).toEqual([{ id: existing.body.id, name: base }]);
      expect(await auditCount('administrative_class.create')).toBe(before);

      const confirmed = await post({ code: similar, confirmSimilar: true }).expect(201);
      expect(confirmed.body.code).toBe(similar);
    });

    it('KHÔNG cảnh báo trên cặp lớp thật khác nhau ATT/CTT (Review Focus 4)', async () => {
      const prefix = `ZZ${randomTag(8)}`;
      await post({ code: `${prefix}ATT` }).expect(201);
      await post({ code: `${prefix}CTT` }).expect(201);
    });

    it('cảnh báo cả trường hợp thiếu một ký tự', async () => {
      const base = `ZZ${randomTag(10)}ATT`;
      await post({ code: base }).expect(201);
      const warn = await post({ code: base.slice(0, -1) }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
    });
  });

  describe('sửa', () => {
    it('sửa lỗi gõ: đổi code của đúng một dòng; audit ghi cũ và mới', async () => {
      const typo = code();
      const created = await post({ code: typo }).expect(201);
      const fixed = code();
      const response = await patch(created.body.id, { code: fixed.toLowerCase() }).expect(200);
      expect(response.body.code).toBe(fixed);

      const [row] = await ds.query(
        `SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'administrative_class.update'`,
        [created.body.id],
      );
      expect(row.old_value).toEqual({ code: typo });
      expect(row.new_value).toEqual({ targetLabel: fixed, code: fixed });
    });

    it('đổi sang mã đã có là 409; đổi hoa-thường của chính mình thì không phải trùng', async () => {
      const a = await post({ code: code() }).expect(201);
      const b = await post({ code: code() }).expect(201);
      await patch(a.body.id, { code: a.body.code.toLowerCase() }).expect(200);
      const clash = await patch(b.body.id, { code: a.body.code }).expect(409);
      expect(clash.body.message).toContain('đã tồn tại');
    });

    it('đổi sang mã gần giống mã khác bị cảnh báo; confirmSimilar bỏ qua', async () => {
      const base = `ZZ${randomTag(10)}AB`;
      await post({ code: base }).expect(201);
      const other = await post({ code: code() }).expect(201);
      const similar = `${base.slice(0, -2)}BA`;
      const warn = await patch(other.body.id, { code: similar }).expect(409);
      expect(warn.body.error).toBe('NEAR_DUPLICATE');
      await patch(other.body.id, { code: similar, confirmSimilar: true }).expect(200);
    });

    it('404 cho mã không tồn tại; gửi lại đúng giá trị cũ không ghi audit', async () => {
      await patch('00000000-0000-4000-8000-000000000000', { code: code() }).expect(404);
      const created = await post({ code: code() }).expect(201);
      await patch(created.body.id, { code: created.body.code }).expect(200);
      const rows = await ds.query(`SELECT 1 FROM examcollect.audit_log WHERE target_id = $1 AND action = 'administrative_class.update'`, [created.body.id]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('danh sách và xoá', () => {
    it('danh sách đếm số lớp đang dùng mỗi mã', async () => {
      const value = code();
      const created = await post({ code: value }).expect(201);
      await seedClass(ds, { teacherId, administrativeClassId: created.body.id, groupName: 'Nhóm 1' });
      await seedClass(ds, { teacherId, administrativeClassId: created.body.id, groupName: 'Nhóm 2' });

      const list = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      expect(list.body.find((c: { id: string }) => c.id === created.body.id)).toMatchObject({ code: value, classCount: 2 });
    });

    it('sắp theo mã: hai mã chỉ khác ký tự cuối thì A đứng trước B', async () => {
      // Xem ghi chú ở test phòng: không so với một thứ tự tính bằng JS vì collation của DB khác ICU.
      const prefix = `ZZ${randomTag(10)}`;
      const b = await post({ code: `${prefix}B` }).expect(201);
      const a = await post({ code: `${prefix}A` }).expect(201);
      const list = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      const ids = list.body.map((c: { id: string }) => c.id);
      expect(ids.indexOf(a.body.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(a.body.id)).toBeLessThan(ids.indexOf(b.body.id));
    });

    it('T-MD-4: xoá mã còn lớp dùng bị chặn kèm lý do và số lớp', async () => {
      const created = await post({ code: code() }).expect(201);
      await seedClass(ds, { teacherId, administrativeClassId: created.body.id });
      const before = await auditCount('administrative_class.delete');

      const blocked = await request(app.getHttpServer()).delete(`/administrative-classes/${created.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toContain(created.body.code);
      expect(blocked.body.message).toMatch(/1 lớp/);
      expect(await auditCount('administrative_class.delete')).toBe(before);
    });

    it('T-MD-4: mã không lớp nào dùng thì xoá được, và KHÔNG tự biến mất khi chưa ai xoá (đã bỏ "mồ côi tự dọn")', async () => {
      const created = await post({ code: code() }).expect(201);
      // Chưa có lớp nào dùng: vẫn nằm trong Danh mục.
      const list = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      expect(list.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

      // Một lớp dùng nó rồi bị xoá: mã vẫn ở lại.
      const klass = await seedClass(ds, { teacherId, administrativeClassId: created.body.id });
      await ds.query(`DELETE FROM examcollect.class WHERE id = $1`, [klass.id]);
      const again = await request(app.getHttpServer()).get('/administrative-classes').set(auth(adminToken)).expect(200);
      expect(again.body.map((c: { id: string }) => c.id)).toContain(created.body.id);

      await request(app.getHttpServer()).delete(`/administrative-classes/${created.body.id}`).set(auth(adminToken)).expect(204);
      const [row] = await ds.query(`SELECT old_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'administrative_class.delete'`, [created.body.id]);
      expect(row.old_value).toMatchObject({ targetLabel: created.body.code });
    });
  });
});
