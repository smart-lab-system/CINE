import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns { status: "ok" }', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  // §10.1: Railway không được đẩy traffic sang code đang chờ schema mới. /health phải đỏ khi còn migration chờ.
  it('còn migration chờ → 503 migration_pending', async () => {
    const spy = jest.spyOn(app.get(DataSource), 'showMigrations').mockResolvedValue(true);

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', reason: 'migration_pending' });
    spy.mockRestore();
  });

  it('không đọc được trạng thái migration → 503 db_unreachable, không lộ lỗi gốc của DB', async () => {
    const spy = jest.spyOn(app.get(DataSource), 'showMigrations').mockRejectedValue(
      new Error('password authentication failed for postgres://cine:hunter2@db.example'),
    );

    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ status: 'error', reason: 'db_unreachable' });
    expect(JSON.stringify(response.body)).not.toMatch(/hunter2|password|postgres:/);
    spy.mockRestore();
  });
});
