import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';

describe('GET /students/:mssv (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let teacherToken: string;
  let adminToken: string;
  const known = `LK${randomTag(10)}`;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function account(prefix: string, role: 'admin' | 'teacher') {
    const email = `${prefix}_${randomTag()}@example.com`;
    await createTestAccount(ds, { email, password: 'correct-horse-battery', role });
    return login(email);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    teacherToken = await account('lookup_teacher', 'teacher');
    adminToken = await account('lookup_admin', 'admin');
    await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Phạm Thị Tra Cứu')`, [known]);
  });

  afterAll(async () => {
    try {
      await ds.query(`DELETE FROM examcollect.student WHERE mssv = $1`, [known]).catch(() => undefined);
    } finally {
      await app.close();
    }
  });

  const lookup = (mssv: string, token = teacherToken) =>
    request(app.getHttpServer()).get(`/students/${encodeURIComponent(mssv)}`).set('Authorization', `Bearer ${token}`);

  it('T-STU-1: trả họ tên của đúng MSSV đó, không phân biệt hoa-thường, và MSSV theo cách đã lưu', async () => {
    const response = await lookup(known.toLowerCase()).expect(200);
    expect(response.body).toEqual({ mssv: known, fullName: 'Phạm Thị Tra Cứu' });
  });

  it('T-STU-1: MSSV chưa có là 404', async () => {
    await lookup(`ZZ${randomTag(10)}`).expect(404);
  });

  it('T-STU-1: KHÔNG có route liệt kê sinh viên (Review Focus 4)', async () => {
    await request(app.getHttpServer()).get('/students').set('Authorization', `Bearer ${teacherToken}`).expect(404);
  });

  it('MSSV sai định dạng là 400, và không tốn lượt tra', async () => {
    await lookup('SV 01').expect(400);
    await lookup('ab').expect(400);
    await lookup('A'.repeat(21)).expect(400);
  });

  it('chỉ giảng viên: không token 401, admin 403', async () => {
    await request(app.getHttpServer()).get(`/students/${known}`).expect(401);
    await lookup(known, adminToken).expect(403);
  });

  it('Review Focus 4: lần thứ 31 trong một phút là 429, và người khác vẫn tra được', async () => {
    const heavy = await account('lookup_heavy', 'teacher');
    for (let i = 0; i < 30; i++) {
      // MSSV không có: 404 vẫn tính một lượt — chính cách quét sẽ sinh ra những lượt này.
      await lookup(`ZZ${randomTag(10)}`, heavy).expect(404);
    }
    const blocked = await lookup(`ZZ${randomTag(10)}`, heavy).expect(429);
    expect(blocked.body.message).toMatch(/quá nhanh/);
    await lookup(known, teacherToken).expect(200);
  });
});
