import { randomUUID } from 'crypto';
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { AuditLogEntity } from '../src/admin/entities/audit-log.entity';
import { createTestAccount } from './helpers/create-account';

/**
 * Trang đọc audit_log. `audit_log` là append-only bằng trigger nên các dòng
 * test ghi ở đây KHÔNG xoá được: cô lập bằng tài khoản người thực hiện riêng và
 * tiền tố hành động duy nhất cho mỗi lần chạy, để dữ liệu thật hay lần chạy
 * trước không lọt vào kết quả.
 */
describe('GET /audit-log (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let teacherToken: string;
  let adminId: string;
  let otherActorId: string;

  const run = Date.now().toString(36);
  /** Mọi hành động của lần chạy này bắt đầu bằng `P`. `P` kết thúc bằng '.' nên cũng là một tiền tố hợp lệ. */
  const P = `zz${run}.`;
  const at = (iso: string) => new Date(iso);

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function put(entry: {
    action: string;
    actorId?: string | null;
    occurredAt: Date;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  }) {
    const repo = dataSource.getRepository(AuditLogEntity);
    const actorId = entry.actorId === undefined ? adminId : entry.actorId;
    return repo.save(
      repo.create({
        actorType: actorId ? 'user' : 'system',
        actorId,
        action: entry.action,
        targetType: 'zz_probe',
        targetId: randomUUID(),
        oldValue: entry.oldValue ?? {},
        newValue: entry.newValue ?? {},
        occurredAt: entry.occurredAt,
      }),
    );
  }

  function get(path: string, token = adminToken) {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const adminEmail = `audit_reader_admin_${run}@example.com`;
    adminId = await createTestAccount(dataSource, {
      name: 'Admin Đọc Nhật Ký',
      email: adminEmail,
      password: 'correct-horse-battery',
      role: 'admin',
    });
    adminToken = await login(adminEmail);

    const teacherEmail = `audit_reader_teacher_${run}@example.com`;
    await createTestAccount(dataSource, {
      email: teacherEmail,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    teacherToken = await login(teacherEmail);

    otherActorId = await createTestAccount(dataSource, {
      email: `audit_reader_other_${run}@example.com`,
      password: 'correct-horse-battery',
      role: 'admin',
    });

    // Người thực hiện A (adminId)
    await put({ action: `${P}room.create`, occurredAt: at('2020-01-01T10:00:00.000Z') });
    await put({ action: `${P}room.update`, occurredAt: at('2020-01-02T10:00:00.000Z') });
    await put({ action: `${P}class.create`, occurredAt: at('2020-01-03T10:00:00.000Z') });
    // Người thực hiện B (otherActorId)
    await put({
      action: `${P}room.create`,
      actorId: otherActorId,
      occurredAt: at('2020-01-02T12:00:00.000Z'),
    });
    // Hệ thống: không người thực hiện
    await put({ action: `${P}system.tick`, actorId: null, occurredAt: at('2020-01-04T00:00:00.000Z') });
    // Bảy dòng CÙNG một thời điểm — phân trang phải vẫn ổn định
    for (let i = 0; i < 7; i++) {
      await put({ action: `${P}tie.row`, occurredAt: at('2020-02-01T00:00:00.000Z') });
    }
    // Một giá trị vượt 4 KB
    await put({
      action: `${P}big.write`,
      occurredAt: at('2020-03-01T00:00:00.000Z'),
      oldValue: { small: 1 },
      newValue: { blob: 'x'.repeat(5000) },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-AUD-3: không token là 401, giảng viên là 403', async () => {
    await request(app.getHttpServer()).get('/audit-log').expect(401);
    await get('/audit-log', teacherToken).expect(403);
  });

  it('T-AUD-2: khớp chính xác một hành động', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(`${P}room.create`)}&actorId=${adminId}`,
    ).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items.map((e: { action: string }) => e.action)).toEqual([`${P}room.create`]);
  });

  it('T-AUD-2: không có actorId thì thấy cả hai người thực hiện', async () => {
    const response = await get(`/audit-log?action=${encodeURIComponent(`${P}room.create`)}`).expect(200);
    expect(response.body.total).toBe(2);
  });

  it('T-AUD-2: tiền tố kết thúc bằng dấu chấm, mới nhất trước', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(`${P}room.`)}&actorId=${adminId}`,
    ).expect(200);
    expect(response.body.items.map((e: { action: string }) => e.action)).toEqual([
      `${P}room.update`,
      `${P}room.create`,
    ]);
  });

  it('T-AUD-2: danh sách nhiều mục, bằng cách lặp tham số hoặc ngăn bằng dấu phẩy', async () => {
    const a = encodeURIComponent(`${P}room.`);
    const b = encodeURIComponent(`${P}class.create`);
    const repeated = await get(`/audit-log?action=${a}&action=${b}&actorId=${adminId}`).expect(200);
    const commas = await get(`/audit-log?action=${a},${b}&actorId=${adminId}`).expect(200);
    expect(repeated.body.total).toBe(3);
    expect(commas.body.total).toBe(3);
  });

  it('không có ký tự đại diện: `_` và `%` được hiểu đúng nghĩa đen (Review Focus 1)', async () => {
    // Với LIKE, `_oom` khớp `room`; ở đây phải ra 0.
    const underscore = await get(
      `/audit-log?action=${encodeURIComponent(`${P}_oom.`)}&actorId=${adminId}`,
    ).expect(200);
    expect(underscore.body.total).toBe(0);
    // Một hành động chính xác có `%` cũng không được khớp gì.
    const percent = await get(
      `/audit-log?action=${encodeURIComponent(`${P}room.%`)}&actorId=${adminId}`,
    ).expect(200);
    expect(percent.body.total).toBe(0);
  });

  it('T-AUD-2: lọc theo người thực hiện không để dòng của người khác lọt vào', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(P)}&actorId=${otherActorId}`,
    ).expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].actor.id).toBe(otherActorId);
  });

  it('T-AUD-2: `from` bao gồm, `to` không bao gồm', async () => {
    const base = `/audit-log?action=${encodeURIComponent(`${P}room.update`)}&actorId=${adminId}`;
    const exact = '2020-01-02T10:00:00.000Z';
    const includesFrom = await get(`${base}&from=${exact}`).expect(200);
    expect(includesFrom.body.total).toBe(1);
    const excludesTo = await get(`${base}&to=${exact}`).expect(200);
    expect(excludesTo.body.total).toBe(0);
  });

  it('T-AUD-2: hoà thời gian thì phân trang vẫn ổn định, không trùng không sót (Review Focus 2)', async () => {
    const base = `/audit-log?action=${encodeURIComponent(`${P}tie.row`)}&actorId=${adminId}&pageSize=3`;
    const pages = [
      await get(`${base}&page=1`).expect(200),
      await get(`${base}&page=2`).expect(200),
      await get(`${base}&page=3`).expect(200),
    ];
    expect(pages.map((p) => p.body.items.length)).toEqual([3, 3, 1]);
    for (const p of pages) expect(p.body.total).toBe(7);

    const ids = pages.flatMap((p) => p.body.items.map((e: { id: string }) => e.id));
    expect(new Set(ids).size).toBe(7);
    // Cùng thời điểm thì `id` giảm dần là thứ tự phụ.
    expect(ids).toEqual([...ids].sort().reverse());
  });

  it('T-AUD-4: giá trị vượt 4 KB bị cắt thành null kèm cờ, giá trị nhỏ giữ nguyên (Review Focus 3)', async () => {
    const response = await get(
      `/audit-log?action=${encodeURIComponent(`${P}big.write`)}&actorId=${adminId}`,
    ).expect(200);
    const [entry] = response.body.items;
    expect(entry.newValue).toBeNull();
    expect(entry.newValueTruncated).toBe(true);
    expect(entry.oldValue).toEqual({ small: 1 });
    expect(entry.oldValueTruncated).toBe(false);
  });

  it('trả người thực hiện kèm tên và email, và null cho dòng của hệ thống (Review Focus 5)', async () => {
    const human = await get(
      `/audit-log?action=${encodeURIComponent(`${P}class.create`)}&actorId=${adminId}`,
    ).expect(200);
    expect(human.body.items[0].actor).toEqual({
      id: adminId,
      name: 'Admin Đọc Nhật Ký',
      email: `audit_reader_admin_${run}@example.com`,
    });

    const system = await get(`/audit-log?action=${encodeURIComponent(`${P}system.tick`)}`).expect(200);
    expect(system.body.total).toBe(1);
    expect(system.body.items[0].actor).toBeNull();
  });

  it('từ chối đầu vào sai bằng 400 (Review Focus 4)', async () => {
    await get('/audit-log?page=0').expect(400);
    await get('/audit-log?pageSize=101').expect(400);
    await get('/audit-log?actorId=khong-phai-uuid').expect(400);
    await get('/audit-log?from=hom-qua').expect(400);
    await get(
      '/audit-log?from=2020-01-02T00:00:00.000Z&to=2020-01-02T00:00:00.000Z',
    ).expect(400);
    await get(
      '/audit-log?from=2020-01-03T00:00:00.000Z&to=2020-01-02T00:00:00.000Z',
    ).expect(400);
    const eleven = Array.from({ length: 11 }, (_, i) => `a${i}.`).join(',');
    await get(`/audit-log?action=${eleven}`).expect(400);
  });

  // Review B+G1 (nâng từ Minor 5): `@IsISO8601()` không-nghiêm-ngặt nhận cả tuần ISO, dạng cơ bản và độ lệch giờ rút gọn, nhưng
  // `new Date(...)` đọc chúng thành Invalid Date; Invalid Date là giá trị "truthy", bị gắn làm tham số rồi Postgres từ chối (22007) —
  // một lỗi DB mà bộ lọc ngoại lệ không ánh xạ nên ra 500. Cùng loại lỗi với `page` khổng lồ ở dưới.
  it('ISO-8601 về chữ nhưng không đọc được thành thời điểm là 400 nêu ĐÚNG trường sai, không phải 500 (Review Focus 4: "rác")', async () => {
    for (const bad of ['2026-W01', '20261005', '2026-10-05T10:00:00+07']) {
      const field = (await get(`/audit-log?from=${encodeURIComponent(bad)}`).expect(400)).body.message as string;
      expect(field).toContain('`from`');
      const to = (await get(`/audit-log?to=${encodeURIComponent(bad)}`).expect(400)).body.message as string;
      expect(to).toContain('`to`');
    }
    // `from` hỏng + `to` đúng: câu phải nói về `from`, không phải "`to` phải sau `from`" (so sánh với Invalid Date luôn sai).
    const mixed = await get(
      `/audit-log?from=${encodeURIComponent('2026-W01')}&to=2026-10-05T00:00:00.000Z`,
    ).expect(400);
    expect(mixed.body.message).toContain('`from`');
    expect(mixed.body.message).not.toContain('phải sau');
  });

  // Ngoài plan: một `page` khổng lồ làm OFFSET tràn bigint ở Postgres (22003) — một lỗi DB mà bộ lọc ngoại lệ không ánh xạ
  // nên ra 500. Đầu vào của người dùng phải ra 400 chứ không phải 500.
  it('page khổng lồ là 400, không để OFFSET tràn số ở Postgres thành 500', async () => {
    await get('/audit-log?page=1000000000000000000').expect(400);
    await get('/audit-log?page=100001').expect(400);
    await get('/audit-log?page=100000').expect(200);
  });
});
