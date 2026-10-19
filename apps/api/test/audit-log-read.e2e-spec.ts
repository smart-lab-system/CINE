import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { AuditLogService } from '../src/admin/audit-log.service';
import { createTestAccount } from './helpers/create-account';

/**
 * Nhật ký thao tác — đường đọc chỉ cho admin. Giá trị cũ/mới có thể nhạy cảm, nên API chỉ trả TÊN trường đã đổi.
 */
describe('Nhật ký thao tác — đọc chỉ (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let auditSvc: AuditLogService;
  const RUN = randomUUID().slice(0, 8);
  const ACT_OVERRIDE = `nhat_ky_test.ghi_de.${RUN}`;
  const ACT_OTHER = `nhat_ky_test.khac.${RUN}`;
  const SECRET_OLD = 'GIA-TRI-CU-NHAY-CAM';
  const SECRET_NEW = 'GIA-TRI-MOI-NHAY-CAM';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    ds = app.get(DataSource);
    auditSvc = app.get(AuditLogService);

    adminId = await createTestAccount(ds, {
      name: 'Admin nhật ký',
      email: `audit-admin-${randomUUID()}@test.local`,
      password: 'secret-pass-1',
      role: 'admin',
    });
    const teacherEmail = `audit-teacher-${randomUUID()}@test.local`;
    await createTestAccount(ds, { name: 'GV nhật ký', email: teacherEmail, password: 'secret-pass-1', role: 'teacher' });

    adminToken = (await request(app.getHttpServer()).post('/auth/login').send({
      email: (await ds.query(`SELECT email FROM examcollect.account WHERE id = $1`, [adminId]))[0].email,
      password: 'secret-pass-1',
    })).body.accessToken;
    teacherToken = (await request(app.getHttpServer()).post('/auth/login').send({
      email: teacherEmail,
      password: 'secret-pass-1',
    })).body.accessToken;

    await auditSvc.recordUserAction({
      actorId: adminId,
      action: ACT_OVERRIDE,
      targetType: 'error_rule',
      targetId: randomUUID(),
      oldValue: { deduction: 300, note: SECRET_OLD },
      newValue: { deduction: 150, note: SECRET_NEW },
    });
    await auditSvc.recordUserAction({
      actorId: adminId,
      action: ACT_OTHER,
      targetType: 'account',
      targetId: randomUUID(),
      oldValue: {},
      newValue: { role: 'teacher' },
    });
  }, 60_000);

  afterAll(async () => app.close());

  it('giảng viên không đọc được nhật ký → 403', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/audit-log')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  it('admin đọc được: có tên trường đã đổi, KHÔNG có giá trị cũ hay mới', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/audit-log?action=${ACT_OVERRIDE}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    const [item] = res.body.items;
    expect(item.action).toBe(ACT_OVERRIDE);
    expect(item.actorName).toBe('Admin nhật ký');
    expect(item.changedFields).toEqual(['deduction', 'note']);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_OLD);
    expect(JSON.stringify(res.body)).not.toContain(SECRET_NEW);
  });

  it('lọc theo hành động chỉ trả đúng hành động đó', async () => {
    const res = await request(app.getHttpServer())
      .get(`/admin/audit-log?action=${ACT_OTHER}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items.every((i: { action: string }) => i.action === ACT_OTHER)).toBe(true);
  });

  it('phân trang bằng before: trang đầu có nextBefore, trang sau không trùng và tiến về quá khứ', async () => {
    const first = await request(app.getHttpServer())
      .get(`/admin/audit-log?limit=1&action=${ACT_OVERRIDE},${ACT_OTHER}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(1);
    expect(first.body.nextBefore).not.toBeNull();
    const second = await request(app.getHttpServer())
      .get(`/admin/audit-log?limit=1&before=${encodeURIComponent(first.body.nextBefore)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(second.status).toBe(200);
    expect(second.body.items[0]?.id).not.toBe(first.body.items[0].id);
    expect(new Date(second.body.items[0].occurredAt).getTime()).toBeLessThan(new Date(first.body.items[0].occurredAt).getTime());
  });

  it('lọc theo thời gian bắt đầu: from ở tương lai → không có dòng nào', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const res = await request(app.getHttpServer())
      .get(`/admin/audit-log?action=${ACT_OVERRIDE}&from=${encodeURIComponent(future)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });

  it('limit ngoài khoảng 1..200 → 400', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/audit-log?limit=500')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
  });
});
