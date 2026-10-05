# Plan D3 — Phiên thi dùng phòng và học kỳ thật

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên **chọn** phòng (`roomId`) thay vì gõ tên; học kỳ của phiên **suy ra từ lớp**, không còn ô nhập. `room_name` / `semester_name` thành **bản chụp do server điền** lúc tạo phiên (bảng điểm, tên file `{PHONG}` và các đường đọc cũ không đổi). Chống trùng phòng chạy theo khoá. Hai danh sách có cột học kỳ (`GET /exam-sessions`, `GET /submissions/overview`) nhận bộ lọc và trường học kỳ theo **khoá**, và đổi tên lớp sang `classLabel`.

**Architecture:** Đây là bước **đổi hợp đồng API** (`POST /exam-sessions` bỏ `roomName`/`semesterName`, thêm `roomId`), nên các suite e2e phải đổi **cùng một commit** với API — plan A đã làm điều đó rẻ: 29 file dựng thân request qua `sessionBody`, nên chỉ có helper và ba suite "gõ tay phòng/học kỳ" phải viết lại. `ScheduleConflictService` đổi sang tham số dạng đối tượng, khoá theo `room_id`, đọc nhãn lớp từ view, và nhận `excludeSessionId` (plan F dùng khi sửa phiên). Mọi nơi còn đọc `class.name` chuyển sang `class_label`; sau đó `seedClass` thôi ghi `class.name`.

**Tech Stack:** NestJS 10, TypeORM 0.3, Postgres 16, class-validator, jest e2e.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §2.4, §2.5, §4 (nhóm Phiên thi; `GET /exam-sessions`, `POST /exam-sessions`, `schedule-conflict`), §5.2 (form tạo phiên), §7.2, §11: T-MD-9, T-ROOM-1 (đã ở plan C), T-ROOM-2, T-ROOM-3, T-FLT-3, T-SES-2 (phần `excludeSessionId`), §11 "nghiệm thu bằng chấm thật" (CLI diễn tập); §13 mục 13.

## Global Constraints

- **`POST /exam-sessions` nhận `roomId` (UUID bắt buộc) và KHÔNG nhận `roomName`/`semesterName`.** Client cũ còn gửi chúng thì `ValidationPipe({ whitelist: true })` lặng lẽ cắt (như `courseName`). Phòng phải tồn tại **và `is_active`** (400 nêu tên phòng); lớp phải thuộc giảng viên gọi (kiểm có sẵn, giữ) **và có học kỳ** (409 nêu cách khắc phục).
- **Bản chụp do server điền, một lần:** `room_name` ← tên phòng lúc tạo; `semester_name` ← nhãn học kỳ của lớp lúc tạo (`HK1 2026-2027`); `course_name` ← lớp (như cũ). Admin đổi tên phòng hay sửa ngày học kỳ **sau đó** không đổi bản chụp trên phiên cũ (T-ROOM-3, T-MD-9). `semester_name` mang `update: false`; `room_name` **không** (plan F cập nhật nó khi sửa phòng của phiên).
- **Học kỳ không bao giờ chặn thao tác** (CLAUDE.md §1.2, spec §7.3): tạo phiên cho lớp của kỳ đã kết thúc vẫn được (T-FLT-3). Bộ lọc năm học/học kỳ chỉ hẹp tầm nhìn.
- `ScheduleConflictService.assertNone` nhận **một đối tượng** `{ roomId, classId, teacherId, startTime, endTime, excludeSessionId? }`. Nó phản chiếu **đúng** vị từ của ba ràng buộc (cùng khoảng nửa mở `'[)'`, cùng tập trạng thái `collecting/completed/cancelled` không giữ chỗ): chặt hơn ràng buộc thì từ chối lịch hợp lệ, lỏng hơn thì trả lại 409 chung chung mà lớp này sinh ra để tránh. DB (ràng buộc EXCLUDE) vẫn là thẩm quyền cuối.
- **Hợp đồng phản hồi:** `ExamSessionListItemDto` thêm `semesterId`, `academicYear`, `term`, `classLabel` và **bỏ** `className`; phản hồi danh sách **bỏ** `semesterNames` (lựa chọn lấy từ `GET /semesters`). `ExamSessionResponseDto` gán `roomId` thật (trường đã khai mà chưa bao giờ được gán), thêm `classLabel`, bỏ `courseId` mồ côi. `SessionOverviewItem` thêm `semesterId`, `academicYear`, `term`, đổi `className` → `classLabel`; **giữ** `semesterName` (bản chụp) cho bảng điểm.
- **Bộ lọc `GET /exam-sessions`:** `semesterId` (uuid) và `academicYear` (số 2000–2999) lọc theo **học kỳ HIỆN TẠI của lớp** (khoá), không theo bản chụp. Hai bộ lọc AND với phạm vi chủ sở hữu và với nhau; vắng mặt là "tất cả". `semesterName` bị bỏ khỏi DTO.
- Chạy e2e theo plan A. Học kỳ mặc định của test là **cố định** (`ensureTestSemester`, năm 2200, plan D1); `seedClass` mặc định dùng nó.
- Sau plan này, **không còn** code nào đọc `class.name`, `enrollment.student_name` (ngoài `COALESCE` dự phòng của D1) hay ghi chúng; cột cũ chỉ còn tồn tại cho giai đoạn chuyển tiếp và bị gỡ ở plan H. `seedClass` thôi ghi `class.name`.

## Review Focus

1. **Bản chụp trôi theo bản gốc.** Nếu `roomName`/`semesterName` được suy ra lúc đọc (join) thay vì chụp lúc tạo, đổi tên phòng làm đổi bảng điểm cũ. → test đổi tên phòng và sửa ngày học kỳ rồi đọc lại phiên cũ (Task 1).
2. **Client cũ gửi `roomName`.** Phải bị bỏ qua và dẫn tới 400 "thiếu roomId", không được lặng lẽ tạo phòng mới hay dùng tên đó. → test (Task 1).
3. **Phòng ngừng hoạt động lọt vào phiên mới**, hoặc **chặn nhầm phiên cũ** vẫn tham chiếu nó. → T-ROOM-2 kiểm cả hai chiều (Task 1).
4. **Lớp chưa có học kỳ** (dữ liệu cũ chưa backfill) tạo ra phiên có `semester_name` rỗng/NULL. → 409 rõ ràng, không ghi gì (Task 1).
5. **`excludeSessionId` loại quá tay.** Một phiên khác cùng phòng không được lọt vì tham số này. → test hai chiều (Task 1).
6. **Bộ lọc học kỳ làm lộ phiên người khác** (một `OR` đặt nhầm). → giữ ca "AND vào phạm vi chủ sở hữu" khi viết lại bộ lọc theo khoá (Task 1).
7. **Test xanh vì sai lý do sau khi đổi seed:** helper tự tạo phòng/học kỳ im lặng nên một test quên truyền phòng vẫn pass. → số test mỗi suite phải khớp baseline, và `tsc` phải sạch (Task 3).

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/exam-session/dto/create-exam-session.dto.ts` | `roomId` thay `roomName` + `semesterName`. |
| `apps/api/src/exam-session/dto/search-exam-sessions.dto.ts` | `semesterId`, `academicYear` thay `semesterName`. |
| `apps/api/src/exam-session/dto/exam-session-response.dto.ts` | Trường mới/bỏ trường. |
| `apps/api/src/exam-session/exam-session.service.ts` | `create`, `findAllForOwner`, `toResponseDto`. |
| `apps/api/src/exam-session/schedule-conflict.service.ts` | Viết lại. |
| `apps/api/src/course/room.service.ts`, `semester.service.ts` | `requireActiveForNewSession`, `labelOf`. |
| `apps/api/src/submission/submission-overview.service.ts`, `submission-overview.types.ts` | Nhãn lớp + trường học kỳ. |
| `apps/api/src/eval/rehearsal/cli.ts` | `roomId` thay `roomName`/`semesterName`. |
| `apps/api/test/helpers/seed.ts` | `ensureRoom`; `seedClass`, `seedExamSession`, `sessionBody` dạng cuối. |
| `apps/api/test/seed-helper.e2e-spec.ts`, `master-data-schema.e2e-spec.ts` | Theo helper mới. |
| `apps/api/test/exam-session-snapshots.e2e-spec.ts` | **Mới** (thay `exam-session-semester-name`, bị xoá). |
| `apps/api/test/exam-session.e2e-spec.ts`, `exam-schedule-conflict.e2e-spec.ts` | Viết lại phần phòng/học kỳ. |
| `apps/api/test/submission-overview*.e2e-spec.ts` | Trường học kỳ mới. |
| `apps/api/src/common/e2e-seed-hygiene.spec.ts` | Cập nhật chú thích danh sách rule 2. |
| `packages/shared/src/api/schema.d.ts` | Sinh lại. |

---

### Task 1: Viết test cho hợp đồng mới (đỏ)

**Files:**
- Create: `apps/api/test/exam-session-snapshots.e2e-spec.ts`
- Delete: `apps/api/test/exam-session-semester-name.e2e-spec.ts`

**Interfaces:**
- Consumes: `ensureRoom(db, name): Promise<{ id: string; name: string }>` và `seedClass(db, { semesterId?: string | null, administrativeClassId?: string | null, … })` — cả hai ở dạng cuối thêm trong Task 2 Step 1.
- Produces: các test mà Task 2–3 phải làm xanh.

- [ ] **Step 1: Viết `exam-session-snapshots.e2e-spec.ts`**

Create `apps/api/test/exam-session-snapshots.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { semesterLabel } from '../src/common/semester-label';
import { createTestAccount } from './helpers/create-account';
import { ensurePastSemester, ensureTestSemester, randomTag } from './helpers/master-data';
import { ensureRoom, seedClass } from './helpers/seed';

/**
 * `room_name`, `semester_name` — ảnh chụp lúc tạo phiên (spec §2.4, CLAUDE.md §7.1.5).
 *
 * Từ khi phòng và học kỳ là thực thể, hai chuỗi này KHÔNG còn do giảng viên gõ: server chép tên phòng và nhãn học
 * kỳ của lớp vào lúc tạo. Test thứ hai và thứ ba của mỗi nhóm là toàn bộ lý do cột tồn tại — nếu chúng xanh cả khi
 * bỏ cột đi (đọc tên bằng join) thì cột đó không cần thiết, và bảng điểm cũ sẽ đổi theo mỗi lần admin đổi tên phòng.
 */
describe('Phiên thi: bản chụp phòng và học kỳ (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let teacherToken: string;
  let teacherId: string;
  let adminToken: string;
  let semesterId: string;
  let semesterText: string;

  const tag = randomTag(8);
  let windowCursor = 0;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  /** Mỗi phiên một khung giờ riêng và một lớp riêng: hai phiên cùng lớp chồng giờ bị 409. */
  function create(body: Record<string, unknown>, token = teacherToken) {
    windowCursor += 1;
    const start = Date.now() + (windowCursor * 3 + 1) * 3_600_000;
    return request(app.getHttpServer())
      .post('/exam-sessions')
      .set(auth(token))
      .send({
        name: `Snapshot ${tag} ${windowCursor}`,
        examType: 'CK',
        startTime: new Date(start).toISOString(),
        endTime: new Date(start + 3_600_000).toISOString(),
        requiredFilenames: ['Cau1.docx'],
        ...body,
      });
  }

  async function account(prefix: string, role: 'teacher' | 'admin') {
    const email = `${prefix}_${tag}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: login.body.accessToken as string };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const teacher = await account('snap_gv', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    adminToken = (await account('snap_admin', 'admin')).token;

    semesterId = await ensureTestSemester(ds, 1);
    const [{ academic_year_start: year, term }] = await ds.query(
      `SELECT academic_year_start, term FROM examcollect.semester WHERE id = $1`,
      [semesterId],
    );
    semesterText = semesterLabel(year, term);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('chụp lúc tạo', () => {
    it('server chép tên phòng và nhãn học kỳ của LỚP vào phiên, và trả roomId + classLabel', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong chup ${tag} A`);

      const res = await create({ classId: klass.id, roomId: room.id }).expect(201);

      expect(res.body).toMatchObject({
        roomId: room.id,
        roomName: room.name,
        semesterName: semesterText,
        classLabel: klass.label,
      });
      const [row] = await ds.query(`SELECT room_id, room_name, semester_name FROM examcollect.exam_session WHERE id = $1`, [res.body.id]);
      expect(row).toEqual({ room_id: room.id, room_name: room.name, semester_name: semesterText });
    });

    it('client cũ gửi roomName/semesterName: bị bỏ qua, và không có roomId thì 400 — không tạo phòng, không dùng tên đó (Review Focus 2)', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.room`);

      const res = await create({ classId: klass.id, roomName: `Phong gõ tay ${tag}`, semesterName: 'HK tự khai' }).expect(400);

      expect(JSON.stringify(res.body.message)).toMatch(/roomId/);
      const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.room`);
      expect(after).toBe(before);
    });

    it('semesterName và roomName gửi KÈM roomId hợp lệ vẫn bị bỏ qua: bản chụp luôn đến từ server', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong chup ${tag} B`);

      const res = await create({ classId: klass.id, roomId: room.id, roomName: 'GIẢ', semesterName: 'GIẢ' }).expect(201);

      expect(res.body.roomName).toBe(room.name);
      expect(res.body.semesterName).toBe(semesterText);
    });

    it('roomId không phải uuid, hoặc không có thật: 400; lớp không có học kỳ: 409 và không ghi gì (Review Focus 4)', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      await create({ classId: klass.id, roomId: 'khong-phai-uuid' }).expect(400);
      const ghost = await create({ classId: klass.id, roomId: '00000000-0000-4000-8000-0000000000ee' }).expect(400);
      expect(ghost.body.message).toMatch(/phòng/i);

      const legacy = await seedClass(ds, { teacherId, semesterId: null }); // lớp cũ chưa backfill
      const room = await ensureRoom(ds, `Phong chup ${tag} C`);
      const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_session WHERE class_id = $1`, [legacy.id]);
      const blocked = await create({ classId: legacy.id, roomId: room.id }).expect(409);
      expect(blocked.body.message).toMatch(/học kỳ/);
      const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.exam_session WHERE class_id = $1`, [legacy.id]);
      expect(after).toBe(before);
    });
  });

  describe('T-ROOM-3: đổi tên phòng không đổi phiên cũ', () => {
    it('bản chụp giữ tên cũ; phiên TẠO SAU mang tên mới (Review Focus 1)', async () => {
      const room = await ensureRoom(ds, `Phong doi ten ${tag}`);
      const klass = await seedClass(ds, { teacherId, semesterId });
      const old = await create({ classId: klass.id, roomId: room.id }).expect(201);

      const newName = `Phong da doi ten ${tag}`;
      await request(app.getHttpServer()).patch(`/rooms/${room.id}`).set(auth(adminToken)).send({ name: newName }).expect(200);

      const [row] = await ds.query(`SELECT room_name FROM examcollect.exam_session WHERE id = $1`, [old.body.id]);
      expect(row.room_name).toBe(room.name);

      const klass2 = await seedClass(ds, { teacherId, semesterId });
      const fresh = await create({ classId: klass2.id, roomId: room.id }).expect(201);
      expect(fresh.body.roomName).toBe(newName);
    });
  });

  describe('T-MD-9: bản chụp học kỳ không đổi theo học kỳ', () => {
    it('admin sửa ngày của học kỳ thì semester_name trên phiên không đổi', async () => {
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong T-MD-9 ${tag}`);
      const created = await create({ classId: klass.id, roomId: room.id }).expect(201);
      const [{ end_date: end }] = await ds.query(`SELECT to_char(end_date, 'YYYY-MM-DD') AS end_date FROM examcollect.semester WHERE id = $1`, [semesterId]);

      // Ngày sửa được (năm/kỳ thì không khi đã có lớp). Co ngày kết thúc lùi một ngày rồi trả lại.
      const shorter = new Date(`${end}T00:00:00Z`);
      shorter.setUTCDate(shorter.getUTCDate() - 1);
      const shorterText = shorter.toISOString().slice(0, 10);
      await request(app.getHttpServer()).patch(`/semesters/${semesterId}`).set(auth(adminToken)).send({ endDate: shorterText }).expect(200);
      await request(app.getHttpServer()).patch(`/semesters/${semesterId}`).set(auth(adminToken)).send({ endDate: end }).expect(200);

      const [row] = await ds.query(`SELECT semester_name FROM examcollect.exam_session WHERE id = $1`, [created.body.id]);
      expect(row.semester_name).toBe(semesterText);
    });

    it('cột không ghi đè được, kể cả khi save() mang giá trị khác', async () => {
      // `{ update: false }` ở tầng TypeORM. JSDoc "KHÔNG BAO GIỜ sửa" chỉ là lời hứa; một cột kỳ bị ghi đè làm bảng
      // điểm ghi sai kỳ, vĩnh viễn, không triệu chứng.
      const klass = await seedClass(ds, { teacherId, semesterId });
      const room = await ensureRoom(ds, `Phong update false ${tag}`);
      const created = await create({ classId: klass.id, roomId: room.id }).expect(201);

      const repo = ds.getRepository('ExamSessionEntity');
      await repo.save({ id: created.body.id, semesterName: 'KỲ BỊ GHI ĐÈ', name: 'Tên mới' });

      const [row] = await ds.query(`SELECT semester_name, name FROM examcollect.exam_session WHERE id = $1`, [created.body.id]);
      expect(row.semester_name).toBe(semesterText);
      // Cột thường vẫn ghi được — nếu cả hai cùng không đổi thì test xanh vì save() không chạy, không phải vì cột được bảo vệ.
      expect(row.name).toBe('Tên mới');
    });
  });

  describe('T-ROOM-2: phòng ngừng hoạt động', () => {
    it('không chọn được cho phiên MỚI (400 nêu tên), nhưng phiên cũ vẫn tham chiếu được (Review Focus 3)', async () => {
      const room = await ensureRoom(ds, `Phong ngung ${tag}`);
      const klass = await seedClass(ds, { teacherId, semesterId });
      const before = await create({ classId: klass.id, roomId: room.id }).expect(201);

      await request(app.getHttpServer()).patch(`/rooms/${room.id}`).set(auth(adminToken)).send({ isActive: false }).expect(200);

      const klass2 = await seedClass(ds, { teacherId, semesterId });
      const blocked = await create({ classId: klass2.id, roomId: room.id }).expect(400);
      expect(blocked.body.message).toContain(room.name);
      expect(blocked.body.message).toMatch(/ngừng hoạt động/);

      // Phiên cũ không bị đụng: đọc lại được, vẫn mang phòng.
      const old = await request(app.getHttpServer()).get(`/exam-sessions/${before.body.id}`).set(auth(teacherToken)).expect(200);
      expect(old.body.roomId).toBe(room.id);
      expect(old.body.roomName).toBe(room.name);

      // Và danh sách phòng cho form tạo phiên không còn nó.
      const active = await request(app.getHttpServer()).get('/rooms?active=true').set(auth(teacherToken)).expect(200);
      expect(active.body.map((r: { id: string }) => r.id)).not.toContain(room.id);
    });
  });

  describe('T-FLT-3: học kỳ không bao giờ chặn thao tác', () => {
    it('lớp của kỳ ĐÃ KẾT THÚC vẫn tạo được phiên thi', async () => {
      const pastSemester = await ensurePastSemester(ds);
      const klass = await seedClass(ds, { teacherId, semesterId: pastSemester });
      const room = await ensureRoom(ds, `Phong ky cu ${tag}`);
      const res = await create({ classId: klass.id, roomId: room.id }).expect(201);
      expect(res.body.semesterName).toBe('HK1 2001-2002');
    });
  });
});
```

- [ ] **Step 2: Xoá suite cũ**

Xoá `apps/api/test/exam-session-semester-name.e2e-spec.ts`: nó khẳng định "học kỳ là thứ giảng viên khai cho đúng phiên đó" — đúng điều spec đã đảo ngược. Ba ý còn giá trị của nó (chụp lúc tạo, không đổi theo, `update: false`) nằm ở suite mới.

- [ ] **Step 3: Thêm ca `excludeSessionId` vào `exam-schedule-conflict.e2e-spec.ts`**

Thêm hai ca cuối `describe` (dùng `roomId`, `otherRoomId` khai ở Task 3 Step 2; viết ở đây để TDD, chúng sẽ biên dịch được khi Task 3 xong):

```ts
  it('assertNone loại trừ ĐÚNG phiên được chỉ định: một phiên không va chạm với chính nó (dùng cho sửa phiên)', async () => {
    const day = freshDay();
    const first = await createSession({ name: 'Ca cần sửa', classId, roomId, ...windowAt(day, 8, 10) });
    expect(first.status).toBe(201);
    const service = app.get(ScheduleConflictService);
    const same = {
      roomId,
      classId,
      teacherId: ownerId,
      startTime: new Date(first.body.startTime),
      endTime: new Date(first.body.endTime),
    };

    // Không loại trừ: phiên này tự va chạm với chính nó (ba kiểm tra đều thấy nó).
    await expect(service.assertNone(same)).rejects.toThrow(ConflictException);
    // Loại trừ chính nó: êm.
    await expect(service.assertNone({ ...same, excludeSessionId: first.body.id })).resolves.toBeUndefined();
  });

  it('excludeSessionId chỉ loại phiên đó: phiên KHÁC cùng phòng vẫn bị phát hiện (Review Focus 5)', async () => {
    const day = freshDay();
    const mine = await createSession({ name: 'Của tôi', classId, roomId, ...windowAt(day, 8, 10) });
    expect(mine.status).toBe(201);
    // Phiên của đồng nghiệp ở CÙNG phòng, kế sau (không chồng): hợp lệ.
    const theirs = await createSession(
      { name: 'Của đồng nghiệp', classId: peerClassId, roomId, ...windowAt(day, 10, 12) },
      peerToken,
    );
    expect(theirs.status).toBe(201);

    const service = app.get(ScheduleConflictService);
    // Dời phiên của tôi sang 9–11 trong cùng phòng: chồng với phiên đồng nghiệp (10–12), và loại trừ chính mình
    // không được che mất phiên kia.
    await expect(
      service.assertNone({
        roomId,
        classId,
        teacherId: ownerId,
        startTime: new Date(windowAt(day, 9, 11).startTime),
        endTime: new Date(windowAt(day, 9, 11).endTime),
        excludeSessionId: mine.body.id,
      }),
    ).rejects.toThrow(/Của đồng nghiệp/);
  });
```

và thêm import ở đầu file: `import { ConflictException } from '@nestjs/common';` và `import { ScheduleConflictService } from '../src/exam-session/schedule-conflict.service';`.

- [ ] **Step 4: Chưa chạy được** — Task 2–3 là một khối. Chuyển sang Task 2.

---

### Task 2: Đổi hợp đồng API và helper seed (một khối)

**Files:**
- Modify: `apps/api/test/helpers/seed.ts`, `apps/api/test/seed-helper.e2e-spec.ts`, `apps/api/test/master-data-schema.e2e-spec.ts`
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.ts`, `search-exam-sessions.dto.ts`, `exam-session-response.dto.ts`
- Modify: `apps/api/src/course/room.service.ts`, `apps/api/src/course/semester.service.ts`
- Modify (viết lại): `apps/api/src/exam-session/schedule-conflict.service.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts`
- Modify: `apps/api/src/submission/submission-overview.service.ts`, `submission-overview.types.ts`

**Interfaces:**
- Produces (API): `POST /exam-sessions { name, classId, roomId, examType, startTime, endTime, requiredFilenames, rubricId? }`; `GET /exam-sessions?semesterId&academicYear&…` → `{ items: ExamSessionListItemDto[], total }`.
- Produces (service): `RoomService.requireActiveForNewSession(roomId): Promise<RoomEntity>`; `SemesterService.labelOf(semesterId): Promise<string | null>`; `ScheduleConflictService.assertNone(check: ScheduleCheck): Promise<void>`.
- Produces (helper): `ensureRoom`, `seedClass` (có học kỳ + lớp danh nghĩa), `seedExamSession` (có phòng), `sessionBody` (có `roomId`).

Mọi commit phải xanh nên Task 2 **không commit**; commit ở cuối Task 3.

- [ ] **Step 1: Helper seed dạng cuối**

Trong `apps/api/test/helpers/seed.ts`:

1. Thêm import ở đầu file: `import { ensureTestSemester } from './master-data';` (runtime) — `master-data.ts` chỉ `import type { Queryable } from './seed'` nên **không** có vòng nhập thật.

2. Thêm hàm dùng chung (sau `classLabel`):

```ts
/**
 * Phòng theo tên, tạo nếu chưa có (không phân biệt hoa-thường). Idempotent: hai lần gọi cùng tên trả cùng một phòng, nên
 * các test cần "hai phiên cùng phòng" chỉ việc truyền cùng một `roomName`.
 */
export async function ensureRoom(db: Queryable, name: string): Promise<{ id: string; name: string }> {
  const [row] = await db.query(
    `INSERT INTO examcollect.room (name) VALUES ($1)
     ON CONFLICT (name) DO UPDATE SET name = examcollect.room.name
     RETURNING id, name::text AS name`,
    [name],
  );
  return { id: row.id as string, name: row.name as string };
}

/** Lớp danh nghĩa theo mã (HOA, 3–30 chữ/số), tạo nếu chưa có. */
async function ensureAdministrativeClass(db: Queryable, code: string): Promise<string> {
  if (!/^[A-Z0-9]{3,30}$/.test(code)) {
    throw new Error(`seedClass: code "${code}" phải là chữ HOA/số dài 3–30 ký tự (khớp ck_administrative_class_code).`);
  }
  const [row] = await db.query(
    `INSERT INTO examcollect.administrative_class (code) VALUES ($1)
     ON CONFLICT (code) DO UPDATE SET code = EXCLUDED.code
     RETURNING id`,
    [code],
  );
  return row.id as string;
}
```

3. Thay `SeedClassOptions`, `SeededClass`, `seedClass`:

```ts
export interface SeedClassOptions {
  teacherId: string;
  /** Mã lớp danh nghĩa (HOA, 3–30 chữ/số). Mặc định: một mã duy nhất tự sinh (`ADM…`). Bị bỏ qua khi có `administrativeClassId`. */
  code?: string;
  /** Nhóm, vd "Nhóm 1". Mặc định `''` = không tách nhóm. */
  groupName?: string;
  /** Chỉ truyền khi test CỐ Ý cần một môn khác. Mặc định là hằng số của hệ thống. */
  courseName?: string;
  /** Học kỳ của lớp. Mặc định: học kỳ test dùng chung (2200, kỳ 1). `null` = lớp CŨ chưa có học kỳ (dữ liệu trước backfill). */
  semesterId?: string | null;
  /** Lớp danh nghĩa có sẵn. Mặc định: tạo/dùng lớp theo `code`. `null` = lớp cũ chưa gán. */
  administrativeClassId?: string | null;
}

export interface SeededClass {
  id: string;
  code: string;
  groupName: string;
  /** Nhãn hiển thị — đọc từ view `class_label`, đúng thứ mà API trả ra ở mọi nơi hiện tên lớp. */
  label: string;
  semesterId: string | null;
  administrativeClassId: string | null;
}

export async function seedClass(db: Queryable, o: SeedClassOptions): Promise<SeededClass> {
  const groupName = o.groupName ?? '';
  const semesterId = o.semesterId === undefined ? await ensureTestSemester(db, 1) : o.semesterId;
  const administrativeClassId =
    o.administrativeClassId === undefined
      ? await ensureAdministrativeClass(db, o.code ?? `ADM${stamp()}`)
      : o.administrativeClassId;
  // KHÔNG ghi `class.name` (cột cũ, bị gỡ ở plan H): tên lớp là biểu thức của mã + nhóm.
  const [row] = await db.query(
    `INSERT INTO examcollect.class
       (course_name, teacher_id, semester_id, administrative_class_id, group_name)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [o.courseName ?? COURSE_NAME, o.teacherId, semesterId, administrativeClassId, groupName],
  );
  const [meta] = await db.query(
    `SELECT cl.label, ac.code::text AS code
       FROM examcollect.class_label cl
       JOIN examcollect.class c ON c.id = cl.class_id
       LEFT JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
      WHERE cl.class_id = $1`,
    [row.id],
  );
  return {
    id: row.id as string,
    code: (meta.code as string | null) ?? '',
    groupName,
    label: meta.label as string,
    semesterId,
    administrativeClassId,
  };
}
```

Với lớp `semesterId: null` hoặc `administrativeClassId: null` (lớp cũ), `class_label` rơi về `class.name` — vốn NULL ở đây — nên `label` có thể là `null`; test dùng các lớp này chỉ để kiểm đường "lớp cũ", không đọc `label`.

4. Trong `SeedExamSessionOptions` thêm `withoutRoom?: boolean` và đổi kiểu trả về; thay thân `seedExamSession`:

```ts
  /**
   * Phòng thật. Mặc định: tạo/dùng phòng theo `roomName` (hoặc một tên duy nhất) và ghi `room_id`. `roomId` có sẵn
   * thì `roomName` mặc định là tên của phòng đó.
   */
  roomId?: string;
  /** Dòng KIỂU CŨ chỉ có bản chụp tên phòng, `room_id` NULL — cho test về ràng buộc cũ ở giai đoạn chuyển tiếp. */
  withoutRoom?: boolean;
```

```ts
export interface SeededExamSession {
  id: string;
  code: string;
  roomId: string | null;
  roomName: string;
  semesterName: string;
  courseName: string;
}

export async function seedExamSession(db: Queryable, o: SeedExamSessionOptions): Promise<SeededExamSession> {
  const s = stamp();
  const code = (o.code ?? `S${s}`).slice(0, 20);
  const semesterName = o.semesterName ?? 'HK kiểm thử';
  const courseName = o.courseName ?? COURSE_NAME;

  let roomId: string | null = null;
  let roomName = o.roomName ?? `P ${s}`;
  if (!o.withoutRoom) {
    if (o.roomId) {
      roomId = o.roomId;
      if (o.roomName === undefined) {
        const [room] = await db.query(`SELECT name::text AS name FROM examcollect.room WHERE id = $1`, [o.roomId]);
        roomName = room.name as string;
      }
    } else {
      const room = await ensureRoom(db, roomName);
      roomId = room.id;
      roomName = room.name;
    }
  }

  const [row] = await db.query(
    `INSERT INTO examcollect.exam_session
       (name, code, class_id, teacher_id, exam_type, start_time, end_time, status,
        semester_name, course_name, room_name, room_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [
      o.name ?? `Phiên ${s}`,
      code,
      o.classId,
      o.teacherId,
      o.examType ?? 'TK',
      o.startTime.toISOString(),
      o.endTime.toISOString(),
      o.status ?? 'active',
      semesterName,
      courseName,
      roomName,
      roomId,
    ],
  );
  return { id: row.id as string, code, roomId, roomName, semesterName, courseName };
}
```

5. Thay `SessionBodyOptions` và `sessionBody`:

```ts
export interface SessionBodyOptions {
  classId: string;
  name?: string;
  /** Phòng có sẵn. Loại trừ nhau với `roomName`. */
  roomId?: string;
  /** Tên phòng: tạo/dùng phòng theo tên rồi gửi `roomId` của nó. Mặc định một tên duy nhất. */
  roomName?: string;
  rubricId?: string;
  examType?: ExamType;
  /** Truyền CẢ HAI hoặc không truyền cái nào. */
  startTime?: string;
  endTime?: string;
  requiredFilenames?: Array<
    | string
    | { filename: string; deliverableType?: string; language?: string; entries?: string[] }
  >;
}

/**
 * Thân hợp lệ của `POST /exam-sessions` — `roomId`, KHÔNG có `roomName`/`semesterName`: phòng do giảng viên CHỌN, học kỳ
 * suy ra từ lớp (spec §2.4). Nhận `roomName` cho tiện test: tạo phòng theo tên (idempotent) rồi gửi id của nó.
 */
export async function sessionBody(db: Queryable, o: SessionBodyOptions): Promise<Record<string, unknown>> {
  if ((o.startTime === undefined) !== (o.endTime === undefined)) {
    throw new Error('sessionBody: phải truyền cả startTime và endTime, hoặc không truyền cái nào.');
  }
  if (o.roomId !== undefined && o.roomName !== undefined) {
    throw new Error('sessionBody: truyền roomId HOẶC roomName, không cả hai.');
  }
  const window =
    o.startTime !== undefined && o.endTime !== undefined
      ? { startTime: o.startTime, endTime: o.endTime }
      : concurrentLiveWindow();
  const s = stamp();
  const roomId = o.roomId ?? (await ensureRoom(db, o.roomName ?? `P ${s}`)).id;
  return {
    name: o.name ?? `Phiên ${s}`,
    classId: o.classId,
    roomId,
    examType: o.examType ?? 'TK',
    ...window,
    requiredFilenames: o.requiredFilenames ?? ['Cau1.docx'],
    ...(o.rubricId ? { rubricId: o.rubricId } : {}),
  };
}
```

Mọi chỗ gọi `sessionBody` đang truyền `semesterName` (xem Step 5) sẽ không biên dịch — đó là chủ ý.

- [ ] **Step 2: Cập nhật test của chính helper, và test schema ở plan C**

Trong `apps/api/test/seed-helper.e2e-spec.ts`:
- Ca `'seedClass dựng một lớp thật và trả nhãn'`: thay các khẳng định về `class.name` bằng
```ts
    const [row] = await dataSource.query(
      `SELECT course_name, name, teacher_id, semester_id, administrative_class_id, group_name FROM examcollect.class WHERE id = $1`,
      [klass.id],
    );
    expect(row.course_name).toBe(COURSE_NAME);
    expect(row.name).toBeNull(); // không còn ghi cột cũ
    expect(row.semester_id).not.toBeNull();
    expect(row.administrative_class_id).not.toBeNull();
    expect(row.group_name).toBe('Nhóm 2');
    expect(klass.label).toBe(`${klass.code} – Nhóm 2`);
```
- Ca mã duy nhất `'mã lớp tự sinh duy nhất…'` giữ nguyên (mã nay là mã lớp danh nghĩa thật).
- Ca `'sessionBody mặc định đủ để POST /exam-sessions trả 201'`: giữ, nó sẽ chạy trên API mới; thêm `expect(response.body.roomId).toBe(body.roomId)`.
- Ca `'sessionBody giữ nguyên phòng, học kỳ và tên file…'`: thay `roomName: 'P Cố Định'` + `semesterName` bằng
```ts
    const body = await sessionBody(dataSource, { classId: 'c1', roomName: 'P Cố Định', requiredFilenames: ['A.docx', { filename: 'B.zip', entries: ['x.txt'] }] });
    const [room] = await dataSource.query(`SELECT id FROM examcollect.room WHERE name = $1`, ['P Cố Định']);
    expect(body).toMatchObject({ classId: 'c1', roomId: room.id, examType: 'TK', requiredFilenames: ['A.docx', { filename: 'B.zip', entries: ['x.txt'] }] });
    expect(body).not.toHaveProperty('roomName');
    expect(body).not.toHaveProperty('semesterName');
```
- Thêm: `sessionBody` từ chối `roomId` và `roomName` cùng lúc; `ensureRoom` idempotent (hai lần cùng tên → cùng id, và khác hoa-thường → cùng id); `seedClass({ semesterId: null, administrativeClassId: null })` cho lớp cũ (cột NULL); `seedExamSession({ withoutRoom: true })` cho `room_id` NULL, và mặc định có `room_id`.

Trong `apps/api/test/master-data-schema.e2e-spec.ts` (plan C): helper `newSession` thêm tuỳ chọn `withoutRoom?: boolean` truyền xuống `seedExamSession`; hai lời gọi trong ca `'ràng buộc cũ theo TÊN vẫn bảo vệ dòng chưa có room_id…'` truyền `withoutRoom: true` (nếu không, chúng tự có phòng và ca đỏ vì sai lý do — đang chặn bằng `room_id` chứ không bằng tên). Ca kế `'…CHỈ áp cho dòng chưa có room_id…'` đã truyền `roomId` tường minh nên không đổi.

- [ ] **Step 3: DTO**

`apps/api/src/exam-session/dto/create-exam-session.dto.ts`: thay hai trường `roomName` và `semesterName` (cùng hai khối doc phía trên) bằng

```ts
  /**
   * Phòng thi — giảng viên CHỌN trong những phòng admin đã khai và đang hoạt động (spec §2.4). Trước đây là chuỗi gõ
   * tay nên "P.A101" và "P A101" là hai phòng với Postgres và chống trùng phòng chỉ còn là nỗ lực tốt nhất.
   *
   * `room_name` trên phiên là BẢN CHỤP tên phòng lúc tạo, server điền; không có ô nào cho giảng viên gõ.
   */
  @IsUUID()
  roomId!: string;
```

Học kỳ **không** có trường nào: suy từ lớp lúc tạo (spec §4). Xoá `semesterName` và doc của nó.

`apps/api/src/exam-session/dto/search-exam-sessions.dto.ts`: xoá trường `semesterName` (và doc), thêm

```ts
  /**
   * Học kỳ HIỆN TẠI của lớp (`class.semester_id`), lọc bằng KHOÁ — không bằng bản chụp `semester_name`. Từng lọc theo chuỗi
   * nên "HK1 2026-2027" và "Học kỳ 1 2026-2027" là hai mục lọc (spec §0). Vắng mặt là "tất cả học kỳ", không phải lỗi:
   * học kỳ ở đây là tham số lọc, không phải điều kiện để thao tác được (CLAUDE.md §1.2).
   */
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  /** Năm học (2026 nghĩa là 2026-2027): cả ba kỳ của năm đó. AND với `semesterId` nếu cả hai có mặt. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYear?: number;
```

`apps/api/src/exam-session/dto/exam-session-response.dto.ts`: trong `ExamSessionResponseDto` xoá `courseId!: string;` và thay khối `roomId`/`courseName`/`roomName` + doc bằng

```ts
  classId!: string;
  /** Nhãn gộp của lớp (`DHKTPM18A – Nhóm 1`), đọc từ view `class_label`. */
  classLabel!: string | null;
  /** Phòng thật (khoá ngoại). `roomName` dưới đây là BẢN CHỤP tên phòng lúc tạo. */
  roomId!: string | null;
  /** Môn và phòng dạng VĂN BẢN, chụp lúc tạo phiên. */
  courseName!: string;
  roomName!: string;
```

và (bỏ dòng `classId!: string;` cũ phía trên nếu thừa). Trong `ExamSessionListItemDto` thay `className!: string;` bằng

```ts
  /** Nhãn gộp của lớp. Từng là `className`; giá trị là nhãn, không phải `class.name`. */
  classLabel!: string;
  /** Học kỳ HIỆN TẠI của lớp — nguồn cho bộ lọc năm học → học kỳ. `null` chỉ với lớp cũ chưa backfill. */
  semesterId!: string | null;
  academicYear!: number | null;
  term!: number | null;
```

(giữ `semesterName` — bản chụp — cho bảng điểm.)

- [ ] **Step 4: `RoomService`, `SemesterService`, `ScheduleConflictService`**

Thêm vào `RoomService` (plan C) một phương thức công khai:

```ts
  /**
   * Phòng cho một phiên MỚI: phải tồn tại và đang hoạt động. `is_active = false` nghĩa là không chọn được cho phiên
   * mới; phiên cũ vẫn tham chiếu được, nên kiểm này chỉ ở đường TẠO (và đường ĐỔI phòng ở plan F), không ở khoá ngoại.
   */
  async requireActiveForNewSession(roomId: string): Promise<RoomEntity> {
    const room = await this.dataSource.getRepository(RoomEntity).findOne({ where: { id: roomId } });
    if (!room) {
      throw new BadRequestException('Không tìm thấy phòng đã chọn.');
    }
    if (!room.isActive) {
      throw new BadRequestException(`Phòng "${room.name}" đã ngừng hoạt động, hãy chọn phòng khác.`);
    }
    return room;
  }
```

Thêm vào `SemesterService`:

```ts
  /** Nhãn `HK1 2026-2027` của một học kỳ, hoặc null nếu không có. Dùng để CHỤP `semester_name` lúc tạo phiên. */
  async labelOf(semesterId: string): Promise<string | null> {
    const [row] = await this.dataSource.query(
      `SELECT academic_year_start AS year, term FROM examcollect.semester WHERE id = $1`,
      [semesterId],
    );
    return row ? semesterLabel(row.year, row.term) : null;
  }
```

Replace `apps/api/src/exam-session/schedule-conflict.service.ts` toàn bộ bằng:

```ts
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';

/**
 * Reports a booking that would collide, in words the lecturer can act on.
 *
 * This is ADVISORY. The authority on the rule is the EXCLUDE constraints on `exam_session` (room, class, teacher gap):
 * they are what holds when two lecturers submit at the same instant, and what covers write paths that do not go through
 * this service. What this adds is the only thing a constraint cannot — naming the room, the session already holding it,
 * and when — because otherwise the lecturer gets PostgresExceptionFilter's "This request conflicts with an existing
 * record" and no way to act on it.
 *
 * The queries below mirror those constraints exactly: same half-open range, same status predicate. They have to. A
 * pre-check stricter than the constraint refuses valid bookings; a looser one hands back the generic database 409 this
 * class exists to avoid.
 */

/** Formatted for the lecturer reading the error, not for the server's locale. The API has no timezone convention of its
 *  own and a VPS commonly runs on UTC, so an unqualified format would report an hour nobody in the room experienced. */
const CLASH_TIME = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const CLASH_DATE = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  day: '2-digit',
  month: '2-digit',
});

export function describeWindow(start: Date, end: Date): string {
  const startDay = CLASH_DATE.format(start);
  const endDay = CLASH_DATE.format(end);
  // A window that crosses midnight needs both dates, or "23:00–01:00 ngày 05/09" reads as a session that ran backwards.
  if (startDay !== endDay) {
    return `${CLASH_TIME.format(start)} ngày ${startDay} đến ${CLASH_TIME.format(end)} ngày ${endDay}`;
  }
  return `${CLASH_TIME.format(start)}–${CLASH_TIME.format(end)} ngày ${startDay}`;
}

interface ScheduleClash {
  sessionName: string;
  ownerName: string;
  startTime: Date;
  endTime: Date;
}

/**
 * Khoảng cách tối thiểu giữa hai phiên của CÙNG một giảng viên, tính từ `end_time` của phiên trước tới `start_time` của
 * phiên sau. Phải khớp con số 30 trong `examcollect.teacher_busy_range()` (migration `1789350000000-TeacherScheduleGap`).
 * Đổi một chỗ mà quên chỗ kia thì lớp kiểm này lệch khỏi ràng buộc.
 */
export const TEACHER_GAP_MINUTES = 30;

/** Một lịch đang được hỏi "có va chạm không". */
export interface ScheduleCheck {
  roomId: string;
  classId: string;
  teacherId: string;
  startTime: Date;
  endTime: Date;
  /**
   * Phiên cần LOẠI khỏi ba phép kiểm — dùng khi SỬA một phiên đã có. Ràng buộc EXCLUDE của DB tự bỏ qua chính dòng đang
   * UPDATE (một dòng không va chạm với chính nó), còn các truy vấn ở đây thì KHÔNG, nên không có tham số này thì sửa một
   * phiên sẽ báo nó va chạm với chính nơi nó đang ở. Chỉ loại ĐÚNG phiên này: phiên khác cùng phòng vẫn bị phát hiện.
   */
  excludeSessionId?: string;
}

/** Vị từ trạng thái của ba ràng buộc: collecting/completed/cancelled không còn giữ chỗ. */
const HOLDING = `s.status <> 'collecting' AND s.status <> 'completed' AND s.status <> 'cancelled'`;

@Injectable()
export class ScheduleConflictService {
  constructor(
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
  ) {}

  /**
   * Throws if this room or this class is already spoken for, or the teacher is too close to another session.
   *
   * The room clash is reported in preference to the class clash: changing room is the cheaper fix, and a lecturer told
   * about both at once has to work out which to act on.
   */
  async assertNone(check: ScheduleCheck): Promise<void> {
    const exclude = check.excludeSessionId ?? null;

    const roomClash = await this.firstClash(
      `SELECT s.name AS "sessionName", r.name::text AS "ownerName",
              s.start_time AS "startTime", s.end_time AS "endTime"
         FROM examcollect.exam_session s
         JOIN examcollect.room r ON r.id = s.room_id
        WHERE s.room_id = $1 AND ${HOLDING}
          AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange($2, $3, '[)')
          AND ($4::uuid IS NULL OR s.id <> $4)
        ORDER BY s.start_time LIMIT 1`,
      [check.roomId, check.startTime, check.endTime, exclude],
    );
    if (roomClash) {
      throw new ConflictException(
        `Phòng ${roomClash.ownerName} đã có phiên thi "${roomClash.sessionName}" lúc ` +
          `${describeWindow(roomClash.startTime, roomClash.endTime)}. ` +
          `Hãy chọn phòng khác hoặc đổi khung giờ.`,
      );
    }

    const classClash = await this.firstClash(
      `SELECT s.name AS "sessionName", cl.label AS "ownerName",
              s.start_time AS "startTime", s.end_time AS "endTime"
         FROM examcollect.exam_session s
         JOIN examcollect.class_label cl ON cl.class_id = s.class_id
        WHERE s.class_id = $1 AND ${HOLDING}
          AND tstzrange(s.start_time, s.end_time, '[)') && tstzrange($2, $3, '[)')
          AND ($4::uuid IS NULL OR s.id <> $4)
        ORDER BY s.start_time LIMIT 1`,
      [check.classId, check.startTime, check.endTime, exclude],
    );
    if (classClash) {
      throw new ConflictException(
        `Lớp ${classClash.ownerName} đã có phiên thi "${classClash.sessionName}" lúc ` +
          `${describeWindow(classClash.startTime, classClash.endTime)}. ` +
          `Một lớp không thể thi hai ca cùng lúc.`,
      );
    }

    // Báo SAU hai cái trên, cố ý: trùng phòng hay trùng lớp là va chạm cứng, còn đây là luật đi lại. Nếu một lịch phạm cả
    // hai thì cái cứng hơn là cái giảng viên cần nghe trước.
    //
    // Gọi hàm SQL của chính migration thay vì chép lại phép cộng: một bản sao là một chỗ để lệch, và lệch ở đây thì triệu
    // chứng là 409 chung chung từ `PostgresExceptionFilter` — đúng thứ cả lớp này sinh ra để tránh. `collecting` cũng giải
    // phóng giảng viên (`finalize` là họ chủ động tuyên bố ca thi xong), nên vị từ trạng thái giống hệt hai phép trên.
    const gapClash = await this.firstClash(
      `SELECT s.name AS "sessionName", s.name AS "ownerName",
              s.start_time AS "startTime", s.end_time AS "endTime"
         FROM examcollect.exam_session s
        WHERE s.teacher_id = $1 AND ${HOLDING}
          AND examcollect.teacher_busy_range(s.start_time, s.end_time)
           && examcollect.teacher_busy_range($2, $3)
          AND ($4::uuid IS NULL OR s.id <> $4)
        ORDER BY s.start_time LIMIT 1`,
      [check.teacherId, check.startTime, check.endTime, exclude],
    );
    if (gapClash) {
      throw new ConflictException(
        `Bạn đã có phiên thi "${gapClash.sessionName}" lúc ` +
          `${describeWindow(gapClash.startTime, gapClash.endTime)}. ` +
          `Hai phiên của cùng một giảng viên phải cách nhau ít nhất ${TEACHER_GAP_MINUTES} phút.`,
      );
    }
  }

  private async firstClash(sql: string, params: unknown[]): Promise<ScheduleClash | undefined> {
    const [raw] = await this.sessions.query(sql, params);
    if (!raw) {
      return undefined;
    }
    // Truy vấn thô trả cột theo cách driver trả chúng.
    return { ...raw, startTime: new Date(raw.startTime), endTime: new Date(raw.endTime) };
  }
}
```

- [ ] **Step 5: `ExamSessionService`**

Trong `apps/api/src/exam-session/exam-session.service.ts`:

1. Import và constructor: thêm `import { RoomService } from '../course/room.service';`, `import { SemesterService } from '../course/semester.service';`, `import { ClassLabelService } from '../course/class-label.service';` và ba tham số (sau `scheduleConflicts`):

```ts
    private readonly rooms: RoomService,
    private readonly semesters: SemesterService,
    private readonly classLabels: ClassLabelService,
```

(`ExamSessionModule` đã `imports: [CourseModule]`; `CourseModule` xuất ba service này từ plan C và D1.)

2. Trong `create`, ngay sau `const klass = await this.classes.findTaughtBy(...)` thêm:

```ts
    // Học kỳ của phiên SUY RA từ lớp và được CHỤP lúc này (spec §2.4): không có ô nào cho giảng viên gõ. Lớp chưa có
    // học kỳ (dữ liệu cũ chưa backfill) thì chưa có gì để chụp — nói rõ cách khắc phục thay vì ghi một chuỗi rỗng.
    if (!klass.semesterId) {
      throw new ConflictException(
        'Lớp này chưa thuộc học kỳ nào nên chưa tạo được phiên thi. Hãy nhờ quản trị viên gán học kỳ cho lớp.',
      );
    }
```

3. Sau khối kiểm rubric (trước `assertNone`) thêm và đổi lời gọi:

```ts
    // Phòng do giảng viên CHỌN: phải có thật và đang hoạt động (400 nêu tên). Rồi chụp tên phòng và nhãn học kỳ.
    const room = await this.rooms.requireActiveForNewSession(dto.roomId);
    const semesterName = (await this.semesters.labelOf(klass.semesterId))!;
    const classLabel = (await this.classLabels.labelsFor([klass.id])).get(klass.id) ?? null;

    await this.scheduleConflicts.assertNone({
      roomId: room.id,
      classId: klass.id,
      teacherId,
      startTime: new Date(dto.startTime),
      endTime: new Date(dto.endTime),
    });
```

(thay lời gọi `assertNone(dto.roomName, klass.id, teacherId, …)` cũ).

4. Trong `manager.create(ExamSessionEntity, {…})` thay `roomName: dto.roomName`, `semesterName: dto.semesterName` bằng

```ts
              roomId: room.id,
              // Chụp MỘT LẦN, tại đây (CLAUDE.md §7.1.5): đổi tên phòng hay sửa ngày học kỳ về sau không đổi phiên này.
              // `semester_name` mang `update: false` nên một `save()` về sau không ghi đè được.
              roomName: room.name,
              semesterName,
```

và cập nhật chú thích bên trên ("Phòng và học kỳ thì đến thẳng từ biểu mẫu…") thành "Phòng chọn từ danh sách, học kỳ suy ra từ lớp — cả hai được CHỤP ở dưới".

5. Truyền `classLabel` vào `toResponseDto` ở cả ba nơi gọi: trong `create` (`this.toResponseDto(session, savedDeliverables, rubric?.version ?? null, entriesByDeliverable, classLabel)`), trong `setRubric` và `findByIdForOwner` (lấy nhãn bằng `(await this.classLabels.labelsFor([session.classId])).get(session.classId) ?? null`). Đổi chữ ký `toResponseDto(..., entriesByDeliverable = new Map(), classLabel: string | null = null)` và trong thân thêm `dto.roomId = session.roomId; dto.classLabel = classLabel;`.

6. Viết lại `findAllForOwner` — thay phần dựng truy vấn đến hết hàm bằng:

```ts
  async findAllForOwner(
    teacherId: string,
    query: SearchExamSessionsDto,
  ): Promise<{ items: ExamSessionListItemDto[]; total: number }> {
    const qb = this.sessions
      .createQueryBuilder('s')
      .leftJoinAndSelect('s.class', 'class')
      .leftJoinAndSelect('class.semester', 'semester')
      .where('s.teacherId = :teacherId', { teacherId });

    if (query.search) {
      qb.andWhere('(s.name ILIKE :search OR s.code ILIKE :search)', { search: `%${query.search}%` });
    }
    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query.examType) {
      qb.andWhere('s.examType = :examType', { examType: query.examType });
    }
    // AND vào owner-scope, KHÔNG thay thế nó: bộ lọc kỳ chỉ hẹp tầm nhìn của giảng viên trong phạm vi họ vốn đã được phép
    // thấy. Một `orWhere` ở đây sẽ kéo phiên của giảng viên khác cùng kỳ vào, và kết quả vẫn trông "có dữ liệu" nên không
    // ai nghi ngờ — e2e ghim đúng ca đó.
    //
    // Lọc theo HỌC KỲ HIỆN TẠI CỦA LỚP (khoá), không theo bản chụp `semester_name`: "HK1 2026-2027" và "Học kỳ 1
    // 2026-2027" từng là hai mục lọc. Bản chụp vẫn là thứ bảng điểm in ra, nhưng không còn là thứ ai đó phải gõ khớp.
    if (query.semesterId) {
      qb.andWhere('class.semesterId = :semesterId', { semesterId: query.semesterId });
    }
    if (query.academicYear !== undefined) {
      qb.andWhere('semester.academicYearStart = :academicYear', { academicYear: query.academicYear });
    }
    // Lớp: khoá ngoại, nên so bằng id chứ không so chuỗi. Cùng lý do AND như bộ lọc kỳ ngay trên.
    if (query.classId) {
      qb.andWhere('s.classId = :classId', { classId: query.classId });
    }

    // Chế độ LỊCH: một khoảng ngày, không phân trang. Xem doc của `from`/`to` trong SearchExamSessionsDto.
    const range = parseRange(query);
    if (range) {
      qb.andWhere('s.startTime >= :from AND s.startTime < :to', range);
      // Tăng dần cho lịch: mắt đọc lưới từ sớm tới muộn trong một ô ngày. Danh sách thì ngược lại.
      qb.orderBy('s.startTime', 'ASC').take(RANGE_HARD_CAP);
    } else {
      qb.orderBy('s.startTime', 'DESC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize);
    }

    const [rows, total] = await qb.getManyAndCount();

    // Nhãn lớp từ view, MỘT truy vấn cho cả trang — không join thêm vào truy vấn phân trang ở trên (join một-nhiều
    // giữa các quan hệ làm `skip/take` của TypeORM phải bọc truy vấn con).
    const labels = await this.classLabels.labelsFor([...new Set(rows.map((row) => row.classId))]);

    const items = rows.map((session) => {
      const item = new ExamSessionListItemDto();
      item.id = session.id;
      item.name = session.name;
      item.code = session.code;
      item.courseName = session.courseName;
      item.classLabel = labels.get(session.classId) ?? '';
      item.semesterId = session.class.semesterId;
      item.academicYear = session.class.semester?.academicYearStart ?? null;
      item.term = session.class.semester?.term ?? null;
      item.roomName = session.roomName;
      item.semesterName = session.semesterName;
      item.examType = session.examType;
      item.startTime = session.startTime;
      item.endTime = session.endTime;
      item.status = session.status;
      return item;
    });

    return { items, total };
  }
```

(Danh sách `semesterNames` và truy vấn `SELECT DISTINCT semester_name` bị bỏ hẳn: lựa chọn của bộ lọc lấy từ `GET /semesters`.)

- [ ] **Step 6: Danh sách bài thu (`submission-overview`)**

`apps/api/src/submission/submission-overview.service.ts`:
- Trong `OverviewRawRow`: đổi `class_name: string | null;` thành `class_label: string | null; semester_id: string | null; academic_year: number | null; term: number | null;`.
- Trong câu SQL: thay `s.class_id,  cl.name AS class_name,` bằng
```sql
             s.class_id,  lbl.label AS class_label,
             k.semester_id, sem.academic_year_start AS academic_year, sem.term,
```
và thay dòng `JOIN      ${schema}.class  cl ON cl.id = s.class_id` bằng
```sql
      JOIN      ${schema}.class  k   ON k.id = s.class_id
      JOIN      ${schema}.class_label lbl ON lbl.class_id = k.id
      LEFT JOIN ${schema}.semester sem ON sem.id = k.semester_id
```
- Trong phần ánh xạ hàng: thay `className: row.class_name,` bằng
```ts
      classLabel: row.class_label,
      semesterId: row.semester_id,
      academicYear: row.academic_year,
      term: row.term,
```
`apps/api/src/submission/submission-overview.types.ts`: trong `SessionOverviewItem` đổi `className: string | null;` thành `classLabel: string | null;` và thêm `semesterId: string | null; academicYear: number | null; term: number | null;` (kèm doc: lấy từ HỌC KỲ HIỆN TẠI của lớp, nguồn cho bộ lọc phía trình duyệt); cập nhật doc của `semesterName`: "bản chụp lúc tạo phiên, giữ cho bảng điểm; bộ lọc dùng `semesterId`/`academicYear`/`term`".

- [ ] **Step 7: Chưa chạy được** — còn các suite phải đổi theo (Task 3).

---

### Task 3: Đưa mọi suite theo hợp đồng mới, chạy cả bộ, commit

**Files:**
- Modify: `apps/api/test/exam-session.e2e-spec.ts`, `exam-schedule-conflict.e2e-spec.ts`, `submission-overview*.e2e-spec.ts` và mọi suite mà `tsc` báo `semesterName`
- Modify: `apps/api/src/eval/rehearsal/cli.ts`
- Modify: `apps/api/src/common/e2e-seed-hygiene.spec.ts`
- Modify: `packages/shared/src/api/schema.d.ts`

- [ ] **Step 1: `exam-schedule-conflict.e2e-spec.ts`**

Công thức (suite này vốn nói về PHÒNG nên đổi nhiều nhất, nhưng cơ học):
1. Khai báo `roomId`, `otherRoomId` cạnh `roomName`, `otherRoomName`; trong `beforeAll` thay hai dòng đặt tên phòng bằng
```ts
    const room = await ensureRoom(dataSource, `Phòng trùng lịch ${Date.now()}`);
    roomName = room.name;
    roomId = room.id;
    const otherRoom = await ensureRoom(dataSource, `Phòng khác ${Date.now()}`);
    otherRoomName = otherRoom.name;
    otherRoomId = otherRoom.id;
```
2. `createSession`: bỏ `semesterName: 'HK kiểm thử'` khỏi thân mặc định.
3. Mọi `roomName,` trong thân request thành `roomId,`; mọi `roomName: otherRoomName,` thành `roomId: otherRoomId,`. Các khẳng định `toContain(roomName)` **giữ nguyên**: câu lỗi nêu tên phòng (đọc từ bảng `room`).
4. Ca chèn thẳng vào DB (`'rejects an overlapping row written straight to the database'`): thêm `roomId, roomName` vào lời gọi `seedExamSession` (plan A đã chuyển nó sang helper). Khẳng định `{ code: '23P01' }` giữ nguyên — giờ do `ex_exam_session_room_overlap` theo `room_id`.
5. Import: `import { ensureRoom } from './helpers/seed';` (cạnh `seedClass`, `seedExamSession`).
6. Các lớp (`classId`, `otherClassId`, `peerClassId`) tạo bằng `seedClass` (plan A) — không đổi, nay có học kỳ mặc định.
7. Hai ca `excludeSessionId` đã thêm ở Task 1 Step 3.

- [ ] **Step 2: `exam-session.e2e-spec.ts`**

1. Fixture: thay `roomName = \`Exam Session Test Room ${Date.now()}\`` bằng
```ts
    const room = await ensureRoom(dataSource, `Exam Session Test Room ${Date.now()}`);
    roomName = room.name;
    roomId = room.id;
```
(khai `let roomId: string;`). Dựng ba lớp bằng `seedClass` với học kỳ tường minh: `classId` và `foreignClassId` ở `await ensureTestSemester(dataSource, 1)`, `otherSemesterClassId` ở `await ensureTestSemester(dataSource, 2)`. Tính `FIRST_SEMESTER_TEXT` / `OTHER_SEMESTER_TEXT` bằng `semesterLabel` từ hai học kỳ đó (đọc `academic_year_start`, `term`). Bỏ hai hằng `FIRST_SEMESTER`, `OTHER_SEMESTER` dựa trên `Date.now()`.
2. Mỗi thân `.send({…})` của `POST /exam-sessions` (21 chỗ): xoá cặp dòng `roomName,` + `semesterName: …,` và thêm một dòng `roomId,`. Ca "creates an exam session with a unique code" khẳng định thêm `expect(response.body.roomId).toBe(roomId)`, `roomName`, và `semesterName` bằng `FIRST_SEMESTER_TEXT`.
3. Ca `'lists only the classes this lecturer teaches, with their roster size'` (đã sửa ở plan D2) giữ nguyên.
4. **Thay toàn bộ hai khối** `describe('GET /exam-sessions — semester filter')` và `describe('GET /exam-sessions — class filter')` bằng:

```ts
  /**
   * Bộ lọc theo HỌC KỲ — bằng KHOÁ (spec §7.2). Lọc theo học kỳ HIỆN TẠI của lớp (`class.semester_id`), không theo bản chụp
   * `semester_name`: "HK1 2026-2027" và "Học kỳ 1 2026-2027" từng là hai mục lọc, và danh sách lựa chọn dựng từ chuỗi gõ tay.
   */
  describe('GET /exam-sessions — semester filter', () => {
    const stamp = Date.now().toString(36);
    let firstSemesterId: string;
    let otherSemesterId: string;

    beforeAll(async () => {
      firstSemesterId = await ensureTestSemester(dataSource, 1);
      otherSemesterId = await ensureTestSemester(dataSource, 2);
    });

    async function createIn(
      classIdForSession: string,
      nameSuffix: string,
      token: string,
      examType: 'TK' | 'GK' | 'CK' = 'TK',
    ): Promise<string> {
      const { startTime, endTime } = futureWindow();
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Sem${stamp} ${nameSuffix}`,
          classId: classIdForSession,
          roomId,
          examType,
          startTime,
          endTime,
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      return response.body.id as string;
    }

    it('narrows to one semester — the same teacher own sessions in the other semester drop out', async () => {
      const inFirst = await createIn(classId, 'Kỳ một', ownerToken);
      const inSecond = await createIn(otherSemesterClassId, 'Kỳ hai', ownerToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Kỳ`, semesterId: otherSemesterId })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(inSecond);
      expect(ids).not.toContain(inFirst);
      // Cả hai phiên đều khớp `search`, nên total = 1 chứng minh chính bộ lọc kỳ đã cắt — không phải search làm hộ nó.
      expect(response.body.total).toBe(1);
    });

    it('lọc theo NĂM HỌC lấy cả ba kỳ của năm đó, và dòng mang semesterId/academicYear/term/classLabel', async () => {
      const inFirst = await createIn(classId, 'Năm học một', ownerToken);
      const inSecond = await createIn(otherSemesterClassId, 'Năm học hai', ownerToken);
      const [{ academic_year_start: year }] = await dataSource.query(
        `SELECT academic_year_start FROM examcollect.semester WHERE id = $1`,
        [firstSemesterId],
      );

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Năm học`, academicYear: year })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([inFirst, inSecond]));
      const row = response.body.items.find((item: { id: string }) => item.id === inFirst);
      expect(row).toMatchObject({ semesterId: firstSemesterId, academicYear: year, term: 1 });
      expect(typeof row.classLabel).toBe('string');
      expect(row).not.toHaveProperty('className');
      expect(response.body).not.toHaveProperty('semesterNames');
    });

    it('ANDs onto the owner scope — another teacher session in the SAME semester stays invisible', async () => {
      const mine = await createIn(classId, 'Của tôi', ownerToken);
      const theirs = await createIn(foreignClassId, 'Của người khác', otherToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Của`, semesterId: firstSemesterId })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(mine);
      // `theirs` nằm ĐÚNG học kỳ đang lọc và vẫn phải vắng mặt: một `orWhere` đặt nhầm ở đây biến một tiện ích thành lỗ
      // hổng phân quyền, và kết quả vẫn trông "có dữ liệu" nên không ai nghi ngờ (Review Focus 6).
      expect(ids).not.toContain(theirs);
      expect(response.body.total).toBe(1);
    });

    it('một học kỳ không khớp phiên nào trả về danh sách rỗng, không phải 404', async () => {
      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ semesterId: '00000000-0000-4000-8000-0000000000ff' })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(0);
      expect(response.body.total).toBe(0);
    });

    it('semesterId không phải uuid và academicYear ngoài 2000–2999 bị từ chối 400, không bị lặng lẽ bỏ qua', async () => {
      await request(app.getHttpServer()).get('/exam-sessions').query({ semesterId: 'khong-phai-uuid' }).set('Authorization', `Bearer ${ownerToken}`).expect(400);
      await request(app.getHttpServer()).get('/exam-sessions').query({ academicYear: 1999 }).set('Authorization', `Bearer ${ownerToken}`).expect(400);
    });

    it('chains onto the other three filters instead of widening them', async () => {
      // Mỗi phiên "sai" lệch khỏi phiên đúng ĐÚNG MỘT chiều; một `andWhere` viết nhầm thành `orWhere` sẽ để chính phiên lệch
      // theo chiều đó lọt vào kết quả.
      const wanted = await createIn(otherSemesterClassId, 'Gộp đúng', ownerToken, 'CK');
      const wrongType = await createIn(otherSemesterClassId, 'Gộp sai loại', ownerToken, 'GK');
      const wrongSemester = await createIn(classId, 'Gộp sai kỳ', ownerToken, 'CK');

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Gộp`, examType: 'CK', status: 'active', semesterId: otherSemesterId })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toEqual([wanted]);
      expect(ids).not.toContain(wrongType);
      expect(ids).not.toContain(wrongSemester);
      expect(response.body.total).toBe(1);
    });

    it('treats an absent semester as all semesters, not as an error', async () => {
      const inFirst = await createIn(classId, 'Không lọc một', ownerToken);
      const inSecond = await createIn(otherSemesterClassId, 'Không lọc hai', ownerToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Sem${stamp} Không lọc` })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toEqual(expect.arrayContaining([inFirst, inSecond]));
    });
  });

  /**
   * Bộ lọc theo LỚP: khác ba bộ lọc trên ở một điểm quyết định — lớp là KHOÁ NGOẠI, không phải chuỗi giảng viên gõ — nên nó
   * phải chịu đúng hai phép thử mà bộ lọc kỳ chịu: nó có thật sự cắt không, và nó có AND vào phạm vi chủ sở hữu không.
   */
  describe('GET /exam-sessions — class filter', () => {
    const stamp = Date.now().toString(36);

    async function createForClass(classIdForSession: string, nameSuffix: string, token: string): Promise<string> {
      const { startTime, endTime } = futureWindow();
      const response = await request(app.getHttpServer())
        .post('/exam-sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Cls${stamp} ${nameSuffix}`,
          classId: classIdForSession,
          roomId,
          examType: 'TK',
          startTime,
          endTime,
          requiredFilenames: ['Cau1.docx'],
        });
      expect(response.status).toBe(201);
      return response.body.id as string;
    }

    it('thu hẹp về đúng một lớp — phiên lớp khác của CHÍNH giảng viên đó rơi ra', async () => {
      const inA = await createForClass(classId, 'Lớp A', ownerToken);
      const inB = await createForClass(otherSemesterClassId, 'Lớp B', ownerToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ search: `Cls${stamp} Lớp`, classId })
        .set('Authorization', `Bearer ${ownerToken}`);

      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).toContain(inA);
      expect(ids).not.toContain(inB);
      expect(response.body.total).toBe(1);
    });

    it('AND vào phạm vi chủ sở hữu — lọc theo lớp của người khác trả về rỗng, không phải phiên của họ', async () => {
      const theirs = await createForClass(foreignClassId, 'Của người khác', otherToken);

      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ classId: foreignClassId })
        .set('Authorization', `Bearer ${ownerToken}`);

      // Ca quan trọng nhất của bộ này: `classId` đến thẳng từ URL, nên một `orWhere` đặt nhầm biến bộ lọc tiện lợi thành
      // đường đọc trộm phiên của giảng viên khác.
      expect(response.status).toBe(200);
      const ids = response.body.items.map((item: { id: string }) => item.id);
      expect(ids).not.toContain(theirs);
      expect(response.body.total).toBe(0);
    });

    it('classId không phải uuid bị từ chối 400, không bị lặng lẽ bỏ qua', async () => {
      const response = await request(app.getHttpServer())
        .get('/exam-sessions')
        .query({ classId: 'khong-phai-uuid' })
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(response.status).toBe(400);
    });
  });
```

(Hai ca `semesterNames…` bị xoá cùng khối cũ: danh sách lựa chọn học kỳ giờ đến từ `GET /semesters`, được kiểm ở plan C.) Thêm import `ensureTestSemester` từ `./helpers/master-data`, `ensureRoom` từ `./helpers/seed`, `semesterLabel` từ `../src/common/semester-label`.

- [ ] **Step 3: Các suite còn lại — để `tsc` dẫn đường**

Chạy `pnpm exec tsc --noEmit` từ `apps/api`. Các lỗi còn lại đều thuộc hai loại:
1. `semesterName` không có trong `SessionBodyOptions`: xoá dòng đó. **Hai ngoại lệ có khẳng định về học kỳ:**
   - `submission-overview-attendance.e2e-spec.ts` (dòng ~61 và ~228): lớp của phiên được seed với `semesterId` từ `ensureTestSemester`; thay khẳng định `expect(item.semesterName).toBe(\`Attend Semester ${stamp}\`)` bằng `expect(item.semesterName).toBe(semesterLabel(year, term))` (đọc `year`, `term` của học kỳ đó) và thêm `expect(item).toMatchObject({ semesterId, academicYear: year, term })`.
   - Mọi suite khác báo `semesterName` chỉ để đặt một giá trị tuỳ ý (`submission-overview`, `-makeup-search`): xoá dòng.
2. `className` còn được đọc từ `GET /exam-sessions` hoặc `GET /submissions/overview`: đổi sang `classLabel`.

Thêm vào `submission-overview.e2e-spec.ts` một ca nhỏ khẳng định `item.classLabel` bằng nhãn của lớp đã seed và có ba trường học kỳ.

- [ ] **Step 4: CLI diễn tập**

`apps/api/src/eval/rehearsal/cli.ts`: thêm trước `runSession`

```ts
/** Phòng riêng cho diễn tập: admin tạo và chỉ BẬT khi diễn tập — không dùng lại một phòng đã ngừng (spec §11). */
const REHEARSAL_ROOM_NAME = 'Phòng diễn tập';

async function rehearsalRoomId(): Promise<string> {
  if (process.env.REHEARSAL_ROOM_ID) return process.env.REHEARSAL_ROOM_ID;
  const rooms = itemsOf<{ id: string; name: string }>(await api('GET', '/rooms?active=true'));
  const room = rooms.find((r) => r.name === REHEARSAL_ROOM_NAME);
  if (!room) {
    throw new Error(
      `Chưa có phòng "${REHEARSAL_ROOM_NAME}" đang hoạt động. Nhờ quản trị viên tạo nó ở trang Phòng thi và bật hoạt động ` +
        'trước lượt diễn tập (tắt lại sau đó), hoặc đặt REHEARSAL_ROOM_ID.',
    );
  }
  return room.id;
}
```

Trong `runSession`, thay thân request tạo phiên (`classId, roomName: 'TEST-KHONG-PHONG', semesterName: 'TEST dien tap', examType: 'TK',`) bằng

```ts
    classId, roomId: await rehearsalRoomId(), examType: 'TK',
```

và ghi chú ngay trong tài liệu đầu file: lớp (`REHEARSAL_CLASS_ID`) phải do admin tạo và giao cho tài khoản diễn tập, thuộc một học kỳ; phiên lấy nhãn học kỳ từ lớp đó. Không còn chuỗi `'TEST dien tap'` làm học kỳ: tên phiên vẫn bắt đầu bằng `TEST dien tap` để `isRehearsalSession` nhận ra.

- [ ] **Step 5: Cập nhật chú thích guard**

`apps/api/src/common/e2e-seed-hygiene.spec.ts`: đổi đoạn doc nhắc ba file "kiểm chính tính năng phòng/học kỳ gõ tay, sẽ bị plan D viết lại" thành: "ba file kiểm hành vi tạo phiên/chống trùng lịch/bản chụp — chúng dựng thân request bằng tay có chủ ý để kiểm cả đầu vào sai (thiếu `roomId`, `roomId` rác…), nên ở lại danh sách vĩnh viễn". Danh sách và giá trị không đổi (`exam-session-semester-name` đã bị thay bởi `exam-session-snapshots`: **thay** tên đó trong `SESSION_BODY_ALLOWLIST` và `PERMANENT_SESSION_BODY_FILES` bằng `'exam-session-snapshots.e2e-spec.ts'`, **nếu** suite mới có thân `.send({` literal — nó có, vì hàm `create` dựng thân bằng tay; còn không thì xoá mục khỏi cả hai danh sách).

- [ ] **Step 6: Chạy tất cả, so với baseline**

```powershell
cd apps/api
pnpm exec tsc --noEmit
pnpm test 2>&1 | Out-File C:/tmp/unit-after-d3.txt
Select-String C:/tmp/unit-after-d3.txt -Pattern '^Tests:|^Test Suites:'
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest' } | Select-Object ProcessId, CommandLine
npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e-after-d3.json
node scripts/e2e-summary.cjs C:/tmp/e2e-after-d3.json | Out-File -Encoding utf8 C:/tmp/after-d3.tsv
$base = Get-Content ../../docs/superpowers/plans/md-restore-baseline.tsv | Where-Object { $_ -notmatch '^#' -and $_ -notmatch '^TOTAL' }
$after = Get-Content C:/tmp/after-d3.tsv | Where-Object { $_ -notmatch '^TOTAL' }
Compare-Object $base $after
```

Expected: `tsc` sạch; không `failed > 0`. `Compare-Object` chỉ liệt kê: suite **mới** của plan A–D3 (`=>`); suite D3 đổi số test có chủ ý (`exam-session` — bớt hai ca `semesterNames`, thêm ca mới; `exam-schedule-conflict` +2; `exam-session-semester-name` biến mất `<=`, `exam-session-snapshots` xuất hiện `=>`; `submission-overview` +1) và suite cũ khác phải **giống hệt** baseline (Review Focus 7). Một suite cũ tự nhiên đổi số test hay đỏ nghĩa là helper mới làm lệch tình huống của nó: so với bản trước bằng `git diff` rồi sửa test (không nới helper).

- [ ] **Step 7: Sinh lại client OpenAPI**

Làm đúng Task 3 của plan B. Diff phải đổi `POST /exam-sessions` (`roomId`), `GET /exam-sessions` (tham số + phản hồi), và thêm trường vào phản hồi chi tiết. Hunk không liên quan ⇒ tách commit riêng.

- [ ] **Step 8: Commit (một khối)**

```bash
git add apps/api packages/shared/src/api/schema.d.ts
git commit -m "feat(master-data): phiên thi chọn phòng, học kỳ suy ra từ lớp, bản chụp do server điền; chống trùng theo khoá, excludeSessionId, bộ lọc năm học/học kỳ theo khoá"
```

---

## Tự kiểm lại plan so với spec

- §2.4 (`room_id`, bản chụp `room_name`/`semester_name` server điền, `update:false`, chống trùng phòng chuyển về khoá — ràng buộc ở DB từ plan C, pre-check ở Task 2 Step 4; `is_active` kiểm ở service): Task 1–3. §2.5: nhãn lớp ở `exam-session.service` (danh sách, chi tiết), `schedule-conflict.service`, `submission-overview.service` + types — **hoàn tất mười một file** cùng `class.service`, `roster.service` (D1), `attendance`, `grading`, `submission` (D2). §4: `GET /exam-sessions` (`semesterId`/`academicYear` thay `semesterName`, bỏ `semesterNames`, dòng thêm `semesterId/academicYear/term/classLabel`), `POST /exam-sessions` (`roomId`, bỏ `semesterName`), `schedule-conflict` nhận id + tên để báo lỗi đọc được.
- §11: T-ROOM-2, T-ROOM-3, T-MD-9, T-FLT-3 (Task 1); T-SES-2 phần `excludeSessionId` (Task 1 Step 3; phần "sửa phiên" thuộc plan F); T-GR-1 (toàn bộ e2e chấm điểm xanh sau khi đổi helper seed: Task 3 Step 6). §11 "nghiệm thu bằng chấm thật": CLI diễn tập (Task 3 Step 4), kèm cảnh báo rằng lớp diễn tập phải do admin tạo.
- §13 mục 13 (`eval/rehearsal/cli.ts` và `test/helpers` cần mã danh nghĩa có trong Danh mục khi dựng lớp): helper `seedClass` tạo/dùng lớp danh nghĩa (Task 2 Step 1); CLI nhận `REHEARSAL_CLASS_ID` đã tạo sẵn (Task 3 Step 4).
- Hệ quả phải nói ra: (1) từ plan này `GET /exam-sessions` không còn `semesterNames`, nên trang giảng viên **phải** đổi cùng đợt (plan G) — phản hồi đổi hợp đồng; (2) lớp chưa có học kỳ không tạo được phiên (409) — đúng, vì backfill (plan H) gán học kỳ cho mọi lớp trước khi triển khai; (3) `roomName` của phiên cũ trước backfill vẫn là chuỗi gõ tay cho tới khi plan H gán `room_id`.
- Placeholder scan: Step 3 của Task 3 giao cho `tsc` dẫn đường cho các suite "báo `semesterName`" thay vì liệt kê từng dòng, vì danh sách đầy đủ phụ thuộc cách mỗi suite gọi helper (đã đo: chỉ hai suite có khẳng định về học kỳ ngoài hai suite viết lại, và đó là hai ngoại lệ được nêu tên). Mọi thay đổi có hình dạng khác nhau đều có mã cụ thể.
- Kiểu nhất quán: `ScheduleCheck` (khai ở `schedule-conflict.service.ts`) khớp lời gọi trong `ExamSessionService.create` và hai ca `excludeSessionId`; plan F dùng lại đúng `assertNone(check)` với `excludeSessionId`. `SeededClass.semesterId/administrativeClassId` và `seedClass({ semesterId: null })` khớp ca "lớp không có học kỳ" ở Task 1. `RoomService.requireActiveForNewSession` được plan F dùng lại khi đổi phòng.
