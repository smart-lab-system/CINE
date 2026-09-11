# Giai đoạn "Đang thu bài" + hành động "Thu lại" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cho `exam_session` một giai đoạn `collecting` thật giữa `active` và `completed`, để giảng viên đứng tại phòng thi có hai thao tác — "Thu lại" (yêu cầu agent của những em thiếu bài nộp lại) và "Xác nhận kết thúc" (chốt phiên) — thay vì phiên tự đóng lúc chuông reo.

**Architecture:** Một giá trị enum mới cộng hai cột dấu vết (`completed_at`, `completed_by`), rồi thay mọi so sánh `status === 'completed'` rải rác bằng hai predicate dùng chung. Scheduler đổi đích từ `completed` sang `collecting` và mọc thêm một lượt quét thứ hai để phiên không treo. "Thu lại" là một sự kiện socket mới nhắm đúng từng sinh viên, dùng ack có timeout nên con số báo về là "agent đã nhận" chứ không phải "server đã gửi".

**Tech Stack:** NestJS 11, TypeORM 0.3, PostgreSQL 16.15, Socket.IO 4, Next.js App Router, TanStack Query, Jest (e2e), Vitest (web).

**Spec:** `docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md` (rev 3, đã duyệt 2026-09-11)

## Global Constraints

- **Bảng test §10 của spec là tối thiểu bắt buộc**, gồm cả hai ca đua (§4.3) và ca MSSV lệch hoa/thường (§6.2). Không task nào được coi là xong khi ca của nó chưa xanh.
- **Migration không được bọc `BEGIN/COMMIT` và không được dùng giá trị `'collecting'` bên trong chính nó** — spec §4. `data-source.ts` đặt `migrationsTransactionMode: 'none'`, nên bọc transaction ở đây rồi dùng giá trị mới sẽ ném `unsafe use of new value of enum type` lúc deploy.
- **e2e chạy `pnpm test:e2e`** từ `apps/api`. Nếu lệnh đó chạy song song và đổ hàng loạt `Exceeded timeout of 5000 ms for a hook`, nhánh `fix/e2e-test-config` chưa được merge — dùng `npx jest --config ./test/jest-e2e.json --runInBand` thay thế. Cần Postgres + MinIO chạy và bucket `examcollect-submissions` đã tạo.
- **Thêm route API mới thì phải regenerate OpenAPI client**, nếu không `pnpm --filter web build` fail ở đúng dòng gọi API mới: build API → chạy `node -r dotenv/config dist/src/main.js` (đường dẫn là `dist/src/main.js`, **không** phải `dist/main.js`) → đợi `curl http://localhost:4000/api-docs-json` trả 200 → `cd packages/shared && pnpm generate:api-client` → tắt server.
- **Không đụng `submission_status`.** Giá trị `vắng thi` thuộc Plan C Task 3 — spec §8. Hai migration phải không giao nhau.
- **Không nới `agent:join`.** Nó giữ nguyên `status === 'active'` — spec §2, §9.2.
- Backend service file ≤ 500 dòng (CLAUDE.md File Organization Rules). `exam-session.service.ts` hiện **541 dòng** — đã quá ngưỡng, nên mọi thứ mới ở task 2 và 3 đi vào file riêng, không nối thêm vào đó.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `apps/api/src/database/migrations/<ts>-AddCollectingStatus.ts` | Enum value + 2 cột. Không transaction, không dùng giá trị mới |
| `apps/api/src/exam-session/exam-session.types.ts` | Thêm `isExamOver` / `isCollectionOpen` — hai predicate dùng chung |
| `apps/api/src/exam-session/entities/exam-session.entity.ts` | `'collecting'` vào union + enum cột; 2 property mới |
| `apps/api/src/exam-session/collection-phase.service.ts` | **Mới.** Toàn bộ vòng đời thu bài: chuyển sang `collecting`, xác nhận kết thúc (kèm xử lý đua), quét hết hạn |
| `apps/api/src/exam-session/recollect.service.ts` | **Mới.** Tìm ai thiếu bài + gửi `exam:recollect` có ack |
| `apps/api/src/exam-session/exam-session.scheduler.ts` | Tick thứ hai cho quét hết hạn |
| `apps/api/src/exam-session/exam-session.gateway.ts` | Hàm `requestRecollect()` cho service gọi |
| `apps/agent/src/session-controller.ts` | Xử lý `exam:recollect` mà không đụng `examEnded` |
| `apps/web/src/lib/submission-attention.ts` | `getSessionPhase` đọc status thẳng |
| `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/CollectionPhaseActions.tsx` | **Mới.** Hai nút + kết quả thu lại |

---

## Task 1: Enum `collecting`, hai cột dấu vết, hai predicate

Nền móng: ba task sau đều đọc từ đây. Không có hành vi nào đổi trong task này — `collecting` chưa ai ghi vào.

**Files:**
- Create: `apps/api/src/database/migrations/<timestamp>-AddCollectingStatus.ts`
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts:15-20` (union) và block `@Column` của `status`
- Modify: `apps/api/src/exam-session/exam-session.types.ts`
- Modify: `apps/api/src/exam-session/dto/search-exam-sessions.dto.ts:9-10`
- Test: `apps/api/src/exam-session/exam-session.types.spec.ts` (mới)

**Interfaces:**
- Produces: `ExamSessionStatus` thêm `'collecting'`; `ExamSessionEntity.completedAt: Date | null`, `ExamSessionEntity.completedBy: string | null`; `isExamOver(status): boolean`; `isCollectionOpen(status): boolean`.

- [ ] **Step 1: Viết test cho hai predicate**

```typescript
// apps/api/src/exam-session/exam-session.types.spec.ts
import { isCollectionOpen, isExamOver } from './exam-session.types';

/**
 * Hai hàm này tồn tại vì ba guard trong codebase từng viết
 * `=== 'completed'` khi đó là trạng thái hậu-thi DUY NHẤT (spec §5).
 * Test khoá lại đúng chỗ chúng KHÁC nhau — `active` — vì gộp hai khái
 * niệm vào một hàm là cách hỏng dễ xảy ra nhất.
 */
describe('isExamOver', () => {
  it('đúng cho collecting và completed', () => {
    expect(isExamOver('collecting')).toBe(true);
    expect(isExamOver('completed')).toBe(true);
  });

  it('sai cho mọi trạng thái trước khi thi xong', () => {
    expect(isExamOver('draft')).toBe(false);
    expect(isExamOver('scheduled')).toBe(false);
    expect(isExamOver('active')).toBe(false);
    expect(isExamOver('cancelled')).toBe(false);
  });
});

describe('isCollectionOpen', () => {
  it('đúng cho active, collecting, completed', () => {
    expect(isCollectionOpen('active')).toBe(true);
    expect(isCollectionOpen('collecting')).toBe(true);
    expect(isCollectionOpen('completed')).toBe(true);
  });

  it('sai cho draft, scheduled, cancelled', () => {
    expect(isCollectionOpen('draft')).toBe(false);
    expect(isCollectionOpen('scheduled')).toBe(false);
    expect(isCollectionOpen('cancelled')).toBe(false);
  });

  it('KHÁC isExamOver ở đúng `active` — hai khái niệm, không gộp được', () => {
    expect(isCollectionOpen('active')).toBe(true);
    expect(isExamOver('active')).toBe(false);
  });
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `cd apps/api && pnpm test -- exam-session.types.spec`
Expected: FAIL — `isExamOver`/`isCollectionOpen` chưa tồn tại.

- [ ] **Step 3: Thêm `'collecting'` vào union type**

Trong `apps/api/src/exam-session/entities/exam-session.entity.ts`, sửa union (dòng 15-20):

```typescript
export type ExamSessionStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  // Hết giờ làm bài, đang gom bài về, giảng viên CHƯA xác nhận. Xem
  // docs/superpowers/specs/2026-09-11-exam-collection-phase-design.md.
  // `completed` từ nay nghĩa là "đã có người chốt", không phải "hết giờ".
  | 'collecting'
  | 'completed'
  | 'cancelled';
```

và enum của cột `status` (khoảng dòng 139):

```typescript
    enum: ['draft', 'scheduled', 'active', 'collecting', 'completed', 'cancelled'],
```

- [ ] **Step 4: Thêm hai cột vào entity**

Ngay dưới cột `status` trong cùng file:

```typescript
  /**
   * Thời điểm phiên rời `collecting`. KHÔNG dùng `updated_at` thay: cột
   * đó đổi theo mọi UPDATE (gắn rubric, archive, đóng attention), nên
   * dòng cảnh báo "có bài về sau khi bạn xác nhận" sẽ sai ngẫu nhiên.
   */
  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  /**
   * Ai chốt phiên. `NULL` mang nghĩa CỤ THỂ và phải giữ đúng nghĩa đó:
   * **không người nào xác nhận** — lượt quét dự phòng đã đóng nó.
   *
   * Plan C Task 3 đọc chính cột này để biết có được kết luận "vắng thi"
   * hay không: một `@Interval` 30 giây không phải thứ được phép tuyên bố
   * một sinh viên vắng thi (spec §8.1).
   */
  @Column({ name: 'completed_by', type: 'uuid', nullable: true })
  completedBy!: string | null;
```

- [ ] **Step 5: Viết migration bằng tay**

Không dùng `migration:generate` — nó sẽ sinh `ALTER TYPE` theo kiểu tạo type mới rồi `USING` cast, tức rewrite cả bảng, và mất luôn mệnh đề `AFTER 'active'`.

```typescript
// apps/api/src/database/migrations/1789200000000-AddCollectingStatus.ts
// (đổi timestamp thành Date.now() lúc tạo file)
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Giai đoạn "Đang thu bài" (spec §4).
 *
 * ⚠️ Migration này CỐ Ý không bọc `BEGIN/COMMIT` và CỐ Ý không dùng giá
 * trị `'collecting'` ở bất cứ đâu bên trong nó.
 *
 * `data-source.ts` đặt `migrationsTransactionMode: 'none'` (vì
 * `InitialSchema` tự viết transaction của nó), nên mỗi câu ở đây
 * autocommit và `ADD VALUE` có hiệu lực ngay. Nhưng chính quy ước đó là
 * cái bẫy: ai bọc file này trong `BEGIN/COMMIT` rồi thêm một backfill,
 * một CHECK hay một partial index chạm tới `'collecting'` sẽ nhận
 * `unsafe use of new value of enum type` — lúc deploy, không phải lúc
 * dev. Cần backfill thì tách thành migration thứ hai.
 */
export class AddCollectingStatus1789200000000 implements MigrationInterface {
  name = 'AddCollectingStatus1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "examcollect"."exam_session_status" ADD VALUE IF NOT EXISTS 'collecting' AFTER 'active'`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ADD COLUMN "completed_at" timestamptz`,
    );
    await queryRunner.query(
      `ALTER TABLE "examcollect"."exam_session" ADD COLUMN "completed_by" uuid
         REFERENCES "examcollect"."account"("id") ON DELETE RESTRICT`,
    );
  }

  public async down(): Promise<void> {
    // Postgres không xoá được một giá trị enum. Một `down()` rỗng sẽ
    // trông như revert thành công trong khi `'collecting'` vẫn còn trong
    // type — ném lỗi là câu trả lời trung thực.
    throw new Error(
      'AddCollectingStatus không revert được: Postgres không hỗ trợ xoá giá trị enum. ' +
        'Muốn lùi thì phải tạo lại type exam_session_status và cast cả bảng — làm tay, có chủ đích.',
    );
  }
}
```

- [ ] **Step 6: Chạy migration**

Run: `cd apps/api && pnpm migration:run`
Expected: `AddCollectingStatus1789200000000 has been executed successfully.`

Kiểm lại giá trị đã vào đúng vị trí:

```bash
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -t -c \
  "SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid WHERE t.typname='exam_session_status' ORDER BY e.enumsortorder;"
```
Expected: `draft, scheduled, active, collecting, completed, cancelled` — đúng thứ tự đó.

- [ ] **Step 7: Thêm hai predicate**

Vào cuối `apps/api/src/exam-session/exam-session.types.ts`:

```typescript
import type { ExamSessionStatus } from './entities/exam-session.entity';

/**
 * "Kỳ thi đã qua" — đúng cho cả `collecting` lẫn `completed`.
 *
 * Tồn tại vì cả ba chỗ dùng nó trước đây đều viết `=== 'completed'` khi
 * `completed` còn là trạng thái hậu-thi DUY NHẤT. Thêm `collecting` làm
 * cả ba sai một cách im lặng. Trạng thái thứ tư sau này chỉ phải sửa ở
 * đây, không phải đi tìm lại từng chuỗi so sánh.
 */
export function isExamOver(status: ExamSessionStatus): boolean {
  return status === 'collecting' || status === 'completed';
}

/**
 * Phiên còn nhận bài nộp về.
 *
 * KHÁC `isExamOver`, và khác có chủ đích: `active` là còn nhận nhưng
 * chưa qua. Gộp hai hàm thành một sẽ xoá mất đúng sự khác biệt đó.
 */
export function isCollectionOpen(status: ExamSessionStatus): boolean {
  return status === 'active' || status === 'collecting' || status === 'completed';
}
```

- [ ] **Step 8: Chạy test lại**

Run: `cd apps/api && pnpm test -- exam-session.types.spec`
Expected: PASS, 5 test.

- [ ] **Step 9: Thêm `collecting` vào DTO lọc**

Trong `apps/api/src/exam-session/dto/search-exam-sessions.dto.ts`, thêm `'collecting'` vào mảng giá trị hợp lệ, ngay sau `'active'` — cùng thứ tự với enum để đọc ra vòng đời.

- [ ] **Step 10: Build cả hai app**

Run: `pnpm --filter api build && pnpm --filter web build`
Expected: PASS cả hai. Web build sẽ lộ ra mọi chỗ TypeScript exhaustive-check trên `ExamSessionStatus` còn thiếu nhánh `collecting` — sửa từng chỗ bằng cách thêm nhánh, không bằng `default:`.

- [ ] **Step 11: Chạy e2e để chắc chưa có gì vỡ**

Run: `cd apps/api && pnpm test:e2e`
Expected: PASS toàn bộ. Task này chưa đổi hành vi nào, nên một suite đỏ ở đây là hồi quy thật.

- [ ] **Step 12: Commit**

```bash
git add apps/api/src/database/migrations apps/api/src/exam-session apps/web/src
git commit -m "feat(exam-session): add collecting status, completion trace columns, and shared predicates

Foundation only — nothing writes 'collecting' yet. The two predicates
exist because three guards in the codebase compare against 'completed'
directly, written when that was the only post-exam state; adding a
state splits that meaning and each missed site fails silently.

completed_by is nullable with a specific meaning: NULL means no human
confirmed the session. Plan C Task 3 reads it to decide whether it may
conclude absence."
```

---

## Task 2: Vòng đời — scheduler, xác nhận kết thúc, quét hết hạn, ba guard

**Files:**
- Create: `apps/api/src/exam-session/collection-phase.service.ts`
- Modify: `apps/api/src/exam-session/exam-session.service.ts` (`finalizeExamSession` đổi đích, thêm `findCollectionExpiredIds`)
- Modify: `apps/api/src/exam-session/exam-session.scheduler.ts`
- Modify: `apps/api/src/exam-session/exam-session.controller.ts`
- Modify: `apps/api/src/exam-session/exam-session.module.ts`
- Modify: `apps/api/src/submission/submission.service.ts` (`isAcceptingUploads`)
- Modify: `apps/api/src/agent-connection/attendance.service.ts:194`
- Modify: `apps/api/src/exam-session/exam-material.service.ts:175`
- Test: `apps/api/test/collection-phase.e2e-spec.ts` (mới)

**Interfaces:**
- Consumes: `isExamOver`, `isCollectionOpen`, `ExamSessionEntity.completedAt/completedBy` (Task 1).
- Produces: `CollectionPhaseService.confirmEnd(id, teacherId): Promise<ExamSessionResponseDto>`; `CollectionPhaseService.completeExpired(id): Promise<boolean>`; `ExamSessionService.findCollectionExpiredIds(now): Promise<string[]>`; route `POST /exam-sessions/:id/confirm-end`.

- [ ] **Step 1: Viết e2e cho vòng đời**

```typescript
// apps/api/test/collection-phase.e2e-spec.ts
// Dựng app theo đúng khuôn exam-session.e2e-spec.ts (ValidationPipe +
// PostgresExceptionFilter), và tạo phiên qua POST /exam-sessions như spec
// đó làm — đừng INSERT thẳng, vì luồng tạo mới là thứ đặt status='active'.

describe('Collection phase (e2e)', () => {
  it('hết giờ thì scheduler đưa active → collecting, KHÔNG phải completed', async () => {
    const { session } = await seedActiveSession(app, { endsInMs: -1000 });

    await app.get(ExamSessionScheduler).sweep(new Date());

    const row = await sessionRow(session.id);
    expect(row.status).toBe('collecting');
    expect(row.completed_at).toBeNull();
  });

  it('trong collecting vẫn nhận upload', async () => {
    // Chống hồi quy isAcceptingUploads. Đây là ca mà cả tính năng sinh ra
    // để phục vụ: quên sửa guard thì file bay về bị từ chối.
    const { session, agent } = await seedActiveSession(app, { endsInMs: -1000 });
    await app.get(ExamSessionScheduler).sweep(new Date());

    const result = await agent.submitFile('Cau1.docx');
    expect(result.status).toBe('collected');
  });

  it('trong collecting vẫn dựng được báo cáo lệch điểm danh', async () => {
    const { session } = await seedFinalizedSessionWithHeadcount(app);
    await app.get(ExamSessionScheduler).sweep(new Date());

    const res = await request(app.getHttpServer())
      .get(`/exam-sessions/${session.id}/attendance`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.body.discrepancy).not.toBeNull();
  });

  it('trong collecting vẫn chặn xoá đề thi', async () => {
    const { session, materialId } = await seedSessionWithMaterial(app, { endsInMs: -1000 });
    await app.get(ExamSessionScheduler).sweep(new Date());

    const res = await request(app.getHttpServer())
      .delete(`/exam-sessions/${session.id}/materials/${materialId}`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(403);
  });

  it('"Xác nhận kết thúc" ghi cả completed_at lẫn completed_by', async () => {
    const { session } = await seedCollectingSession(app);

    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/confirm-end`)
      .set('Authorization', `Bearer ${teacherToken}`);

    expect(res.status).toBe(200);
    const row = await sessionRow(session.id);
    expect(row.status).toBe('completed');
    expect(row.completed_by).toBe(teacherId);
    expect(row.completed_at).not.toBeNull();
  });

  it('gọi lần hai là no-op và KHÔNG ghi đè completed_at', async () => {
    const { session } = await seedCollectingSession(app);
    await confirmEnd(session.id);
    const first = (await sessionRow(session.id)).completed_at;

    const res = await confirmEnd(session.id);

    expect(res.status).toBe(200);
    expect((await sessionRow(session.id)).completed_at).toEqual(first);
  });

  it('sau xác nhận, trong grace, upload VẪN được nhận', async () => {
    // Pin quyết định (a) ở spec §3.1. Nút xác nhận là tín hiệu quy trình,
    // không phải cái khoá — chặn ở đây là tạo ra một cách làm mất bài của
    // sinh viên mà không ai phát hiện tới lúc chấm.
    const { session, agent } = await seedCollectingSession(app);
    await confirmEnd(session.id);

    const result = await agent.submitFile('Cau1.docx');
    expect(result.status).toBe('collected');
  });

  it('giảng viên không bấm thì quét dự phòng đóng phiên với completed_by NULL', async () => {
    const { session } = await seedCollectingSession(app, { endedMsAgo: GRACE_MS + 1000 });

    await app.get(ExamSessionScheduler).sweepExpiredCollection(new Date());

    const row = await sessionRow(session.id);
    expect(row.status).toBe('completed');
    expect(row.completed_by).toBeNull();
    expect(row.completed_at).not.toBeNull();
  });

  it('trước endTime + grace thì quét dự phòng KHÔNG đụng tới phiên', async () => {
    const { session } = await seedCollectingSession(app, { endedMsAgo: 60_000 });

    await app.get(ExamSessionScheduler).sweepExpiredCollection(new Date());

    expect((await sessionRow(session.id)).status).toBe('collecting');
  });

  it('thua cuộc đua với scheduler: giảng viên bấm ngay sau vẫn ký được tên', async () => {
    // Spec §4.3. Không có cách "ưu tiên" hai UPDATE đồng thời, nên đường
    // của giảng viên phải nhận được cả phiên mà lượt quét vừa đóng —
    // nếu không, ý định của con người bị một @Interval ghi đè im lặng.
    const { session } = await seedCollectingSession(app, { endedMsAgo: GRACE_MS + 1000 });
    await app.get(ExamSessionScheduler).sweepExpiredCollection(new Date());
    expect((await sessionRow(session.id)).completed_by).toBeNull();

    const res = await confirmEnd(session.id);

    expect(res.status).toBe(200);
    expect((await sessionRow(session.id)).completed_by).toBe(teacherId);
  });

  it('nhưng quá cửa sổ grace thì không ký khống được nữa', async () => {
    const { session } = await seedCollectingSession(app, { endedMsAgo: GRACE_MS + 3 * 3600_000 });
    await app.get(ExamSessionScheduler).sweepExpiredCollection(new Date());

    await confirmEnd(session.id);

    expect((await sessionRow(session.id)).completed_by).toBeNull();
  });

  it('chốt bài sớm đưa phiên vào collecting mà quét dự phòng chưa đụng tới', async () => {
    // Spec §9.5: mốc quét theo endTime theo lịch, không theo lúc vào
    // collecting — cùng công thức với isAcceptingUploads.
    const { session } = await seedActiveSession(app, { endsInMs: 3600_000 });

    await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/finalize`)
      .set('Authorization', `Bearer ${teacherToken}`);
    expect((await sessionRow(session.id)).status).toBe('collecting');

    await app.get(ExamSessionScheduler).sweepExpiredCollection(new Date());
    expect((await sessionRow(session.id)).status).toBe('collecting');
  });

  it('confirm-end từ chối giảng viên không phải chủ phiên', async () => {
    const { session } = await seedCollectingSession(app);
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/confirm-end`)
      .set('Authorization', `Bearer ${otherTeacherToken}`);
    expect(res.status).toBe(403);
  });

  it('tạo được phiên mới cùng phòng ngay sau endTime khi phiên cũ đang collecting', async () => {
    // Ràng buộc GiST loại trừ theo `status <> completed AND <> cancelled`,
    // nên phiên `collecting` vẫn nằm trong đó — nhưng khoảng thời gian
    // của nó đã trôi qua, nên không chồng lấn. Spec §4.1.
    const { session, roomId } = await seedActiveSession(app, { endsInMs: -1000 });
    await app.get(ExamSessionScheduler).sweep(new Date());

    const res = await createSessionAt(app, { roomId, startTime: session.endTime });
    expect(res.status).toBe(201);
  });
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `cd apps/api && pnpm test:e2e -- collection-phase`
Expected: FAIL — `sweepExpiredCollection` và route `confirm-end` chưa tồn tại; ca đầu tiên fail vì scheduler vẫn đưa thẳng sang `completed`.

- [ ] **Step 3: Đổi đích của `finalizeExamSession`**

Trong `apps/api/src/exam-session/exam-session.service.ts`, sửa `.set({ status: 'completed' })` thành `'collecting'` và cập nhật doc comment:

```typescript
  /**
   * Hết giờ làm bài: `active → collecting`. Cả lượt quét theo lịch
   * (ExamSessionScheduler) lẫn "Chốt bài ngay" thủ công đều đi qua đây.
   *
   * ĐÍCH LÀ `collecting`, KHÔNG phải `completed` — `completed` từ nay
   * nghĩa là "đã có người chốt" (spec §3). Nhưng sự kiện phát ra vẫn là
   * `exam:finalize` và vẫn phát Ở ĐÂY: agent nộp bài khi nhận nó, nên
   * dời nó xuống bước xác nhận sẽ khiến agent chỉ nộp sau khi giảng viên
   * bấm — ngược hẳn ý đồ. Tên sự kiện giờ hơi lệch nghĩa; đổi tên là phá
   * agent đã triển khai, nên giữ (spec §2).
   */
  async finalizeExamSession(
    examSessionId: string,
    reason: ExamFinalizeReason,
  ): Promise<boolean> {
    const result = await this.sessions
      .createQueryBuilder()
      .update(ExamSessionEntity)
      .set({ status: 'collecting' })
      .where('id = :id', { id: examSessionId })
      .andWhere('status = :active', { active: 'active' })
      .execute();
```

Phần còn lại của hàm không đổi.

- [ ] **Step 4: Thêm truy vấn tìm phiên thu bài đã hết hạn**

Ngay dưới `findFinalizableIds` trong cùng file:

```typescript
  /**
   * Phiên còn kẹt ở `collecting` sau khi cửa sổ nhận bài đã đóng — danh
   * sách việc của lượt quét dự phòng.
   *
   * Mốc là `end_time + grace` THEO LỊCH, không tính từ lúc vào
   * `collecting`: `isAcceptingUploads` dùng đúng công thức đó, và lệch
   * hai bên sẽ tạo ra quãng phiên đã `completed` mà vẫn nhận bài (spec
   * §9.5). Hệ quả: chốt bài sớm thì `collecting` kéo dài tới hết grace
   * của giờ thi theo lịch — có chủ đích.
   *
   * Dùng chung idx_exam_session_status_end_time với findFinalizableIds.
   */
  async findCollectionExpiredIds(now: Date): Promise<string[]> {
    const rows = await this.sessions
      .createQueryBuilder('s')
      .select('s.id', 'id')
      .where('s.status = :collecting', { collecting: 'collecting' })
      .andWhere(
        `s.endTime + make_interval(secs => :graceSecs) <= :now`,
        { graceSecs: SUBMISSION_GRACE_PERIOD_MS / 1000, now },
      )
      .getRawMany<{ id: string }>();
    return rows.map((row) => row.id);
  }
```

Import `SUBMISSION_GRACE_PERIOD_MS` từ `../submission/submission.types`.

- [ ] **Step 5: Tạo `CollectionPhaseService`**

File riêng, không nối vào `exam-session.service.ts` (đã 541 dòng, quá ngưỡng 500 của File Organization Rules).

```typescript
// apps/api/src/exam-session/collection-phase.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExamSessionEntity } from './entities/exam-session.entity';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionResponseDto } from './dto/exam-session-response.dto';
import { SUBMISSION_GRACE_PERIOD_MS } from '../submission/submission.types';

/**
 * Vòng đời giai đoạn "Đang thu bài" (spec §3).
 *
 * Tách khỏi `ExamSessionService` vì file đó đã 541 dòng, và vì đây là
 * trách nhiệm khác: `ExamSessionService` sở hữu việc tạo/đọc phiên, chỗ
 * này sở hữu đúng hai chuyển trạng thái sau khi hết giờ.
 */
@Injectable()
export class CollectionPhaseService {
  constructor(
    @InjectRepository(ExamSessionEntity)
    private readonly sessions: Repository<ExamSessionEntity>,
    private readonly examSessions: ExamSessionService,
  ) {}

  /**
   * "Xác nhận kết thúc": `collecting → completed`, có tên người ký.
   *
   * Mệnh đề `OR` thứ hai là phần dễ bỏ sót nhất (spec §4.3). Tại đúng
   * mốc `end_time + grace`, giảng viên bấm trong khi lượt quét cũng
   * tick; Postgres serialize hai UPDATE và một trong hai match 0 dòng.
   * Nếu lượt quét thắng thì `completed_by = NULL`, và theo §8.1 Plan C
   * Task 3 sẽ KHÔNG được kết luận vắng thi — dù giảng viên thật sự đã
   * đứng trong phòng và xác nhận. Không có cách ưu tiên một bên trong
   * hai UPDATE đồng thời, nên thay vào đó đường của giảng viên nhận cả
   * phiên mà lượt quét vừa đóng.
   *
   * `:now <= end_time + grace` chặn nó thành đường ký khống: sau cửa sổ
   * đó giảng viên đã rời phòng, và "xác nhận" một buổi thi hôm qua không
   * còn là quan sát.
   *
   * Không ghi đè `completed_at` khi phiên đã có người ký: `completed_by
   * IS NULL` trong mệnh đề OR lo việc đó, và nhánh `collecting` thì theo
   * định nghĩa chưa ai ký.
   */
  async confirmEnd(id: string, teacherId: string): Promise<ExamSessionResponseDto> {
    await this.examSessions.findByIdForOwner(id, teacherId);

    await this.sessions
      .createQueryBuilder()
      .update(ExamSessionEntity)
      .set({ status: 'completed', completedAt: () => 'now()', completedBy: teacherId })
      .where('id = :id', { id })
      .andWhere(
        `(status = :collecting
          OR (status = :completed
              AND completed_by IS NULL
              AND now() <= end_time + make_interval(secs => :graceSecs)))`,
        {
          collecting: 'collecting',
          completed: 'completed',
          graceSecs: SUBMISSION_GRACE_PERIOD_MS / 1000,
        },
      )
      .execute();

    // Đọc lại thay vì vá bản sao trong bộ nhớ: nếu 0 dòng khớp (phiên đã
    // có người ký, hoặc đã quá cửa sổ), giảng viên vẫn phải thấy trạng
    // thái thật chứ không phải phỏng đoán. Gọi lần hai vì thế là no-op
    // trả 200, không phải lỗi.
    return this.examSessions.findByIdForOwner(id, teacherId);
  }

  /**
   * Lượt quét dự phòng đóng phiên không ai chốt. `completed_by` để
   * NGUYÊN `NULL` — đó là toàn bộ thông tin mà lượt quét này mang lại:
   * không người nào quan sát buổi thi này (spec §8.1).
   */
  async completeExpired(id: string): Promise<boolean> {
    const result = await this.sessions
      .createQueryBuilder()
      .update(ExamSessionEntity)
      .set({ status: 'completed', completedAt: () => 'now()' })
      .where('id = :id', { id })
      .andWhere('status = :collecting', { collecting: 'collecting' })
      .execute();
    return (result.affected ?? 0) > 0;
  }
}
```

- [ ] **Step 6: Thêm tick thứ hai vào scheduler**

Trong `apps/api/src/exam-session/exam-session.scheduler.ts`, thêm cờ chống chồng lấn riêng và một handler mới:

```typescript
  private runningCollectionSweep = false;

  /**
   * Lượt quét thứ hai: đóng phiên kẹt ở `collecting` vì không ai bấm
   * "Xác nhận kết thúc" — mất điện, đóng nhầm tab, quên. Không có nó thì
   * phiên treo vĩnh viễn.
   *
   * Cờ `running` RIÊNG, không dùng chung với lượt quét finalize: hai
   * lượt làm hai việc khác nhau trên hai tập phiên khác nhau, và để một
   * lượt chậm chặn lượt kia là ghép hai sự cố không liên quan.
   */
  @Interval('exam-session-collection-sweep', ExamSessionScheduler.SWEEP_INTERVAL_MS)
  async handleCollectionSweep(): Promise<void> {
    if (this.runningCollectionSweep) {
      this.logger.debug('collection sweep skipped: previous tick still running');
      return;
    }
    this.runningCollectionSweep = true;
    try {
      await this.sweepExpiredCollection(new Date());
    } catch (error) {
      this.logger.error(
        'collection sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.runningCollectionSweep = false;
    }
  }

  /** Tách khỏi handler để test lái được một tick tại `now` đã chọn. */
  async sweepExpiredCollection(now: Date): Promise<number> {
    const ids = await this.examSessions.findCollectionExpiredIds(now);
    let closed = 0;
    for (const id of ids) {
      try {
        if (await this.collectionPhase.completeExpired(id)) {
          closed++;
        }
      } catch (error) {
        this.logger.error(
          `failed to close collection for exam session ${id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
    if (closed > 0) {
      this.logger.log(`collection sweep closed ${closed} exam session(s)`);
    }
    return closed;
  }
```

Thêm `private readonly collectionPhase: CollectionPhaseService` vào constructor.

- [ ] **Step 7: Thêm route**

Trong `apps/api/src/exam-session/exam-session.controller.ts`, ngay dưới route `finalize`:

```typescript
  /**
   * "Xác nhận kết thúc" — `collecting → completed`, ghi tên người chốt.
   *
   * Khác `finalize` ở trên: `finalize` nghĩa là "hết giờ, nộp đi" và đưa
   * phiên VÀO `collecting`; cái này nghĩa là "tôi đã nhìn phòng, xong"
   * và đưa nó RA. Hai nút khác nhau trên màn hình, hai ý nghĩa khác nhau.
   *
   * 200 và idempotent, như `finalize`: gọi lại trên phiên đã chốt trả về
   * cùng trạng thái, không lỗi.
   */
  @Post(':id/confirm-end')
  @Roles('teacher')
  @HttpCode(200)
  confirmEnd(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.collectionPhase.confirmEnd(id, req.user!.sub);
  }
```

Thêm `CollectionPhaseService` vào constructor và `providers` của `exam-session.module.ts`.

- [ ] **Step 8: Sửa ba guard**

`apps/api/src/submission/submission.service.ts` — `isAcceptingUploads`:

```typescript
function isAcceptingUploads(session: ExamSessionEntity, now: Date): boolean {
  // `collecting` nằm trong isCollectionOpen — thiếu nó thì mọi file bay
  // về trong lúc thu bài bị từ chối, tức hỏng đúng thứ giai đoạn đó sinh
  // ra để phục vụ.
  if (!isCollectionOpen(session.status)) {
    return false;
  }
  const at = now.getTime();
  return (
    at >= session.startTime.getTime() &&
    at <= session.endTime.getTime() + SUBMISSION_GRACE_PERIOD_MS
  );
}
```

`apps/api/src/agent-connection/attendance.service.ts:194`:

```typescript
    // isExamOver, không phải `=== 'completed'`: báo cáo lệch là thứ
    // giảng viên đọc để chọn thu lại ai, nên nó phải có mặt TRONG lúc
    // thu bài, không phải chỉ sau khi đã chốt.
    if (!isExamOver(session.status) || !confirmedAt || session.attendanceConfirmedCount === null) {
      return null;
    }
```

`apps/api/src/exam-session/exam-material.service.ts:175`:

```typescript
    // isExamOver: đề thi phải khoá ngay khi hết giờ, không đợi tới lúc
    // giảng viên chốt — nếu không, nó mở khoá xoá trở lại suốt cửa sổ
    // thu bài.
    if (isExamOver(session.status)) {
      throw new ForbiddenException(
        'Phiên thi đã kết thúc — đề thi được giữ lại để đối chiếu, không xoá được nữa.',
      );
    }
```

- [ ] **Step 9: Chạy e2e**

Run: `cd apps/api && pnpm test:e2e -- collection-phase`
Expected: PASS, 14 test.

- [ ] **Step 10: Chạy toàn bộ e2e**

Run: `cd apps/api && pnpm test:e2e`
Expected: PASS. Task này đổi ý nghĩa của `completed` nên đây là chỗ hồi quy lộ ra — chú ý `exam-session`, `submission-collection`, `session-lifecycle`, `attendance`. Suite nào đỏ thì đọc kỹ trước khi sửa test: có thể chính nó đang khẳng định hành vi cũ mà spec cố ý đổi, và khi đó sửa test là đúng — nhưng phải nói rõ trong commit vì sao.

- [ ] **Step 11: Regenerate OpenAPI client**

```bash
pnpm --filter api build
cd apps/api && node -r dotenv/config dist/src/main.js &
# đợi tới khi curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/api-docs-json trả 200
cd packages/shared && pnpm generate:api-client
# tắt server
```
Kiểm: `grep -n '"/exam-sessions/{id}/confirm-end"' packages/shared/src/api/schema.d.ts` phải có kết quả.

- [ ] **Step 12: Build web**

Run: `pnpm --filter web build`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/api/src apps/api/test packages/shared/src
git commit -m "feat(exam-session): collecting phase with teacher confirmation

The clock no longer closes a session. active -> collecting on time-up,
and completed now means a person signed off. exam:finalize still fires
at time-up, not at confirmation — agents upload on that event, so
moving it would invert the intent.

The confirm path also accepts a session the expiry sweep just closed,
bounded to the grace window. Two concurrent UPDATEs cannot be
prioritised, and losing that race would let a 30-second @Interval
erase a teacher's signature — which Plan C Task 3 reads to decide
whether it may conclude absence.

Three guards move to the shared predicates. Each omission fails
silently: uploads refused during collection, the discrepancy report
missing when it is most needed, exam materials deletable again."
```

---

## Task 3: "Thu lại" — backend

**Files:**
- Create: `apps/api/src/exam-session/recollect.service.ts`
- Create: `apps/api/src/exam-session/recollect.types.ts`
- Modify: `apps/api/src/exam-session/exam-session.gateway.ts`
- Modify: `apps/api/src/exam-session/exam-session.controller.ts`
- Modify: `apps/api/src/exam-session/exam-session.module.ts`
- Test: `apps/api/test/recollect.e2e-spec.ts` (mới)

**Interfaces:**
- Consumes: `CollectionPhaseService` (không trực tiếp — chỉ cần status `collecting`), `agentRoom()` trong gateway.
- Produces: `RecollectResult { missing: number; acknowledged: number; unreachable: number; unreachableNames: string[] }`; `RecollectService.requestRecollect(id, teacherId): Promise<RecollectResult>`; `ExamSessionGateway.requestRecollect(examSessionId, mssvs): Promise<string[]>` trả về danh sách MSSV đã ack; route `POST /exam-sessions/:id/recollect`.

- [ ] **Step 1: Viết e2e**

```typescript
// apps/api/test/recollect.e2e-spec.ts
// Cần socket.io-client thật để ack — xem agent-join.e2e-spec.ts cho khuôn
// kết nối và join.

describe('POST /exam-sessions/:id/recollect (e2e)', () => {
  it('chỉ agent của em chưa nộp đủ nhận exam:recollect', async () => {
    const { session } = await seedCollectingSession(app, { students: ['SV001', 'SV002'] });
    const done = await joinAgent(session, 'SV001');
    await submitAll(done, session);           // SV001 nộp đủ
    const missing = await joinAgent(session, 'SV002');

    const received: string[] = [];
    done.socket.on('exam:recollect', () => received.push('SV001'));
    missing.socket.on('exam:recollect', (_p, ack) => { received.push('SV002'); ack({ ok: true }); });

    const res = await recollect(session.id);

    expect(res.body).toMatchObject({ missing: 1, acknowledged: 1, unreachable: 0 });
    expect(received).toEqual(['SV002']);
  });

  it('em nộp thiếu 1/2 file VẪN nhận', async () => {
    // Ca thu lại có ích nhất: máy còn đó, chỉ thiếu một file. Bản đầu của
    // spec bỏ sót nhóm này.
    const { session } = await seedCollectingSession(app, {
      students: ['SV001'],
      requiredFilenames: ['Cau1.docx', 'Cau2.docx'],
    });
    const agent = await joinAgent(session, 'SV001');
    await submitOne(agent, 'Cau1.docx');

    let got = false;
    agent.socket.on('exam:recollect', (_p, ack) => { got = true; ack({ ok: true }); });

    const res = await recollect(session.id);

    expect(got).toBe(true);
    expect(res.body).toMatchObject({ missing: 1, acknowledged: 1 });
  });

  it('MSSV lệch hoa thường vẫn nhắm trúng', async () => {
    // student_mssv là citext — Postgres coi 'SV001' và 'sv001' là MỘT
    // sinh viên, Set.has() của JS thì không. So thẳng sẽ trượt lúc được
    // lúc không tuỳ cách nhập roster, và ra `acknowledged: 0` trông hệt
    // như cả phòng đã ngắt kết nối.
    const { session } = await seedCollectingSession(app, { students: ['SV001'] });
    const agent = await joinAgent(session, 'sv001');

    let got = false;
    agent.socket.on('exam:recollect', (_p, ack) => { got = true; ack({ ok: true }); });

    const res = await recollect(session.id);

    expect(got).toBe(true);
    expect(res.body.acknowledged).toBe(1);
  });

  it('agent không ack trong 3 giây rơi vào unreachable, kèm tên', async () => {
    const { session } = await seedCollectingSession(app, { students: ['SV001', 'SV002'] });
    const alive = await joinAgent(session, 'SV001');
    alive.socket.on('exam:recollect', (_p, ack) => ack({ ok: true }));
    const mute = await joinAgent(session, 'SV002');
    mute.socket.on('exam:recollect', () => { /* cố ý không ack */ });

    const res = await recollect(session.id);

    expect(res.body).toMatchObject({ missing: 2, acknowledged: 1, unreachable: 1 });
    expect(res.body.unreachableNames).toHaveLength(1);
  });

  it('máy đã ngắt kết nối tính là unreachable', async () => {
    const { session } = await seedCollectingSession(app, { students: ['SV001'] });
    const agent = await joinAgent(session, 'SV001');
    agent.socket.disconnect();
    await waitForDisconnect();

    const res = await recollect(session.id);

    expect(res.body).toMatchObject({ missing: 1, acknowledged: 0, unreachable: 1 });
  });

  it('sau khi nộp lại, em đó rời khỏi tập đích ở lần bấm sau', async () => {
    // Vòng khép kín của tính năng.
    const { session } = await seedCollectingSession(app, { students: ['SV001'] });
    const agent = await joinAgent(session, 'SV001');
    agent.socket.on('exam:recollect', (_p, ack) => ack({ ok: true }));

    expect((await recollect(session.id)).body.missing).toBe(1);
    await submitAll(agent, session);

    expect((await recollect(session.id)).body.missing).toBe(0);
  });

  it('phiên không ở collecting thì 409', async () => {
    const { session } = await seedActiveSession(app, { endsInMs: 3600_000 });
    const res = await recollect(session.id);
    expect(res.status).toBe(409);
  });

  it('từ chối giảng viên không phải chủ phiên', async () => {
    const { session } = await seedCollectingSession(app, { students: ['SV001'] });
    const res = await request(app.getHttpServer())
      .post(`/exam-sessions/${session.id}/recollect`)
      .set('Authorization', `Bearer ${otherTeacherToken}`);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `cd apps/api && pnpm test:e2e -- recollect`
Expected: FAIL — 404, route chưa có.

- [ ] **Step 3: Khai kiểu trả về**

```typescript
// apps/api/src/exam-session/recollect.types.ts

/** Ack agent trả lời cho `exam:recollect`. Chỉ cần biết nó còn sống. */
export interface RecollectAck {
  ok: boolean;
}

export interface RecollectResult {
  /** Số sinh viên đã dự thi mà chưa nộp đủ file bắt buộc. */
  missing: number;
  /**
   * Số agent ĐÃ TRẢ LỜI trong thời hạn — không phải số lệnh đã gửi.
   * `emit` là bắn-và-quên: socket còn kết nối nhưng tiến trình agent treo
   * vẫn được tính, và giảng viên hành động dựa trên con số này.
   */
  acknowledged: number;
  unreachable: number;
  /**
   * Tên các em không với tới được, lấy từ `enrollment.student_name`
   * (cột `NOT NULL`) — em unreachable theo định nghĩa là em không có
   * socket để đọc tên ra. Đây là phần giảng viên hành động dựa vào, quan
   * trọng hơn con số.
   */
  unreachableNames: string[];
}

/** 3 giây: agent chỉ cần báo đã nhận, chưa cần upload xong. */
export const RECOLLECT_ACK_TIMEOUT_MS = 3_000;
```

- [ ] **Step 4: Thêm hàm phát lệnh có ack vào gateway**

Trong `apps/api/src/exam-session/exam-session.gateway.ts`:

```typescript
  /**
   * Yêu cầu đúng những agent trong `mssvs` nộp lại. Trả về MSSV của
   * những agent ĐÃ ack.
   *
   * Nhắm từng máy chứ không phát cả phòng: em đã nộp đủ mà nhận lệnh nộp
   * lại sẽ upload đè lên bài của chính mình.
   *
   * So sánh hạ chữ thường hai đầu vì `student_mssv` là `citext` —
   * Postgres coi 'SV001' và 'sv001' là một sinh viên, `Set.has()` thì
   * không, và sai kiểu đó trượt lúc được lúc không.
   *
   * Sự kiện MỚI, không tái dùng `exam:finalize`: agent đặt `examEnded`
   * vĩnh viễn khi nhận `exam:finalize`, nên bắn lại sẽ không đổi được gì
   * ở phía nó.
   */
  async requestRecollect(examSessionId: string, mssvs: string[]): Promise<string[]> {
    const wanted = new Set(mssvs.map((m) => m.toLowerCase()));
    const sockets = await this.server.in(agentRoom(examSessionId)).fetchSockets();
    const targets = sockets.filter((socket) => {
      const mssv = socket.data.studentId;
      return typeof mssv === 'string' && wanted.has(mssv.toLowerCase());
    });

    // SONG SONG: 10 máy treo × 3 giây tuần tự = 30 giây request đứng
    // hình, trong khi cả 10 timeout đó đếm cùng lúc được.
    const settled = await Promise.allSettled(
      targets.map(async (socket) => {
        await socket
          .timeout(RECOLLECT_ACK_TIMEOUT_MS)
          .emitWithAck('exam:recollect', { examSessionId });
        return socket.data.studentId as string;
      }),
    );

    return settled
      .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
      .map((r) => r.value);
  }
```

- [ ] **Step 5: Tạo `RecollectService`**

```typescript
// apps/api/src/exam-session/recollect.service.ts
import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ExamSessionService } from './exam-session.service';
import { ExamSessionGateway } from './exam-session.gateway';
import { RecollectResult } from './recollect.types';

@Injectable()
export class RecollectService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly examSessions: ExamSessionService,
    private readonly gateway: ExamSessionGateway,
  ) {}

  /**
   * Ai đã dự thi mà chưa nộp đủ file bắt buộc.
   *
   * "Đã dự thi" đọc từ `agent_connection_event` chứ không từ roster: mục
   * tiêu là những máy CÓ THỂ nộp lại, và một em chưa từng kết nối thì
   * không có gì để thu. "Chưa đủ" so số file `collected` với số
   * `required_deliverable` — nên nó gồm cả em nộp thiếu, không chỉ em
   * trắng tay.
   */
  private async findMissing(
    examSessionId: string,
  ): Promise<Array<{ mssv: string; name: string }>> {
    return this.dataSource.query(
      `WITH required AS (
         SELECT COUNT(*)::int AS n
           FROM examcollect.required_deliverable
          WHERE exam_session_id = $1
       ),
       attended AS (
         SELECT DISTINCT student_mssv
           FROM examcollect.agent_connection_event
          WHERE exam_session_id = $1
       ),
       collected AS (
         SELECT student_mssv, COUNT(*)::int AS n
           FROM examcollect.submission
          WHERE exam_session_id = $1 AND status = 'collected'
          GROUP BY student_mssv
       )
       SELECT a.student_mssv AS mssv, e.student_name AS name
         FROM attended a
         JOIN examcollect.exam_session s ON s.id = $1
         JOIN examcollect.enrollment e
           ON e.course_id = s.course_id AND e.student_mssv = a.student_mssv
         LEFT JOIN collected c ON c.student_mssv = a.student_mssv
        WHERE COALESCE(c.n, 0) < (SELECT n FROM required)
        ORDER BY e.student_name`,
      [examSessionId],
    );
  }

  async requestRecollect(id: string, teacherId: string): Promise<RecollectResult> {
    const session = await this.examSessions.findEntityForOwner(id, teacherId);
    if (session.status !== 'collecting') {
      // Gửi lệnh cho một buổi thi đã đóng chỉ tạo kỳ vọng sai: agent có
      // thể đã tắt, và bài về sau `endTime + grace` sẽ bị
      // `isAcceptingUploads` từ chối.
      throw new ConflictException('Chỉ thu lại được khi phiên đang ở trạng thái Đang thu bài');
    }

    const missing = await this.findMissing(id);
    const ackedMssv = await this.gateway.requestRecollect(
      id,
      missing.map((m) => m.mssv),
    );
    const acked = new Set(ackedMssv.map((m) => m.toLowerCase()));
    const unreachable = missing.filter((m) => !acked.has(m.mssv.toLowerCase()));

    return {
      missing: missing.length,
      acknowledged: missing.length - unreachable.length,
      unreachable: unreachable.length,
      unreachableNames: unreachable.map((m) => m.name),
    };
  }
}
```

- [ ] **Step 6: Thêm route**

```typescript
  /**
   * "Thu lại" — yêu cầu agent của những em chưa nộp đủ gửi lại bài.
   *
   * Cho bấm nhiều lần: đây là thao tác đọc-rồi-gửi, không đổi trạng thái
   * gì ở server, và em đã nộp giữa hai lần bấm tự rơi khỏi tập đích.
   */
  @Post(':id/recollect')
  @Roles('teacher')
  @HttpCode(200)
  recollect(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    return this.recollectService.requestRecollect(id, req.user!.sub);
  }
```

Đăng ký `RecollectService` trong `exam-session.module.ts` và thêm vào constructor của controller.

- [ ] **Step 7: Chạy e2e**

Run: `cd apps/api && pnpm test:e2e -- recollect`
Expected: PASS, 8 test.

- [ ] **Step 8: Regenerate OpenAPI + build**

Theo đúng thủ tục ở Global Constraints, rồi:
Run: `pnpm --filter api build && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src apps/api/test packages/shared/src
git commit -m "feat(exam-session): re-collect from students who have not submitted everything

Targets individual sockets rather than the room, so a student who
already submitted does not upload over their own work. Includes
partial submitters — one missing file is the case where re-collecting
helps most, and the agent re-sends everything, which upserts.

MSSV comparison lowercases both sides because student_mssv is citext:
Postgres treats SV001 and sv001 as one student and Set.has does not,
so a direct compare misses depending on how the roster was typed and
reports acknowledged: 0, which reads as "everyone disconnected".

The count is acks, not emits, gathered in parallel — emit is
fire-and-forget, and ten dead machines at three seconds each would
otherwise freeze the request for thirty."
```

---

## Task 4: Agent xử lý `exam:recollect`

**Files:**
- Modify: `apps/agent/src/session-controller.ts`
- Test: `apps/agent/src/session-controller.test.ts`

**Interfaces:**
- Consumes: sự kiện `exam:recollect` với payload `{ examSessionId: string }`, callback ack `(ack: RecollectAck) => void`.
- Produces: agent upload lại mọi required deliverable và **không** đụng `examEnded`.

- [ ] **Step 1: Viết test**

```typescript
// apps/agent/src/session-controller.test.ts — thêm vào describe hiện có
it('exam:recollect uploads every required deliverable again', async () => {
  const { socket, uploader } = harnessAfterFinalize();
  uploader.reset();

  socket.emit('exam:recollect', { examSessionId: 'exam-1' });
  await flush();

  expect(uploader.uploaded).toEqual(['Cau1.docx', 'Cau2.docx']);
});

it('exam:recollect acks so the server can count it as reached', async () => {
  const { socket } = harnessAfterFinalize();
  const ack = vi.fn();

  socket.emit('exam:recollect', { examSessionId: 'exam-1' }, ack);
  await flush();

  expect(ack).toHaveBeenCalledWith({ ok: true });
});

it('exam:recollect does NOT touch examEnded', async () => {
  // examEnded=true là thứ chặn agent gửi lại `agent:join` sau khi phiên
  // đóng. Đặt lại nó ở đây sẽ làm UI của sinh viên tụt từ "đã nộp" về
  // màn hình join/lỗi.
  const { socket, state } = harnessAfterFinalize();
  expect(state.examEnded).toBe(true);

  socket.emit('exam:recollect', { examSessionId: 'exam-1' });
  await flush();

  expect(state.examEnded).toBe(true);
});

it('acks even when the upload itself fails', async () => {
  // Ack nghĩa là "tôi còn sống và đã nhận lệnh", không phải "đã nộp
  // xong". Nuốt ack khi upload lỗi sẽ báo máy đó unreachable trong khi
  // nó đang ở ngay đó và giảng viên xử lý tay được.
  const { socket, uploader } = harnessAfterFinalize();
  uploader.failNext();
  const ack = vi.fn();

  socket.emit('exam:recollect', { examSessionId: 'exam-1' }, ack);
  await flush();

  expect(ack).toHaveBeenCalledWith({ ok: true });
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `cd apps/agent && pnpm test -- session-controller`
Expected: FAIL — agent chưa lắng nghe `exam:recollect`.

- [ ] **Step 3: Xử lý sự kiện**

Trong `apps/agent/src/session-controller.ts`, cạnh handler `exam:finalize`:

```typescript
    /**
     * Giảng viên bấm "Thu lại" — nộp lại mọi deliverable bắt buộc.
     *
     * KHÔNG đụng `examEnded`: cờ đó là thứ chặn agent gửi lại
     * `agent:join` sau khi phiên đóng, và đặt lại nó sẽ làm màn hình của
     * sinh viên tụt từ "đã nộp" về màn hình join/lỗi.
     *
     * Ack NGAY và ack KỂ CẢ khi upload lỗi: ack nghĩa là "máy này còn
     * sống và đã nhận lệnh", không phải "đã nộp xong". Server dùng nó để
     * nói cho giảng viên biết máy nào không với tới được, và một máy im
     * lặng vì upload lỗi sẽ bị báo nhầm là đã tắt — trong khi nó đang ở
     * ngay đó và xử lý tay được.
     */
    socket.on('exam:recollect', (_payload, ack?: (result: { ok: boolean }) => void) => {
      ack?.({ ok: true });
      void this.uploadAllDeliverables('recollect').catch((error) => {
        this.log(`Thu lại thất bại: ${error instanceof Error ? error.message : String(error)}`);
      });
    });
```

Nếu đường upload hiện nằm inline trong handler `exam:finalize`, tách nó thành `uploadAllDeliverables(reason)` trước và cho cả hai handler cùng gọi — hai bản sao của đường nộp bài sẽ lệch nhau.

- [ ] **Step 4: Chạy test lại**

Run: `cd apps/agent && pnpm test -- session-controller`
Expected: PASS.

- [ ] **Step 5: Chạy lại e2e task 3**

Run: `cd apps/api && pnpm test:e2e -- recollect`
Expected: vẫn PASS — e2e dùng socket client riêng nên không phụ thuộc agent thật, nhưng chạy lại để chắc không có gì lệch hợp đồng.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src
git commit -m "feat(agent): handle exam:recollect without ending the session again

Acks immediately and acks even when the upload fails: the ack means
'this machine is alive and got the order', not 'the file is in'. A
machine silent because its upload errored would otherwise be reported
as switched off, while it is sitting right there and the invigilator
could fix it by hand.

examEnded stays true. That flag is what stops the agent re-sending
agent:join after the session closed; clearing it would drop the
student's screen from 'submitted' back to a join/error state."
```

---

## Task 5: Hai nút trên màn hình phòng thi

**Files:**
- Create: `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/CollectionPhaseActions.tsx`
- Modify: `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx`
- Modify: `apps/web/src/lib/submission-attention.ts`
- Modify: `apps/web/src/lib/api/exam-session.ts`, `apps/web/src/hooks/useExamSession.ts`
- Test: `apps/web/src/lib/submission-attention.test.ts`, `apps/web/src/app/(exam-live)/exam-sessions/[id]/_components/CollectionPhaseActions.test.tsx` (mới)

**Interfaces:**
- Consumes: `POST /exam-sessions/:id/confirm-end`, `POST /exam-sessions/:id/recollect` → `RecollectResult` (Task 2, 3).
- Produces: component `<CollectionPhaseActions sessionId status missingCount onRefresh />`.

- [ ] **Step 1: Sửa test của `getSessionPhase`**

Trong `apps/web/src/lib/submission-attention.test.ts`, thêm và sửa:

```typescript
it('đọc collecting thẳng từ status, không suy từ đồng hồ', () => {
  const item = { ...base, status: 'collecting', endTime: iso(NOW + 3600_000) };
  // endTime còn ở tương lai mà status đã là collecting — chốt bài sớm.
  // Suy từ đồng hồ sẽ trả 'running', tức nói sai hẳn tình trạng.
  expect(getSessionPhase(item, NOW)).toBe('collecting');
});

it('completed là Đã kết thúc, kể cả còn trong grace', () => {
  // Đổi so với bản cũ: trước đây `completed` + trong grace suy ra
  // 'collecting'. Giờ `collecting` là trạng thái thật, nên `completed`
  // nghĩa là đã có người chốt.
  const item = { ...base, status: 'completed', endTime: iso(NOW - 60_000) };
  expect(getSessionPhase(item, NOW)).toBe('ended');
});
```

- [ ] **Step 2: Chạy để thấy fail**

Run: `pnpm --filter web test -- submission-attention`
Expected: FAIL.

- [ ] **Step 3: Sửa `getSessionPhase`**

```typescript
/**
 * `collecting` và `completed` giờ là trạng thái THẬT trong DB, nên đồng
 * hồ không còn tiếng nói ở hai ca đó — đọc thẳng.
 *
 * Nhánh suy-từ-đồng-hồ chỉ còn phục vụ **phiên `completed` tạo trước khi
 * giai đoạn thu bài được triển khai** (spec §9.3): chúng có
 * `completed_at = NULL` và chưa từng đi qua `collecting`. Đừng mở rộng
 * nhánh này — giữ hai nguồn sự thật song song là đúng thứ nó từng gây ra.
 */
export function getSessionPhase(item: SessionOverviewItem, now: number): SessionPhase {
  if (item.status === 'draft' || item.status === 'cancelled') {
    return item.status;
  }
  if (item.status === 'collecting') {
    return 'collecting';
  }
  if (item.status === 'completed') {
    return 'ended';
  }

  const start = new Date(item.startTime).getTime();
  const end = new Date(item.endTime).getTime();
  if (now <= end) {
    return now < start ? 'upcoming' : 'running';
  }
  // `active` mà đồng hồ đã qua endTime: lượt quét chưa kịp tick (tối đa
  // 30 giây). Hiện 'collecting' ngay thay vì để 'running' sai trong lúc chờ.
  return now <= end + SUBMISSION_GRACE_MS ? 'collecting' : 'ended';
}
```

- [ ] **Step 4: Chạy test lại**

Run: `pnpm --filter web test -- submission-attention`
Expected: PASS.

- [ ] **Step 5: Thêm hàm API + hook**

Trong `apps/web/src/lib/api/exam-session.ts`:

```typescript
export interface RecollectResult {
  missing: number;
  acknowledged: number;
  unreachable: number;
  unreachableNames: string[];
}

export async function confirmSessionEnd(id: string): Promise<void> {
  const { error, response } = await apiClient.POST('/exam-sessions/{id}/confirm-end', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}

export async function recollectSubmissions(id: string): Promise<RecollectResult> {
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/recollect', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
  return data as unknown as RecollectResult;
}
```

Trong `apps/web/src/hooks/useExamSession.ts`, thêm `useConfirmSessionEnd()` và `useRecollect()` theo đúng khuôn mutation đã có trong file (invalidate query của phiên sau khi thành công).

- [ ] **Step 6: Viết test component**

```typescript
// CollectionPhaseActions.test.tsx
it('nút Thu lại mang số em còn thiếu', () => {
  render(<CollectionPhaseActions {...props} missingCount={5} />);
  expect(screen.getByRole('button', { name: /thu lại \(5\)/i })).toBeEnabled();
});

it('không ai thiếu thì disabled kèm giải thích, KHÔNG ẩn', () => {
  // Ẩn đi làm giảng viên tưởng tính năng hỏng.
  render(<CollectionPhaseActions {...props} missingCount={0} />);
  expect(screen.getByRole('button', { name: /thu lại/i })).toBeDisabled();
  expect(screen.getByText(/tất cả đã nộp đủ/i)).toBeInTheDocument();
});

it('sau khi thu lại, hiện TÊN những máy không phản hồi', async () => {
  // Danh sách tên là phần giảng viên hành động dựa vào, không phải con số.
  recollectMock.mockResolvedValue({
    missing: 3, acknowledged: 1, unreachable: 2,
    unreachableNames: ['Nguyễn Văn A', 'Trần Thị B'],
  });
  render(<CollectionPhaseActions {...props} missingCount={3} />);

  fireEvent.click(screen.getByRole('button', { name: /thu lại/i }));

  expect(await screen.findByText(/Nguyễn Văn A/)).toBeInTheDocument();
  expect(screen.getByText(/Trần Thị B/)).toBeInTheDocument();
});

it('hộp xác nhận nói rõ là KHÔNG chặn bài đang về', async () => {
  // Chống đúng cách hiểu sai mà quyết định (a) tạo ra.
  render(<CollectionPhaseActions {...props} />);
  fireEvent.click(screen.getByRole('button', { name: /xác nhận kết thúc/i }));
  expect(await screen.findByText(/không chặn bài đang về/i)).toBeInTheDocument();
});

it('chỉ hiện khi phiên đang collecting', () => {
  const { container } = render(<CollectionPhaseActions {...props} status="active" />);
  expect(container).toBeEmptyDOMElement();
});
```

- [ ] **Step 7: Chạy để thấy fail**

Run: `pnpm --filter web test -- CollectionPhaseActions`
Expected: FAIL — chưa có component.

- [ ] **Step 8: Viết component**

Hai nút cạnh nhau, chỉ render khi `status === 'collecting'`. Nút "Thu lại" mang `missingCount`, disabled kèm dòng "Tất cả đã nộp đủ" khi bằng 0. Nút "Xác nhận kết thúc" mở `Dialog` với nội dung:

> Phiên chuyển sang **Đã kết thúc**. Bài nộp vẫn tiếp tục được nhận tới {HH:mm} (30 phút sau giờ thi) — xác nhận **không chặn bài đang về**.

Sau khi thu lại, render `Alert` với `{acknowledged}/{missing} máy đã nhận yêu cầu.` và, khi `unreachable > 0`, danh sách `unreachableNames`.

Kèm mốc `tính đến HH:mm:ss` cạnh `missingCount`, lấy từ thời điểm dữ liệu về. Khi socket rớt, mốc đứng yên và giảng viên **nhìn thấy** là nó đứng, thay vì tin vào một con số chết.

- [ ] **Step 9: Chạy test lại**

Run: `pnpm --filter web test -- CollectionPhaseActions`
Expected: PASS.

- [ ] **Step 10: Gắn vào trang phiên**

Trong `apps/web/src/app/(exam-live)/exam-sessions/[id]/page.tsx`, render `<CollectionPhaseActions>` cạnh `FinalizeSessionButton` đã có. `missingCount` lấy từ `attendance`/overview đã fetch sẵn trên trang; làm mới theo sự kiện socket bài-nộp-về mà trang đã đăng ký, không thêm polling.

Thêm dòng §7.3 khi `completedBy !== null` và có bài nộp sau `completedAt`:

> Có {N} sinh viên nộp bài sau khi bạn xác nhận kết thúc.

Đếm **sinh viên**, không đếm file: một em nộp 2 file sau xác nhận là `N = 1`.

- [ ] **Step 11: Chạy toàn bộ test web + build**

Run: `pnpm --filter web test && pnpm --filter web build`
Expected: PASS cả hai. Chú ý `exam-sessions/[id]/page.test.tsx` — nó có thể đang khẳng định `FinalizeSessionButton` là nút duy nhất.

- [ ] **Step 12: Chạy toàn bộ e2e lần cuối**

Run: `cd apps/api && pnpm test:e2e`
Expected: PASS toàn bộ.

- [ ] **Step 13: Commit**

```bash
git add apps/web/src
git commit -m "feat(web): collecting-phase actions on the exam room screen

getSessionPhase now reads collecting and completed straight from
status instead of inferring from the clock. The inference branch
survives only for sessions completed before this shipped, and says so
— keeping two sources of truth in parallel is what it caused before.

The confirm dialog states that confirming does not block uploads still
arriving, which is the misreading that choosing 'do not block' invites.
The re-collect result leads with the names of machines that did not
answer, not the count: the names are what the invigilator acts on."
```

---

## Self-Review Notes

**Spec coverage:** §3 vòng đời → Task 2. §3.1 không chặn upload → Task 2 Step 1 (ca "sau xác nhận, trong grace"). §4 migration → Task 1. §4.2 `completed_by` → Task 1 + Task 2. §4.3 đua → Task 2 Step 1 + Step 5. §5 ba guard + predicate → Task 1 Step 7, Task 2 Step 8. §6 "Thu lại" → Task 3 + Task 4. §6.5 409 → Task 3. §7 UI → Task 5. §7.3 dòng cảnh báo → Task 5 Step 10. §9.5 chốt sớm → Task 2 Step 1 (ca "chốt bài sớm"). §10 bảng test → phân bổ hết vào Task 2 và 3. **Không mục nào của spec thiếu task.**

**Ngoài phạm vi, đúng như spec:** `submission_status`/`vắng thi` (Plan C Task 3), nới `agent:join` (§9.2), đổi tên `exam:finalize` (§2), đổi tên trạng thái file 0 byte (§2).

**Type consistency:** `RecollectResult` khai một lần ở `recollect.types.ts` (Task 3) và được sao đúng hình dạng sang `lib/api/exam-session.ts` (Task 5) — bốn trường, cùng tên. `RecollectAck { ok: boolean }` khớp giữa gateway (Task 3), agent (Task 4) và test. `isExamOver`/`isCollectionOpen` đặt tên nhất quán từ Task 1 tới Task 2. `sweepExpiredCollection(now)` cùng một tên ở scheduler (Task 2 Step 6) và test (Task 2 Step 1).

**Một chỗ plan này cố ý không quyết thay người implement:** Task 4 Step 3 nói "nếu đường upload đang inline trong handler `exam:finalize` thì tách ra trước". Tôi chưa đọc hết `session-controller.ts` nên không biết nó đã tách sẵn chưa — người làm đọc rồi quyết, và lý do phải tách (hai bản sao sẽ lệch nhau) đã ghi ngay tại đó.
