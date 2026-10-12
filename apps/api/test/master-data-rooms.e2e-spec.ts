import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

describe('Master data — room & computer (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const stamp = Date.now();

    const adminEmail = `md_room_admin_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });
    adminToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: adminEmail, password: 'correct-horse-battery' })
    ).body.accessToken;

    const teacherEmail = `md_room_teacher_${stamp}@example.com`;
    await createTestAccount(dataSource, {
      email: teacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    teacherToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: teacherEmail, password: 'correct-horse-battery' })
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('CRUD room + computer; hostname unique; delete room with child 409; teacher 403', async () => {
    const roomRes = await request(app.getHttpServer())
      .post('/master-data/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `A${Date.now().toString().slice(-6)}`,
        name: 'Phòng máy A1',
        capacity: 40,
        building: 'A',
        status: 'active',
      });
    expect(roomRes.status).toBe(201);
    const roomId = roomRes.body.id as string;

    const teacherDenied = await request(app.getHttpServer())
      .post('/master-data/computers')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send({
        roomId,
        hostname: 'PC-01',
        location: 'P01',
        cpu: 'i5',
        ramGb: 8,
        storage: '256GB SSD',
        os: 'Windows 11',
        status: 'active',
      });
    expect(teacherDenied.status).toBe(403);

    const pcRes = await request(app.getHttpServer())
      .post('/master-data/computers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        hostname: 'PC-01',
        location: 'P01',
        cpu: 'Intel i5-12400',
        ramGb: 16,
        storage: '512GB SSD',
        gpu: null,
        os: 'Windows 11',
        status: 'active',
      });
    expect(pcRes.status).toBe(201);

    const dupHost = await request(app.getHttpServer())
      .post('/master-data/computers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        hostname: 'PC-01',
        location: 'P02',
        cpu: 'i5',
        ramGb: 8,
        storage: '256GB SSD',
        os: 'Windows 11',
        status: 'active',
      });
    expect(dupHost.status).toBe(409);

    const delRoomBlocked = await request(app.getHttpServer())
      .delete(`/master-data/rooms/${roomId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRoomBlocked.status).toBe(409);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/master-data/computers/${pcRes.body.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/master-data/rooms/${roomId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);
  });

  it('searches computers by hostname, ip, or location', async () => {
    const stamp = Date.now();
    const roomRes = await request(app.getHttpServer())
      .post('/master-data/rooms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `S${stamp.toString().slice(-6)}`,
        name: 'Phòng search',
        capacity: 20,
        status: 'active',
      });
    expect(roomRes.status).toBe(201);
    const roomId = roomRes.body.id as string;

    const pcRes = await request(app.getHttpServer())
      .post('/master-data/computers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        roomId,
        hostname: `HOST-${stamp}`,
        location: `LOC-${stamp}`,
        cpu: 'i7',
        ramGb: 16,
        storage: '512GB SSD',
        os: 'Windows 11',
        ipAddress: '10.0.9.99',
        status: 'active',
      });
    expect(pcRes.status).toBe(201);

    const byIp = await request(app.getHttpServer())
      .get('/master-data/computers?search=10.0.9.99')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byIp.status).toBe(200);
    expect(byIp.body.items.some((c: { id: string }) => c.id === pcRes.body.id)).toBe(
      true,
    );

    const byLoc = await request(app.getHttpServer())
      .get(`/master-data/computers?search=${encodeURIComponent(`LOC-${stamp}`)}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byLoc.status).toBe(200);
    expect(byLoc.body.items.some((c: { id: string }) => c.id === pcRes.body.id)).toBe(
      true,
    );

    const miss = await request(app.getHttpServer())
      .get('/master-data/computers?search=no-such-pc-zzzz')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(miss.status).toBe(200);
    expect(miss.body.items).toHaveLength(0);
  });
});
