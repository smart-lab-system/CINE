process.env.SEED_API_ENABLED = 'true';

import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { SeedModule } from '../src/seed/seed.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { SeedErrorCode } from '../src/seed/seed.types';

/**
 * Seed API enabled. SeedModule is imported explicitly so routes register even
 * if AppModule was first loaded in this worker with the flag off (e.g. after
 * seed-api-disabled.e2e-spec.ts). SEED_API_ENABLED is set for documentation
 * and for AppModule when this file loads first.
 */
describe('Seed API (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    process.env.SEED_API_ENABLED = 'true';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, SeedModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /seed/bootstrap-admin', () => {
    it('returns 409 BOOTSTRAP_NOT_AVAILABLE when accounts already exist', async () => {
      await createTestAccount(dataSource, {
        email: `seed_bootstrap_block_${Date.now()}@example.com`,
        password: 'Demo123456!',
        role: 'admin',
      });

      const response = await request(app.getHttpServer())
        .post('/seed/bootstrap-admin')
        .send({
          name: 'Should Fail',
          email: `seed_bootstrap_fail_${Date.now()}@example.com`,
          password: 'Demo123456!',
        });

      expect(response.status).toBe(409);
      expect(response.body).toMatchObject({
        code: SeedErrorCode.BOOTSTRAP_NOT_AVAILABLE,
      });
      expect(response.body).not.toHaveProperty('password');
    });
  });
});
