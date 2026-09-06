import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';

/**
 * Bất biến "tối đa MỘT kỳ hiện hành" ép ở tầng DB, không ở service: service
 * không phải thứ duy nhất ghi được bảng này, và một check trước UPDATE không
 * nhìn thấy row mà request khác đang ghi ngay lúc đó.
 */
describe('semester.is_current — ràng buộc DB (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let schema: string;
  const stamp = Date.now();

  let academicToken: string;
  let headToken: string;
  let teacherToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);
    schema = (dataSource.options as { schema?: string }).schema ?? 'examcollect';

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'correct-horse-battery' });
      return res.body.accessToken;
    };
    const account = async (prefix: string, role: string): Promise<string> => {
      const email = `${prefix}_${stamp}@example.com`;
      await createTestAccount(dataSource, {
        email,
        password: 'correct-horse-battery',
        role: role as 'admin',
      });
      return login(email);
    };

    academicToken = await account('cur_academic', 'academic_affairs');
    headToken = await account('cur_head', 'department_admin');
    teacherToken = await account('cur_teacher', 'teacher');
  }, 60_000);

  afterAll(async () => {
    await dataSource.query(`DELETE FROM ${schema}.semester WHERE name LIKE $1`, [
      `Cur ${stamp}%`,
    ]);
    await app.close();
  });

  async function makeSemester(suffix: string, isCurrent: boolean): Promise<string> {
    const [row] = await dataSource.query(
      `INSERT INTO ${schema}.semester (name, start_date, end_date, is_current)
       VALUES ($1, '2026-09-01', '2027-01-15', $2) RETURNING id`,
      [`Cur ${stamp} ${suffix}`, isCurrent],
    );
    return row.id;
  }

  it('cho phép nhiều kỳ KHÔNG hiện hành', async () => {
    await makeSemester('a', false);
    await makeSemester('b', false);
    const [{ count }] = await dataSource.query(
      `SELECT count(*)::int FROM ${schema}.semester WHERE name LIKE $1`,
      [`Cur ${stamp}%`],
    );
    expect(count).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it('từ chối kỳ hiện hành THỨ HAI', async () => {
    // Dọn cờ của bất kỳ kỳ nào khác đang giữ, để test đo đúng thứ nó nói là
    // đang đo — DB dev có thể đã có một kỳ hiện hành từ lần chạy trước.
    await dataSource.query(`UPDATE ${schema}.semester SET is_current = false WHERE is_current`);
    await makeSemester('first-current', true);
    await expect(makeSemester('second-current', true)).rejects.toThrow(
      /uq_semester_single_current/,
    );
  }, 30_000);

  describe('PUT /semesters/:id/current', () => {
    const setCurrent = (id: string, token: string) =>
      request(app.getHttpServer())
        .put(`/semesters/${id}/current`)
        .set('Authorization', `Bearer ${token}`);

    it('gạt cờ, và gỡ cờ kỳ đang giữ', async () => {
      const a = await makeSemester('flip-a', false);
      const b = await makeSemester('flip-b', false);

      await setCurrent(a, academicToken).expect(200);
      await setCurrent(b, academicToken).expect(200);

      const rows = await dataSource.query(
        `SELECT id FROM ${schema}.semester WHERE is_current`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(b);
    }, 30_000);

    it('gạt lại chính kỳ đang hiện hành là hợp lệ và không đổi gì', async () => {
      const a = await makeSemester('idem', false);
      await setCurrent(a, academicToken).expect(200);
      await setCurrent(a, academicToken).expect(200);

      const rows = await dataSource.query(
        `SELECT id FROM ${schema}.semester WHERE is_current`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(a);
    }, 30_000);

    it('ghi audit_log', async () => {
      const a = await makeSemester('audited', false);
      await setCurrent(a, academicToken).expect(200);

      const rows = await dataSource.query(
        `SELECT action FROM ${schema}.audit_log WHERE target_id = $1`,
        [a],
      );
      expect(rows.map((r: { action: string }) => r.action)).toContain(
        'semester.current_changed',
      );
    }, 30_000);

    // Lịch học kỳ là quyết định cấp trường. Trưởng khoa tự đặt lịch riêng cho
    // khoa mình là đúng lỗi phân quyền mà thay đổi này sinh ra để sửa.
    it.each([
      ['Trưởng khoa', () => headToken],
      ['giảng viên', () => teacherToken],
    ])('từ chối %s', async (_label, token) => {
      const a = await makeSemester(`forbidden-${_label}`, false);
      await setCurrent(a, token()).expect(403);
    }, 30_000);

    it('404 cho id không tồn tại', async () => {
      await setCurrent(randomUUID(), academicToken).expect(404);
    }, 30_000);
  });

  describe('DELETE /semesters/:id', () => {
    it('chặn xoá kỳ đang hiện hành, nói rõ phải chuyển cờ trước', async () => {
      const a = await makeSemester('undeletable', false);
      await request(app.getHttpServer())
        .put(`/semesters/${a}/current`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .delete(`/semesters/${a}`)
        .set('Authorization', `Bearer ${academicToken}`)
        .expect(409);
      expect(res.body.message).toMatch(/hiện hành/);
    }, 30_000);
  });
});
