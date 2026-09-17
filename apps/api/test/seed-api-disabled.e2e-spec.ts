import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

/**
 * Flag unset → SeedModule is not registered → seed routes are absent (404).
 * setup-e2e.ts clears SEED_API_ENABLED and points DATABASE_URL at
 * examcollect_e2e (never the demo DB).
 */
describe('Seed API disabled (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.SEED_API_ENABLED = 'false';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('POST /seed/bootstrap-admin returns 404 when flag is off', async () => {
    const response = await request(app.getHttpServer())
      .post('/seed/bootstrap-admin')
      .send({
        name: 'Admin',
        email: 'admin@example.com',
        password: 'Demo123456!',
      });

    expect(response.status).toBe(404);
  });

  it('POST /admin/seed/accounts returns 404 when flag is off', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/seed/accounts')
      .send({
        name: 'Teacher',
        email: 'teacher@example.com',
        password: 'Demo123456!',
        role: 'teacher',
      });

    expect(response.status).toBe(404);
  });
});
