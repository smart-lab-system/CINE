import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const username = `auth_test_${Date.now()}`;

  it('registers a new account', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        username,
        password: 'correct-horse-battery',
        displayName: 'Auth Test User',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });

  it('rejects login with the wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('logs in with the correct password and returns tokens', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'correct-horse-battery' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.refreshToken).toBeDefined();
    expect(response.body.user.username).toBe(username);
  });
});
