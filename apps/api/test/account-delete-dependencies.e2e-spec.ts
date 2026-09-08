import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount, type TestAccountRole } from './helpers/create-account';

/**
 * Xoá tài khoản gần như KHÔNG phải một thao tác có thật.
 *
 * 10 bảng trỏ vào `account`, tất cả ON DELETE RESTRICT. Một trong đó là
 * `audit_log.actor_id`, và `audit_log` mang trigger `trg_audit_log_immutable`
 * (BEFORE UPDATE OR DELETE) — nên các dòng chặn KHÔNG THỂ xoá được để giải
 * chặn. Một tài khoản đã từng làm dù chỉ một thao tác được audit thì vĩnh viễn
 * không xoá được. Đó là hệ quả có chủ đích của audit bất biến; cái phải sửa là
 * thông báo, không phải ràng buộc.
 */
describe('DELETE /accounts/:id — phụ thuộc giải được vs vĩnh viễn', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let semesterId: string;

  async function makeAccount(prefix: string, role: TestAccountRole) {
    const email = `${prefix}_${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;
    const password = 'Password123!';
    const id = await createTestAccount(dataSource, { email, password, role });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password });
    return { id, token: login.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    adminToken = (await makeAccount('del_admin', 'admin')).token;

    const [semester] = await dataSource.query(
      `INSERT INTO examcollect.semester (name, start_date, end_date)
       VALUES ($1, '2026-09-01', '2027-01-15') RETURNING id`,
      [`Kỳ xoá tài khoản ${Date.now()}`],
    );
    semesterId = semester.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('xoá một tài khoản chưa làm gì thì được', async () => {
    const spare = await makeAccount('del_spare', 'teacher');
    await request(app.getHttpServer())
      .delete(`/accounts/${spare.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
  });

  it('xoá một head còn môn thì 409, và nói rõ MÔN là thứ giải được', async () => {
    const head = await makeAccount('del_head', 'department_admin');
    await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id, department_head_id)
       VALUES ($1, 'Môn chặn xoá', $2, $3)`,
      [`DL${Date.now()}`.slice(0, 20), semesterId, head.id],
    );

    const res = await request(app.getHttpServer())
      .delete(`/accounts/${head.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.resolvable.courses).toBe(1);
    expect(res.body.permanent.auditLogEntries).toBe(0);
  });

  it('một tài khoản đã có dòng audit thì VĨNH VIỄN không xoá được, và 409 phải nói thế', async () => {
    // Phân công một môn là thao tác được audit, nên chính nó biến tài khoản
    // Phòng Đào tạo này thành không xoá được. Thông báo PHẢI phân biệt nó với
    // thứ gỡ được, vì "gỡ hết rồi thử lại" ở đây là lời khuyên không bao giờ
    // chạy được — đúng loại thất bại âm thầm mà việc đếm sinh ra để diệt.
    const actor = await makeAccount('del_actor', 'academic_affairs');
    const head = await makeAccount('del_target_head', 'department_admin');
    const [orphan] = await dataSource.query(
      `INSERT INTO examcollect.course (code, name, semester_id)
       VALUES ($1, 'Môn để phân công', $2) RETURNING id`,
      [`DA${Date.now()}`.slice(0, 20), semesterId],
    );
    await request(app.getHttpServer())
      .patch(`/courses/${orphan.id}/owner`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ departmentHeadId: head.id })
      .expect(200);

    const res = await request(app.getHttpServer())
      .delete(`/accounts/${actor.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.permanent.auditLogEntries).toBeGreaterThan(0);
    expect(res.body.message).toMatch(/vô hiệu hoá|không xoá được/i);
  });
});
