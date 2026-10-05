# Plan F — Sửa và huỷ phiên thi (API)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Giảng viên **sửa** một phiên thi (tên, phòng, giờ, loại kỳ thi) **trước giờ bắt đầu** và **huỷ** một phiên chưa có ai vào — hai việc mà hôm nay không có route nào làm, nên một phiên tạo sai phòng hay sai giờ chỉ còn cách tạo phiên mới trong khi phiên cũ vẫn giữ phòng, lớp và quãng giãn cách 30 phút của giảng viên (nên phiên mới bị 409).

**Architecture:** Một service **mới** `ExamSessionEditService` (không nhét vào `ExamSessionService` đang ~800 dòng, vượt xa ngưỡng 500 của CLAUDE.md) với hai phương thức `update` và `cancel`, và các luật **thuần** (cửa sổ sửa, kiểm giờ, trạng thái huỷ) tách ra `exam-session-edit.rules.ts` để test không cần DB. Cả hai ghi bằng **một câu `UPDATE` có điều kiện** (`status = 'active'`, `start_time > now()` / không có sự kiện kết nối) rồi kiểm số dòng bị ảnh hưởng, nên cửa sổ không bị vượt giữa lúc đọc và lúc ghi; ràng buộc exclusion của DB vẫn là thẩm quyền cuối. Mỗi lần ghi để lại một dòng `audit_log` cùng giao dịch.

**Tech Stack:** NestJS 10, TypeORM 0.3, Postgres 16 (EXCLUDE), class-validator, jest (unit + e2e), socket.io-client (một ca e2e).

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §4 (hai route), §4.1 (toàn bộ, gồm quyết định **phương án A** của chủ đồ án ngày 05/10), §4.2 (hai hành động audit), §11: T-SES-1 … T-SES-10 (T-SES-11 là web, thuộc plan G3). Nhắc lại từ plan D3: `ScheduleConflictService.assertNone` đã nhận đối tượng `{ roomId, classId, teacherId, startTime, endTime, excludeSessionId? }`; `RoomService.requireActiveForNewSession` đã có.

**Phụ thuộc:** plan C (cột `room_id`, `RoomService`), plan D3 (`assertNone` có `excludeSessionId`, `seedExamSession({ withoutRoom })`, `sessionBody` gửi `roomId`), plan B (`audit-describe` — câu tiếng Việt của hai hành động mới thuộc plan G1, không ở đây).

## Global Constraints

- **Hai route, đều `@Roles('teacher')`:** `PATCH /exam-sessions/:id` và `POST /exam-sessions/:id/cancel`. Kiểm chủ phiên bằng `findEntityForOwner` (404 khi không có, 403 khi của người khác). Admin → 403 (route chỉ cho `teacher`; chuyển chủ vẫn là `PATCH :id/teacher` của admin).
- **Cửa sổ sửa (phương án A, đã chốt): `status = 'active'` VÀ `now < start_time`.** Ngoài cửa sổ → `409` kèm câu "Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được." (hoặc câu theo trạng thái). Lý do không có ngoại lệ "đổi phòng giữa giờ": tên phòng được dựng vào tên file ở **hai thời điểm** (lúc vào phòng và lúc nộp) nên đổi giữa chừng làm sinh viên đã vào dưới phòng cũ bị kiểm file nén lệch oan. Phương án B (đổi chỉ phòng sau giờ bắt đầu khi không file nào dùng `{PHONG}`) **không làm**; nếu sau này cần, đó là thay đổi cục bộ ở `ExamSessionEditService.update`.
- **Trường sửa được (đều tuỳ chọn):** `name`, `roomId`, `startTime`, `endTime`, `examType`. **Không** sửa được: lớp, danh sách file bắt buộc, giảng viên, học kỳ (suy từ lớp), `rubricId` (đã có route riêng), và các trường chụp. Gửi bất kỳ trường cấm nào (`classId`, `requiredFilenames`, `teacherId`, `rubricId`, `semesterName`, `roomName`) là **`400`** nêu "huỷ phiên và tạo lại" — **không** lặng lẽ bỏ qua như `whitelist` làm với trường lạ, vì một client tưởng đã đổi lớp mà không báo lỗi là tệ hơn một lỗi. Thân không có trường nào hợp lệ → `400`. Gửi đúng giá trị hiện có → `200` không ghi gì, không audit.
- **Thứ tự kiểm** (lỗi đầu vào trước, xung đột sau — như `create`): 404/403 → `409` cửa sổ → `400` giờ (cặp **sau khi sửa**, kể cả khi chỉ gửi một đầu) → `400` phòng mới không `is_active` → `409` va chạm (`assertNone` với `excludeSessionId` = chính phiên này). Chỉ kiểm va chạm khi **phòng hoặc giờ đổi**: sửa tên không cần.
- **Giờ dùng chung luật tạo phiên** (hằng số xuất từ `create-exam-session.dto.ts`): ít nhất `MIN_EXAM_DURATION_MINUTES` (15) phút, `startTime` không lùi quá `MAX_BACKDATE_MINUTES` (30) phút so với hiện tại; giãn cách 30 phút giữa hai phiên của giảng viên do `assertNone` + ràng buộc DB lo.
- **Đổi `roomId`:** phòng mới phải `is_active`; **giữ** phòng đã ngừng hoạt động (không gửi `roomId`, hoặc gửi đúng phòng hiện tại) thì **không** kiểm `is_active` (T-SES-6). Cột chụp `room_name` cập nhật **trong cùng câu `UPDATE`** (cột này không mang `update: false`); `semester_name` thì có và không đổi. Phiên cũ chưa có `room_id` (trước backfill, plan H) mà đổi giờ không kèm `roomId` → `400` bảo chọn phòng trong danh sách (sửa tên thì được).
- **Ghi nguyên tử:** `UPDATE … WHERE id AND status = 'active' AND start_time > now()` rồi kiểm `affected`; `0` dòng → `409` cùng câu của cửa sổ. Danh sách dự thi đã đóng băng (nếu giảng viên đã bấm "Mở phiên thi") **giữ nguyên**: nó không phụ thuộc giờ.
- **Huỷ:** điều kiện `status = 'active'` **và** không có dòng `agent_connection_event` nào của phiên **và** không có bài `collected`. Thoả → `cancelled`; không thoả vì đã có người vào → `409` "Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc"; không thoả vì trạng thái → `409` theo trạng thái. Điều kiện nằm **trong câu `UPDATE`** (cùng giao dịch với audit). Huỷ phiên đã `cancelled` là `200` idempotent (như `finalize`), không audit lần hai. Phiên **không khôi phục được**; các dòng `session_roster` và `submission not_submitted` đã gieo thì **giữ nguyên**. Không thêm cột `cancelled_at`/`cancelled_by`: ai/khi nào/vì sao nằm ở `audit_log`.
- **Lý do huỷ (tuỳ chọn):** thân `{ reason?: string }` (≤ 200 ký tự sau khi cắt khoảng trắng) được ghi vào `audit_log.new_value.reason` nếu có — spec §4.1 nói "ai huỷ, khi nào **và lý do** nằm trong `audit_log`". Không bắt buộc, không có cột riêng; giao diện (G3) quyết định có hỏi hay không.
- **Audit:** `exam_session.update` (`oldValue`/`newValue` chỉ gồm **đúng các trường đổi**: `name`, `room` (tên phòng), `startTime`, `endTime`, `examType`) và `exam_session.cancel` (`oldValue { status: 'active' }`, `newValue { status: 'cancelled', reason? }`); cả hai mang `newValue.targetLabel` (tên phiên sau khi sửa) và `newValue.code`, `targetType = 'exam_session'`, `targetId` = id phiên, **cùng giao dịch** với thay đổi. Thất bại không để lại dòng nào.
- **Không phát sự kiện socket:** huỷ yêu cầu chưa ai vào (không có agent nào đang kết nối) và sửa yêu cầu chưa bắt đầu (`agent:join` chỉ nhận sau `start_time`), nên không có ai để báo. Màn hình giảng viên làm mới bằng truy vấn.
- Hành vi **sẵn có** với phiên `cancelled` được khoá bằng test mới, không viết lại: `agent:join` trả `SESSION_NOT_ACTIVE`; gắn đề đã bị từ chối (đã có test ở `exam-authoring-attach.e2e-spec.ts`); nộp bài không với tới được vì mọi đường nộp bài phải qua `agent:join`. Không đổi `ExamSessionService`, scheduler, hay gateway.
- Chạy e2e theo plan A (Docker `cine-*`, `.env.test`, `--runInBand`). **Không dọn** phiên đã tạo: `agent_connection_event` là append-only và khoá ngoại `RESTRICT` nên không xoá được phiên có sự kiện; dùng tên mang hậu tố ngẫu nhiên (cùng tiền lệ `grading-seed.ts`).

## Review Focus

1. **Sửa tự va chạm với chính nó.** Dời giờ một phiên sang khoảng **chồng lên khoảng cũ của nó** (cùng phòng, cùng lớp, cùng giảng viên) bị chính ba phép kiểm báo trùng nếu không loại trừ. → ca `8:00–10:00 → 9:00–11:00` phải `200` (T-SES-2); và một phiên **khác** cùng phòng vẫn bị phát hiện (đã có ở D3, giữ).
2. **Cửa sổ bị vượt giữa lúc đọc và lúc ghi.** Đọc `start_time` rồi `UPDATE` vô điều kiện thì một phiên vừa bắt đầu vẫn bị sửa. → `UPDATE … AND start_time > now()`; ca "dời giờ vào quá khứ ≤ 30 phút rồi sửa lần nữa" phải `409` (cửa sổ đóng ngay sau lần sửa đầu).
3. **Chỉ gửi một đầu thời gian.** `{ endTime }` mà kiểm trên giá trị gửi thôi sẽ cho qua một khoảng 10 phút (start cũ + end mới). → kiểm trên cặp sau khi sửa (T-SES-5).
4. **Huỷ phiên mà đã có người vào / đã có bài `collected`** (mất bằng chứng), hoặc huỷ phiên đang thu bài. → ba điều kiện nằm trong `UPDATE`; ca có sự kiện, ca có bài, ca `collecting` đều `409` và trạng thái không đổi (T-SES-8).
5. **Phiên huỷ vẫn giữ phòng/lớp/giãn cách.** → tạo ngay phiên mới cùng lớp, phòng, giờ phải `201` (T-SES-7).
6. **Trường cấm bị bỏ qua lặng lẽ**, hoặc thân rỗng để lại dòng audit vô nghĩa. → `400` từng trường cấm; `400` thân rỗng; `200` không audit khi không có gì đổi.
7. **Giữ phòng đã ngừng hoạt động bị chặn nhầm** (admin tắt phòng sau khi phiên được tạo, giảng viên chỉ sửa tên). → T-SES-6 cả hai chiều.
8. **Giảng viên khác / admin sửa hoặc huỷ.** → `403` cho cả hai route (T-SES-4), kể cả phiên không tồn tại là `404`.

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/exam-session/exam-session-edit.rules.ts` (+ `.spec.ts`) | **Mới.** Luật thuần: cửa sổ sửa, kiểm giờ, điều kiện trạng thái huỷ. |
| `apps/api/src/exam-session/dto/update-exam-session.dto.ts` | **Mới.** `UpdateExamSessionDto`, `CancelExamSessionDto`. |
| `apps/api/src/exam-session/dto/create-exam-session.dto.ts` | Xuất `EXAM_TYPES` (một từ khoá `export`). |
| `apps/api/src/exam-session/exam-session-edit.service.ts` | **Mới.** `update`, `cancel`. |
| `apps/api/src/exam-session/exam-session.controller.ts`, `exam-session.module.ts` | Thêm hai route; đăng ký service. |
| `apps/api/test/exam-session-edit.e2e-spec.ts` | **Mới.** |
| `packages/shared/src/api/schema.d.ts` | Sinh lại. |

---

### Task 1: Luật thuần (cửa sổ sửa, kiểm giờ, điều kiện huỷ)

**Files:**
- Create: `apps/api/src/exam-session/exam-session-edit.rules.ts`
- Test: `apps/api/src/exam-session/exam-session-edit.rules.spec.ts`

**Interfaces:**
- Consumes: `MIN_EXAM_DURATION_MINUTES`, `MAX_BACKDATE_MINUTES` (`./dto/create-exam-session.dto`).
- Produces:

```ts
export function editWindowProblem(session: { status: string; startTime: Date }, now: Date): string | null;
export function timeProblems(startTime: Date, endTime: Date, now: Date): string[];
export function cancelStatusProblem(status: string): string | null;
export const CANCEL_HAS_PRESENCE_MESSAGE: string;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/api/src/exam-session/exam-session-edit.rules.spec.ts`:

```ts
import {
  CANCEL_HAS_PRESENCE_MESSAGE,
  cancelStatusProblem,
  editWindowProblem,
  timeProblems,
} from './exam-session-edit.rules';

const NOW = new Date('2026-10-05T08:00:00.000Z');
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000);

describe('editWindowProblem', () => {
  it('active và CHƯA tới giờ bắt đầu: sửa được', () => {
    expect(editWindowProblem({ status: 'active', startTime: minutes(1) }, NOW)).toBeNull();
    expect(editWindowProblem({ status: 'active', startTime: minutes(60 * 24 * 30) }, NOW)).toBeNull();
  });

  it('đúng giờ bắt đầu thì ĐÃ hết cửa sổ (now < start là điều kiện, không phải now <= start)', () => {
    expect(editWindowProblem({ status: 'active', startTime: NOW }, NOW)).toMatch(/đã bắt đầu/i);
  });

  it('đã bắt đầu: nêu cách thoát (huỷ nếu chưa ai vào)', () => {
    const message = editWindowProblem({ status: 'active', startTime: minutes(-5) }, NOW);
    expect(message).toBe('Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.');
  });

  it.each([
    ['collecting', /thu bài/i],
    ['completed', /kết thúc/i],
    ['cancelled', /huỷ/i],
  ])('trạng thái %s: không sửa được, câu nói đúng trạng thái', (status, pattern) => {
    expect(editWindowProblem({ status, startTime: minutes(60) }, NOW)).toMatch(pattern);
  });

  it('trạng thái lạ (draft/scheduled — không tồn tại trong dữ liệu thật) vẫn bị từ chối', () => {
    expect(editWindowProblem({ status: 'draft', startTime: minutes(60) }, NOW)).toMatch(/draft/);
  });
});

describe('timeProblems', () => {
  it('khoảng hợp lệ: không có vấn đề', () => {
    expect(timeProblems(minutes(60), minutes(120), NOW)).toEqual([]);
  });

  it('đúng 15 phút thì đủ; 14 phút thì thiếu', () => {
    expect(timeProblems(minutes(60), minutes(75), NOW)).toEqual([]);
    expect(timeProblems(minutes(60), minutes(74), NOW)).toEqual([expect.stringMatching(/15 phút/)]);
  });

  it('kết thúc không sau bắt đầu: một vấn đề (không chồng thêm "quá ngắn")', () => {
    expect(timeProblems(minutes(60), minutes(60), NOW)).toEqual([expect.stringMatching(/sau giờ bắt đầu/)]);
    expect(timeProblems(minutes(60), minutes(30), NOW)).toEqual([expect.stringMatching(/sau giờ bắt đầu/)]);
  });

  it('lùi giờ bắt đầu tối đa 30 phút: 30 thì được, 31 thì không', () => {
    expect(timeProblems(minutes(-30), minutes(60), NOW)).toEqual([]);
    expect(timeProblems(minutes(-31), minutes(60), NOW)).toEqual([expect.stringMatching(/30 phút/)]);
  });

  it('gom mọi vấn đề thay vì dừng ở vấn đề đầu', () => {
    // Lùi quá 30 phút VÀ khoảng quá ngắn.
    expect(timeProblems(minutes(-60), minutes(-50), NOW)).toHaveLength(2);
  });
});

describe('cancelStatusProblem', () => {
  it('chỉ phiên active mới huỷ được', () => {
    expect(cancelStatusProblem('active')).toBeNull();
  });

  it.each([
    ['collecting', /thu bài/i],
    ['completed', /kết thúc/i],
  ])('trạng thái %s: không huỷ được và chỉ tới Chốt bài ngay / Xác nhận kết thúc', (status, pattern) => {
    expect(cancelStatusProblem(status)).toMatch(pattern);
  });

  it('câu "đã có người vào" nêu hai nút cần bấm', () => {
    expect(CANCEL_HAS_PRESENCE_MESSAGE).toBe(
      'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc.',
    );
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest src/exam-session/exam-session-edit.rules.spec.ts`
Expected: FAIL — không import được `./exam-session-edit.rules`.

- [ ] **Step 3: Viết luật**

Create `apps/api/src/exam-session/exam-session-edit.rules.ts`:

```ts
import { MAX_BACKDATE_MINUTES, MIN_EXAM_DURATION_MINUTES } from './dto/create-exam-session.dto';

/**
 * Luật sửa và huỷ phiên thi (spec §4.1) — hàm THUẦN, để các ca biên (đúng giờ bắt đầu, đúng 15 phút, đúng 30 phút) test được
 * mà không cần DB, và để `ExamSessionEditService` chỉ còn việc điều phối.
 */

/**
 * Lý do KHÔNG sửa được, hoặc `null` nếu sửa được. Cửa sổ là `status = 'active'` VÀ `now < start_time` (phương án A, chủ đồ
 * án chốt 05/10): trong cửa sổ này chắc chắn chưa ai vào phòng vì `agent:join` chỉ nhận sau `start_time`. `now < start`, không
 * phải `<=`: đúng giờ bắt đầu là lúc `agent:join` bắt đầu nhận.
 */
export function editWindowProblem(session: { status: string; startTime: Date }, now: Date): string | null {
  if (session.status === 'active') {
    return now.getTime() < session.startTime.getTime()
      ? null
      : 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.';
  }
  switch (session.status) {
    case 'collecting':
      return 'Phiên đang thu bài nên không sửa được.';
    case 'completed':
      return 'Phiên đã kết thúc nên không sửa được.';
    case 'cancelled':
      return 'Phiên đã bị huỷ nên không sửa được.';
    default:
      return `Phiên ở trạng thái "${session.status}" nên không sửa được.`;
  }
}

/**
 * Các vấn đề của cặp (bắt đầu, kết thúc) SAU KHI sửa — cùng luật với tạo phiên (`create-exam-session.dto.ts`): kết thúc sau
 * bắt đầu, ít nhất 15 phút, bắt đầu không lùi quá 30 phút. Kiểm trên CẶP chứ không trên từng trường được gửi: `{ endTime }`
 * một mình ghép với `start_time` cũ có thể ra một khoảng 10 phút mà từng giá trị riêng đều trông hợp lệ.
 *
 * "Quá ngắn" không được báo chồng lên "kết thúc không sau bắt đầu" — cùng quy ước với `HasMinimumDurationConstraint`.
 */
export function timeProblems(startTime: Date, endTime: Date, now: Date): string[] {
  const problems: string[] = [];
  const start = startTime.getTime();
  const end = endTime.getTime();
  if (end <= start) {
    problems.push('Giờ kết thúc phải sau giờ bắt đầu.');
  } else if (end - start < MIN_EXAM_DURATION_MINUTES * 60_000) {
    problems.push(`Phiên thi phải kéo dài ít nhất ${MIN_EXAM_DURATION_MINUTES} phút.`);
  }
  if (start < now.getTime() - MAX_BACKDATE_MINUTES * 60_000) {
    problems.push(`Giờ bắt đầu không được lùi quá ${MAX_BACKDATE_MINUTES} phút so với hiện tại.`);
  }
  return problems;
}

export const CANCEL_HAS_PRESENCE_MESSAGE =
  'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc.';

/** Lý do KHÔNG huỷ được vì TRẠNG THÁI, hoặc `null`. Điều kiện "đã có người vào" được kiểm riêng, ngay trong câu `UPDATE`. */
export function cancelStatusProblem(status: string): string | null {
  switch (status) {
    case 'active':
      return null;
    case 'collecting':
      return 'Phiên đang thu bài nên không huỷ được — hãy Xác nhận kết thúc khi xong.';
    case 'completed':
      return 'Phiên đã kết thúc nên không huỷ được.';
    default:
      return `Phiên ở trạng thái "${status}" nên không huỷ được.`;
  }
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/api && npx jest src/exam-session/exam-session-edit.rules.spec.ts`
Expected: PASS. Ca "gom mọi vấn đề": khoảng `(-60, -50)` phút vừa lùi quá 30 phút vừa dài 10 phút (<15) nên có đúng hai vấn đề.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/exam-session/exam-session-edit.rules.ts apps/api/src/exam-session/exam-session-edit.rules.spec.ts
git commit -m "feat(sessions): luật thuần cho sửa/huỷ phiên thi (cửa sổ trước giờ bắt đầu, kiểm giờ trên cặp, điều kiện huỷ)"
```

---

### Task 2: e2e cho sửa và huỷ (đỏ)

**Files:**
- Create: `apps/api/test/exam-session-edit.e2e-spec.ts`

**Interfaces:**
- Consumes: `seedClass`, `seedExamSession({ withoutRoom })`, `sessionBody`, `ensureRoom` (D3), `createTestAccount`, `releaseTeacherSessions`, `randomTag`, `PATCH /exam-sessions/:id`, `POST /exam-sessions/:id/cancel`.
- Produces: các test mà Task 3 phải làm xanh.

- [ ] **Step 1: Viết e2e**

Create `apps/api/test/exam-session-edit.e2e-spec.ts`:

```ts
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
    for (const socket of sockets) {
      socket.removeAllListeners();
      socket.disconnect();
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
    await app.close();
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
```

Ghi chú về hai chỗ hay vỡ khi chép:
- Ca "thất bại không để lại dòng audit" dùng `windowAt(0, 0, 0).endTime` (giờ kết thúc = 00:00 UTC hôm nay, nằm **trước** `startTime` 8:00 của phiên) để ép `400` mà không cần thêm helper.
- `old_value`/`new_value` ghi `startTime`/`endTime` ở dạng `Date#toISOString()` — đúng chuỗi mà `windowAt` đã sinh ra nên so thẳng; `iso()` chỉ dùng khi so với cột `to_char` của DB (không có mili-giây). Ca "mở phiên thi" dựa vào `openSession` (helper có sẵn) và `seedEnrollment` (lớp phải có ít nhất một sinh viên, nếu không route `open` trả 400).

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/exam-session-edit.e2e-spec.ts`
Expected: FAIL — `PATCH /exam-sessions/:id` và `POST /exam-sessions/:id/cancel` trả 404 (route chưa có).

---

### Task 3: DTO, service, route (xanh)

**Files:**
- Create: `apps/api/src/exam-session/dto/update-exam-session.dto.ts`, `apps/api/src/exam-session/exam-session-edit.service.ts`
- Modify: `apps/api/src/exam-session/dto/create-exam-session.dto.ts`, `apps/api/src/exam-session/exam-session.controller.ts`, `apps/api/src/exam-session/exam-session.module.ts`

**Interfaces:**
- Consumes: Task 1; `ExamSessionService.findEntityForOwner`, `findByIdForOwner`; `RoomService.requireActiveForNewSession` (D3/C); `ScheduleConflictService.assertNone` (D3); `AuditLogService.recordUserAction(input, manager)`.
- Produces:

```ts
class ExamSessionEditService {
  update(id: string, teacherId: string, dto: UpdateExamSessionDto): Promise<ExamSessionResponseDto>;
  cancel(id: string, teacherId: string, dto: CancelExamSessionDto): Promise<ExamSessionResponseDto>;
}
// Routes (teacher): PATCH /exam-sessions/:id · POST /exam-sessions/:id/cancel (200)
```

- [ ] **Step 1: Xuất `EXAM_TYPES`**

Trong `apps/api/src/exam-session/dto/create-exam-session.dto.ts` đổi `const EXAM_TYPES: ExamType[] = ['TK', 'GK', 'CK'];` thành `export const EXAM_TYPES: ExamType[] = ['TK', 'GK', 'CK'];` (một từ khoá; để DTO sửa dùng chung đúng danh sách).

- [ ] **Step 2: Viết DTO**

Create `apps/api/src/exam-session/dto/update-exam-session.dto.ts`:

```ts
import { Transform } from 'class-transformer';
import { IsEmpty, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';
import type { ExamType } from '../entities/exam-session.entity';
import { EXAM_TYPES } from './create-exam-session.dto';

const CANNOT_EDIT = (what: string) =>
  `Không sửa được ${what} của phiên thi — hãy huỷ phiên và tạo lại.`;

/**
 * Sửa một phiên thi TRƯỚC giờ bắt đầu (spec §4.1). Mọi trường tuỳ chọn; các trường cấm được KHAI BÁO với `@IsEmpty` thay vì
 * để `whitelist` lặng lẽ cắt: một client tưởng đã đổi lớp mà không nhận lỗi nào là tệ hơn một lỗi, vì giảng viên sẽ vào phòng
 * thi với phiên sai lớp. `@IsEmpty` cũng giữ trường đó trong danh sách trắng nên `ValidationPipe` thấy nó và báo.
 *
 * Giờ KHÔNG kiểm ở đây: luật "kết thúc sau bắt đầu / tối thiểu 15 phút" cần CẶP giá trị, mà một thân chỉ gửi một đầu thì phải
 * lấy đầu kia từ bản ghi — nên `exam-session-edit.rules.ts` kiểm sau khi ghép.
 */
export class UpdateExamSessionDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  /** Phòng thi: chọn trong phòng đang hoạt động. Không gửi nghĩa là giữ phòng hiện tại (kể cả khi nó đã bị tắt). */
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsISO8601()
  startTime?: string;

  @IsOptional()
  @IsISO8601()
  endTime?: string;

  @IsOptional()
  @IsIn(EXAM_TYPES)
  examType?: ExamType;

  // ---- Trường cấm: có mặt là 400 -------------------------------------------------------------------------------

  @IsEmpty({ message: CANNOT_EDIT('lớp') })
  classId?: unknown;

  @IsEmpty({ message: CANNOT_EDIT('danh sách file bắt buộc nộp') })
  requiredFilenames?: unknown;

  @IsEmpty({ message: 'Đổi giảng viên của phiên thi là việc của quản trị viên.' })
  teacherId?: unknown;

  @IsEmpty({ message: 'Rubric của phiên thi đổi ở màn hình chấm điểm, không phải ở đây.' })
  rubricId?: unknown;

  @IsEmpty({ message: 'Học kỳ của phiên thi lấy từ lớp, không sửa được — hãy huỷ phiên và tạo lại.' })
  semesterName?: unknown;

  @IsEmpty({ message: 'Phòng thi được chọn bằng roomId trong danh sách phòng, không gõ tên.' })
  roomName?: unknown;
}

/** Huỷ một phiên thi. Lý do tuỳ chọn, chỉ để ghi vào `audit_log` (spec §4.1: "ai huỷ, khi nào và lý do"). */
export class CancelExamSessionDto {
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  reason?: string;
}
```

- [ ] **Step 3: Viết service**

Create `apps/api/src/exam-session/exam-session-edit.service.ts`:

```ts
import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { RoomService } from '../course/room.service';
import { CancelExamSessionDto, UpdateExamSessionDto } from './dto/update-exam-session.dto';
import { ExamSessionResponseDto } from './dto/exam-session-response.dto';
import { ExamSessionEntity } from './entities/exam-session.entity';
import {
  CANCEL_HAS_PRESENCE_MESSAGE,
  cancelStatusProblem,
  editWindowProblem,
  timeProblems,
} from './exam-session-edit.rules';
import { ExamSessionService } from './exam-session.service';
import { ScheduleConflictService } from './schedule-conflict.service';

/**
 * Sửa và huỷ phiên thi của giảng viên (spec §4.1). Tách khỏi `ExamSessionService` (đã vượt ngưỡng 500 dòng của CLAUDE.md) vì
 * đây là hai phép ghi có luật riêng; luật THUẦN nằm ở `exam-session-edit.rules.ts`.
 *
 * Cả hai ghi bằng MỘT câu `UPDATE` có điều kiện rồi kiểm số dòng bị ảnh hưởng, giống `finalizeExamSession`: đọc trước rồi ghi
 * vô điều kiện sẽ để một phiên vừa bắt đầu (hoặc vừa có người vào) vẫn bị sửa/huỷ. Các kiểm tra đọc-trước ở đây chỉ để cho
 * câu báo lỗi ĐỌC ĐƯỢC; điều kiện thật nằm trong câu `UPDATE`, và ràng buộc exclusion của DB vẫn là thẩm quyền cuối về chồng
 * lịch (vi phạm lọt qua → 23P01 → 409 chung qua `PostgresExceptionFilter`).
 */
@Injectable()
export class ExamSessionEditService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly examSessions: ExamSessionService,
    private readonly rooms: RoomService,
    private readonly scheduleConflicts: ScheduleConflictService,
    private readonly auditLog: AuditLogService,
  ) {}

  async update(id: string, teacherId: string, dto: UpdateExamSessionDto): Promise<ExamSessionResponseDto> {
    // 404 khi không có, 403 khi của người khác.
    const session = await this.examSessions.findEntityForOwner(id, teacherId);
    const now = new Date();

    const windowProblem = editWindowProblem(session, now);
    if (windowProblem) throw new ConflictException(windowProblem);

    if (
      dto.name === undefined &&
      dto.roomId === undefined &&
      dto.startTime === undefined &&
      dto.endTime === undefined &&
      dto.examType === undefined
    ) {
      throw new BadRequestException('Hãy gửi ít nhất một trường cần sửa: name, roomId, startTime, endTime hoặc examType.');
    }

    const next = {
      name: dto.name ?? session.name,
      examType: dto.examType ?? session.examType,
      startTime: dto.startTime ? new Date(dto.startTime) : session.startTime,
      endTime: dto.endTime ? new Date(dto.endTime) : session.endTime,
    };
    const roomChanged = dto.roomId !== undefined && dto.roomId !== session.roomId;
    const timeChanged =
      next.startTime.getTime() !== session.startTime.getTime() || next.endTime.getTime() !== session.endTime.getTime();
    const nameChanged = next.name !== session.name;
    const typeChanged = next.examType !== session.examType;
    if (!roomChanged && !timeChanged && !nameChanged && !typeChanged) {
      // Gửi đúng giá trị hiện có: không có gì để ghi, và một dòng audit "đổi X thành X" là nhiễu.
      return this.examSessions.findByIdForOwner(id, teacherId);
    }

    // Lỗi đầu vào (400) trước xung đột (409) — như `create`. Kiểm trên CẶP sau khi sửa, kể cả khi chỉ gửi một đầu.
    const problems = timeProblems(next.startTime, next.endTime, now);
    if (problems.length > 0) throw new BadRequestException(problems.join(' '));

    // Phòng MỚI phải đang hoạt động. Giữ phòng hiện tại — kể cả khi admin đã tắt nó sau khi phiên được tạo — thì không kiểm.
    const room = roomChanged ? await this.rooms.requireActiveForNewSession(dto.roomId!) : null;
    const roomId = room?.id ?? session.roomId;

    if (roomChanged || timeChanged) {
      if (roomId === null) {
        // Phiên tạo trước khi có danh sách phòng (chưa backfill, plan H): không có khoá để kiểm va chạm.
        throw new BadRequestException(
          'Phiên này được tạo trước khi có danh sách phòng nên chưa gắn phòng. Hãy chọn một phòng trong danh sách để đổi giờ.',
        );
      }
      // `excludeSessionId`: chính phiên này không được tính là va chạm với chính nó (một phiên dời sang khoảng chồng lên
      // khoảng cũ của nó sẽ báo trùng phòng, trùng lớp và vi phạm giãn cách với CHÍNH NÓ nếu thiếu tham số này).
      await this.scheduleConflicts.assertNone({
        roomId,
        classId: session.classId,
        teacherId: session.teacherId,
        startTime: next.startTime,
        endTime: next.endTime,
        excludeSessionId: session.id,
      });
    }

    await this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(ExamSessionEntity)
        .set({
          name: next.name,
          examType: next.examType,
          startTime: next.startTime,
          endTime: next.endTime,
          ...(room ? { roomId: room.id, roomName: room.name } : {}),
        })
        .where('id = :id', { id })
        .andWhere('status = :active', { active: 'active' })
        // Cửa sổ kiểm lại NGAY TRONG câu ghi: một phiên bắt đầu giữa lúc đọc và lúc ghi vẫn không bị sửa.
        .andWhere('start_time > now()')
        .execute();
      if ((result.affected ?? 0) === 0) {
        throw new ConflictException(
          'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.',
        );
      }

      const oldValue: Record<string, unknown> = {};
      const newValue: Record<string, unknown> = { targetLabel: next.name, code: session.code };
      if (nameChanged) {
        oldValue.name = session.name;
        newValue.name = next.name;
      }
      if (roomChanged) {
        oldValue.room = session.roomName;
        newValue.room = room!.name;
      }
      if (next.startTime.getTime() !== session.startTime.getTime()) {
        oldValue.startTime = session.startTime.toISOString();
        newValue.startTime = next.startTime.toISOString();
      }
      if (next.endTime.getTime() !== session.endTime.getTime()) {
        oldValue.endTime = session.endTime.toISOString();
        newValue.endTime = next.endTime.toISOString();
      }
      if (typeChanged) {
        oldValue.examType = session.examType;
        newValue.examType = next.examType;
      }
      await this.auditLog.recordUserAction(
        {
          actorId: teacherId,
          action: 'exam_session.update',
          targetType: 'exam_session',
          targetId: id,
          oldValue,
          newValue,
        },
        manager,
      );
    });

    return this.examSessions.findByIdForOwner(id, teacherId);
  }

  async cancel(id: string, teacherId: string, dto: CancelExamSessionDto): Promise<ExamSessionResponseDto> {
    const session = await this.examSessions.findEntityForOwner(id, teacherId);

    // Idempotent như `finalize`: huỷ lại một phiên đã huỷ không phải lỗi, và không ghi audit lần hai.
    if (session.status === 'cancelled') {
      return this.examSessions.findByIdForOwner(id, teacherId);
    }
    const statusProblem = cancelStatusProblem(session.status);
    if (statusProblem) throw new ConflictException(statusProblem);

    await this.dataSource.transaction(async (manager) => {
      // Cả ba điều kiện nằm TRONG câu `UPDATE`: một em vào phòng giữa lúc kiểm và lúc ghi vẫn chặn được việc huỷ. (Một lượt
      // join commit đúng giữa chừng câu lệnh có thể lọt qua dưới READ COMMITTED; cửa sổ đó cỡ mili-giây, hậu quả là một em
      // thấy phiên bị huỷ — chấp nhận, như đã chấp nhận ở `finalizeExamSession`.)
      const result = await manager
        .createQueryBuilder()
        .update(ExamSessionEntity)
        .set({ status: 'cancelled' })
        .where('id = :id', { id })
        .andWhere('status = :active', { active: 'active' })
        .andWhere('NOT EXISTS (SELECT 1 FROM examcollect.agent_connection_event e WHERE e.exam_session_id = :id)')
        .andWhere(
          `NOT EXISTS (SELECT 1 FROM examcollect.submission sub WHERE sub.exam_session_id = :id AND sub.status = 'collected')`,
        )
        .execute();
      if ((result.affected ?? 0) === 0) {
        throw new ConflictException(await this.whyNotCancellable(manager, id));
      }

      await this.auditLog.recordUserAction(
        {
          actorId: teacherId,
          action: 'exam_session.cancel',
          targetType: 'exam_session',
          targetId: id,
          oldValue: { status: 'active' },
          newValue: {
            targetLabel: session.name,
            code: session.code,
            status: 'cancelled',
            ...(dto.reason ? { reason: dto.reason } : {}),
          },
        },
        manager,
      );
    });

    return this.examSessions.findByIdForOwner(id, teacherId);
  }

  /** Câu báo lỗi sau khi `UPDATE` huỷ không khớp dòng nào: nói ĐÚNG lý do ở thời điểm này (đã có người vào, hay trạng thái đổi). */
  private async whyNotCancellable(manager: EntityManager, id: string): Promise<string> {
    const [row] = await manager.query(
      `SELECT s.status,
              EXISTS (SELECT 1 FROM examcollect.agent_connection_event e WHERE e.exam_session_id = s.id) AS "hasEvents",
              EXISTS (SELECT 1 FROM examcollect.submission sub WHERE sub.exam_session_id = s.id AND sub.status = 'collected') AS "hasCollected"
         FROM examcollect.exam_session s WHERE s.id = $1`,
      [id],
    );
    if (row.status === 'active' && (row.hasEvents || row.hasCollected)) {
      return CANCEL_HAS_PRESENCE_MESSAGE;
    }
    return cancelStatusProblem(row.status) ?? CANCEL_HAS_PRESENCE_MESSAGE;
  }
}
```

- [ ] **Step 4: Thêm hai route và đăng ký**

Trong `apps/api/src/exam-session/exam-session.controller.ts`:

1. Thêm import:
```ts
import { ExamSessionEditService } from './exam-session-edit.service';
import { CancelExamSessionDto, UpdateExamSessionDto } from './dto/update-exam-session.dto';
```
2. Thêm vào constructor (sau `sessionRoster`): `private readonly editor: ExamSessionEditService,`
3. Thêm hai handler ngay sau `findOne` (trước khối doc của `reassignTeacher`):

```ts
  /**
   * Sửa phiên thi TRƯỚC giờ bắt đầu — tên, phòng, giờ, loại kỳ thi (spec §4.1). Chỉ chủ phiên; admin → 403 vì route chỉ cho
   * `teacher` (admin chuyển chủ bằng `PATCH :id/teacher`). `ParseUUIDPipe`: một id sai dạng thành 22P02 mà
   * `PostgresExceptionFilter` không ánh xạ, và route ghi mới không nên mang lỗi đó (cùng lý do với `finalize`).
   */
  @Patch(':id')
  @Roles('teacher')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateExamSessionDto, @Req() req: Request) {
    return this.editor.update(id, req.user!.sub, dto);
  }

  /**
   * Huỷ phiên chưa có ai vào. 200 và idempotent như `finalize`: huỷ lại một phiên đã huỷ trả về cùng trạng thái.
   */
  @Post(':id/cancel')
  @Roles('teacher')
  @HttpCode(200)
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelExamSessionDto, @Req() req: Request) {
    return this.editor.cancel(id, req.user!.sub, dto);
  }
```

Trong `apps/api/src/exam-session/exam-session.module.ts`: thêm `import { ExamSessionEditService } from './exam-session-edit.service';` và đưa `ExamSessionEditService` vào `providers` (module đã import `CourseModule` — nơi xuất `RoomService` — và `AdminModule` — nơi xuất `AuditLogService`).

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/api && npx jest --config ./test/jest-e2e.json --runInBand test/exam-session-edit.e2e-spec.ts`
Expected: PASS (~45 ca). Các ca hay trượt: (1) "dời giờ chồng lên khoảng cũ của chính nó" — nếu `409`, `excludeSessionId` chưa được truyền hoặc truy vấn ở `schedule-conflict.service.ts` chưa loại phiên đó khỏi **cả ba** phép kiểm; (2) ca audit `startTime` — `toISOString()` cho `…000Z`; (3) ca `agent:join` cần `app.listen(0)` đã có ở `beforeAll`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/exam-session apps/api/test/exam-session-edit.e2e-spec.ts
git commit -m "feat(sessions): sửa phiên thi trước giờ bắt đầu và huỷ phiên chưa có ai vào (UPDATE có điều kiện, audit cùng giao dịch)"
```

---

### Task 4: Sinh lại client, chạy cả hai bộ

**Files:**
- Modify: `packages/shared/src/api/schema.d.ts`

- [ ] **Step 1: Chạy cả hai bộ và so với baseline**

```powershell
cd apps/api
pnpm exec tsc --noEmit
pnpm test 2>&1 | Out-File C:/tmp/unit-after-f.txt
Select-String C:/tmp/unit-after-f.txt -Pattern '^Tests:|^Test Suites:'
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest' } | Select-Object ProcessId, CommandLine
npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e-after-f.json
node scripts/e2e-summary.cjs C:/tmp/e2e-after-f.json | Out-File -Encoding utf8 C:/tmp/after-f.tsv
$base = Get-Content ../../docs/superpowers/plans/md-restore-baseline.tsv | Where-Object { $_ -notmatch '^#' -and $_ -notmatch '^TOTAL' }
$after = Get-Content C:/tmp/after-f.tsv | Where-Object { $_ -notmatch '^TOTAL' }
Compare-Object $base $after
```

Expected: `tsc` sạch, không `failed > 0`, `Compare-Object` chỉ khác ở các suite mới/đã đổi của plan A–F (suite `exam-session-edit` mới). Hai suite sẵn có phải **giữ nguyên số test**: `exam-schedule-conflict` (D3 đã thêm hai ca `excludeSessionId`; F không thêm gì ở đó) và `exam-authoring-attach` (ca phiên `cancelled` vẫn xanh: chứng tỏ hành vi sẵn có không đổi).

- [ ] **Step 2: Sinh lại client OpenAPI** *(hoãn được tới plan G1 Task 1 — xem roadmap, mục "Sinh lại client")*

Làm đúng Task 3 của plan B. Diff phải thêm đúng `PATCH /exam-sessions/{id}` (thân `UpdateExamSessionDto`) và `POST /exam-sessions/{id}/cancel` (thân `CancelExamSessionDto`); hunk không liên quan ⇒ tách commit riêng.

- [ ] **Step 3: Soát quyền một lượt**

Chạy lại bộ quét quyền của plan C Task 9 Step 3: hai route mới đều có `@Roles('teacher')` tường minh; `roles-retired.spec.ts` xanh.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/api/schema.d.ts
git commit -m "chore(api-client): sinh lại schema cho PATCH và cancel phiên thi"
```

---

## Tự kiểm lại plan so với spec

- §4 (hai route, vai trò teacher chủ phiên) và §4.1: cửa sổ A (`status = 'active'` và `now < start_time`, câu 409 nguyên văn) — Task 1, 3; trường sửa được/không sửa được — `UpdateExamSessionDto`; dùng chung luật giờ của tạo phiên (15 phút, lùi 30 phút) và `assertNone` với `excludeSessionId` — Task 1, 3; đổi `roomId` kèm `room_name` **cùng giao dịch**, phòng mới `is_active`, `semester_name` không đổi — Task 3 (một câu `UPDATE` ghi cả hai cột); đổi giờ kiểm trên cặp sau khi sửa — `timeProblems` + ca "một đầu"; danh sách dự thi đã đóng băng giữ nguyên — không có dòng code nào đụng `session_roster`; huỷ: ba điều kiện, 409 nguyên văn, idempotent, phòng/lớp/giãn cách nhả (ca T-SES-7), `session_roster`/`submission not_submitted` giữ nguyên (ca riêng), không thêm cột `cancelled_*`.
- §4.2: `exam_session.update` (cũ/mới của đúng các trường đổi) và `exam_session.cancel` cùng giao dịch — Task 3; tên hành động và khoá `targetLabel` khớp quy ước plan B (`newValue.targetLabel`); câu tiếng Việt cho hai hành động này thêm ở plan G1 cùng mọi hành động dữ liệu nền.
- §11: T-SES-1…T-SES-10 đều có ca e2e (T-SES-9 là một ca `agent:join` thật + hai khẳng định tham chiếu hành vi sẵn có; T-SES-11 là web, plan G3). Bốn Review Focus của spec được ghim bằng ca cụ thể (tự va chạm, cửa sổ nguyên tử, một đầu, huỷ có người vào).
- Quyết định mới không có trong spec, nói thẳng để user duyệt: (a) **trường cấm trả 400** thay vì bị `whitelist` bỏ qua lặng lẽ; (b) **thân rỗng 400, gửi đúng giá trị hiện có 200 không audit**; (c) **`reason` tuỳ chọn** khi huỷ (spec nhắc "lý do" nằm trong audit nhưng bảng route không có thân — không bắt buộc, giao diện G3 chọn có hỏi hay không); (d) **phiên cũ chưa có `room_id`** đổi giờ phải kèm `roomId` (chỉ tồn tại tới backfill ở plan H); (e) service riêng `ExamSessionEditService` thay vì thêm vào `ExamSessionService` (đã ~800 dòng).
- Giới hạn chấp nhận, nêu rõ: một em `agent:join` commit **đúng giữa** câu `UPDATE` huỷ có thể lọt qua dưới READ COMMITTED và thấy phiên bị huỷ ngay sau đó — cửa sổ cỡ mili-giây, cùng mức chấp nhận của `finalizeExamSession`; nộp bài vào phiên đã huỷ không có ca e2e riêng vì mọi đường nộp bài phải qua `agent:join` (đã khoá), và `isAcceptingUploads` từ chối `cancelled` bằng mã (ghi trong chú thích hàm).
- Placeholder scan: không có "TBD"; mọi bước có mã/lệnh. Kiểu nhất quán: `assertNone({ … excludeSessionId })` khớp D3; `RoomService.requireActiveForNewSession` khớp D3/C; `editWindowProblem`/`timeProblems`/`cancelStatusProblem`/`CANCEL_HAS_PRESENCE_MESSAGE` khớp giữa Task 1 và 3; hai route khớp tên hàm `ExamSessionEditService.update/cancel` và hai DTO; plan G3 dùng đúng hai route, hai thân, và các mã 409/400 ở trên (cùng câu chữ cho tooltip/hộp thoại).
