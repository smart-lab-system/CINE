import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { openSession } from './helpers/open-session';
import { ensureRoom, seedClass, seedEnrollment, seedExamSession, sessionBody } from './helpers/seed';
import { releaseTeacherSessions } from './helpers/session-window';

/**
 * Sửa và huỷ phiên thi (spec §4.1, T-SES-1…10).
 *
 * Mỗi test dùng MỘT NGÀY riêng ở tương lai xa: ba ràng buộc chồng lịch (phòng, lớp, giãn cách giảng viên) chạy giữa mọi phiên
 * của cùng một người, và hai test chung một ngày sẽ va nhau ở những ca không hề nói về điều đó. Riêng các ca cần phiên ĐÃ BẮT
 * ĐẦU dùng một giảng viên riêng (`live`) và `releaseTeacherSessions` đầu mỗi ca.
 *
 * Không dọn phiên: `agent_connection_event` là append-only và khoá ngoại RESTRICT, nên phiên có sự kiện không xoá được.
 */
describe('Sửa và huỷ phiên thi (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let baseUrl: string;

  const PASSWORD = 'correct-horse-battery';
  const tag = randomTag(8);
  const sockets: Socket[] = [];

  let teacher: { id: string; token: string };
  let colleague: { id: string; token: string };
  let admin: { id: string; token: string };
  let live: { id: string; token: string };

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  /** Ngày thứ N tính từ hôm nay (UTC), bắt đầu từ 30 để luôn ở tương lai xa. */
  let dayCursor = 30;
  const freshDay = () => dayCursor++;
  function windowAt(day: number, startHour: number, endHour: number, endMinute = 0) {
    const base = new Date();
    const midnight = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()) + day * DAY;
    return {
      startTime: new Date(midnight + startHour * HOUR).toISOString(),
      endTime: new Date(midnight + endHour * HOUR + endMinute * MINUTE).toISOString(),
    };
  }

  async function account(label: string, role: 'teacher' | 'admin') {
    const email = `edit_${label}_${tag}@example.com`.toLowerCase();
    const id = await createTestAccount(ds, { email, password: PASSWORD, role });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: PASSWORD });
    return { id, token: login.body.accessToken as string };
  }

  let roomCounter = 0;
  async function room(label: string) {
    roomCounter += 1;
    return ensureRoom(ds, `EDIT${tag} ${label} ${roomCounter}`);
  }

  /** Tạo một phiên bằng API với lớp mới (một lớp không thể thi hai ca chồng giờ). */
  async function createSession(
    owner: { id: string; token: string },
    options: { roomId: string; startTime: string; endTime: string; name?: string; classId?: string },
  ) {
    const classId = options.classId ?? (await seedClass(ds, { teacherId: owner.id })).id;
    const body = await sessionBody(ds, {
      classId,
      roomId: options.roomId,
      name: options.name ?? `Phiên EDIT${tag} ${Math.random().toString(36).slice(2, 8)}`,
      startTime: options.startTime,
      endTime: options.endTime,
    });
    const response = await request(app.getHttpServer()).post('/exam-sessions').set(auth(owner.token)).send(body);
    expect(response.status).toBe(201);
    return { ...response.body, classId } as { id: string; code: string; name: string; classId: string; roomId: string; roomName: string };
  }

  const patch = (id: string, body: object, token = teacher.token) =>
    request(app.getHttpServer()).patch(`/exam-sessions/${id}`).set(auth(token)).send(body);
  const cancel = (id: string, body: object = {}, token = teacher.token) =>
    request(app.getHttpServer()).post(`/exam-sessions/${id}/cancel`).set(auth(token)).send(body);

  const dbSession = async (id: string) =>
    (
      await ds.query(
        `SELECT name, status, room_id, room_name, exam_type, semester_name,
                to_char(start_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS start_iso,
                to_char(end_time   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS end_iso
           FROM examcollect.exam_session WHERE id = $1`,
        [id],
      )
    )[0];
  const iso = (value: string) => new Date(value).toISOString().replace('.000Z', 'Z');

  async function auditRows(action: string, targetId: string) {
    return ds.query(
      `SELECT actor_id, old_value, new_value FROM examcollect.audit_log
        WHERE action = $1 AND target_id = $2 ORDER BY occurred_at`,
      [action, targetId],
    );
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.listen(0);
    baseUrl = await app.getUrl();
    ds = app.get(DataSource);

    teacher = await account('gv', 'teacher');
    colleague = await account('dongnghiep', 'teacher');
    admin = await account('admin', 'admin');
    live = await account('live', 'teacher');
  });

  afterAll(async () => {
    try {
      for (const socket of sockets) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    } finally {
      await app.close();
    }
  });

  describe('PATCH /exam-sessions/:id', () => {
    it('T-SES-1: đổi phòng — room_id VÀ room_name đổi cùng nhau, phòng cũ được nhả, học kỳ chụp không đổi', async () => {
      const day = freshDay();
      const w = windowAt(day, 8, 10);
      const oldRoom = await room('cu');
      const newRoom = await room('moi');
      const session = await createSession(teacher, { roomId: oldRoom.id, ...w });
      const before = await dbSession(session.id);

      const response = await patch(session.id, { roomId: newRoom.id }).expect(200);

      expect(response.body).toMatchObject({ id: session.id, roomId: newRoom.id, roomName: newRoom.name });
      const after = await dbSession(session.id);
      expect(after).toMatchObject({ room_id: newRoom.id, room_name: newRoom.name, status: 'active' });
      expect(after.semester_name).toBe(before.semester_name); // `update: false`

      // Phòng cũ trống ở đúng khung giờ đó: một lớp khác đặt được.
      await createSession(colleague, { roomId: oldRoom.id, ...w });
    });

    it('sửa tên, loại kỳ thi và giờ cùng lúc; trả về phiên đã sửa', async () => {
      const day = freshDay();
      const session = await createSession(teacher, { roomId: (await room('a')).id, ...windowAt(day, 8, 10) });
      const next = windowAt(day, 13, 15);

      const response = await patch(session.id, {
        name: `Tên mới ${tag}`,
        examType: 'CK',
        startTime: next.startTime,
        endTime: next.endTime,
      }).expect(200);

      expect(response.body).toMatchObject({ name: `Tên mới ${tag}`, examType: 'CK' });
      const row = await dbSession(session.id);
      expect(row).toMatchObject({ name: `Tên mới ${tag}`, exam_type: 'CK' });
      expect(row.start_iso).toBe(iso(next.startTime));
      expect(row.end_iso).toBe(iso(next.endTime));
    });

    describe('T-SES-2: va chạm', () => {
      it('dời sang phòng đang có phiên chồng giờ → 409 nêu phiên đang giữ phòng và khung giờ', async () => {
        const day = freshDay();
        const w = windowAt(day, 8, 10);
        const taken = await room('ban');
        const holder = await createSession(colleague, { roomId: taken.id, ...w, name: `Phiên giữ phòng ${tag}` });
        const mine = await createSession(teacher, { roomId: (await room('rieng')).id, ...w });

        const response = await patch(mine.id, { roomId: taken.id }).expect(409);

        expect(response.body.message).toContain(taken.name);
        expect(response.body.message).toContain(holder.name);
        expect((await dbSession(mine.id)).room_id).not.toBe(taken.id); // không ghi gì
      });

      it('Review Focus 1: dời giờ sang khoảng CHỒNG lên khoảng cũ của chính phiên này thì được — không tự va chạm', async () => {
        const day = freshDay();
        const mine = await createSession(teacher, { roomId: (await room('tu')).id, ...windowAt(day, 8, 10) });
        const shifted = windowAt(day, 9, 11); // chồng 1 giờ lên khoảng cũ: cùng phòng, cùng lớp, cùng giảng viên

        await patch(mine.id, shifted).expect(200);

        expect((await dbSession(mine.id)).start_iso).toBe(iso(shifted.startTime));
      });

      it('đổi giờ vào chỗ một phiên KHÁC cùng phòng vẫn bị phát hiện (excludeSessionId chỉ loại chính nó)', async () => {
        const day = freshDay();
        const shared = await room('chung');
        await createSession(colleague, { roomId: shared.id, ...windowAt(day, 12, 14), name: `Phiên đồng nghiệp ${tag}` });
        const mine = await createSession(teacher, { roomId: shared.id, ...windowAt(day, 8, 10) });

        const response = await patch(mine.id, windowAt(day, 11, 13)).expect(409);

        expect(response.body.message).toContain(`Phiên đồng nghiệp ${tag}`);
      });
    });

    describe('T-SES-3: cửa sổ sửa', () => {
      it('phiên đã bắt đầu → 409 kèm cách thoát', async () => {
        await releaseTeacherSessions(ds, live.id);
        const started = new Date(Date.now() - 5 * MINUTE);
        const session = await createSession(live, {
          roomId: (await room('dabatdau')).id,
          startTime: started.toISOString(),
          endTime: new Date(started.getTime() + HOUR).toISOString(),
        });

        const response = await patch(session.id, { name: 'Đổi tên khi đã bắt đầu' }, live.token).expect(409);

        expect(response.body.message).toBe('Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.');
        expect((await dbSession(session.id)).name).not.toBe('Đổi tên khi đã bắt đầu');
      });

      it('Review Focus 2: dời giờ bắt đầu vào quá khứ (≤ 30 phút) được; từ đó cửa sổ đóng ngay', async () => {
        await releaseTeacherSessions(ds, live.id);
        const w = windowAt(freshDay(), 8, 10);
        const session = await createSession(live, { roomId: (await room('doivaoquakhu')).id, ...w });
        const start = new Date(Date.now() - 10 * MINUTE);

        await patch(session.id, {
          startTime: start.toISOString(),
          endTime: new Date(start.getTime() + HOUR).toISOString(),
        }, live.token).expect(200);

        await patch(session.id, { name: 'Lần sửa thứ hai' }, live.token).expect(409);
      });

      it.each(['collecting', 'completed', 'cancelled'])('phiên %s → 409', async (status) => {
        const session = await createSession(teacher, { roomId: (await room(status)).id, ...windowAt(freshDay(), 8, 10) });
        await ds.query(`UPDATE examcollect.exam_session SET status = $1 WHERE id = $2`, [status, session.id]);

        await patch(session.id, { name: `Sửa khi ${status}` }).expect(409);

        expect((await dbSession(session.id)).name).not.toBe(`Sửa khi ${status}`);
      });
    });

    describe('T-SES-4: quyền', () => {
      it('giảng viên khác → 403; admin → 403; không tồn tại → 404; id sai dạng → 400', async () => {
        const session = await createSession(teacher, { roomId: (await room('quyen')).id, ...windowAt(freshDay(), 8, 10) });

        await patch(session.id, { name: 'x' }, colleague.token).expect(403);
        await patch(session.id, { name: 'x' }, admin.token).expect(403);
        await patch('00000000-0000-4000-8000-0000000000aa', { name: 'x' }).expect(404);
        await patch('khong-phai-uuid', { name: 'x' }).expect(400);
        await request(app.getHttpServer()).patch(`/exam-sessions/${session.id}`).send({ name: 'x' }).expect(401);
      });
    });

    describe('T-SES-5: giờ', () => {
      it('dưới 15 phút → 400; kết thúc không sau bắt đầu → 400; lùi quá 30 phút → 400', async () => {
        const day = freshDay();
        const session = await createSession(teacher, { roomId: (await room('gio')).id, ...windowAt(day, 8, 10) });
        const short = windowAt(day, 8, 8, 10);
        const backwards = windowAt(day, 10, 9);

        const tooShort = await patch(session.id, short).expect(400);
        expect(tooShort.body.message).toMatch(/15 phút/);
        await patch(session.id, backwards).expect(400);
        const past = await patch(session.id, { startTime: new Date(Date.now() - 2 * HOUR).toISOString() }).expect(400);
        expect(past.body.message).toMatch(/30 phút/);
      });

      it('Review Focus 3: chỉ đổi MỘT đầu thì kiểm trên cặp sau khi sửa', async () => {
        const day = freshDay();
        const session = await createSession(teacher, { roomId: (await room('mot-dau')).id, ...windowAt(day, 8, 10) });

        // Giờ bắt đầu cũ 08:00 + giờ kết thúc mới 08:10 = 10 phút: từng giá trị riêng đều là một ISO hợp lệ.
        const response = await patch(session.id, { endTime: windowAt(day, 8, 8, 10).endTime }).expect(400);

        expect(response.body.message).toMatch(/15 phút/);
        expect((await dbSession(session.id)).end_iso).toBe(iso(windowAt(day, 8, 10).endTime));
      });

      it('giãn cách 30 phút của giảng viên: 15 phút thì 409, đúng 30 phút thì được', async () => {
        const day = freshDay();
        const first = await createSession(teacher, { roomId: (await room('gap1')).id, ...windowAt(day, 8, 10) });
        await createSession(teacher, { roomId: (await room('gap2')).id, ...windowAt(day, 12, 13), name: `Ca sau ${tag}` });

        const tooClose = await patch(first.id, { endTime: windowAt(day, 11, 11, 45).endTime }).expect(409);
        expect(tooClose.body.message).toMatch(/30 phút/);

        // Kết thúc 11:30, ca sau bắt đầu 12:00: đúng 30 phút. Khoảng bận là nửa mở nên không chồng.
        await patch(first.id, { endTime: windowAt(day, 11, 11, 30).endTime }).expect(200);
      });
    });

    describe('T-SES-6: phòng ngừng hoạt động', () => {
      it('chọn phòng đã ngừng làm phòng MỚI → 400 nêu tên', async () => {
        const stopped = await room('ngung');
        await ds.query(`UPDATE examcollect.room SET is_active = false WHERE id = $1`, [stopped.id]);
        const session = await createSession(teacher, { roomId: (await room('dangchay')).id, ...windowAt(freshDay(), 8, 10) });

        const response = await patch(session.id, { roomId: stopped.id }).expect(400);

        expect(response.body.message).toContain(stopped.name);
        expect(response.body.message).toMatch(/ngừng hoạt động/);
      });

      it('Review Focus 7: giữ nguyên phòng đã bị tắt sau khi tạo phiên và chỉ sửa tên → được, kể cả gửi đúng roomId cũ', async () => {
        const chosen = await room('tatsau');
        const session = await createSession(teacher, { roomId: chosen.id, ...windowAt(freshDay(), 8, 10) });
        await ds.query(`UPDATE examcollect.room SET is_active = false WHERE id = $1`, [chosen.id]);

        await patch(session.id, { name: `Chỉ đổi tên ${tag}` }).expect(200);
        await patch(session.id, { name: `Đổi tên lần hai ${tag}`, roomId: chosen.id }).expect(200);

        expect(await dbSession(session.id)).toMatchObject({ room_id: chosen.id, name: `Đổi tên lần hai ${tag}` });
      });

      it('phòng không tồn tại → 400', async () => {
        const session = await createSession(teacher, { roomId: (await room('khongco')).id, ...windowAt(freshDay(), 8, 10) });
        await patch(session.id, { roomId: '00000000-0000-4000-8000-0000000000ee' }).expect(400);
      });
    });

    describe('trường được phép và trường cấm (Review Focus 6)', () => {
      it.each([
        ['classId', '00000000-0000-4000-8000-0000000000c1', /huỷ phiên và tạo lại/],
        ['requiredFilenames', ['Khac.docx'], /huỷ phiên và tạo lại/],
        ['semesterName', 'HK khác', /huỷ phiên và tạo lại/],
        ['teacherId', '00000000-0000-4000-8000-0000000000c2', /quản trị viên/],
        ['rubricId', '00000000-0000-4000-8000-0000000000c3', /chấm điểm/],
        ['roomName', 'Phòng gõ tay', /roomId/],
      ])('gửi %s là 400 kèm lý do và cách làm đúng, không bị bỏ qua lặng lẽ', async (field, value, pattern) => {
        const session = await createSession(teacher, { roomId: (await room(`cam-${field}`)).id, ...windowAt(freshDay(), 8, 10) });

        const response = await patch(session.id, { name: `Kèm ${field}`, [field]: value }).expect(400);

        expect(JSON.stringify(response.body.message)).toMatch(pattern);
        expect((await dbSession(session.id)).name).not.toBe(`Kèm ${field}`); // không ghi gì, kể cả trường hợp lệ đi kèm
      });

      it('thân rỗng hoặc chỉ có trường lạ → 400, không audit', async () => {
        const session = await createSession(teacher, { roomId: (await room('rong')).id, ...windowAt(freshDay(), 8, 10) });
        await patch(session.id, {}).expect(400);
        await patch(session.id, { khongco: 1 }).expect(400);
        expect(await auditRows('exam_session.update', session.id)).toHaveLength(0);
      });

      it('gửi đúng giá trị hiện có → 200, không ghi gì, không audit', async () => {
        const w = windowAt(freshDay(), 8, 10);
        const roomA = await room('khongdoi');
        const session = await createSession(teacher, { roomId: roomA.id, ...w });

        await patch(session.id, { name: session.name, roomId: roomA.id, startTime: w.startTime, endTime: w.endTime }).expect(200);

        expect(await auditRows('exam_session.update', session.id)).toHaveLength(0);
      });

      it('examType ngoài TK/GK/CK → 400; roomId không phải uuid → 400; name rỗng → 400', async () => {
        const session = await createSession(teacher, { roomId: (await room('kieu')).id, ...windowAt(freshDay(), 8, 10) });
        await patch(session.id, { examType: 'XX' }).expect(400);
        await patch(session.id, { roomId: 'khong-phai-uuid' }).expect(400);
        await patch(session.id, { name: '' }).expect(400);
      });
    });

    describe('phiên cũ chưa có room_id (trước backfill)', () => {
      it('sửa tên được; đổi giờ không kèm roomId → 400 bảo chọn phòng; kèm roomId → được', async () => {
        const day = freshDay();
        const klass = await seedClass(ds, { teacherId: teacher.id });
        const original = windowAt(day, 8, 10);
        const legacy = await seedExamSession(ds, {
          teacherId: teacher.id,
          classId: klass.id,
          startTime: new Date(original.startTime),
          endTime: new Date(original.endTime),
          roomName: `LEGACY${tag}`,
          withoutRoom: true, // hình dạng TRƯỚC backfill: chỉ có bản chụp tên phòng, room_id NULL
        });

        await patch(legacy.id, { name: `Cũ đổi tên ${tag}` }).expect(200);

        const blocked = await patch(legacy.id, windowAt(day, 9, 11)).expect(400);
        expect(blocked.body.message).toMatch(/chọn một phòng/i);

        const chosen = await room('gan-phong');
        await patch(legacy.id, { ...windowAt(day, 9, 11), roomId: chosen.id }).expect(200);
        expect(await dbSession(legacy.id)).toMatchObject({ room_id: chosen.id, room_name: chosen.name });
      });
    });

    it('T-SES-10: audit nêu đúng các trường đổi (cũ → mới), một dòng, cùng người sửa', async () => {
      const day = freshDay();
      const oldRoom = await room('audit-cu');
      const newRoom = await room('audit-moi');
      const session = await createSession(teacher, { roomId: oldRoom.id, ...windowAt(day, 8, 10), name: `Trước ${tag}` });
      const next = windowAt(day, 14, 16);

      await patch(session.id, { name: `Sau ${tag}`, roomId: newRoom.id, endTime: next.endTime, startTime: next.startTime }).expect(200);

      const original = windowAt(day, 8, 10);
      const rows = await auditRows('exam_session.update', session.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(teacher.id);
      // `loại kỳ thi` KHÔNG đổi nên không có mặt: audit chỉ nêu ĐÚNG các trường đổi. Giờ ghi dạng `toISOString()`, cùng
      // chuỗi mà `windowAt` đã sinh ra.
      expect(rows[0].old_value).toEqual({
        name: `Trước ${tag}`,
        room: oldRoom.name,
        startTime: original.startTime,
        endTime: original.endTime,
      });
      expect(rows[0].new_value).toEqual({
        targetLabel: `Sau ${tag}`,
        code: session.code,
        name: `Sau ${tag}`,
        room: newRoom.name,
        startTime: next.startTime,
        endTime: next.endTime,
      });
    });

    it('thất bại không để lại dòng audit nào', async () => {
      const session = await createSession(teacher, { roomId: (await room('audit-loi')).id, ...windowAt(freshDay(), 8, 10) });
      await patch(session.id, { endTime: windowAt(0, 0, 0).endTime }).expect(400);
      expect(await auditRows('exam_session.update', session.id)).toHaveLength(0);
    });
  });

  describe('POST /exam-sessions/:id/cancel', () => {
    it('T-SES-7: chưa ai vào → cancelled; tạo NGAY phiên mới cùng lớp, phòng, giờ được (Review Focus 5)', async () => {
      const w = windowAt(freshDay(), 8, 10);
      const chosen = await room('huy');
      const klass = await seedClass(ds, { teacherId: teacher.id });
      const session = await createSession(teacher, { roomId: chosen.id, classId: klass.id, ...w });

      const response = await cancel(session.id).expect(200);

      expect(response.body.status).toBe('cancelled');
      expect((await dbSession(session.id)).status).toBe('cancelled');
      // Phòng, lớp và quãng giãn cách của giảng viên đều đã nhả (ba ràng buộc bỏ qua `cancelled`).
      await createSession(teacher, { roomId: chosen.id, classId: klass.id, ...w });
    });

    it('huỷ một phiên ĐÃ bắt đầu mà chưa ai vào cũng được', async () => {
      await releaseTeacherSessions(ds, live.id);
      const started = new Date(Date.now() - 5 * MINUTE);
      const session = await createSession(live, {
        roomId: (await room('huydabatdau')).id,
        startTime: started.toISOString(),
        endTime: new Date(started.getTime() + HOUR).toISOString(),
      });

      await cancel(session.id, {}, live.token).expect(200);
      expect((await dbSession(session.id)).status).toBe('cancelled');
    });

    it('huỷ hai lần: lần hai là 200 idempotent và KHÔNG thêm dòng audit', async () => {
      const session = await createSession(teacher, { roomId: (await room('huyhailan')).id, ...windowAt(freshDay(), 8, 10) });

      await cancel(session.id).expect(200);
      await cancel(session.id).expect(200);

      expect(await auditRows('exam_session.cancel', session.id)).toHaveLength(1);
    });

    describe('T-SES-8: đã có người vào', () => {
      it('có agent_connection_event → 409 nêu hai nút cần bấm; trạng thái không đổi; không audit (Review Focus 4)', async () => {
        const session = await createSession(teacher, { roomId: (await room('coevent')).id, ...windowAt(freshDay(), 8, 10) });
        await ds.query(
          `INSERT INTO examcollect.agent_connection_event (exam_session_id, student_mssv, event_type)
           VALUES ($1, $2, 'connected')`,
          [session.id, `EV${tag}`],
        );

        const response = await cancel(session.id).expect(409);

        expect(response.body.message).toBe('Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc.');
        expect((await dbSession(session.id)).status).toBe('active');
        expect(await auditRows('exam_session.cancel', session.id)).toHaveLength(0);
      });

      it('có bài collected (dù không có sự kiện kết nối) → 409', async () => {
        const session = await createSession(teacher, { roomId: (await room('cobai')).id, ...windowAt(freshDay(), 8, 10) });
        const [deliverable] = await ds.query(
          `SELECT id FROM examcollect.required_deliverable WHERE exam_session_id = $1`,
          [session.id],
        );
        const [row] = await ds.query(
          `INSERT INTO examcollect.submission
             (exam_session_id, required_deliverable_id, student_mssv, student_name_input, home_class_id, home_teacher_id, status)
           VALUES ($1, $2, $3, 'Sinh vien bai', $4, $5, 'received') RETURNING id`,
          [session.id, deliverable.id, `SB${tag}`, session.classId, teacher.id],
        );
        for (const next of ['validated', 'collected']) {
          await ds.query(`UPDATE examcollect.submission SET status = $1 WHERE id = $2`, [next, row.id]);
        }

        await cancel(session.id).expect(409);

        expect((await dbSession(session.id)).status).toBe('active');
      });

      it('"Mở phiên thi" đã gieo bài not_submitted và ảnh chốt: KHÔNG chặn huỷ, và cả hai được giữ nguyên', async () => {
        const klass = await seedClass(ds, { teacherId: teacher.id });
        await seedEnrollment(ds, { classId: klass.id, teacherId: teacher.id, mssv: `NS${tag}`, name: 'Sinh vien chua nop' });
        const session = await createSession(teacher, {
          roomId: (await room('notsub')).id,
          classId: klass.id,
          ...windowAt(freshDay(), 8, 10),
        });
        await openSession(app, teacher.token, session.id); // đóng băng danh sách và gieo bài not_submitted
        const count = async (table: string) =>
          ((await ds.query(`SELECT count(*)::int AS n FROM examcollect.${table} WHERE exam_session_id = $1`, [session.id]))[0].n as number);
        expect(await count('submission')).toBeGreaterThan(0);
        const roster = await count('session_roster');
        const seeded = await count('submission');

        await cancel(session.id).expect(200);

        expect(await count('submission')).toBe(seeded);
        expect(await count('session_roster')).toBe(roster);
        const rows = await ds.query(`SELECT DISTINCT status FROM examcollect.submission WHERE exam_session_id = $1`, [session.id]);
        expect(rows).toEqual([{ status: 'not_submitted' }]);
      });

      it.each(['collecting', 'completed'])('phiên %s → 409 theo trạng thái', async (status) => {
        const session = await createSession(teacher, { roomId: (await room(`huy-${status}`)).id, ...windowAt(freshDay(), 8, 10) });
        await ds.query(`UPDATE examcollect.exam_session SET status = $1 WHERE id = $2`, [status, session.id]);

        await cancel(session.id).expect(409);

        expect((await dbSession(session.id)).status).toBe(status);
      });
    });

    it('T-SES-4: giảng viên khác / admin → 403; không tồn tại → 404', async () => {
      const session = await createSession(teacher, { roomId: (await room('huyquyen')).id, ...windowAt(freshDay(), 8, 10) });
      await cancel(session.id, {}, colleague.token).expect(403);
      await cancel(session.id, {}, admin.token).expect(403);
      await cancel('00000000-0000-4000-8000-0000000000bb').expect(404);
      expect((await dbSession(session.id)).status).toBe('active');
    });

    it('T-SES-10: audit ghi người huỷ, trạng thái cũ → mới, và lý do nếu có (đã cắt khoảng trắng)', async () => {
      const session = await createSession(teacher, { roomId: (await room('huyaudit')).id, ...windowAt(freshDay(), 8, 10), name: `Phiên huỷ ${tag}` });

      await cancel(session.id, { reason: '  Nhầm phòng  ' }).expect(200);

      const rows = await auditRows('exam_session.cancel', session.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(teacher.id);
      expect(rows[0].old_value).toEqual({ status: 'active' });
      expect(rows[0].new_value).toEqual({
        targetLabel: `Phiên huỷ ${tag}`,
        code: session.code,
        status: 'cancelled',
        reason: 'Nhầm phòng',
      });
    });

    it('không có lý do thì new_value không có khoá reason; lý do quá 200 ký tự → 400', async () => {
      const session = await createSession(teacher, { roomId: (await room('huylydo')).id, ...windowAt(freshDay(), 8, 10) });
      await cancel(session.id, { reason: 'x'.repeat(201) }).expect(400);
      await cancel(session.id).expect(200);
      expect((await auditRows('exam_session.cancel', session.id))[0].new_value).not.toHaveProperty('reason');
    });

    it('T-SES-9: agent:join vào phiên đã huỷ (khung giờ ĐANG chạy) bị từ chối SESSION_NOT_ACTIVE', async () => {
      await releaseTeacherSessions(ds, live.id);
      const started = new Date(Date.now() - 5 * MINUTE);
      const session = await createSession(live, {
        roomId: (await room('huyjoin')).id,
        startTime: started.toISOString(),
        endTime: new Date(started.getTime() + HOUR).toISOString(),
      });
      await cancel(session.id, {}, live.token).expect(200);

      // Khung giờ đang chạy nên chỉ TRẠNG THÁI mới làm lệnh join bị từ chối: đúng hành vi sẵn có cần khoá lại.
      const reply = await new Promise<{ event: string; body: Record<string, unknown> }>((resolve, reject) => {
        const socket = io(`${baseUrl}/exam-live`, { reconnection: false, forceNew: true });
        sockets.push(socket);
        const timer = setTimeout(() => reject(new Error('không có phản hồi cho agent:join')), 10_000);
        socket.on('agent:join:ack', (body) => {
          clearTimeout(timer);
          resolve({ event: 'ack', body });
        });
        socket.on('agent:join:error', (body) => {
          clearTimeout(timer);
          resolve({ event: 'error', body });
        });
        socket.on('connect', () => socket.emit('agent:join', { studentId: `JN${tag}`, sessionCode: session.code }));
      });

      expect(reply.event).toBe('error');
      expect(reply.body.code).toBe('SESSION_NOT_ACTIVE');
    });
  });
});
