import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Labs (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  const suffix = Date.now();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `lab_admin_${suffix}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Labs Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let labId: string;
  let workstationId: string;
  let layoutAId: string;
  let layoutBId: string;

  it('rejects lab creation without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/labs')
      .send({ code: `L${suffix}`.slice(0, 8), name: 'Unauthorized', capacity: 20 });
    expect(response.status).toBe(401);
  });

  it('creates a lab', async () => {
    const response = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `LAB${suffix}`.slice(0, 16),
        name: 'Lab A',
        building: 'A',
        floor: '2',
        capacity: 40,
      });
    expect(response.status).toBe(201);
    labId = response.body.id;
  });

  it('rejects duplicate lab codes with 409', async () => {
    const code = `LAB${suffix}`.slice(0, 16);
    const response = await request(app.getHttpServer())
      .post('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code, name: 'Duplicate', capacity: 10 });
    expect(response.status).toBe(409);
  });

  it('lists labs', async () => {
    const response = await request(app.getHttpServer())
      .get('/labs')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ search: `LAB${suffix}`.slice(0, 16) });
    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(response.body.items.some((i: { id: string }) => i.id === labId)).toBe(
      true,
    );
  });

  it('creates a workstation under the lab', async () => {
    const response = await request(app.getHttpServer())
      .post(`/labs/${labId}/workstations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        assetCode: `PC${suffix}`.slice(0, 16),
        hostname: `host-${suffix}`,
      });
    expect(response.status).toBe(201);
    workstationId = response.body.id;

    const detail = await request(app.getHttpServer())
      .get(`/labs/${labId}/workstations/${workstationId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.agentId).toBeTruthy();
    expect(detail.body.hostname).toBe(`host-${suffix}`);
    expect(detail.body.status).toBe('available');
  });

  it('creates two layouts and activates the second', async () => {
    const a = await request(app.getHttpServer())
      .post(`/labs/${labId}/layouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Layout v1', isActive: true });
    expect(a.status).toBe(201);
    layoutAId = a.body.id;

    const b = await request(app.getHttpServer())
      .post(`/labs/${labId}/layouts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Layout v2' });
    expect(b.status).toBe(201);
    layoutBId = b.body.id;

    const activated = await request(app.getHttpServer())
      .post(`/labs/${labId}/layouts/${layoutBId}/activate`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activated.status).toBe(201);
    expect(activated.body.isActive).toBe(true);

    const list = await request(app.getHttpServer())
      .get(`/labs/${labId}/layouts`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    const activeCount = list.body.items.filter(
      (i: { isActive: boolean }) => i.isActive,
    ).length;
    expect(activeCount).toBe(1);
    expect(
      list.body.items.find((i: { id: string }) => i.id === layoutBId).isActive,
    ).toBe(true);
  });

  it('bulk upserts seats on a layout', async () => {
    const response = await request(app.getHttpServer())
      .put(`/labs/${labId}/layouts/${layoutBId}/seats`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seats: [
          {
            seatCode: 'A01',
            workstationId,
            positionX: 40,
            positionY: 60,
            rotationDegrees: 0,
            isDisabled: false,
            notes: null,
          },
          {
            seatCode: 'A02',
            positionX: 140,
            positionY: 60,
            rotationDegrees: 15,
            isDisabled: true,
            notes: 'broken',
          },
        ],
      });
    expect(response.status).toBe(200);
    expect(response.body.total).toBe(2);
    expect(
      response.body.items.find((s: { seatCode: string }) => s.seatCode === 'A02')
        .isDisabled,
    ).toBe(true);

    const detail = await request(app.getHttpServer())
      .get(`/labs/${labId}/layouts/${layoutBId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.seats).toHaveLength(2);

    const seatId = detail.body.seats[0].id;
    const update = await request(app.getHttpServer())
      .put(`/labs/${labId}/layouts/${layoutBId}/seats`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        seats: [
          {
            id: seatId,
            seatCode: 'A01',
            workstationId,
            positionX: 50,
            positionY: 70,
            rotationDegrees: 0,
          },
        ],
      });
    expect(update.status).toBe(200);
    expect(update.body.total).toBe(1);
    expect(update.body.items[0].positionX).toBe(50);
  });

  it('blocks soft-deleting a lab that still has children with 409', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/labs/${labId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(response.status).toBe(409);
  });

  it('soft-deletes seats then layout then workstation then lab', async () => {
    const detail = await request(app.getHttpServer())
      .get(`/labs/${labId}/layouts/${layoutBId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    for (const seat of detail.body.seats) {
      const delSeat = await request(app.getHttpServer())
        .delete(`/labs/${labId}/layouts/${layoutBId}/seats/${seat.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(delSeat.status).toBe(204);
    }

    // layout A has no seats
    expect(
      (
        await request(app.getHttpServer())
          .delete(`/labs/${labId}/layouts/${layoutAId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app.getHttpServer())
          .delete(`/labs/${labId}/layouts/${layoutBId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/labs/${labId}/workstations/${workstationId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);

    expect(
      (
        await request(app.getHttpServer())
          .delete(`/labs/${labId}`)
          .set('Authorization', `Bearer ${adminToken}`)
      ).status,
    ).toBe(204);
  });
});
