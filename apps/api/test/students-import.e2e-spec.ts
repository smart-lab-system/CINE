import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

jest.setTimeout(20000);

describe('StudentsImport (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    const dataSource = app.get(DataSource);
    const adminUsername = `import_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Import Test Admin',
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

  async function buildWorkbookBuffer(
    rows: Array<[string, string, string, string, number | string]>,
  ): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('students');
    sheet.addRow(['student_code', 'full_name', 'date_of_birth', 'class_code', 'cohort_year']);
    rows.forEach((row) => sheet.addRow(row));
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async function pollUntilFinished(jobId: string): Promise<any> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const response = await request(app.getHttpServer())
        .get(`/students/import/${jobId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (response.body.state === 'completed' || response.body.state === 'failed') {
        return response.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Import job ${jobId} did not finish in time`);
  }

  it('rejects an import request without a file', async () => {
    const response = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });

  it('imports valid rows, creating new students', async () => {
    const codeA = `IMPA_${Date.now()}`;
    const codeB = `IMPB_${Date.now()}`;
    const buffer = await buildWorkbookBuffer([
      [codeA, 'Import Student A', '', 'D20CQCE01', 2020],
      [codeB, 'Import Student B', '', '', ''],
    ]);

    const uploadResponse = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');

    expect(uploadResponse.status).toBe(202);
    const { jobId } = uploadResponse.body;
    expect(jobId).toBeDefined();

    const finished = await pollUntilFinished(jobId);
    expect(finished.state).toBe('completed');
    expect(finished.result.totalRows).toBe(2);
    expect(finished.result.created).toBe(2);
    expect(finished.result.failed).toBe(0);

    const searchResponse = await request(app.getHttpServer())
      .get(`/students?search=${codeA}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(
      searchResponse.body.items.some((item: any) => item.studentCode === codeA),
    ).toBe(true);
  });

  it('re-imports the same student code as an update, not a duplicate', async () => {
    const code = `IMPC_${Date.now()}`;
    const firstBuffer = await buildWorkbookBuffer([[code, 'Original Name', '', '', '']]);
    const firstUpload = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', firstBuffer, 'students.xlsx');
    await pollUntilFinished(firstUpload.body.jobId);

    const secondBuffer = await buildWorkbookBuffer([[code, 'Updated Name', '', '', '']]);
    const secondUpload = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', secondBuffer, 'students.xlsx');
    const finished = await pollUntilFinished(secondUpload.body.jobId);

    expect(finished.result.created).toBe(0);
    expect(finished.result.updated).toBe(1);

    const searchResponse = await request(app.getHttpServer())
      .get(`/students?search=${code}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const match = searchResponse.body.items.find((item: any) => item.studentCode === code);
    expect(match.fullName).toBe('Updated Name');
  });

  it('reports per-row errors for invalid rows without failing the whole job', async () => {
    const validCode = `IMPD_${Date.now()}`;
    const buffer = await buildWorkbookBuffer([
      [validCode, 'Valid Row', '', '', ''],
      ['x', '', '', '', ''], // studentCode too short, fullName missing
    ]);

    const uploadResponse = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');
    const finished = await pollUntilFinished(uploadResponse.body.jobId);

    expect(finished.result.totalRows).toBe(2);
    expect(finished.result.created).toBe(1);
    expect(finished.result.failed).toBe(1);
    expect(finished.result.errors[0].row).toBe(3);
  });

  it('404s on an unknown job id', async () => {
    const response = await request(app.getHttpServer())
      .get('/students/import/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
