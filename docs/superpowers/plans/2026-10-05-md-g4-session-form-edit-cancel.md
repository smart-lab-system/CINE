# Plan G4 — Form phiên thi theo danh mục (phòng chọn, học kỳ suy từ lớp) và Sửa / Huỷ phiên

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form tạo phiên thi chọn **phòng từ danh sách** (không còn ô gõ chữ), hiện **học kỳ chỉ để xem** lấy từ lớp, và hiện lớp bằng nhãn gộp có học kỳ; thêm trang **sửa phiên** `/teacher/exam-sessions/[id]/edit` (dùng lại các ô của form tạo, khoá lớp và file bắt buộc), nút **"Sửa"** và **"Huỷ phiên"** ở danh sách (chỉ bấm được khi đủ điều kiện, không thì nêu lý do), hộp thoại xác nhận huỷ. Sau plan này `apps/web` phải qua `tsc` và `next build` sạch.

**Architecture:** Hợp đồng đổi một lần ở `lib/api/exam-session.ts` (`roomId` thay `roomName`/`semesterName`; thêm `updateExamSession`, `cancelExamSession`) kèm hai hook có làm mới cache. Các luật thuần tách ra hai file test được không cần DOM: `lib/exam-session-actions.ts` (khi nào Sửa/Huỷ bấm được, kèm lý do) và `lib/exam-session-form.ts` (`editPayload` chỉ gửi **trường đổi**, so theo phút). Schema form (`new/schema.ts`) tách các trường và **ba luật về giờ** thành phần dùng chung rồi dựng thêm `editExamSessionSchema`, để tạo và sửa không thể lệch nhau về một luật giờ. Các ô chung (tên, phòng, loại, giờ, học kỳ chỉ-xem) thành `_components/session-fields.tsx` dùng qua `useFormContext`; trang tạo viết lại quanh chúng, trang sửa là trang mới, hành động ở hàng danh sách là hai component riêng (`session-row-actions`, `cancel-session-dialog`).

**Tech Stack:** Next.js 15, React 19, react-hook-form + zod, TanStack Query 5, Radix (Select, Dialog, Tooltip), vitest + Testing Library (Radix Select: `fireEvent.click(combobox)` rồi `fireEvent.click(option)`).

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §4.1 (sửa/huỷ phiên: cửa sổ, quy tắc, **Giao diện**, phương án A), §5.2 (form tạo phiên: lớp từ danh sách được giao với nhãn gộp, phòng chọn từ phòng đang hoạt động, học kỳ chỉ để xem; chữ ở màn trống), §11: T-SES-11 (nút Sửa/Huỷ phiên kèm lý do khi không đủ điều kiện), T-SES-6 (giữ phòng đã ngừng hoạt động — phía web).

**Phụ thuộc:** plan D3 (`POST /exam-sessions` nhận `roomId`; `ExamSessionResponse.roomId/classLabel`), plan F (`PATCH /exam-sessions/:id`, `POST /exam-sessions/:id/cancel`), plan G1 (`useRooms`, client đã sinh lại), plan G2 (`semesterTextOf`), plan G3a (`TeachingClass` mới: `label`, `labelWithSemester`, `semesterId/academicYear/term`), plan G3b (`ExamSessionListItem.classLabel`, danh sách phiên đã dùng bộ lọc dùng chung).

## Global Constraints

- **Hợp đồng (D3, F):** tạo gửi `roomId` (uuid) và **không** `roomName`/`semesterName` (học kỳ suy từ lớp và được server chụp). `PATCH` nhận đúng năm trường tuỳ chọn `name`, `roomId`, `startTime`, `endTime`, `examType` — **không bao giờ** gửi `classId`, `requiredFilenames`, `rubricId`, `semesterName`, `roomName` (server trả 400). `POST …/cancel` nhận `{ reason? }` (≤ 200 ký tự sau khi cắt). Cả hai trả `ExamSessionResponse`.
- **`editPayload` chỉ gửi trường ĐỔI.** Giờ so theo **phút** (ô `datetime-local` không có giây): phiên có giờ bắt đầu lẻ giây mà người dùng không đụng tới thì **không** bị coi là đổi. Không có gì đổi → không gọi API, báo "Không có thay đổi nào."
- **Cửa sổ sửa (phương án A, spec §4.1):** Sửa chỉ khi `status = 'active'` **và** `now < startTime`. Ngoài cửa sổ nút Sửa **không bấm được** và nêu lý do (câu của server cho ca "đã bắt đầu"); mở thẳng trang sửa bằng URL cũng bị chặn bằng cùng hàm và hiện cùng lý do. Giờ không đọc được → coi như **đã bắt đầu** (không cho sửa).
- **Huỷ:** bật khi `status = 'active'`, kể cả sau giờ bắt đầu — server mới biết đã có ai vào phòng chưa; câu 409 của server ("Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc") hiện **trong hộp thoại, hộp thoại giữ mở**. Hộp thoại nêu hậu quả (không khôi phục được; sinh viên không vào được nữa), lý do tuỳ chọn ≤ 200 ký tự.
- **Nút "không đủ điều kiện"** = `aria-disabled="true"` + tooltip + mô tả ẩn qua `aria-describedby` (không dùng `disabled`: giữ focus bàn phím để người dùng đọc được lý do); bấm không làm gì. Không để người dùng bấm rồi mới nhận 409.
- **Phòng:** chọn từ `useRooms({ activeOnly: true })`. Phiên đang sửa có phòng **đã ngừng hoạt động** → phòng đó vẫn là một lựa chọn gắn "(đã ngừng hoạt động)" và là giá trị mặc định, để **giữ nguyên** (T-SES-6); `editPayload` không gửi `roomId` khi không đổi. Phiên cũ **chưa có `roomId`** (trước backfill, plan H): ô phòng trống, có ghi chú; sửa tên/loại vẫn được; đổi giờ không kèm phòng thì server 400 nói rõ.
- **Học kỳ chỉ-xem**, lấy từ lớp, không gửi. Lớp hiện bằng `labelWithSemester` (`DHKTPM18A – Nhóm 1 · HK1 2026-2027`).
- **Chữ màn trống nguyên văn spec §5.2:** "Bạn chưa có lớp nào được giao nên chưa tạo được phiên thi." (không liên kết tạo lớp). Chưa có phòng đang hoạt động: "Chưa có phòng thi nào đang hoạt động nên chưa tạo được phiên thi. Quản trị viên tạo phòng ở mục Phòng thi."
- **Câu lỗi của server là câu hữu ích** (va chạm phòng/lớp/giãn cách, cửa sổ sửa, đã có người vào): hiển thị nguyên văn; chỉ khi không có mới dùng câu dự phòng riêng của từng việc (tạo / sửa / huỷ).
- **Không đụng:** phòng chờ (đã có nhánh "Đã huỷ"), lịch tuần (không thêm nút), `RequiredFilenamesInput`/`RubricPicker` (chỉ nhập kiểu `CreateExamSessionFormValues`, vẫn đúng).
- **Kết thúc plan:** `apps/web` qua `tsc --noEmit`, `eslint`, `vitest run`, `next build` **không lỗi**; `docs/superpowers/plans/md-restore-web-tsc-red.txt` rỗng và bị xoá.
- **Kết thúc dòng:** phần lớn file `.ts/.tsx` ở đây dùng **CRLF** (kiểm bằng `file <đường dẫn>`). Công cụ thay chuỗi **nhiều dòng** sẽ không khớp; sửa theo từng dòng, hoặc dùng script `python3` đọc/ghi bytes như các bước dưới (không dùng `python`).

## Review Focus

1. **Form tạo còn gửi `roomName`/`semesterName` hoặc còn ô gõ chữ cho phòng/học kỳ** — phiên tạo ra sai hoặc server 400. → test trang tạo: không có ô `textbox` nào tên "Phòng thi"/"Học kỳ" có thể sửa, và thân gửi lên có `roomId` mà không có hai khoá cũ (Task 4).
2. **Sửa gửi cả trường không đổi hoặc trường cấm**; giờ lẻ giây bị coi là "đã đổi" nên một lần sửa tên lại đổi giờ của phiên; lệch múi giờ khi nạp giờ vào ô `datetime-local`. → `editPayload` test: giây, đúng năm khoá, không có khoá cấm (Task 2); trang sửa chỉ gửi `{ name }` khi chỉ đổi tên (Task 5).
3. **Phòng đã ngừng hoạt động bị chặn nhầm** (sửa tên không được) hoặc **bị đổi âm thầm sang phòng khác** khi ô chọn không có giá trị hiện tại. → phòng đã ngừng vẫn là lựa chọn và là mặc định; sửa tên không gửi `roomId` (Task 4, 5).
4. **Phiên cũ không có `roomId` làm form vỡ hoặc chặn** sửa tên. → ca trang sửa (Task 5).
5. **Nút Sửa/Huỷ bấm được rồi mới báo 409, thiếu lý do, hoặc phiên đã bắt đầu vẫn cho Sửa** (đồng hồ). → bảng ca `editAvailability`/`cancelAvailability` và ca hàng danh sách có `aria-describedby` trỏ tới lý do (Task 2, 6).
6. **Huỷ bị 409 "đã có người vào" mà hộp thoại đóng và nuốt lỗi**, hoặc huỷ xong danh sách còn hiện phiên cũ. → ca hộp thoại giữ mở + hiện câu của server; ca hook làm mới danh sách/lịch/chi tiết/tổng quan bài thu (Task 1, 6).
7. **Mở trang sửa bằng URL cho phiên đã bắt đầu, đã huỷ, của người khác (403) hoặc không tồn tại (404).** → trang chặn bằng lý do / thông báo lỗi, không dựng form (Task 5).

---

## File Structure

| File | Việc |
|---|---|
| `apps/web/src/lib/api/exam-session.ts` (+ `exam-session-edit.test.ts`) | `roomId`; `ExamSessionResponse.roomId/classLabel`; `UpdateExamSessionInput`, `updateExamSession`, `cancelExamSession`. |
| `apps/web/src/hooks/useExamSession.ts` (+ `useExamSessionEdit.test.tsx`) | `useUpdateExamSession`, `useCancelExamSession`. |
| `apps/web/src/lib/exam-session-actions.ts` (+ test) | **Mới.** `editAvailability`, `cancelAvailability`. |
| `apps/web/src/lib/exam-session-form.ts` (+ test) | **Mới.** `toDatetimeLocal`, `editFormValuesOf`, `editPayload`. |
| `apps/web/src/app/teacher/exam-sessions/new/schema.ts` (+ test) | Trường và luật giờ dùng chung; `roomId`; `editExamSessionSchema`; `describeUpdateError`/`describeCancelError`. |
| `apps/web/src/app/teacher/exam-sessions/_components/session-fields.tsx` (+ test) | **Mới.** Các ô chung của form tạo và sửa. |
| `apps/web/src/app/teacher/exam-sessions/new/page.tsx` (+ `page.test.tsx` **mới**) | Viết lại quanh các ô chung. |
| `apps/web/src/app/teacher/exam-sessions/[id]/edit/page.tsx` (+ test) | **Mới.** Trang sửa. |
| `apps/web/src/app/teacher/exam-sessions/_components/session-row-actions.tsx` (+ test) | **Mới.** Sửa / Huỷ phiên ở hàng danh sách. |
| `apps/web/src/app/teacher/exam-sessions/_components/cancel-session-dialog.tsx` (+ test) | **Mới.** Hộp thoại xác nhận huỷ. |
| `apps/web/src/app/teacher/exam-sessions/page.tsx` (+ test) | Gắn hành động và hộp thoại vào cột "Thao tác". |
| `docs/superpowers/plans/md-restore-web-tsc-red.txt` | Rỗng → xoá. |

---

### Task 1: Hợp đồng API và hai hook

**Files:**
- Modify: `apps/web/src/lib/api/exam-session.ts`, `apps/web/src/hooks/useExamSession.ts`
- Test: `apps/web/src/lib/api/exam-session-edit.test.ts` (mới), `apps/web/src/hooks/useExamSessionEdit.test.tsx` (mới)

**Interfaces:**
- Consumes: `apiClient.PATCH('/exam-sessions/{id}')`, `apiClient.POST('/exam-sessions/{id}/cancel')` (client đã sinh lại ở G1 Task 1 từ API của plan F).
- Produces:

```ts
// lib/api/exam-session.ts
export interface CreateExamSessionInput { name: string; classId: string; roomId: string; rubricId?: string; examType: ExamType; startTime: string; endTime: string; requiredFilenames: {…}[] }   // KHÔNG còn roomName/semesterName
export interface ExamSessionResponse { …; roomName: string; roomId: string | null; classLabel: string | null; … }
export interface UpdateExamSessionInput { name?: string; roomId?: string; examType?: ExamType; startTime?: string; endTime?: string }
export function updateExamSession(id: string, body: UpdateExamSessionInput): Promise<ExamSessionResponse>;
export function cancelExamSession(id: string, reason?: string): Promise<ExamSessionResponse>;
// hooks/useExamSession.ts
export function useUpdateExamSession(): UseMutationResult<ExamSessionResponse, Error, { id: string; body: UpdateExamSessionInput }>;
export function useCancelExamSession(): UseMutationResult<ExamSessionResponse, Error, { id: string; reason?: string }>;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/api/exam-session-edit.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const patch = vi.fn();
const post = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { PATCH: (...a: unknown[]) => patch(...a), POST: (...a: unknown[]) => post(...a), GET: vi.fn() },
}));

import { cancelExamSession, updateExamSession } from './exam-session';

const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const failed = (status: number, message: string) => ({ data: undefined, error: { statusCode: status, message }, response: { ok: false, status } });

describe('updateExamSession', () => {
  beforeEach(() => patch.mockReset());

  it('PATCH /exam-sessions/{id} với đúng các trường được đưa, không thêm gì', async () => {
    patch.mockResolvedValue(ok({ id: 's1', name: 'Mới' }));
    const session = await updateExamSession('s1', { name: 'Mới' });
    expect(session).toEqual({ id: 's1', name: 'Mới' });
    expect(patch).toHaveBeenCalledWith('/exam-sessions/{id}', { params: { path: { id: 's1' } }, body: { name: 'Mới' } });
  });

  it('Review Focus 6: lỗi 409 của server được ném lại nguyên câu (cửa sổ sửa đã đóng)', async () => {
    patch.mockResolvedValue(failed(409, 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.'));
    await expect(updateExamSession('s1', { name: 'x' })).rejects.toMatchObject({
      message: 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.',
    });
  });
});

describe('cancelExamSession', () => {
  beforeEach(() => post.mockReset());

  it('POST /exam-sessions/{id}/cancel với thân rỗng khi không có lý do', async () => {
    post.mockResolvedValue(ok({ id: 's1', status: 'cancelled' }));
    await cancelExamSession('s1');
    expect(post).toHaveBeenCalledWith('/exam-sessions/{id}/cancel', { params: { path: { id: 's1' } }, body: {} });
  });

  it('cắt khoảng trắng của lý do; lý do toàn khoảng trắng coi như không có', async () => {
    post.mockResolvedValue(ok({ id: 's1' }));
    await cancelExamSession('s1', '  Nhầm phòng  ');
    expect(post).toHaveBeenLastCalledWith('/exam-sessions/{id}/cancel', { params: { path: { id: 's1' } }, body: { reason: 'Nhầm phòng' } });
    await cancelExamSession('s1', '   ');
    expect(post).toHaveBeenLastCalledWith('/exam-sessions/{id}/cancel', { params: { path: { id: 's1' } }, body: {} });
  });

  it('Review Focus 6: 409 "đã có sinh viên vào phòng" được ném lại để hộp thoại hiển thị', async () => {
    post.mockResolvedValue(failed(409, 'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc'));
    await expect(cancelExamSession('s1')).rejects.toMatchObject({ message: expect.stringContaining('Đã có sinh viên vào phòng') });
  });
});
```

Create `apps/web/src/hooks/useExamSessionEdit.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const h = vi.hoisted(() => ({ update: vi.fn(), cancel: vi.fn() }));
vi.mock('@/lib/api/exam-session', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/exam-session')>()),
  updateExamSession: h.update,
  cancelExamSession: h.cancel,
}));

import { useCancelExamSession, useUpdateExamSession } from './useExamSession';

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const keys = () => invalidate.mock.calls.map((call) => (call[0] as { queryKey: unknown[] }).queryKey);
  return { wrapper, keys };
}

// Mọi nơi đang hiện phiên này: danh sách (khoá gốc, nên mọi trang và bộ lọc), lịch tuần, chi tiết, và tổng quan bài thu.
const REFRESHED = [['exam-sessions'], ['exam-sessions-range'], ['exam-session', 's1'], ['submissions', 'overview']];

describe('useUpdateExamSession / useCancelExamSession', () => {
  beforeEach(() => {
    h.update.mockReset();
    h.cancel.mockReset();
  });

  it('sửa: gọi API với id và thân, rồi làm mới danh sách, lịch, chi tiết và tổng quan bài thu', async () => {
    h.update.mockResolvedValue({ id: 's1' });
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useUpdateExamSession(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', body: { name: 'Mới' } });
    });
    expect(h.update).toHaveBeenCalledWith('s1', { name: 'Mới' });
    expect(keys()).toEqual(expect.arrayContaining(REFRESHED));
  });

  it('huỷ: gọi API với id và lý do, rồi làm mới cùng bốn nơi (Review Focus 6: không để phiên cũ lại trong danh sách)', async () => {
    h.cancel.mockResolvedValue({ id: 's1', status: 'cancelled' });
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useCancelExamSession(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1', reason: 'Nhầm phòng' });
    });
    expect(h.cancel).toHaveBeenCalledWith('s1', 'Nhầm phòng');
    expect(keys()).toEqual(expect.arrayContaining(REFRESHED));
  });

  it('thất bại thì KHÔNG làm mới gì (dữ liệu chưa đổi) và lỗi đi ra cho giao diện', async () => {
    h.cancel.mockRejectedValue({ message: 'Đã có sinh viên vào phòng' });
    const { wrapper, keys } = setup();
    const { result } = renderHook(() => useCancelExamSession(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 's1' }).catch(() => undefined);
    });
    expect(keys()).toEqual([]);
    expect(result.current.error).toMatchObject({ message: 'Đã có sinh viên vào phòng' });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/api/exam-session-edit.test.ts src/hooks/useExamSessionEdit.test.tsx`
Expected: FAIL — `updateExamSession`/`cancelExamSession`/`useUpdateExamSession`/`useCancelExamSession` chưa có.

- [ ] **Step 3: Sửa `lib/api/exam-session.ts`**

1. Trong `CreateExamSessionInput` thay hai trường

```ts
  /** Phòng và học kỳ là VĂN BẢN: không còn bảng nào để chọn ra. */
  roomName: string;
  semesterName: string;
```

bằng

```ts
  /**
   * Phòng, chọn từ phòng ĐANG HOẠT ĐỘNG (`GET /rooms?activeOnly=true`); server chụp tên phòng vào phiên. Không còn `roomName`/`semesterName`:
   * phòng là một hàng trong danh mục, còn học kỳ suy từ lớp và cũng được server chụp.
   */
  roomId: string;
```

2. Trong `ExamSessionResponse` thay khối

```ts
  /** Môn và phòng dạng VĂN BẢN, chụp lúc tạo phiên. `courseId`/`roomId`
   *  biến mất cùng ba bảng dữ liệu nền ở đợt thu hẹp master data. */
  courseName: string;
  roomName: string;
```

bằng

```ts
  /** Môn dạng VĂN BẢN và tên phòng, CHỤP lúc tạo (tên phòng cập nhật khi sửa phòng). */
  courseName: string;
  roomName: string;
  /** Phòng trong danh mục. `null` chỉ với phiên tạo trước khi có danh mục phòng và chưa backfill (plan H). */
  roomId: string | null;
  /** Nhãn gộp của lớp (`DHKTPM18A – Nhóm 1`). */
  classLabel: string | null;
```

3. Ngay sau hàm `createExamSession` (sau dấu `}` đóng của nó) thêm:

```ts
/**
 * Mirrors UpdateExamSessionDto (plan F). Mọi trường tuỳ chọn và CHỈ gửi cái đổi. Lớp, danh sách file bắt buộc, rubric, học kỳ KHÔNG có ở đây
 * một cách có chủ ý: server trả 400 nếu nhận chúng (sai lớp hay sai file bắt buộc thì huỷ phiên và tạo lại).
 */
export interface UpdateExamSessionInput {
  name?: string;
  roomId?: string;
  examType?: ExamType;
  startTime?: string;
  endTime?: string;
}

/**
 * Sửa phiên TRƯỚC giờ bắt đầu (spec §4.1, phương án A). 409 kèm câu giải thích khi cửa sổ đã đóng hoặc có va chạm phòng/lớp/giãn cách —
 * câu đó đi ra qua lỗi được ném để giao diện hiển thị nguyên văn.
 */
export async function updateExamSession(
  id: string,
  body: UpdateExamSessionInput,
): Promise<ExamSessionResponse> {
  const { data, error, response } = await apiClient.PATCH('/exam-sessions/{id}', {
    params: { path: { id } },
    body,
  });
  await throwIfFailed(error, response);
  return data as unknown as ExamSessionResponse;
}

/**
 * Huỷ phiên chưa có ai vào phòng (spec §4.1). Không khôi phục được. Lý do (tuỳ chọn, ≤ 200 ký tự) nằm ở `audit_log`; lý do toàn khoảng
 * trắng coi như không có. 409 "Đã có sinh viên vào phòng…" được ném lại cho hộp thoại hiển thị.
 */
export async function cancelExamSession(id: string, reason?: string): Promise<ExamSessionResponse> {
  const trimmed = reason?.trim();
  const { data, error, response } = await apiClient.POST('/exam-sessions/{id}/cancel', {
    params: { path: { id } },
    body: trimmed ? { reason: trimmed } : {},
  });
  await throwIfFailed(error, response);
  return data as unknown as ExamSessionResponse;
}
```

- [ ] **Step 4: Thêm hai hook vào `hooks/useExamSession.ts`**

1. Trong danh sách import từ `@/lib/api/exam-session` thêm `updateExamSession,`, `cancelExamSession,` (cạnh `createExamSession,`) và kiểu `type UpdateExamSessionInput,` (cạnh `type CreateExamSessionInput,`).
2. Ngay sau hàm `useCreateExamSession` thêm:

```ts
/**
 * Mọi nơi đang hiện phiên này phải đọc lại sau khi sửa hoặc huỷ: danh sách (khoá gốc `['exam-sessions']`, nên mọi trang và bộ lọc, cả
 * `attendance`/`materials` của chính phiên), lịch tuần, chi tiết, và tổng quan bài thu (phiên huỷ không còn là phiên thu bài).
 */
function useRefreshSession() {
  const queryClient = useQueryClient();
  return (id: string) => {
    void queryClient.invalidateQueries({ queryKey: ['exam-sessions'] });
    void queryClient.invalidateQueries({ queryKey: ['exam-sessions-range'] });
    void queryClient.invalidateQueries({ queryKey: ['exam-session', id] });
    void queryClient.invalidateQueries({ queryKey: ['submissions', 'overview'] });
  };
}

/**
 * Sửa phiên. `id` đi theo từng lần gọi (không theo hook) vì một danh sách dùng chung một hook cho mọi hàng. Thất bại không làm mới gì:
 * dữ liệu chưa đổi, và lỗi 409 của server đi ra qua `error` cho giao diện hiển thị.
 */
export function useUpdateExamSession() {
  const refresh = useRefreshSession();
  return useMutation<ExamSessionResponse, Error, { id: string; body: UpdateExamSessionInput }>({
    mutationFn: ({ id, body }) => updateExamSession(id, body),
    onSuccess: (_session, { id }) => refresh(id),
  });
}

/** Huỷ phiên. Cùng quy ước làm mới như `useUpdateExamSession`. */
export function useCancelExamSession() {
  const refresh = useRefreshSession();
  return useMutation<ExamSessionResponse, Error, { id: string; reason?: string }>({
    mutationFn: ({ id, reason }) => cancelExamSession(id, reason),
    onSuccess: (_session, { id }) => refresh(id),
  });
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/api/exam-session-edit.test.ts src/hooks/useExamSessionEdit.test.tsx`
Expected: PASS. (`tsc` còn đỏ ở `new/page.tsx`, `new/schema.ts`, các test dùng `roomName`/`semesterName` của `CreateExamSessionInput` — các task sau xử lý.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/exam-session.ts apps/web/src/lib/api/exam-session-edit.test.ts apps/web/src/hooks/useExamSession.ts apps/web/src/hooks/useExamSessionEdit.test.tsx
git commit -m "feat(web): hợp đồng phiên thi theo danh mục (roomId) và API/hook sửa, huỷ phiên"
```

---

### Task 2: Luật thuần — khi nào Sửa/Huỷ bấm được, và thân PATCH

**Files:**
- Create: `apps/web/src/lib/exam-session-actions.ts`, `apps/web/src/lib/exam-session-form.ts`
- Test: `apps/web/src/lib/exam-session-actions.test.ts`, `apps/web/src/lib/exam-session-form.test.ts`

**Interfaces:**
- Consumes: `EXAM_SESSION_STATUS_LABELS` (`lib/exam-session-display`), `ExamSessionResponse`, `ExamType`, `UpdateExamSessionInput` (Task 1).
- Produces:

```ts
// lib/exam-session-actions.ts
export type ActionAvailability = { allowed: true } | { allowed: false; reason: string };
export const EDIT_STARTED_MESSAGE: string;   // "Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được."
export function editAvailability(session: { status: string; startTime: string }, now: number): ActionAvailability;
export function cancelAvailability(session: { status: string }): ActionAvailability;
// lib/exam-session-form.ts
export type EditableSession = Pick<ExamSessionResponse, 'name' | 'roomId' | 'examType' | 'startTime' | 'endTime'>;
export interface EditFormValues { name: string; roomId: string; examType: ExamType; startTime: string; endTime: string }
export function toDatetimeLocal(iso: string): string;                      // '' khi chuỗi ngày hỏng
export function editFormValuesOf(session: EditableSession): EditFormValues; // roomId null → ''
export function editPayload(original: EditableSession, values: EditFormValues): UpdateExamSessionInput;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/exam-session-actions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { EDIT_STARTED_MESSAGE, cancelAvailability, editAvailability } from './exam-session-actions';

const NOW = new Date(2026, 9, 6, 9, 0).getTime(); // 09:00 06/10/2026, giờ máy
const at = (hour: number, minute = 0) => new Date(2026, 9, 6, hour, minute).toISOString();

describe('editAvailability — cửa sổ sửa (phương án A): active VÀ chưa đến giờ bắt đầu', () => {
  it('phiên active chưa bắt đầu → sửa được, kể cả khi còn đúng một phút', () => {
    expect(editAvailability({ status: 'active', startTime: at(10) }, NOW)).toEqual({ allowed: true });
    expect(editAvailability({ status: 'active', startTime: at(9, 1) }, NOW)).toEqual({ allowed: true });
  });

  it('Review Focus 5: đúng giờ bắt đầu là ĐÃ bắt đầu, và đã quá giờ thì càng — lý do là câu của server', () => {
    expect(editAvailability({ status: 'active', startTime: at(9, 0) }, NOW)).toEqual({ allowed: false, reason: EDIT_STARTED_MESSAGE });
    expect(editAvailability({ status: 'active', startTime: at(8) }, NOW)).toEqual({ allowed: false, reason: EDIT_STARTED_MESSAGE });
    expect(EDIT_STARTED_MESSAGE).toBe('Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.');
  });

  it.each([
    ['collecting', 'Phiên đang thu bài, không sửa được.'],
    ['completed', 'Phiên đã kết thúc, không sửa được.'],
    ['cancelled', 'Phiên đã huỷ, không sửa được.'],
    ['draft', 'Phiên đang ở trạng thái “Nháp”, không sửa được.'],
  ])('trạng thái %s (giờ chưa tới cũng vậy) → không sửa được, nói đúng lý do', (status, reason) => {
    expect(editAvailability({ status, startTime: at(10) }, NOW)).toEqual({ allowed: false, reason });
  });

  it('giờ bắt đầu không đọc được → coi như ĐÃ bắt đầu: không bao giờ cho sửa một phiên có thể đang thi', () => {
    expect(editAvailability({ status: 'active', startTime: 'không phải ngày' }, NOW)).toEqual({ allowed: false, reason: EDIT_STARTED_MESSAGE });
  });
});

describe('cancelAvailability — chỉ phiên active; có ai vào phòng chưa là việc của server', () => {
  it('phiên active → huỷ được (kể cả sau giờ bắt đầu: chưa ai vào thì vẫn huỷ được)', () => {
    expect(cancelAvailability({ status: 'active' })).toEqual({ allowed: true });
  });

  it.each([
    ['collecting', 'Phiên đang thu bài, không huỷ được. Hãy Xác nhận kết thúc ở phòng chờ.'],
    ['completed', 'Phiên đã kết thúc, không huỷ được.'],
    ['cancelled', 'Phiên này đã được huỷ.'],
    ['scheduled', 'Phiên đang ở trạng thái “Đã lên lịch”, không huỷ được.'],
  ])('trạng thái %s → không huỷ được, nói đúng lý do', (status, reason) => {
    expect(cancelAvailability({ status })).toEqual({ allowed: false, reason });
  });
});
```

Create `apps/web/src/lib/exam-session-form.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { editFormValuesOf, editPayload, toDatetimeLocal, type EditFormValues, type EditableSession } from './exam-session-form';

const ROOM = '22222222-2222-4222-8222-222222222222';
const OTHER_ROOM = '33333333-3333-4333-8333-333333333333';

const original: EditableSession = {
  name: 'Giữa kỳ N01',
  roomId: ROOM,
  examType: 'GK',
  startTime: new Date(2026, 9, 6, 8, 0).toISOString(),
  endTime: new Date(2026, 9, 6, 10, 0).toISOString(),
};
const same = (): EditFormValues => editFormValuesOf(original);

describe('toDatetimeLocal', () => {
  it('giờ MÁY người dùng, dạng YYYY-MM-DDTHH:mm, không giây không múi giờ', () => {
    expect(toDatetimeLocal(new Date(2026, 9, 6, 8, 5).toISOString())).toBe('2026-10-06T08:05');
    expect(toDatetimeLocal(new Date(2026, 0, 2, 23, 59).toISOString())).toBe('2026-01-02T23:59');
  });
  it('chuỗi ngày hỏng → ô trống, không ném', () => {
    expect(toDatetimeLocal('không phải ngày')).toBe('');
  });
});

describe('editFormValuesOf', () => {
  it('nạp đúng giá trị hiện có; phiên cũ chưa có phòng → roomId rỗng', () => {
    expect(same()).toEqual({ name: 'Giữa kỳ N01', roomId: ROOM, examType: 'GK', startTime: '2026-10-06T08:00', endTime: '2026-10-06T10:00' });
    expect(editFormValuesOf({ ...original, roomId: null }).roomId).toBe('');
  });
});

describe('editPayload — chỉ gửi trường ĐỔI', () => {
  it('không đổi gì → thân rỗng (giao diện không gọi API)', () => {
    expect(editPayload(original, same())).toEqual({});
  });

  it('chỉ đổi tên → chỉ có name, đã cắt khoảng trắng', () => {
    expect(editPayload(original, { ...same(), name: '  Giữa kỳ N02 ' })).toEqual({ name: 'Giữa kỳ N02' });
  });

  it('chỉ đổi phòng / chỉ đổi loại', () => {
    expect(editPayload(original, { ...same(), roomId: OTHER_ROOM })).toEqual({ roomId: OTHER_ROOM });
    expect(editPayload(original, { ...same(), examType: 'CK' })).toEqual({ examType: 'CK' });
  });

  it('chỉ đổi giờ bắt đầu → startTime là ISO của giờ máy; endTime không đi theo', () => {
    expect(editPayload(original, { ...same(), startTime: '2026-10-06T09:00' })).toEqual({ startTime: new Date(2026, 9, 6, 9, 0).toISOString() });
  });

  it('Review Focus 2: giờ cũ LẺ GIÂY mà người dùng không đụng tới thì KHÔNG bị coi là đã đổi', () => {
    const withSeconds: EditableSession = { ...original, startTime: new Date(2026, 9, 6, 8, 0, 30).toISOString() };
    expect(editPayload(withSeconds, editFormValuesOf(withSeconds))).toEqual({});
    // đổi sang phút khác thì gửi, với giây = 0
    expect(editPayload(withSeconds, { ...editFormValuesOf(withSeconds), startTime: '2026-10-06T08:01' })).toEqual({
      startTime: new Date(2026, 9, 6, 8, 1).toISOString(),
    });
  });

  it('Review Focus 3, 4: ô phòng không đổi (kể cả phòng đã ngừng hoạt động) hoặc rỗng (phiên cũ chưa có phòng) → KHÔNG gửi roomId', () => {
    expect(editPayload(original, { ...same(), name: 'Đổi tên' })).not.toHaveProperty('roomId');
    const legacy: EditableSession = { ...original, roomId: null };
    expect(editPayload(legacy, { ...editFormValuesOf(legacy), name: 'Đổi tên' })).toEqual({ name: 'Đổi tên' });
  });

  it('Review Focus 2: dù đổi mọi thứ, thân chỉ có đúng năm khoá server cho sửa', () => {
    const everything = editPayload(original, {
      name: 'Khác', roomId: OTHER_ROOM, examType: 'TK', startTime: '2026-10-07T08:00', endTime: '2026-10-07T10:00',
    });
    expect(Object.keys(everything).sort()).toEqual(['endTime', 'examType', 'name', 'roomId', 'startTime']);
  });

  it('một ô giờ hỏng không làm ném lỗi và không được gửi', () => {
    expect(() => editPayload(original, { ...same(), startTime: '' })).not.toThrow();
    expect(editPayload(original, { ...same(), startTime: '' })).toEqual({});
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/exam-session-actions.test.ts src/lib/exam-session-form.test.ts`
Expected: FAIL — không import được hai module.

- [ ] **Step 3: Viết `lib/exam-session-actions.ts`**

```ts
import { EXAM_SESSION_STATUS_LABELS } from './exam-session-display';

/**
 * Khi nào hàng của một phiên cho Sửa / Huỷ (spec §4.1 "Giao diện", T-SES-11). Hàm THUẦN: `now` được truyền vào để test không phụ thuộc ngày chạy.
 * Khi không đủ điều kiện, nút không bấm được và `reason` nói vì sao — không để người dùng bấm rồi mới nhận 409. Server vẫn là thẩm quyền cuối:
 * một phiên vừa qua giờ bắt đầu giữa lúc trang mở và lúc bấm vẫn bị từ chối ở API.
 */
export type ActionAvailability = { allowed: true } | { allowed: false; reason: string };

/** Cùng câu với server (plan F): người dùng thấy MỘT lời dù bị chặn ở web hay ở API. */
export const EDIT_STARTED_MESSAGE = 'Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.';

function statusPhrase(status: string): string {
  switch (status) {
    case 'cancelled':
      return 'Phiên đã huỷ';
    case 'completed':
      return 'Phiên đã kết thúc';
    case 'collecting':
      return 'Phiên đang thu bài';
    default:
      return `Phiên đang ở trạng thái “${EXAM_SESSION_STATUS_LABELS[status] ?? status}”`;
  }
}

/**
 * Cửa sổ sửa (phương án A): `status = 'active'` VÀ `now < startTime`. Trong cửa sổ này chắc chắn chưa ai vào phòng (`agent:join` chỉ nhận sau
 * giờ bắt đầu). Giờ không đọc được → coi như ĐÃ bắt đầu: cho sửa nhầm một phiên có thể đang thi đắt hơn chặn nhầm một phiên hỏng ngày.
 */
export function editAvailability(session: { status: string; startTime: string }, now: number): ActionAvailability {
  if (session.status !== 'active') return { allowed: false, reason: `${statusPhrase(session.status)}, không sửa được.` };
  const start = Date.parse(session.startTime);
  if (!Number.isFinite(start) || now >= start) return { allowed: false, reason: EDIT_STARTED_MESSAGE };
  return { allowed: true };
}

/**
 * Chỉ phiên `active`. Cố ý KHÔNG so với giờ bắt đầu: sau giờ bắt đầu mà chưa ai vào phòng thì vẫn huỷ được ("Nếu chưa ai vào phòng bạn vẫn huỷ
 * được"), và web không biết ai đã vào — server biết, và trả 409 kèm câu hướng dẫn, hiện trong hộp thoại.
 */
export function cancelAvailability(session: { status: string }): ActionAvailability {
  if (session.status === 'active') return { allowed: true };
  if (session.status === 'cancelled') return { allowed: false, reason: 'Phiên này đã được huỷ.' };
  const hint = session.status === 'collecting' ? ' Hãy Xác nhận kết thúc ở phòng chờ.' : '';
  return { allowed: false, reason: `${statusPhrase(session.status)}, không huỷ được.${hint}` };
}
```

- [ ] **Step 4: Viết `lib/exam-session-form.ts`**

```ts
import type { ExamSessionResponse, ExamType, UpdateExamSessionInput } from './api/exam-session';

/** Phần của một phiên mà form SỬA đọc và có thể đổi. */
export type EditableSession = Pick<ExamSessionResponse, 'name' | 'roomId' | 'examType' | 'startTime' | 'endTime'>;

export interface EditFormValues {
  name: string;
  /** '' = phiên cũ chưa có phòng trong danh mục (trước backfill). */
  roomId: string;
  examType: ExamType;
  startTime: string;
  endTime: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `<input type="datetime-local">` đọc và ghi giờ MÁY người dùng dạng `YYYY-MM-DDTHH:mm` — không giây, không múi giờ. Chuỗi ngày hỏng → '' (ô
 * trống), không ném: một dòng dữ liệu xấu không được làm trắng cả trang sửa.
 */
export function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function editFormValuesOf(session: EditableSession): EditFormValues {
  return {
    name: session.name,
    roomId: session.roomId ?? '',
    examType: session.examType,
    startTime: toDatetimeLocal(session.startTime),
    endTime: toDatetimeLocal(session.endTime),
  };
}

const minuteOf = (iso: string) => Math.floor(Date.parse(iso) / 60_000);

/** ISO của một giờ-máy dạng `datetime-local`; `null` nếu ô trống hay hỏng. */
function isoOf(local: string): string | null {
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Thân `PATCH /exam-sessions/:id`: CHỈ các trường đổi. Server trả 200 không ghi gì khi gửi đúng giá trị cũ, nhưng gửi cả những trường không đổi
 * vẫn sai vì hai lẽ: kiểm va chạm phòng/giờ chạy khi phòng hay giờ **có mặt** trong thân, và một thân đầy đủ là thân dễ lỡ mang trường cấm.
 *
 * - Giờ so theo PHÚT: ô `datetime-local` không có giây, nên một phiên tạo qua API với giờ lẻ giây mà người dùng không đụng tới sẽ lệch 30 giây
 *   so với giá trị nạp lại — nếu so chính xác, mỗi lần sửa tên lại âm thầm đổi giờ bắt đầu.
 * - Phòng rỗng (phiên cũ chưa có phòng) hoặc không đổi (kể cả phòng đã ngừng hoạt động) → không gửi `roomId`.
 */
export function editPayload(original: EditableSession, values: EditFormValues): UpdateExamSessionInput {
  const body: UpdateExamSessionInput = {};
  const name = values.name.trim();
  if (name !== original.name) body.name = name;
  if (values.roomId !== '' && values.roomId !== original.roomId) body.roomId = values.roomId;
  if (values.examType !== original.examType) body.examType = values.examType;
  const start = isoOf(values.startTime);
  if (start !== null && minuteOf(start) !== minuteOf(original.startTime)) body.startTime = start;
  const end = isoOf(values.endTime);
  if (end !== null && minuteOf(end) !== minuteOf(original.endTime)) body.endTime = end;
  return body;
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/exam-session-actions.test.ts src/lib/exam-session-form.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/exam-session-actions.ts apps/web/src/lib/exam-session-actions.test.ts apps/web/src/lib/exam-session-form.ts apps/web/src/lib/exam-session-form.test.ts
git commit -m "feat(web): luật thuần cho Sửa/Huỷ phiên (cửa sổ sửa, lý do khi bị chặn) và editPayload chỉ gửi trường đổi"
```

---

### Task 3: Schema form — phòng chọn, luật giờ dùng chung, schema sửa

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.ts`
- Test: `apps/web/src/app/teacher/exam-sessions/new/schema.test.ts`

**Interfaces:**
- Consumes: không.
- Produces:

```ts
export const createExamSessionSchema;          // roomId: uuid (không còn roomName/semesterName)
export type CreateExamSessionFormValues;
export const editExamSessionSchema;            // name, roomId ('' hoặc uuid), examType, startTime, endTime — ba luật giờ như create
export type EditExamSessionFormValues;
export function describeCreateError(error: unknown): string;
export function describeUpdateError(error: unknown): string;   // dự phòng: "Không lưu được thay đổi. Vui lòng kiểm tra lại thông tin và thử lại."
export function describeCancelError(error: unknown): string;   // dự phòng: "Không huỷ được phiên thi. Vui lòng thử lại."
```

- [ ] **Step 1: Sửa test hiện có và viết test mới (đỏ)**

Trong `schema.test.ts`, đổi năm cặp dòng `roomName: 'P.A101',` + `semesterName: 'HK1 2026-2027',` thành một dòng `roomId: VALID_UUID,` (mỗi `describe` đã có `VALID_UUID`) bằng script giữ nguyên kết thúc dòng:

```bash
python3 - <<'PY'
import re, pathlib
p = pathlib.Path('apps/web/src/app/teacher/exam-sessions/new/schema.test.ts')
s = p.read_bytes().decode('utf-8')
s, n = re.subn(r"roomName: 'P\.A101',\r?\n\s*semesterName: 'HK1 2026-2027',", "roomId: VALID_UUID,", s)
assert n == 5, n
p.write_bytes(s.encode('utf-8'))
print('ok', n)
PY
```

Đổi dòng import đầu file thành `import { createExamSessionSchema, describeCancelError, describeCreateError, describeUpdateError, editExamSessionSchema } from './schema';`. Rồi thêm vào **cuối file** (các hàm `futureStart`/`toLocalInput` ở cuối file là khai báo hàm nên dùng được từ đây):

```ts
describe('createExamSessionSchema — phòng chọn từ danh sách', () => {
  const ROOM_ID = '22222222-2222-4222-8222-222222222222';

  function values(extra: Record<string, unknown> = {}) {
    const start = futureStart();
    const end = new Date(start.getTime() + 60 * 60_000);
    return {
      name: 'Kiểm tra giữa kỳ',
      classId: '11111111-1111-4111-8111-111111111111',
      roomId: ROOM_ID,
      examType: 'GK' as const,
      startTime: toLocalInput(start),
      endTime: toLocalInput(end),
      requiredFilenames: [{ value: 'Cau1.docx' }],
      ...extra,
    };
  }

  it('nhận roomId là uuid', () => {
    expect(createExamSessionSchema.safeParse(values()).success).toBe(true);
  });

  it('TỪ CHỐI thiếu phòng hoặc phòng không phải uuid, báo ngay ở ô phòng', () => {
    for (const roomId of ['', 'P.A101']) {
      const result = createExamSessionSchema.safeParse(values({ roomId }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.find((issue) => issue.path[0] === 'roomId')?.message).toBe('Vui lòng chọn phòng thi');
      }
    }
  });

  it('Review Focus 1: không còn phòng/học kỳ gõ tay — hai khoá cũ bị bỏ khỏi kết quả', () => {
    const result = createExamSessionSchema.safeParse(values({ roomName: 'P.A101', semesterName: 'HK1 2026-2027' }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('roomName');
      expect(result.data).not.toHaveProperty('semesterName');
    }
  });
});

describe('editExamSessionSchema — chỉ năm trường server cho sửa', () => {
  const ROOM_ID = '22222222-2222-4222-8222-222222222222';

  function values(extra: Record<string, unknown> = {}) {
    const start = futureStart();
    const end = new Date(start.getTime() + 60 * 60_000);
    return { name: 'Kiểm tra giữa kỳ', roomId: ROOM_ID, examType: 'GK' as const, startTime: toLocalInput(start), endTime: toLocalInput(end), ...extra };
  }

  it('nhận bản sao nguyên trạng của một phiên', () => {
    expect(editExamSessionSchema.safeParse(values()).success).toBe(true);
  });

  it('Review Focus 4: roomId rỗng được phép — phiên cũ chưa có phòng trong danh mục', () => {
    expect(editExamSessionSchema.safeParse(values({ roomId: '' })).success).toBe(true);
  });

  it('TỪ CHỐI roomId lạ (không rỗng, không phải uuid)', () => {
    const result = editExamSessionSchema.safeParse(values({ roomId: 'P.A101' }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(['roomId']);
  });

  it('báo ở ô tên khi tên rỗng hoặc dài quá 200 ký tự', () => {
    for (const name of ['   ', 'x'.repeat(201)]) {
      const result = editExamSessionSchema.safeParse(values({ name }));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual(['name']);
    }
  });

  it('Review Focus 2: lớp, file bắt buộc, rubric, học kỳ KHÔNG có đường vào — mọi khoá lạ bị bỏ khỏi kết quả', () => {
    const result = editExamSessionSchema.safeParse(
      values({ classId: 'x', requiredFilenames: [], rubricId: 'y', semesterName: 'z', roomName: 'w' }),
    );
    expect(result.success).toBe(true);
    if (result.success) expect(Object.keys(result.data).sort()).toEqual(['endTime', 'examType', 'name', 'roomId', 'startTime']);
  });
});

describe('luật về giờ — dùng CHUNG cho tạo và sửa (hai form không được lệch nhau)', () => {
  const CLASS_ID = '11111111-1111-4111-8111-111111111111';
  const ROOM_ID = '22222222-2222-4222-8222-222222222222';
  const forms = {
    tạo: (startTime: string, endTime: string) =>
      createExamSessionSchema.safeParse({
        name: 'Kiểm tra', classId: CLASS_ID, roomId: ROOM_ID, examType: 'GK', startTime, endTime, requiredFilenames: [{ value: 'Cau1.docx' }],
      }),
    sửa: (startTime: string, endTime: string) =>
      editExamSessionSchema.safeParse({ name: 'Kiểm tra', roomId: ROOM_ID, examType: 'GK', startTime, endTime }),
  };
  const messagesOf = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
    result.success ? [] : (result.error?.issues.map((issue) => issue.message) ?? []);

  describe.each(Object.entries(forms))('%s', (_label, parse) => {
    it('hợp lệ: ngày mai, kéo dài 60 phút', () => {
      const start = futureStart();
      expect(parse(toLocalInput(start), toLocalInput(new Date(start.getTime() + 60 * 60_000))).success).toBe(true);
    });

    it('kết thúc không sau bắt đầu → báo ở ô kết thúc', () => {
      const start = futureStart();
      const messages = messagesOf(parse(toLocalInput(start), toLocalInput(start)));
      expect(messages).toContain('Thời gian kết thúc phải sau thời gian bắt đầu');
      expect(messages).not.toContain('Phiên thi phải kéo dài ít nhất 15 phút');
    });

    it('ngắn hơn 15 phút', () => {
      const start = futureStart();
      expect(messagesOf(parse(toLocalInput(start), toLocalInput(new Date(start.getTime() + 14 * 60_000))))).toContain(
        'Phiên thi phải kéo dài ít nhất 15 phút',
      );
    });

    it('lùi giờ bắt đầu quá 30 phút so với hiện tại', () => {
      const start = new Date(Date.now() - 31 * 60_000);
      expect(messagesOf(parse(toLocalInput(start), toLocalInput(new Date(start.getTime() + 60 * 60_000))))).toContain(
        'Thời gian bắt đầu không được sớm hơn hiện tại quá 30 phút',
      );
    });
  });
});

describe('describeUpdateError / describeCancelError', () => {
  it('dùng nguyên câu của server — câu 409 của cửa sổ sửa và của "đã có người vào" là câu hữu ích', () => {
    expect(describeUpdateError({ statusCode: 409, message: 'Phiên đã bắt đầu, không sửa được.' })).toBe('Phiên đã bắt đầu, không sửa được.');
    expect(describeCancelError({ statusCode: 409, message: ['Đã có sinh viên vào phòng', 'hãy Chốt bài ngay'] })).toBe(
      'Đã có sinh viên vào phòng. hãy Chốt bài ngay',
    );
  });

  it('mỗi việc có lời dự phòng riêng, không nói "tạo" khi đang sửa hay huỷ', () => {
    expect(describeUpdateError(null)).toBe('Không lưu được thay đổi. Vui lòng kiểm tra lại thông tin và thử lại.');
    expect(describeCancelError(undefined)).toBe('Không huỷ được phiên thi. Vui lòng thử lại.');
    expect(describeCreateError({ message: '   ' })).toBe('Không tạo được phiên thi. Vui lòng kiểm tra lại thông tin và thử lại.');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/new/schema.test.ts`
Expected: FAIL — schema còn đòi `roomName`/`semesterName` (nên mọi ca có `roomId` thất bại), chưa có `editExamSessionSchema`, `describeUpdateError`, `describeCancelError`.

- [ ] **Step 3: Sửa `schema.ts`**

1. **Câu lỗi:** thay khối từ `const FALLBACK_CREATE_ERROR =` đến hết hàm `describeCreateError` bằng:

```ts
const FALLBACK_CREATE_ERROR =
  'Không tạo được phiên thi. Vui lòng kiểm tra lại thông tin và thử lại.';
const FALLBACK_UPDATE_ERROR =
  'Không lưu được thay đổi. Vui lòng kiểm tra lại thông tin và thử lại.';
const FALLBACK_CANCEL_ERROR = 'Không huỷ được phiên thi. Vui lòng thử lại.';

function describeError(error: unknown, fallback: string): string {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return fallback;
  }
  const { message } = error;
  if (typeof message === 'string' && message.trim() !== '') {
    return message;
  }
  if (Array.isArray(message) && message.length > 0) {
    return message.join('. ');
  }
  return fallback;
}

export function describeCreateError(error: unknown): string {
  return describeError(error, FALLBACK_CREATE_ERROR);
}

/** Sửa phiên: câu của server (cửa sổ sửa đã đóng, va chạm phòng/lớp/giãn cách) là câu hữu ích; dự phòng không nói "tạo". */
export function describeUpdateError(error: unknown): string {
  return describeError(error, FALLBACK_UPDATE_ERROR);
}

/** Huỷ phiên: câu 409 "Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc" là cái giảng viên cần đọc. */
export function describeCancelError(error: unknown): string {
  return describeError(error, FALLBACK_CANCEL_ERROR);
}
```

2. **Trường và luật giờ dùng chung:** ngay trên dòng chú thích `// Exported so the rule can be unit-tested directly against the schema` thêm:

```ts
// Các trường dùng chung của form TẠO và form SỬA: cùng luật, cùng câu lỗi. Hai form lệch nhau về một luật giờ là cách người dùng thấy một giờ
// hợp lệ ở form này và bị từ chối ở form kia.
const nameField = z
  .string()
  .trim()
  .min(1, 'Vui lòng nhập tên phiên thi')
  .max(200, 'Tên phiên thi tối đa 200 ký tự');
const examTypeField = z.enum(EXAM_TYPES, { message: 'Vui lòng chọn loại kỳ thi' });
// Bound to <input type="datetime-local">, so this is the browser's
// "YYYY-MM-DDTHH:mm" local-time string, not ISO 8601 yet — converted to
// a real ISO string in onSubmit before it reaches the API (the backend's
// @IsISO8601() needs a full ISO string, e.g. with seconds + offset).
const startTimeField = z.string().min(1, 'Vui lòng chọn thời gian bắt đầu');
const endTimeField = z.string().min(1, 'Vui lòng chọn thời gian kết thúc');

type TimeFields = { startTime: string; endTime: string };

const endsAfterStart = (values: TimeFields): boolean => {
  const start = new Date(values.startTime).getTime();
  const end = new Date(values.endTime).getTime();
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
};

// Mirrors the backend's IsNotExcessivelyBackdatedConstraint. Caught here
// so the message lands on the field to fix rather than arriving as a 400
// after a round trip.
const startNotBackdated = (values: TimeFields): boolean => {
  const start = new Date(values.startTime).getTime();
  if (!Number.isFinite(start)) return true;
  return start >= Date.now() - MAX_BACKDATE_MINUTES * 60_000;
};

// Mirrors the backend's HasMinimumDurationConstraint. Skips entirely when
// end <= start — that's the ordering rule's error to report, not a
// "too short" message stacked on top of an already-invalid ordering.
const longEnough = (values: TimeFields): boolean => {
  const start = new Date(values.startTime).getTime();
  const end = new Date(values.endTime).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return true;
  return end - start >= MIN_EXAM_DURATION_MINUTES * 60_000;
};

const END_AFTER_START_ISSUE = { message: 'Thời gian kết thúc phải sau thời gian bắt đầu', path: ['endTime'] };
const START_NOT_BACKDATED_ISSUE = {
  message: `Thời gian bắt đầu không được sớm hơn hiện tại quá ${MAX_BACKDATE_MINUTES} phút`,
  path: ['startTime'],
};
const LONG_ENOUGH_ISSUE = { message: `Phiên thi phải kéo dài ít nhất ${MIN_EXAM_DURATION_MINUTES} phút`, path: ['endTime'] };

```

3. **Schema tạo — các trường:** trong `createExamSessionSchema` (a) thay khối `name: z.string().trim().min(1, …).max(200, …),` bằng `name: nameField,`; (b) thay **toàn bộ** khối từ chú thích `/** Phòng và học kỳ là VĂN BẢN TỰ DO từ đợt thu hẹp master data …` đến hết `semesterName: z.string()….max(150, 'Tên học kỳ tối đa 150 ký tự'),` bằng:

```ts
    /**
     * Phòng CHỌN từ danh sách phòng đang hoạt động (`GET /rooms`), không còn gõ chữ: gõ lệch một ký tự từng làm phép chống trùng lịch phòng
     * (so chuỗi chính xác) mất tác dụng — nay phép đó chạy theo `room_id`. Học kỳ không còn là trường của form: suy từ lớp ở server.
     */
    roomId: z.string().uuid('Vui lòng chọn phòng thi'),
```

(c) thay `examType: z.enum(EXAM_TYPES, { message: 'Vui lòng chọn loại kỳ thi' }),` bằng `examType: examTypeField,`; (d) thay khối chú thích `// Bound to <input type="datetime-local">, …` cùng hai dòng `startTime: z.string()…,`/`endTime: z.string()…,` (trong schema tạo) bằng

```ts
    startTime: startTimeField,
    endTime: endTimeField,
```

4. **Schema tạo — luật giờ:** thay ba khối `.refine(…)` đầu tiên sau `.min(1, 'Cần khai báo ít nhất 1 file bắt buộc'),\n  })` (từ `.refine(` mở đầu "values.startTime…end > start" đến hết khối "HasMinimumDurationConstraint", ngay trước chú thích `// Mirrors the backend's @ArrayUnique() on requiredFilenames`) bằng:

```ts
  .refine(endsAfterStart, END_AFTER_START_ISSUE)
  .refine(startNotBackdated, START_NOT_BACKDATED_ISSUE)
  .refine(longEnough, LONG_ENOUGH_ISSUE)
```

(Khối `.refine` kiểm trùng tên file ngay sau giữ nguyên.)

5. **Schema sửa:** thêm vào **cuối file**, sau dòng `export type CreateExamSessionFormValues = …`:

```ts

/**
 * Form SỬA phiên (plan F): CHỈ năm trường server cho sửa. Lớp, danh sách file bắt buộc, rubric và học kỳ KHÔNG có mặt — `z.object` bỏ mọi
 * khoá lạ khỏi kết quả, nên không có đường nào gửi nhầm chúng (server trả 400 nếu nhận).
 *
 * `roomId` cho phép '' — phiên tạo trước khi có danh mục phòng chưa gắn phòng (trước backfill, plan H): sửa tên/loại vẫn được, `editPayload`
 * không gửi phòng; đổi giờ mà không chọn phòng thì server trả 400 nói rõ.
 */
export const editExamSessionSchema = z
  .object({
    name: nameField,
    roomId: z
      .string()
      .refine((value) => value === '' || z.string().uuid().safeParse(value).success, { message: 'Phòng không hợp lệ' }),
    examType: examTypeField,
    startTime: startTimeField,
    endTime: endTimeField,
  })
  .refine(endsAfterStart, END_AFTER_START_ISSUE)
  .refine(startNotBackdated, START_NOT_BACKDATED_ISSUE)
  .refine(longEnough, LONG_ENOUGH_ISSUE);

export type EditExamSessionFormValues = z.infer<typeof editExamSessionSchema>;
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/new/schema.test.ts src/app/teacher/exam-sessions/new/_components`
Expected: PASS (cả `RequiredFilenamesInput.test.tsx` và `RubricPicker.test.tsx` — chúng dùng `createExamSessionSchema` làm resolver, không đụng phòng). Nếu một ca đồng hồ ("lùi giờ bắt đầu") trượt vì chạy sát nửa đêm, đó là lỗi của test (không phải schema) — `futureStart()` đã tránh nó cho ca hợp lệ.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/teacher/exam-sessions/new/schema.ts apps/web/src/app/teacher/exam-sessions/new/schema.test.ts
git commit -m "feat(web): schema form phiên thi chọn phòng (roomId), luật giờ dùng chung cho tạo và sửa, schema sửa và câu lỗi riêng"
```

---

### Task 4: Các ô chung và trang tạo phiên (phòng chọn, học kỳ chỉ-xem)

**Files:**
- Create: `apps/web/src/app/teacher/exam-sessions/_components/session-fields.tsx`
- Modify (viết lại): `apps/web/src/app/teacher/exam-sessions/new/page.tsx`
- Test: `apps/web/src/app/teacher/exam-sessions/_components/session-fields.test.tsx` (mới), `apps/web/src/app/teacher/exam-sessions/new/page.test.tsx` (mới — trang này chưa từng có test)

**Interfaces:**
- Consumes: `useRooms({ activeOnly })` (G1), `EXAM_TYPES` và `createExamSessionSchema` (Task 3), `TeachingClass.labelWithSemester/label` (G3a), `semesterTextOf` (G2), `toDatetimeLocal` (Task 2), `useCreateExamSession` (đã có).
- Produces:

```tsx
export interface SessionBasicsValues { name: string; roomId: string; examType: string; startTime: string; endTime: string }
export function SessionNameField(): JSX.Element;
export function SessionRoomField(props: { keep?: { id: string; name: string } | null }): JSX.Element;   // keep: phòng hiện tại của phiên đang sửa
export function SessionExamTypeField(): JSX.Element;
export function SessionTimeFields(): JSX.Element;
export function SessionSemesterReadout(props: { text: string }): JSX.Element;
// Tất cả đọc form qua useFormContext (FormProvider do trang dựng).
```

- [ ] **Step 1: Viết test cho các ô chung (đỏ)**

Create `apps/web/src/app/teacher/exam-sessions/_components/session-fields.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FormProvider, useForm } from 'react-hook-form';

const h = vi.hoisted(() => ({
  rooms: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  roomsArgs: [] as unknown[],
}));
vi.mock('@/hooks/useRooms', () => ({
  useRooms: (options: unknown) => {
    h.roomsArgs.push(options);
    return h.rooms;
  },
}));

import {
  SessionExamTypeField,
  SessionNameField,
  SessionRoomField,
  SessionSemesterReadout,
  SessionTimeFields,
  type SessionBasicsValues,
} from './session-fields';

const ROOMS = [
  { id: 'r1', name: 'Phòng máy A1', capacity: null, isActive: true },
  { id: 'r2', name: 'Phòng máy B1', capacity: 40, isActive: true },
];

function Harness({ defaults = {}, keep, roomError }: { defaults?: Partial<SessionBasicsValues>; keep?: { id: string; name: string } | null; roomError?: string }) {
  const form = useForm<SessionBasicsValues>({ defaultValues: { name: '', roomId: '', examType: '', startTime: '', endTime: '', ...defaults } });
  useEffect(() => {
    if (roomError) form.setError('roomId', { message: roomError });
  }, [roomError, form]);
  return (
    <FormProvider {...form}>
      <SessionNameField />
      <SessionRoomField keep={keep} />
      <SessionExamTypeField />
      <SessionTimeFields />
      <SessionSemesterReadout text="HK1 2026-2027" />
      <output data-testid="values">{JSON.stringify(form.watch())}</output>
    </FormProvider>
  );
}

const values = () => JSON.parse(screen.getByTestId('values').textContent ?? '{}') as SessionBasicsValues;
const choose = (name: string, option: string) => {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};

describe('session-fields', () => {
  beforeEach(() => {
    h.rooms = { data: ROOMS, isLoading: false, isError: false, refetch: vi.fn() };
    h.roomsArgs.length = 0;
  });

  it('phòng: chỉ hỏi phòng ĐANG HOẠT ĐỘNG, kèm sức chứa khi có; chọn thì ghi roomId', () => {
    render(<Harness />);
    expect(h.roomsArgs.at(-1)).toEqual({ activeOnly: true });
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng máy A1' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Phòng máy B1 (40 chỗ)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: 'Phòng máy B1 (40 chỗ)' }));
    expect(values().roomId).toBe('r2');
  });

  it('Review Focus 1: phòng không phải ô gõ chữ', () => {
    render(<Harness />);
    expect(screen.queryByRole('textbox', { name: 'Phòng thi' })).not.toBeInTheDocument();
  });

  it('Review Focus 3: phòng hiện tại đã NGỪNG hoạt động vẫn là một lựa chọn, gắn rõ, và là giá trị đang chọn', () => {
    render(<Harness keep={{ id: 'r9', name: 'Phòng cũ' }} defaults={{ roomId: 'r9' }} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng cũ (đã ngừng hoạt động)' })).toHaveAttribute('data-state', 'checked');
    expect(values().roomId).toBe('r9');
  });

  it('phòng hiện tại còn hoạt động thì KHÔNG bị liệt kê hai lần', () => {
    render(<Harness keep={{ id: 'r1', name: 'Phòng máy A1' }} defaults={{ roomId: 'r1' }} />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getAllByRole('option', { name: /Phòng máy A1/ })).toHaveLength(1);
  });

  it('chưa có phòng đang hoạt động → nói rõ; nhưng đang giữ một phòng cũ thì còn lựa chọn nên không nói vậy', () => {
    h.rooms = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    const { unmount } = render(<Harness />);
    expect(screen.getByText(/Chưa có phòng thi nào đang hoạt động nên chưa tạo được phiên thi/)).toBeInTheDocument();
    unmount();
    render(<Harness keep={{ id: 'r9', name: 'Phòng cũ' }} defaults={{ roomId: 'r9' }} />);
    expect(screen.queryByText(/Chưa có phòng thi nào đang hoạt động/)).not.toBeInTheDocument();
  });

  it('không tải được danh sách phòng → báo và có "Thử lại"', () => {
    h.rooms = { data: undefined, isLoading: false, isError: true, refetch: vi.fn() };
    render(<Harness />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được danh sách phòng');
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(h.rooms.refetch).toHaveBeenCalled();
  });

  it('lỗi của form hiện ngay ở ô phòng', async () => {
    render(<Harness roomError="Vui lòng chọn phòng thi" />);
    expect(await screen.findByText('Vui lòng chọn phòng thi')).toBeInTheDocument();
  });

  it('loại kỳ thi: ba lựa chọn theo nhãn tiếng Việt', () => {
    render(<Harness />);
    choose('Loại kỳ thi', 'Giữa kỳ');
    expect(values().examType).toBe('GK');
    fireEvent.click(screen.getByRole('combobox', { name: 'Loại kỳ thi' }));
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Thường kỳ', 'Giữa kỳ', 'Cuối kỳ']);
  });

  it('tên và hai ô giờ ghi vào form', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu'), { target: { value: '2026-10-06T08:00' } });
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: '2026-10-06T10:00' } });
    expect(values()).toMatchObject({ name: 'Giữa kỳ N01', startTime: '2026-10-06T08:00', endTime: '2026-10-06T10:00' });
  });

  it('học kỳ chỉ để xem: ô chỉ đọc, hiện đúng chữ được truyền vào', () => {
    render(<Harness />);
    const semester = screen.getByLabelText('Học kỳ');
    expect(semester).toHaveAttribute('readonly');
    expect(semester).toHaveValue('HK1 2026-2027');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/_components/session-fields.test.tsx`
Expected: FAIL — không import được `./session-fields`.

- [ ] **Step 3: Viết `_components/session-fields.tsx`**

```tsx
'use client';

import { CircleAlert } from 'lucide-react';
import { Controller, useFormContext } from 'react-hook-form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRooms } from '@/hooks/useRooms';
import { EXAM_TYPE_LABELS } from '@/lib/exam-session-display';
import { EXAM_TYPES } from '../new/schema';

/**
 * Các ô CHUNG của form tạo và form sửa phiên thi (spec §4.1: trang sửa "dùng lại form tạo"). Mỗi ô đọc form qua `useFormContext` — trang dựng
 * `FormProvider` — nên cùng một ô, cùng một câu lỗi, cùng một cách chọn phòng ở cả hai nơi. Kiểu dưới đây chỉ là PHẦN chung; form tạo có thêm
 * lớp, rubric, file bắt buộc, và dùng kiểu rộng hơn.
 */
export interface SessionBasicsValues {
  name: string;
  roomId: string;
  examType: string;
  startTime: string;
  endTime: string;
}

export function SessionNameField() {
  const {
    register,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  return (
    <FormField id="exam-session-name" label="Tên phiên thi" error={errors.name?.message}>
      <Input
        id="exam-session-name"
        placeholder="vd: Thi cuối kỳ Lập trình Web — nhóm 03"
        invalid={Boolean(errors.name)}
        {...register('name')}
      />
    </FormField>
  );
}

/**
 * Phòng CHỌN từ danh sách phòng đang hoạt động (spec §5.2) — không còn gõ chữ. Gõ lệch một ký tự từng làm phép chống trùng lịch phòng mất tác
 * dụng; nay phép đó chạy theo `room_id`, và ô này chỉ cho chọn đúng những phòng admin còn dùng.
 *
 * `keep` là phòng HIỆN TẠI của phiên đang sửa. Nếu admin đã ngừng dùng phòng đó, nó vẫn là một lựa chọn (gắn "đã ngừng hoạt động") và là giá trị
 * đang chọn, để sửa tên hay giờ không buộc phải đổi phòng (T-SES-6); nếu ô không có giá trị hiện tại, Select rơi về "chưa chọn" và một lần sửa
 * tên sẽ âm thầm xoá phòng.
 */
export function SessionRoomField({ keep = null }: { keep?: { id: string; name: string } | null }) {
  const {
    control,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  const rooms = useRooms({ activeOnly: true });
  const active = rooms.data ?? [];
  const kept = keep !== null && !active.some((room) => room.id === keep.id) ? keep : null;
  const noRooms = !rooms.isLoading && !rooms.isError && active.length === 0 && kept === null;

  return (
    <FormField
      id="exam-session-room"
      label="Phòng thi"
      hint="Chọn trong danh sách phòng đang hoạt động."
      error={errors.roomId?.message}
    >
      <Controller
        control={control}
        name="roomId"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange} disabled={rooms.isLoading || rooms.isError}>
            <SelectTrigger id="exam-session-room">
              <SelectValue placeholder={rooms.isLoading ? 'Đang tải…' : 'Chọn phòng thi'} />
            </SelectTrigger>
            <SelectContent>
              {kept && <SelectItem value={kept.id}>{kept.name} (đã ngừng hoạt động)</SelectItem>}
              {active.map((room) => (
                <SelectItem key={room.id} value={room.id}>
                  {room.name}
                  {room.capacity ? ` (${room.capacity} chỗ)` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      {rooms.isError && (
        <p role="alert" className="flex items-center gap-1.5 text-small font-medium text-danger-strong">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Không tải được danh sách phòng.
          <button
            type="button"
            onClick={() => rooms.refetch()}
            className="rounded-sm underline underline-offset-2 hover:no-underline"
          >
            Thử lại
          </button>
        </p>
      )}
      {noRooms && (
        <Alert variant="info">
          <AlertDescription>
            Chưa có phòng thi nào đang hoạt động nên chưa tạo được phiên thi. Quản trị viên tạo phòng ở mục Phòng thi.
          </AlertDescription>
        </Alert>
      )}
    </FormField>
  );
}

export function SessionExamTypeField() {
  const {
    control,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  return (
    <FormField id="exam-session-type" label="Loại kỳ thi" error={errors.examType?.message}>
      <Controller
        control={control}
        name="examType"
        render={({ field }) => (
          <Select value={field.value} onValueChange={field.onChange}>
            <SelectTrigger id="exam-session-type">
              <SelectValue placeholder="Chọn loại kỳ thi" />
            </SelectTrigger>
            <SelectContent>
              {EXAM_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {EXAM_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </FormField>
  );
}

export function SessionTimeFields() {
  const {
    register,
    formState: { errors },
  } = useFormContext<SessionBasicsValues>();
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField id="exam-session-start-time" label="Thời gian bắt đầu" error={errors.startTime?.message}>
        <Input
          id="exam-session-start-time"
          type="datetime-local"
          invalid={Boolean(errors.startTime)}
          {...register('startTime')}
        />
      </FormField>
      <FormField id="exam-session-end-time" label="Thời gian kết thúc" error={errors.endTime?.message}>
        <Input
          id="exam-session-end-time"
          type="datetime-local"
          invalid={Boolean(errors.endTime)}
          {...register('endTime')}
        />
      </FormField>
    </div>
  );
}

/**
 * Học kỳ chỉ để XEM, lấy từ lớp (spec §5.2): không có ô chọn, không gửi lên. Server suy học kỳ từ lớp và chụp chữ vào phiên — chữ đó
 * bảng điểm in ra và không đổi về sau.
 */
export function SessionSemesterReadout({ text }: { text: string }) {
  return (
    <FormField
      id="exam-session-semester"
      label="Học kỳ"
      hint="Lấy từ lớp, không chọn riêng. Chụp vào phiên thi lúc tạo và không đổi về sau — bảng điểm in đúng chữ này."
    >
      <Input id="exam-session-semester" value={text} readOnly aria-readonly="true" />
    </FormField>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/_components/session-fields.test.tsx`
Expected: PASS. Ca dễ trượt: "phòng hiện tại đã ngừng" cần `kept` được tính từ `active` **trước** khi dữ liệu tải xong (nên `keep` hiện ngay cả khi `rooms.data` còn `undefined`) — đó là lý do `active = rooms.data ?? []` chứ không chặn bằng `isLoading`.

- [ ] **Step 5: Viết test cho trang tạo (đỏ)**

Create `apps/web/src/app/teacher/exam-sessions/new/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  create: { isPending: false, isError: false, error: null as unknown, reset: vi.fn() },
  classes: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  rooms: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  roomsArgs: [] as unknown[],
  rubrics: { data: [] as unknown, isLoading: false },
}));

vi.mock('@/hooks/useExamSession', () => ({ useCreateExamSession: () => ({ ...h.create, mutate: h.mutate }) }));
vi.mock('@/hooks/useTeaching', () => ({ useTeachingClasses: () => h.classes }));
vi.mock('@/hooks/useRooms', () => ({
  useRooms: (options: unknown) => {
    h.roomsArgs.push(options);
    return h.rooms;
  },
}));
vi.mock('@/hooks/useGrading', () => ({ useRubrics: () => h.rubrics }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toDatetimeLocal } from '@/lib/exam-session-form';
import NewExamSessionPage from './page';

const CLASSES = [
  {
    id: 'k1', label: 'DHKTPM18A – Nhóm 1', labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027', courseName: 'CTDL&GT',
    semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30,
  },
  { id: 'k2', label: 'DHKTPM17B', labelWithSemester: 'DHKTPM17B', courseName: 'CTDL&GT', semesterId: null, academicYear: null, term: null, studentCount: 0 },
];
const ROOMS = [
  { id: 'r1', name: 'Phòng máy A1', capacity: null, isActive: true },
  { id: 'r2', name: 'Phòng máy B1', capacity: 40, isActive: true },
];

const choose = (name: string, option: string) => {
  fireEvent.click(screen.getByRole('combobox', { name }));
  fireEvent.click(screen.getByRole('option', { name: option }));
};
const inOneDay = (extraHours = 0) => toDatetimeLocal(new Date(Date.now() + (24 + extraHours) * 3_600_000).toISOString());

beforeEach(() => {
  h.mutate.mockReset();
  h.create = { isPending: false, isError: false, error: null, reset: vi.fn() };
  h.classes = { data: CLASSES, isLoading: false, isError: false, refetch: vi.fn() };
  h.rooms = { data: ROOMS, isLoading: false, isError: false, refetch: vi.fn() };
  h.roomsArgs.length = 0;
  h.rubrics = { data: [], isLoading: false };
});

describe('NewExamSessionPage', () => {
  it('Review Focus 1: phòng là ô CHỌN từ phòng đang hoạt động, học kỳ chỉ đọc — không còn ô gõ chữ cho hai thứ đó', () => {
    render(<NewExamSessionPage />);
    expect(h.roomsArgs.at(-1)).toEqual({ activeOnly: true });
    expect(screen.getByRole('combobox', { name: 'Phòng thi' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Phòng thi' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Học kỳ')).toHaveAttribute('readonly');
  });

  it('lớp hiện bằng nhãn gộp có học kỳ, kèm số sinh viên', () => {
    render(<NewExamSessionPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Lớp thi' }));
    expect(screen.getByRole('option', { name: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)' })).toBeInTheDocument();
  });

  it('chọn lớp thì học kỳ (chỉ đọc) theo lớp; lớp chưa có học kỳ hiện "Chưa gán học kỳ"', () => {
    render(<NewExamSessionPage />);
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('Chọn lớp để xem học kỳ');
    choose('Lớp thi', 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)');
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('HK1 2026-2027');
    choose('Lớp thi', 'DHKTPM17B (0 SV)');
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('Chưa gán học kỳ');
  });

  it('chưa được giao lớp nào: chữ nguyên văn spec §5.2, KHÔNG mời tạo lớp', () => {
    h.classes = { data: [], isLoading: false, isError: false, refetch: vi.fn() };
    render(<NewExamSessionPage />);
    expect(screen.getByText('Bạn chưa có lớp nào được giao nên chưa tạo được phiên thi.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tạo lớp/ })).not.toBeInTheDocument();
  });

  it('lớp chưa có danh sách sinh viên → cảnh báo (vẫn tạo được), gọi lớp bằng nhãn', () => {
    render(<NewExamSessionPage />);
    choose('Lớp thi', 'DHKTPM17B (0 SV)');
    expect(screen.getByText(/Lớp DHKTPM17B chưa có danh sách sinh viên/)).toBeInTheDocument();
  });

  it('Review Focus 1: thân gửi lên có roomId và KHÔNG có roomName/semesterName; giờ là ISO', async () => {
    render(<NewExamSessionPage />);
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    choose('Lớp thi', 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)');
    choose('Phòng thi', 'Phòng máy A1');
    choose('Loại kỳ thi', 'Giữa kỳ');
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu'), { target: { value: inOneDay() } });
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: inOneDay(2) } });
    fireEvent.change(screen.getByPlaceholderText(/bai_lam\.docx/i), { target: { value: 'Cau1.docx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên thi' }));

    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    const body = h.mutate.mock.calls[0][0];
    expect(body).toMatchObject({ name: 'Giữa kỳ N01', classId: 'k1', roomId: 'r1', examType: 'GK', requiredFilenames: [{ filename: 'Cau1.docx' }] });
    expect(body).not.toHaveProperty('roomName');
    expect(body).not.toHaveProperty('semesterName');
    expect(body.startTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it('thiếu phòng thì không gửi và báo ở ô phòng', async () => {
    render(<NewExamSessionPage />);
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên thi' }));
    expect(await screen.findByText('Vui lòng chọn phòng thi')).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('lỗi của server (va chạm phòng) hiện nguyên văn', () => {
    h.create = { isPending: false, isError: true, error: { message: 'Phòng Phòng máy A1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.' }, reset: vi.fn() };
    render(<NewExamSessionPage />);
    expect(screen.getByText('Phòng Phòng máy A1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.')).toBeInTheDocument();
  });

  it('tạo xong → màn mã phiên, có "Vào phòng chờ"', () => {
    h.mutate.mockImplementation((_body: unknown, options?: { onSuccess?: (s: { id: string; code: string }) => void }) =>
      options?.onSuccess?.({ id: 'new1', code: 'ABC123' }),
    );
    render(<NewExamSessionPage />);
    // Gọi thẳng qua form hợp lệ là dài; ở đây chỉ kiểm màn thành công khi mutate báo xong.
    fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value: 'Giữa kỳ N01' } });
    choose('Lớp thi', 'DHKTPM18A – Nhóm 1 · HK1 2026-2027 (30 SV)');
    choose('Phòng thi', 'Phòng máy A1');
    choose('Loại kỳ thi', 'Giữa kỳ');
    fireEvent.change(screen.getByLabelText('Thời gian bắt đầu'), { target: { value: inOneDay() } });
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: inOneDay(2) } });
    fireEvent.change(screen.getByPlaceholderText(/bai_lam\.docx/i), { target: { value: 'Cau1.docx' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo phiên thi' }));
    return waitFor(() => {
      expect(screen.getByText('Đã tạo phiên thi')).toBeInTheDocument();
      expect(screen.getByText('ABC123')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Vào phòng chờ' })).toHaveAttribute('href', '/exam-sessions/new1');
    });
  });
});
```

- [ ] **Step 6: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/new/page.test.tsx`
Expected: FAIL — trang còn ô gõ chữ cho phòng/học kỳ, còn đọc `klass.name`, còn gọi `useExamSessions`.

- [ ] **Step 7: Viết lại `new/page.tsx`**

Thay **toàn bộ** nội dung `apps/web/src/app/teacher/exam-sessions/new/page.tsx` bằng (giữ nguyên kết thúc dòng CRLF của file nếu công cụ ghi file không tự giữ — kiểm bằng `file`):

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm, FormProvider, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleAlert, CircleCheckBig, Copy, TriangleAlert } from 'lucide-react';
import { useCreateExamSession } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { semesterTextOf } from '@/lib/master-data-forms';
import {
  SessionExamTypeField,
  SessionNameField,
  SessionRoomField,
  SessionSemesterReadout,
  SessionTimeFields,
} from '../_components/session-fields';
import { RequiredFilenamesInput } from './_components/RequiredFilenamesInput';
import { RubricPicker } from './_components/RubricPicker';
import {
  createExamSessionSchema,
  describeCreateError,
  type CreateExamSessionFormValues,
} from './schema';

const EMPTY_FORM: CreateExamSessionFormValues = {
  name: '',
  classId: '',
  roomId: '',
  // Empty-string sentinel for "not yet chosen" (same as classId above),
  // even though it's outside the Zod enum's real output type — the
  // resolver still rejects submit until the user consciously picks one;
  // this cast only tells RHF what shape the default *starts* as.
  examType: '' as CreateExamSessionFormValues['examType'],
  startTime: '',
  endTime: '',
  // Cùng kiểu sentinel chuỗi rỗng như classId — schema quy nó về
  // undefined, vì "chưa chọn rubric" là hợp lệ chứ không phải uuid hỏng.
  rubricId: '',
  requiredFilenames: [{ value: '', deliverableType: 'document' }],
};

async function copySessionCode(code: string) {
  try {
    await navigator.clipboard.writeText(code);
    toast.success(`Đã sao chép mã "${code}"`);
  } catch {
    // Clipboard access can be denied (permissions, non-HTTPS context) —
    // the code is on screen at projector size anyway, so this is a
    // degraded-but-usable failure, not a dead end.
    toast.error('Không sao chép được — hãy đọc mã trực tiếp cho sinh viên.');
  }
}

// Moved from app/(exam-live)/exam-sessions/new (Phase 0 route rename).
//
// Từ đợt khôi phục master data: PHÒNG chọn từ danh sách phòng đang hoạt động (không còn gõ chữ), HỌC KỲ chỉ để xem — lấy từ lớp, server chụp
// chữ vào phiên. Các ô chung với trang sửa nằm ở `../_components/session-fields`.
export default function NewExamSessionPage() {
  const createExamSession = useCreateExamSession();
  const classes = useTeachingClasses();
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);

  const form = useForm<CreateExamSessionFormValues>({
    resolver: zodResolver(createExamSessionSchema),
    defaultValues: EMPTY_FORM,
  });

  const selectedClass = classes.data?.find((c) => c.id === form.watch('classId'));

  // Not an error: a session can be created and run without a roster. But
  // nobody will get in — agent:join requires an enrollment — and finding
  // that out at the start of the exam is the failure this warning prevents.
  const noRoster = selectedClass?.studentCount === 0;

  function onSubmit(values: CreateExamSessionFormValues) {
    createExamSession.mutate(
      {
        name: values.name,
        classId: values.classId,
        roomId: values.roomId,
        examType: values.examType,
        startTime: new Date(values.startTime).toISOString(),
        endTime: new Date(values.endTime).toISOString(),
        // Schema đã quy chuỗi rỗng về undefined, nên "không chọn rubric" đi
        // ra ngoài dây dưới dạng field vắng mặt — đúng cái DTO @IsOptional
        // của server chờ đợi.
        rubricId: values.rubricId,
        // Chỉ gửi `entries` khi khối "Kiểm file bên trong" thực sự có dòng
        // nào — bỏ hẳn key thay vì gửi mảng rỗng, khớp đúng luật DTO backend
        // "mảng rỗng/vắng mặt = không khai file bên trong" (spec §4.1).
        requiredFilenames: values.requiredFilenames.map((filename) => ({
          filename: filename.value,
          // Chỉ gửi khi khác mặc định — giữ tương thích ngược cho ca phổ
          // biến nhất (tài liệu, không ngôn ngữ) thay vì gửi field thừa.
          ...(filename.deliverableType !== 'document' ? { deliverableType: filename.deliverableType } : {}),
          ...(filename.language ? { language: filename.language } : {}),
          ...(filename.entries && filename.entries.length > 0
            ? { entries: filename.entries.map((entry) => entry.value) }
            : {}),
        })),
      },
      {
        onSuccess: (session) => setCreated({ id: session.id, code: session.code }),
      },
    );
  }

  if (created) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
        {/* Every error path below uses role="alert" — this is the
            equivalent for the success outcome, so a screen reader
            announces the newly created code instead of silence.
            role="status" (not "alert") since this isn't urgent or
            interrupting, just an important state change. */}
        <Card data-animate role="status" className="overflow-hidden">
          <div className="h-1 w-full bg-success" aria-hidden="true" />
          <CardHeader className="items-center text-center">
            <span className="icon-chip mb-1 h-12 w-12 rounded-full bg-success-subtle text-success-strong">
              <CircleCheckBig className="h-6 w-6" aria-hidden="true" />
            </span>
            <CardTitle>Đã tạo phiên thi</CardTitle>
            <CardDescription>
              Đọc mã này cho sinh viên hoặc chiếu lên máy chiếu để sinh viên tự nhập.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-6">
            {/* Oversized with wide tracking on purpose — this is read off
                a projector from across a room, not scanned in a table. */}
            <p className="break-all text-center text-beacon text-primary">{created.code}</p>

            <Button type="button" variant="outline" size="sm" onClick={() => copySessionCode(created.code)}>
              <Copy className="h-4 w-4" aria-hidden="true" />
              Sao chép mã
            </Button>

            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link href={`/exam-sessions/${created.id}`}>Vào phòng chờ</Link>
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // Reset before clearing `created`, so the form that
                  // reappears is empty rather than still holding the
                  // session that was just created.
                  form.reset(EMPTY_FORM);
                  createExamSession.reset();
                  setCreated(null);
                }}
              >
                Tạo phiên thi khác
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        title="Tạo phiên thi mới"
        description="Khai báo lớp, phòng, khung giờ và những file sinh viên bắt buộc phải nộp."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/teacher/exam-sessions">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách phiên thi
            </Link>
          </Button>
        }
      />

      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Card data-animate>
            <CardHeader>
              <CardTitle>Thông tin phiên thi</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <SessionNameField />

              {/* The lecturer picks a CLASS, not a course. The course
                  follows from it server-side, and this list only ever holds
                  classes they were assigned — a class is what they actually
                  teach, and what the roster and the headcount hang off.
                  Nhãn gộp CÓ học kỳ: cùng một lớp học ở hai kỳ là hai lớp. */}
              <FormField
                id="exam-session-class"
                label="Lớp thi"
                error={classes.isError ? undefined : form.formState.errors.classId?.message}
              >
                <Controller
                  control={form.control}
                  name="classId"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={classes.isLoading || classes.isError}
                    >
                      <SelectTrigger id="exam-session-class">
                        <SelectValue placeholder={classes.isLoading ? 'Đang tải…' : 'Chọn lớp thi'} />
                      </SelectTrigger>
                      <SelectContent>
                        {classes.data?.map((klass) => (
                          <SelectItem key={klass.id} value={klass.id}>
                            {klass.labelWithSemester} ({klass.studentCount} SV)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {classes.isError && (
                  <p role="alert" className="flex items-center gap-1.5 text-small font-medium text-danger-strong">
                    <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    Không tải được danh sách lớp.
                    <button
                      type="button"
                      onClick={() => classes.refetch()}
                      className="rounded-sm underline underline-offset-2 hover:no-underline"
                    >
                      Thử lại
                    </button>
                  </p>
                )}
              </FormField>

              {!classes.isLoading && !classes.isError && classes.data?.length === 0 && (
                <Alert variant="info">
                  <AlertDescription>
                    Bạn chưa có lớp nào được giao nên chưa tạo được phiên thi.
                  </AlertDescription>
                </Alert>
              )}

              {noRoster && (
                <Alert variant="warning">
                  <TriangleAlert />
                  <AlertDescription>
                    Lớp {selectedClass?.label} chưa có danh sách sinh viên. Bạn vẫn tạo được
                    phiên thi, nhưng chưa nhập danh sách thì không sinh viên nào vào được —
                    hãy nhập danh sách lớp trước.
                  </AlertDescription>
                </Alert>
              )}

              <SessionSemesterReadout
                text={selectedClass ? semesterTextOf(selectedClass) : 'Chọn lớp để xem học kỳ'}
              />

              <SessionRoomField />

              {/* Rubric thuộc về GIẢNG VIÊN từ đợt thu hẹp master data, nên
                  danh sách không còn phụ thuộc lớp đã chọn. */}
              <RubricPicker />

              <SessionExamTypeField />

              <SessionTimeFields />

              <RequiredFilenamesInput />

              {createExamSession.isError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>
                    {/* The server's message, not a guess at what went
                        wrong. A room or class clash names the booking
                        already holding the slot — the one thing that tells
                        the lecturer what to change. */}
                    {describeCreateError(createExamSession.error)}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/exam-sessions">Hủy</Link>
            </Button>
            <Button type="submit" size="lg" loading={createExamSession.isPending}>
              {createExamSession.isPending ? 'Đang tạo…' : 'Tạo phiên thi'}
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
```

- [ ] **Step 8: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/teacher/exam-sessions/new src/app/teacher/exam-sessions/_components/session-fields.test.tsx`
Expected: PASS (gồm `schema.test.ts`, `RequiredFilenamesInput.test.tsx`, `RubricPicker.test.tsx`). Ca dễ trượt: ca "thiếu phòng" đòi lỗi `roomId` hiện ở ô phòng — nếu thiếu, kiểm `SessionRoomField` đọc `errors.roomId?.message` (kiểu form là `SessionBasicsValues` nhưng tên trường phải trùng `roomId` của schema tạo).

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/app/teacher/exam-sessions/_components/session-fields.tsx apps/web/src/app/teacher/exam-sessions/_components/session-fields.test.tsx apps/web/src/app/teacher/exam-sessions/new/page.tsx apps/web/src/app/teacher/exam-sessions/new/page.test.tsx
git commit -m "feat(web): form tạo phiên chọn phòng từ danh sách, học kỳ chỉ-xem theo lớp, lớp hiện nhãn gộp; tách các ô chung cho trang sửa"
```

---

### Task 5: Trang sửa phiên `/teacher/exam-sessions/[id]/edit`

**Files:**
- Create: `apps/web/src/app/teacher/exam-sessions/[id]/edit/page.tsx`
- Test: `apps/web/src/app/teacher/exam-sessions/[id]/edit/page.test.tsx`

**Interfaces:**
- Consumes: `useExamSessionDetail`, `useUpdateExamSession` (Task 1), `editAvailability` (Task 2), `editFormValuesOf`, `editPayload` (Task 2), `editExamSessionSchema`, `describeUpdateError` (Task 3), các ô chung (Task 4), `useTeachingClasses`, `semesterTextOf`.
- Produces: trang mặc định (route), không export gì khác.

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/app/teacher/exam-sessions/[id]/edit/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  toastSuccess: vi.fn(),
  detail: { data: undefined as unknown, isLoading: false, isError: false, error: null as unknown },
  mutate: vi.fn(),
  update: { isPending: false, isError: false, error: null as unknown },
  classes: { data: [] as unknown, isLoading: false, isError: false },
  rooms: { data: [] as unknown, isLoading: false, isError: false, refetch: vi.fn() },
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 's1' }), useRouter: () => ({ push: h.push }) }));
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: vi.fn() } }));
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessionDetail: () => h.detail,
  useUpdateExamSession: () => ({ ...h.update, mutate: h.mutate }),
}));
vi.mock('@/hooks/useTeaching', () => ({ useTeachingClasses: () => h.classes }));
vi.mock('@/hooks/useRooms', () => ({ useRooms: () => h.rooms }));

import { EDIT_STARTED_MESSAGE } from '@/lib/exam-session-actions';
import { toDatetimeLocal } from '@/lib/exam-session-form';
import EditExamSessionPage from './page';

const HOUR = 3_600_000;
const iso = (offsetHours: number) => new Date(Date.now() + offsetHours * HOUR).toISOString();

function session(over: Record<string, unknown> = {}) {
  return {
    id: 's1', name: 'Giữa kỳ N01', code: 'ABC123', teacherId: 't1', classId: 'k1', classLabel: 'DHKTPM18A – Nhóm 1',
    courseName: 'CTDL&GT', roomName: 'Phòng máy A1', roomId: 'r1', examType: 'GK',
    startTime: iso(2), endTime: iso(4), status: 'active', completedAt: null, completedBy: null, testBundleId: null,
    requiredDeliverables: [
      { id: 'd1', requiredFilename: 'Cau1.docx', deliverableType: 'document', entries: [] },
      { id: 'd2', requiredFilename: 'BaiThi_{MSSV}.zip', deliverableType: 'document', entries: ['main.cpp'] },
    ],
    ...over,
  };
}
const ROOMS = [
  { id: 'r1', name: 'Phòng máy A1', capacity: null, isActive: true },
  { id: 'r2', name: 'Phòng máy B1', capacity: 40, isActive: true },
];
const KLASS = {
  id: 'k1', label: 'DHKTPM18A – Nhóm 1', labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027', courseName: 'CTDL&GT',
  semesterId: 's1', academicYear: 2026, term: 1, studentCount: 30,
};

const loaded = (over: Record<string, unknown> = {}) => {
  h.detail = { data: session(over), isLoading: false, isError: false, error: null };
};
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
const changeName = (value: string) => fireEvent.change(screen.getByLabelText('Tên phiên thi'), { target: { value } });

beforeEach(() => {
  h.push.mockReset();
  h.toastSuccess.mockReset();
  h.mutate.mockReset();
  h.update = { isPending: false, isError: false, error: null };
  h.classes = { data: [KLASS], isLoading: false, isError: false };
  h.rooms = { data: ROOMS, isLoading: false, isError: false, refetch: vi.fn() };
  loaded();
});

describe('EditExamSessionPage — form', () => {
  it('nạp đúng giá trị hiện có của phiên (giờ theo giờ máy)', () => {
    render(<EditExamSessionPage />);
    const current = session();
    expect(screen.getByLabelText('Tên phiên thi')).toHaveValue('Giữa kỳ N01');
    expect(screen.getByLabelText('Thời gian bắt đầu')).toHaveValue(toDatetimeLocal(current.startTime));
    expect(screen.getByLabelText('Thời gian kết thúc')).toHaveValue(toDatetimeLocal(current.endTime));
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng máy A1' })).toHaveAttribute('data-state', 'checked');
  });

  it('lớp và file bắt buộc bị KHOÁ: chỉ đọc, không có ô chọn lớp hay ô nhập file', () => {
    render(<EditExamSessionPage />);
    expect(screen.getByLabelText('Lớp thi')).toHaveAttribute('readonly');
    expect(screen.getByLabelText('Lớp thi')).toHaveValue('DHKTPM18A – Nhóm 1 · HK1 2026-2027');
    expect(screen.queryByRole('combobox', { name: 'Lớp thi' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Học kỳ')).toHaveValue('HK1 2026-2027');
    expect(screen.getByText('Cau1.docx')).toBeInTheDocument();
    expect(screen.getByText(/BaiThi_\{MSSV\}\.zip/)).toBeInTheDocument();
    expect(screen.getByText(/main\.cpp/)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/bai_lam\.docx/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Sai lớp thì huỷ phiên và tạo lại/)).toBeInTheDocument();
  });

  it('Review Focus 2: chỉ đổi tên → thân chỉ có name (giờ lẻ giây của phiên không bị coi là đã đổi)', async () => {
    render(<EditExamSessionPage />);
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { name: 'Giữa kỳ N02' } });
  });

  it('đổi phòng sang phòng khác → thân có roomId', async () => {
    render(<EditExamSessionPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    fireEvent.click(screen.getByRole('option', { name: 'Phòng máy B1 (40 chỗ)' }));
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { roomId: 'r2' } });
  });

  it('không đổi gì → KHÔNG gọi API, và nói rõ', async () => {
    render(<EditExamSessionPage />);
    submit();
    expect(await screen.findByText('Không có thay đổi nào.')).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('giờ kết thúc không sau giờ bắt đầu → báo ở ô, không gọi API', async () => {
    render(<EditExamSessionPage />);
    fireEvent.change(screen.getByLabelText('Thời gian kết thúc'), { target: { value: toDatetimeLocal(session().startTime) } });
    submit();
    expect(await screen.findByText('Thời gian kết thúc phải sau thời gian bắt đầu')).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('Review Focus 3: phòng hiện tại đã ngừng hoạt động — vẫn là một lựa chọn, gắn rõ và đang được chọn', () => {
    h.rooms = { data: [ROOMS[1]], isLoading: false, isError: false, refetch: vi.fn() }; // r1 không còn trong danh sách đang hoạt động
    render(<EditExamSessionPage />);
    fireEvent.click(screen.getByRole('combobox', { name: 'Phòng thi' }));
    expect(screen.getByRole('option', { name: 'Phòng máy A1 (đã ngừng hoạt động)' })).toHaveAttribute('data-state', 'checked');
  });

  // Hai ca riêng: một menu Select đang mở làm phần còn lại của trang không truy cập được (Radix ẩn các phần tử khác).
  it('Review Focus 3: phòng đã ngừng hoạt động — sửa tên KHÔNG gửi roomId (không bị đổi sang phòng khác)', async () => {
    h.rooms = { data: [ROOMS[1]], isLoading: false, isError: false, refetch: vi.fn() };
    render(<EditExamSessionPage />);
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { name: 'Giữa kỳ N02' } });
  });

  it('Review Focus 4: phiên cũ chưa có phòng — có ghi chú, sửa tên vẫn lưu được, thân không có roomId', async () => {
    loaded({ roomId: null });
    render(<EditExamSessionPage />);
    expect(screen.getByText(/chưa gắn phòng trong danh sách/)).toBeInTheDocument();
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.mutate).toHaveBeenCalledTimes(1));
    expect(h.mutate.mock.calls[0][0]).toEqual({ id: 's1', body: { name: 'Giữa kỳ N02' } });
  });

  it('lỗi của server (cửa sổ đã đóng, va chạm phòng) hiện nguyên văn, form giữ nguyên', () => {
    h.update = { isPending: false, isError: true, error: { message: 'Phòng Phòng máy B1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.' } };
    render(<EditExamSessionPage />);
    expect(screen.getByText('Phòng Phòng máy B1 đã có phiên thi "Ca sáng" lúc 08:00–10:00.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tên phiên thi')).toHaveValue('Giữa kỳ N01');
  });

  it('lưu xong → thông báo và về danh sách', async () => {
    h.mutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    render(<EditExamSessionPage />);
    changeName('Giữa kỳ N02');
    submit();
    await waitFor(() => expect(h.push).toHaveBeenCalledWith('/teacher/exam-sessions'));
    expect(h.toastSuccess).toHaveBeenCalledWith('Đã lưu thay đổi.');
  });
});

describe('EditExamSessionPage — không dựng form khi không sửa được', () => {
  it('Review Focus 7: phiên đã bắt đầu → nêu lý do (câu của server), không có form', () => {
    loaded({ startTime: iso(-1), endTime: iso(1) });
    render(<EditExamSessionPage />);
    expect(screen.getByText(EDIT_STARTED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tên phiên thi')).not.toBeInTheDocument();
  });

  it('Review Focus 7: phiên đã huỷ → lý do theo trạng thái', () => {
    loaded({ status: 'cancelled' });
    render(<EditExamSessionPage />);
    expect(screen.getByText('Phiên đã huỷ, không sửa được.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lưu thay đổi' })).not.toBeInTheDocument();
  });

  it('Review Focus 7: không tải được (404 / của người khác) → thông báo, không form', () => {
    h.detail = { data: undefined, isLoading: false, isError: true, error: { statusCode: 403, message: 'Forbidden' } };
    render(<EditExamSessionPage />);
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được phiên thi');
    expect(screen.queryByLabelText('Tên phiên thi')).not.toBeInTheDocument();
  });

  it('đang tải → khung chờ, không form', () => {
    h.detail = { data: undefined, isLoading: true, isError: false, error: null };
    render(<EditExamSessionPage />);
    expect(screen.queryByLabelText('Tên phiên thi')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run "src/app/teacher/exam-sessions/[id]/edit/page.test.tsx"`
Expected: FAIL — chưa có `page.tsx`.

- [ ] **Step 3: Viết `[id]/edit/page.tsx`**

```tsx
'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { ArrowLeft, CircleAlert, Info, TriangleAlert } from 'lucide-react';
import { useExamSessionDetail, useUpdateExamSession } from '@/hooks/useExamSession';
import { useTeachingClasses } from '@/hooks/useTeaching';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExamSessionResponse, RequiredDeliverableResponse } from '@/lib/api/exam-session';
import { editAvailability } from '@/lib/exam-session-actions';
import { editFormValuesOf, editPayload } from '@/lib/exam-session-form';
import { semesterTextOf } from '@/lib/master-data-forms';
import {
  SessionExamTypeField,
  SessionNameField,
  SessionRoomField,
  SessionSemesterReadout,
  SessionTimeFields,
} from '../../_components/session-fields';
import {
  describeUpdateError,
  editExamSessionSchema,
  type EditExamSessionFormValues,
} from '../../new/schema';

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        title="Sửa phiên thi"
        description="Chỉ đổi được tên, phòng, giờ và loại kỳ thi — và chỉ trước giờ bắt đầu."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/teacher/exam-sessions">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Danh sách phiên thi
            </Link>
          </Button>
        }
      />
      {children}
    </div>
  );
}

/**
 * Danh sách file bắt buộc nộp, CHỈ ĐỌC. Khai lại file bắt buộc sau khi phiên đã tạo làm lệch những gì sinh viên đã được hướng dẫn nộp, và máy chủ
 * không có đường sửa nó (plan F) — sai file bắt buộc thì huỷ phiên và tạo lại.
 */
function LockedDeliverables({ items }: { items: RequiredDeliverableResponse[] }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/60 p-4">
      <legend className="px-1 text-body font-semibold text-foreground">File bắt buộc nộp</legend>
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id} className="font-mono text-small">
            <span>{item.requiredFilename}</span>
            {item.entries.length > 0 && (
              <span className="text-muted-foreground"> — file bên trong: {item.entries.join(', ')}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-small text-muted-foreground">Không đổi được. Sai file bắt buộc thì huỷ phiên và tạo lại.</p>
    </fieldset>
  );
}

function EditForm({ session }: { session: ExamSessionResponse }) {
  const router = useRouter();
  const update = useUpdateExamSession();
  const classes = useTeachingClasses();
  const klass = classes.data?.find((item) => item.id === session.classId);
  const [noChange, setNoChange] = useState(false);

  const form = useForm<EditExamSessionFormValues>({
    resolver: zodResolver(editExamSessionSchema),
    defaultValues: editFormValuesOf(session),
  });

  // Phòng hiện tại luôn là một lựa chọn (kể cả khi admin đã ngừng dùng nó) để sửa tên hay giờ không buộc phải đổi phòng.
  const keep = session.roomId ? { id: session.roomId, name: session.roomName } : null;

  function onSubmit(values: EditExamSessionFormValues) {
    const body = editPayload(session, values);
    // Gửi một thân rỗng chỉ để nhận về 200 không ghi gì là một vòng mạng vô ích, và không có gì để báo thành công.
    if (Object.keys(body).length === 0) {
      setNoChange(true);
      return;
    }
    setNoChange(false);
    update.mutate(
      { id: session.id, body },
      {
        onSuccess: () => {
          toast.success('Đã lưu thay đổi.');
          router.push('/teacher/exam-sessions');
        },
      },
    );
  }

  return (
    <Shell>
      <FormProvider {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <Card data-animate>
            <CardHeader>
              <CardTitle>Thông tin phiên thi</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <SessionNameField />

              <FormField id="exam-session-class" label="Lớp thi" hint="Không đổi được. Sai lớp thì huỷ phiên và tạo lại.">
                <Input
                  id="exam-session-class"
                  value={klass?.labelWithSemester ?? session.classLabel ?? '—'}
                  readOnly
                  aria-readonly="true"
                />
              </FormField>

              {klass && <SessionSemesterReadout text={semesterTextOf(klass)} />}

              {session.roomId === null && (
                <Alert variant="info">
                  <Info />
                  <AlertDescription>
                    Phiên này được tạo trước khi có danh mục phòng nên chưa gắn phòng trong danh sách. Bạn vẫn sửa được tên
                    và loại kỳ thi; muốn đổi giờ thì hãy chọn phòng.
                  </AlertDescription>
                </Alert>
              )}

              <SessionRoomField keep={keep} />

              <SessionExamTypeField />

              <SessionTimeFields />

              <LockedDeliverables items={session.requiredDeliverables} />

              {noChange && (
                <Alert variant="info" role="status">
                  <AlertDescription>Không có thay đổi nào.</AlertDescription>
                </Alert>
              )}

              {update.isError && (
                <Alert variant="destructive">
                  <CircleAlert />
                  <AlertDescription>
                    {/* Câu của server, không phải một lời đoán: cửa sổ sửa đã đóng, hay phòng/lớp/giãn cách va chạm với phiên nào. */}
                    {describeUpdateError(update.error)}
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button asChild variant="outline">
              <Link href="/teacher/exam-sessions">Hủy</Link>
            </Button>
            <Button type="submit" size="lg" loading={update.isPending}>
              {update.isPending ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
          </div>
        </form>
      </FormProvider>
    </Shell>
  );
}

/**
 * Trang sửa phiên (spec §4.1, phương án A): chỉ trước giờ bắt đầu. Mở thẳng bằng URL cho một phiên đã bắt đầu, đã huỷ, của người khác (403) hay không
 * tồn tại (404) thì KHÔNG dựng form — cùng `editAvailability` với nút ở danh sách, nên lý do giống nhau ở cả hai nơi. Server vẫn là thẩm quyền
 * cuối: một phiên vừa qua giờ bắt đầu giữa lúc trang mở và lúc bấm "Lưu" bị từ chối ở API và câu 409 hiện ngay trên form.
 */
export default function EditExamSessionPage() {
  const { id } = useParams<{ id: string }>();
  const detail = useExamSessionDetail(id);

  if (detail.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4" aria-busy="true">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Shell>
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            Không tải được phiên thi. Phiên không tồn tại hoặc không phải của bạn.
          </AlertDescription>
        </Alert>
      </Shell>
    );
  }

  const availability = editAvailability(detail.data, Date.now());
  if (!availability.allowed) {
    return (
      <Shell>
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>{availability.reason}</AlertDescription>
        </Alert>
        <div>
          <Button asChild variant="outline">
            <Link href={`/exam-sessions/${detail.data.id}`}>Về phòng chờ</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return <EditForm session={detail.data} />;
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run "src/app/teacher/exam-sessions/[id]/edit/page.test.tsx"`
Expected: PASS. Ca dễ trượt: "chỉ đổi tên → thân chỉ có name" đòi `editPayload` so giờ theo **phút** (fixture dùng `Date.now()` nên giờ lẻ giây — nếu so chính xác, thân sẽ kèm `startTime`/`endTime`); "phòng đã ngừng" đòi `keep` lấy từ `session.roomName` và ô chọn có giá trị hiện tại. Radix chỉ đặt `aria-selected` khi mục vừa được chọn vừa đang có focus nên test dùng `data-state="checked"`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/teacher/exam-sessions/[id]"
git commit -m "feat(web): trang sửa phiên thi (tên, phòng, giờ, loại kỳ thi) — khoá lớp và file bắt buộc, chặn khi phiên đã bắt đầu"
```

---

### Task 6: "Sửa" và "Huỷ phiên" ở danh sách, hộp thoại xác nhận huỷ

**Files:**
- Create: `apps/web/src/hooks/useNow.ts`, `apps/web/src/app/teacher/exam-sessions/_components/session-row-actions.tsx`, `apps/web/src/app/teacher/exam-sessions/_components/cancel-session-dialog.tsx`
- Modify: `apps/web/src/app/teacher/exam-sessions/page.tsx`
- Test: `apps/web/src/hooks/useNow.test.ts`, `…/_components/session-row-actions.test.tsx`, `…/_components/cancel-session-dialog.test.tsx`, `apps/web/src/app/teacher/exam-sessions/page.test.tsx`

**Interfaces:**
- Consumes: `editAvailability`, `cancelAvailability` (Task 2), `useCancelExamSession` (Task 1), `describeCancelError` (Task 3), `ExamSessionListItem` (G3b), `Tooltip*` (`components/ui/tooltip`), `Dialog*` (`components/ui/dialog`).
- Produces:

```tsx
export function useNow(intervalMs?: number): number;   // mặc định 30 000; ms từ epoch, làm mới theo chu kỳ
export function SessionRowActions(props: { session: ExamSessionListItem; now: number; onCancel: (session: ExamSessionListItem) => void }): JSX.Element;
export function CancelSessionDialog(props: { session: ExamSessionListItem | null; onClose: () => void }): JSX.Element;   // session = null → đóng
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/hooks/useNow.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useNow } from './useNow';

describe('useNow', () => {
  afterEach(() => vi.useRealTimers());

  it('trả mốc hiện tại và làm mới sau mỗi chu kỳ — để trang mở lâu vẫn biết phiên đã tới giờ', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 6, 9, 0, 0));
    const { result } = renderHook(() => useNow(1000));
    const first = result.current;
    expect(first).toBe(new Date(2026, 9, 6, 9, 0, 0).getTime());
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current - first).toBe(3000);
  });

  it('dọn bộ hẹn giờ khi gỡ', () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = renderHook(() => useNow(1000));
    unmount();
    expect(clear).toHaveBeenCalled();
  });
});
```

Create `apps/web/src/app/teacher/exam-sessions/_components/session-row-actions.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { EDIT_STARTED_MESSAGE } from '@/lib/exam-session-actions';
import { SessionRowActions } from './session-row-actions';

const NOW = new Date(2026, 9, 6, 9, 0).getTime();
const at = (hour: number) => new Date(2026, 9, 6, hour).toISOString();

function item(over: Partial<ExamSessionListItem> = {}): ExamSessionListItem {
  return {
    id: 's1', name: 'Giữa kỳ N01', code: 'ABC123', courseName: 'CTDL&GT', classLabel: 'DHKTPM18A – Nhóm 1',
    semesterId: 's1', academicYear: 2026, term: 1, roomName: 'Phòng máy A1', semesterName: 'HK1 2026-2027',
    examType: 'GK', startTime: at(10), endTime: at(12), status: 'active', ...over,
  };
}
function setup(session: ExamSessionListItem) {
  const onCancel = vi.fn();
  render(<SessionRowActions session={session} now={NOW} onCancel={onCancel} />);
  return onCancel;
}

describe('SessionRowActions', () => {
  it('phiên active chưa bắt đầu: "Sửa" là liên kết tới trang sửa, "Huỷ phiên" gọi onCancel với phiên đó', () => {
    const onCancel = setup(item());
    expect(screen.getByRole('link', { name: 'Sửa phiên Giữa kỳ N01' })).toHaveAttribute('href', '/teacher/exam-sessions/s1/edit');
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên Giữa kỳ N01' }));
    expect(onCancel).toHaveBeenCalledWith(expect.objectContaining({ id: 's1' }));
  });

  it('Review Focus 5: phiên ĐÃ bắt đầu — "Sửa" không còn là liên kết, không bấm được, và nói vì sao; "Huỷ phiên" vẫn bật', () => {
    const onCancel = setup(item({ startTime: at(8), endTime: at(10) }));
    expect(screen.queryByRole('link', { name: /Sửa phiên/ })).not.toBeInTheDocument();
    const edit = screen.getByRole('button', { name: 'Sửa phiên Giữa kỳ N01' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    // Lý do đi theo `aria-describedby` (có mặt cả khi tooltip chưa mở): bàn phím và trình đọc màn hình đọc được lý do.
    expect(edit).toHaveAccessibleDescription(EDIT_STARTED_MESSAGE);
    fireEvent.click(edit);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Huỷ phiên Giữa kỳ N01' })).not.toHaveAttribute('aria-disabled');
  });

  it.each([
    ['collecting', 'Phiên đang thu bài, không sửa được.', 'Phiên đang thu bài, không huỷ được. Hãy Xác nhận kết thúc ở phòng chờ.'],
    ['completed', 'Phiên đã kết thúc, không sửa được.', 'Phiên đã kết thúc, không huỷ được.'],
    ['cancelled', 'Phiên đã huỷ, không sửa được.', 'Phiên này đã được huỷ.'],
  ])('trạng thái %s: cả hai nút bị chặn, mỗi nút kèm lý do riêng, bấm không làm gì', (status, editReason, cancelReason) => {
    const onCancel = setup(item({ status }));
    const edit = screen.getByRole('button', { name: 'Sửa phiên Giữa kỳ N01' });
    const cancel = screen.getByRole('button', { name: 'Huỷ phiên Giữa kỳ N01' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    expect(edit).toHaveAccessibleDescription(editReason);
    expect(cancel).toHaveAccessibleDescription(cancelReason);
    fireEvent.click(cancel);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('nút bị chặn vẫn nhận focus bàn phím (không dùng `disabled`) để đọc được lý do', () => {
    setup(item({ status: 'completed' }));
    const edit = screen.getByRole('button', { name: 'Sửa phiên Giữa kỳ N01' });
    edit.focus();
    expect(edit).toHaveFocus();
  });
});
```

Create `apps/web/src/app/teacher/exam-sessions/_components/cancel-session-dialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const h = vi.hoisted(() => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  state: { isPending: false, isError: false, error: null as unknown },
  toastSuccess: vi.fn(),
}));
vi.mock('@/hooks/useExamSession', () => ({ useCancelExamSession: () => ({ ...h.state, mutate: h.mutate, reset: h.reset }) }));
vi.mock('sonner', () => ({ toast: { success: h.toastSuccess, error: vi.fn() } }));

import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { CancelSessionDialog } from './cancel-session-dialog';

const SESSION: ExamSessionListItem = {
  id: 's1', name: 'Giữa kỳ N01', code: 'ABC123', courseName: 'CTDL&GT', classLabel: 'DHKTPM18A – Nhóm 1',
  semesterId: 'sem1', academicYear: 2026, term: 1, roomName: 'Phòng máy A1', semesterName: 'HK1 2026-2027',
  examType: 'GK', startTime: new Date(2026, 9, 6, 8, 0).toISOString(), endTime: new Date(2026, 9, 6, 10, 0).toISOString(), status: 'active',
};

beforeEach(() => {
  h.mutate.mockReset();
  h.reset.mockReset();
  h.toastSuccess.mockReset();
  h.state = { isPending: false, isError: false, error: null };
});

describe('CancelSessionDialog', () => {
  it('không có phiên → không có hộp thoại', () => {
    render(<CancelSessionDialog session={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('nêu phiên nào và hậu quả: không khôi phục được, sinh viên không vào được nữa, phòng/lớp/giãn cách được nhả', () => {
    render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Huỷ phiên thi?')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Giữa kỳ N01');
    expect(dialog).toHaveTextContent('DHKTPM18A – Nhóm 1');
    expect(dialog).toHaveTextContent(/không khôi phục được/i);
    expect(dialog).toHaveTextContent(/sinh viên không vào được nữa/i);
    expect(dialog).toHaveTextContent(/nhả/i);
  });

  it('"Giữ phiên" đóng hộp thoại mà không huỷ gì', () => {
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Giữ phiên' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.mutate).not.toHaveBeenCalled();
  });

  it('xác nhận không lý do → gọi với id và reason undefined; có lý do thì cắt khoảng trắng', () => {
    render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên' }));
    expect(h.mutate).toHaveBeenLastCalledWith({ id: 's1', reason: undefined }, expect.any(Object));
    fireEvent.change(screen.getByLabelText(/Lý do/), { target: { value: '  Nhầm phòng  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên' }));
    expect(h.mutate).toHaveBeenLastCalledWith({ id: 's1', reason: 'Nhầm phòng' }, expect.any(Object));
  });

  it('ô lý do giới hạn 200 ký tự (cùng giới hạn của server)', () => {
    render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Lý do/)).toHaveAttribute('maxlength', '200');
  });

  it('thành công → thông báo rồi đóng', () => {
    h.mutate.mockImplementation((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.());
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ phiên' }));
    expect(h.toastSuccess).toHaveBeenCalledWith('Đã huỷ phiên “Giữa kỳ N01”.');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Review Focus 6: 409 "đã có sinh viên vào phòng" hiện NGUYÊN VĂN trong hộp thoại và hộp thoại GIỮ MỞ', () => {
    h.state = {
      isPending: false,
      isError: true,
      error: { statusCode: 409, message: 'Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc' },
    };
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    expect(within(screen.getByRole('dialog')).getByText('Đã có sinh viên vào phòng, hãy Chốt bài ngay rồi Xác nhận kết thúc')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Giữ phiên' })).toBeEnabled();
  });

  it('đang xử lý: cả hai nút khoá và Esc không đóng hộp thoại giữa chừng', () => {
    h.state = { isPending: true, isError: false, error: null };
    const onClose = vi.fn();
    render(<CancelSessionDialog session={SESSION} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Giữ phiên' })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('mở lại cho phiên khác thì lý do và lỗi của lần trước bị xoá', () => {
    const view = render(<CancelSessionDialog session={SESSION} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/Lý do/), { target: { value: 'Nhầm phòng' } });
    view.rerender(<CancelSessionDialog session={{ ...SESSION, id: 's2', name: 'Cuối kỳ N02' }} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Lý do/)).toHaveValue('');
    expect(h.reset).toHaveBeenCalled();
  });
});
```

Trong `apps/web/src/app/teacher/exam-sessions/page.test.tsx` (đã được G3b sửa): (a) thêm vào đầu file, cạnh các mock khác, `const cancelMutate = vi.fn();` và đổi factory mock của `@/hooks/useExamSession` thành (thêm đúng một hook — thiếu một export thì cả file đỏ "is not a function"):

```tsx
vi.mock('@/hooks/useExamSession', () => ({
  useExamSessions: (...args: unknown[]) => useExamSessionsMock(...args),
  useExamSessionsInRange: (...args: unknown[]) => useExamSessionsInRangeMock(...args),
  // Hộp thoại huỷ phiên (render ở cuối trang) đọc hook này ngay cả khi đóng.
  useCancelExamSession: () => ({ mutate: cancelMutate, reset: vi.fn(), isPending: false, isError: false, error: null }),
}));
```

(b) trong `beforeEach` thêm `cancelMutate.mockReset();`; (c) thêm vào cuối file:

```tsx
describe('ExamSessionsListPage — Sửa và Huỷ phiên (T-SES-11)', () => {
  const NAME = 'Giữa kỳ Lập trình Web';
  const upcoming = (over: Record<string, unknown> = {}) =>
    session({
      startTime: new Date(Date.now() + 2 * 3_600_000).toISOString(),
      endTime: new Date(Date.now() + 4 * 3_600_000).toISOString(),
      ...over,
    });
  const show = (item: Record<string, unknown>) =>
    useExamSessionsMock.mockReturnValue({ data: { items: [item], total: 1 }, error: null, isLoading: false, refetch: vi.fn() });

  it('phiên chưa bắt đầu: "Sửa" dẫn tới trang sửa; "Huỷ phiên" mở hộp thoại, "Giữ phiên" đóng lại mà không huỷ gì', () => {
    show(upcoming());
    render(<ExamSessionsListPage />);
    expect(screen.getByRole('link', { name: `Sửa phiên ${NAME}` })).toHaveAttribute('href', '/teacher/exam-sessions/s1/edit');
    fireEvent.click(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Huỷ phiên thi?')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Giữ phiên' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cancelMutate).not.toHaveBeenCalled();
  });

  it('Review Focus 5: phiên đã bắt đầu (mặc định của fixture) — "Sửa" không bấm được và nói vì sao, "Huỷ phiên" vẫn bật', () => {
    render(<ExamSessionsListPage />);
    const edit = screen.getByRole('button', { name: `Sửa phiên ${NAME}` });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).toHaveAccessibleDescription('Phiên đã bắt đầu, không sửa được. Nếu chưa ai vào phòng bạn vẫn huỷ được.');
    expect(screen.queryByRole('link', { name: `Sửa phiên ${NAME}` })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` })).not.toHaveAttribute('aria-disabled');
  });

  it('phiên đã huỷ hay đã kết thúc: cả hai nút bị chặn', () => {
    show(upcoming({ status: 'cancelled' }));
    render(<ExamSessionsListPage />);
    expect(screen.getByRole('button', { name: `Sửa phiên ${NAME}` })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` })).toHaveAttribute('aria-disabled', 'true');
  });

  it('xác nhận huỷ gọi API với id phiên và lý do đã nhập', () => {
    show(upcoming());
    render(<ExamSessionsListPage />);
    fireEvent.click(screen.getByRole('button', { name: `Huỷ phiên ${NAME}` }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Lý do/), { target: { value: 'Nhầm phòng' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Huỷ phiên' }));
    expect(cancelMutate).toHaveBeenCalledWith({ id: 's1', reason: 'Nhầm phòng' }, expect.any(Object));
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/hooks/useNow.test.ts src/app/teacher/exam-sessions/_components/session-row-actions.test.tsx src/app/teacher/exam-sessions/_components/cancel-session-dialog.test.tsx src/app/teacher/exam-sessions/page.test.tsx`
Expected: FAIL — chưa có `useNow`, `session-row-actions`, `cancel-session-dialog`; trang chưa có nút.

- [ ] **Step 3: Viết `hooks/useNow.ts`**

```ts
'use client';

import { useEffect, useState } from 'react';

/**
 * Đồng hồ cho giao diện phụ thuộc "bây giờ": nút Sửa chỉ bật TRƯỚC giờ bắt đầu, nên một trang mở lâu phải tự tắt nút khi phiên tới giờ, không để
 * người dùng bấm vào một cửa sổ đã đóng rồi mới nhận 409. Làm mới mỗi `intervalMs` (mặc định 30 giây — ranh giới là phút nên đủ mịn).
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
```

- [ ] **Step 4: Viết `_components/session-row-actions.tsx`**

```tsx
'use client';

import Link from 'next/link';
import { Ban, Pencil, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { cancelAvailability, editAvailability } from '@/lib/exam-session-actions';

/**
 * Nút không đủ điều kiện (spec §4.1: "không để nút bấm rồi mới báo 409", T-SES-11). KHÔNG dùng `disabled`: nút `disabled` rời khỏi thứ tự focus nên
 * bàn phím không bao giờ tới được để đọc lý do, và nhiều trình đọc màn hình bỏ qua nó. `aria-disabled` + `aria-describedby` giữ nút trong thứ tự
 * focus và đọc lý do; tooltip là phần bổ trợ cho người dùng chuột. Mô tả ẩn LUÔN có trong DOM (không đợi tooltip mở).
 */
function BlockedAction({
  id,
  label,
  ariaLabel,
  icon: Icon,
  reason,
}: {
  id: string;
  label: string;
  ariaLabel: string;
  icon: LucideIcon;
  reason: string;
}) {
  const reasonId = `${id}-reason`;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-disabled="true"
            aria-label={ariaLabel}
            aria-describedby={reasonId}
            onClick={(event) => event.preventDefault()}
            className="cursor-not-allowed opacity-55"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{reason}</TooltipContent>
      </Tooltip>
      <span id={reasonId} className="sr-only">
        {reason}
      </span>
    </>
  );
}

/**
 * "Sửa" và "Huỷ phiên" của MỘT hàng. Điều kiện nằm ở `lib/exam-session-actions` (hàm thuần, có test): Sửa chỉ khi `active` và chưa tới giờ bắt đầu;
 * Huỷ khi `active` — có ai vào phòng chưa là việc của server, 409 hiện trong hộp thoại. `aria-label` mang tên phiên vì một bảng có nhiều hàng.
 */
export function SessionRowActions({
  session,
  now,
  onCancel,
}: {
  session: ExamSessionListItem;
  now: number;
  onCancel: (session: ExamSessionListItem) => void;
}) {
  const edit = editAvailability(session, now);
  const cancel = cancelAvailability(session);

  return (
    <TooltipProvider delayDuration={200}>
      {edit.allowed ? (
        <Button asChild variant="outline" size="sm">
          <Link href={`/teacher/exam-sessions/${session.id}/edit`} aria-label={`Sửa phiên ${session.name}`}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Sửa
          </Link>
        </Button>
      ) : (
        <BlockedAction id={`edit-${session.id}`} label="Sửa" ariaLabel={`Sửa phiên ${session.name}`} icon={Pencil} reason={edit.reason} />
      )}
      {cancel.allowed ? (
        <Button type="button" variant="outline" size="sm" aria-label={`Huỷ phiên ${session.name}`} onClick={() => onCancel(session)}>
          <Ban className="h-4 w-4" aria-hidden="true" />
          Huỷ phiên
        </Button>
      ) : (
        <BlockedAction id={`cancel-${session.id}`} label="Huỷ phiên" ariaLabel={`Huỷ phiên ${session.name}`} icon={Ban} reason={cancel.reason} />
      )}
    </TooltipProvider>
  );
}
```

- [ ] **Step 5: Viết `_components/cancel-session-dialog.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { useCancelExamSession } from '@/hooks/useExamSession';
import type { ExamSessionListItem } from '@/lib/api/exam-session';
import { describeCancelError } from '../new/schema';

/** Cùng giới hạn với `CancelExamSessionDto` ở server (plan F). */
const MAX_REASON_LENGTH = 200;

function formatStart(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Xác nhận huỷ một phiên (spec §4.1): nêu HẬU QUẢ trước khi bấm — phiên không khôi phục được, sinh viên không vào được nữa, phòng/lớp/giãn cách được
 * nhả. Lý do là tuỳ chọn và đi vào nhật ký hệ thống.
 *
 * Khi server từ chối (đã có sinh viên vào phòng, 409) câu của server hiện NGAY TRONG hộp thoại và hộp thoại giữ mở: đó là câu hướng dẫn
 * ("hãy Chốt bài ngay rồi Xác nhận kết thúc"), và đóng hộp thoại sẽ nuốt nó. Đang gửi thì không đóng được (Esc, bấm nền) để không bỏ rơi một
 * yêu cầu đang bay.
 */
export function CancelSessionDialog({ session, onClose }: { session: ExamSessionListItem | null; onClose: () => void }) {
  const { mutate, reset, isPending, isError, error } = useCancelExamSession();
  const [reason, setReason] = useState('');
  const sessionId = session?.id ?? null;

  // Mở cho một phiên khác thì không mang lý do hay lỗi của lần trước sang.
  useEffect(() => {
    setReason('');
    reset();
  }, [sessionId, reset]);

  function confirm() {
    if (!session) return;
    mutate(
      { id: session.id, reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Đã huỷ phiên “${session.name}”.`);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open={session !== null}
      onOpenChange={(open) => {
        if (!open && !isPending) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Huỷ phiên thi?</DialogTitle>
          <DialogDescription>
            {session && (
              <>
                Phiên “{session.name}” ({session.classLabel}, bắt đầu {formatStart(session.startTime)}) sẽ bị huỷ. Phiên không khôi
                phục được và sinh viên không vào được nữa. Phòng, lớp và quãng giãn cách 30 phút của bạn được nhả để tạo phiên khác;
                muốn thi thì tạo phiên mới.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <FormField
          id="cancel-session-reason"
          label="Lý do (không bắt buộc)"
          hint="Ghi vào nhật ký hệ thống, tối đa 200 ký tự."
        >
          <Input
            id="cancel-session-reason"
            value={reason}
            maxLength={MAX_REASON_LENGTH}
            onChange={(event) => setReason(event.target.value)}
            placeholder="vd: Nhầm phòng"
          />
        </FormField>

        {isError && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{describeCancelError(error)}</AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
            Giữ phiên
          </Button>
          <Button type="button" variant="destructive" loading={isPending} onClick={confirm}>
            Huỷ phiên
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6: Gắn vào `exam-sessions/page.tsx`**

1. Imports: thêm `import { CancelSessionDialog } from './_components/cancel-session-dialog';`, `import { SessionRowActions } from './_components/session-row-actions';`, `import { useNow } from '@/hooks/useNow';`, và đổi dòng `import type { ExamSessionStatusFilter, ExamType } from '@/lib/api/exam-session';` thành `import type { ExamSessionListItem, ExamSessionStatusFilter, ExamType } from '@/lib/api/exam-session';`.
2. Trong `ExamSessionsListPage`, cạnh các `useState` khác, thêm:

```tsx
  // Phiên đang được hỏi "huỷ không?" (null = hộp thoại đóng). Đồng hồ làm mới mỗi 30 giây để nút Sửa tự tắt khi phiên tới giờ bắt đầu.
  const [cancelling, setCancelling] = useState<ExamSessionListItem | null>(null);
  const now = useNow();
```

3. Thay ô thao tác của hàng — khối

```tsx
                        <TableCell className="text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/exam-sessions/${session.id}`}>
                              <DoorOpen className="h-4 w-4" aria-hidden="true" />
                              Phòng chờ
                            </Link>
                          </Button>
                        </TableCell>
```

bằng

```tsx
                        <TableCell className="text-right">
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button asChild variant="outline" size="sm">
                              <Link href={`/exam-sessions/${session.id}`}>
                                <DoorOpen className="h-4 w-4" aria-hidden="true" />
                                Phòng chờ
                              </Link>
                            </Button>
                            <SessionRowActions session={session} now={now} onCancel={setCancelling} />
                          </div>
                        </TableCell>
```

4. Ngay trước thẻ đóng `</div>` cuối cùng của JSX trả về (sau khối `<div data-animate className="flex flex-col gap-4">…</div>`), thêm `<CancelSessionDialog session={cancelling} onClose={() => setCancelling(null)} />`.

(Lịch tuần `SessionCalendar` **không** thêm nút: thẻ phiên ở lịch dẫn tới phòng chờ; sửa/huỷ làm ở chế độ Bảng. Ghi chú này để người duyệt biết đó là chủ ý, không phải sót.)

- [ ] **Step 7: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/hooks/useNow.test.ts src/app/teacher/exam-sessions`
Expected: PASS (cả `page.test.tsx` cũ — chúng không đụng cột thao tác ngoài liên kết "Phòng chờ" vẫn còn nguyên). Ca dễ trượt: ca "mở lại cho phiên khác" đòi `reset` trong `useEffect` phụ thuộc `sessionId`; ca "đang xử lý" đòi `onOpenChange` chặn đóng khi `isPending`.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/hooks/useNow.ts apps/web/src/hooks/useNow.test.ts apps/web/src/app/teacher/exam-sessions/_components apps/web/src/app/teacher/exam-sessions/page.tsx apps/web/src/app/teacher/exam-sessions/page.test.tsx
git commit -m "feat(web): nút Sửa và Huỷ phiên ở danh sách (chỉ bấm được khi đủ điều kiện, kèm lý do) và hộp thoại xác nhận huỷ"
```

---

### Task 7: Hết `tsc` đỏ — chạy cả bộ và build

**Files:**
- Delete: `docs/superpowers/plans/md-restore-web-tsc-red.txt`

- [ ] **Step 1: Chạy toàn bộ kiểm tra**

```powershell
cd apps/web
npx vitest run
npx eslint src/lib src/hooks src/app/teacher
pnpm exec tsc --noEmit
Get-ChildItem src -Recurse -Include *.ts,*.tsx | Select-String -CaseSensitive -Pattern 'roomName:|semesterName:' | Where-Object { $_.Path -notmatch '\.test\.tsx?$' -and $_.Line -notmatch 'Snapshot|snapshot|bản chụp|\*|//' } | Select-Object -First 10
pnpm build
```

Expected:
- `vitest` xanh toàn bộ.
- `eslint` sạch.
- `tsc --noEmit` **không còn lỗi nào** (danh sách `md-restore-web-tsc-red.txt` lúc này chỉ gồm các file của plan này). Nếu còn lỗi ở một fixture kiểu `ExamSessionResponse` (thiếu `roomId`/`classLabel`) hoặc `CreateExamSessionInput` (còn `roomName`/`semesterName`) ở file test khác — thêm đúng hai trường (`roomId: null, classLabel: null`) hoặc bỏ hai khoá cũ; **không** dùng `as any` hay `@ts-expect-error` để dập lỗi.
- Lệnh `Select-String` không còn dòng nào là **thân gửi lên** mang `roomName:`/`semesterName:` (các chỗ còn lại là trường **hiển thị** của phản hồi — `ExamSessionListItem.semesterName` bản chụp, `ExamSessionResponse.roomName` — và nằm trong chú thích hoặc kiểu).
- `pnpm build` (`next build`) thành công — bước này bắt lỗi mà vitest và `next dev` bỏ sót, như một file route xuất thêm thứ ngoài `default` (lý do `schema.ts` nằm riêng khỏi `page.tsx`). Nếu build đòi biến môi trường công khai, đặt như môi trường dev (`apps/web/.env.local`).

- [ ] **Step 2: Xoá danh sách đỏ và commit**

Danh sách `md-restore-web-tsc-red.txt` đã làm xong việc của nó (G1 mở, mỗi plan G sau bớt dần, plan này đóng). Xác nhận nó chỉ còn các file đã sửa ở trên rồi xoá:

```powershell
Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt
```

Expected: mỗi dòng là một file thuộc plan này (đều đã xanh ở bước 1). Rồi:

```bash
git rm docs/superpowers/plans/md-restore-web-tsc-red.txt
git commit -m "chore(web): hết tsc đỏ có chủ ý — client OpenAPI đã khớp mọi chỗ gọi"
```

---

## Tự kiểm lại plan so với spec

- §5.2 "Form tạo phiên: lớp chọn từ danh sách lớp được giao, hiện nhãn gộp `DHKTPM18A – Nhóm 1 · HK1 2026-2027`; phòng chọn từ phòng đang hoạt động; học kỳ hiện **chỉ để xem**, lấy từ lớp. Không còn ô gõ chữ nào cho phòng hay học kỳ": Task 4 (`labelWithSemester` ở ô chọn lớp; `SessionRoomField` từ `useRooms({ activeOnly: true })`; `SessionSemesterReadout` chỉ-đọc; thân gửi `roomId`, không `roomName`/`semesterName`; test khoá cả ba). "Chữ ở màn trống": "Bạn chưa có lớp nào được giao nên chưa tạo được phiên thi." nguyên văn, không liên kết tạo lớp (Task 4); phần của "Lớp của tôi" thuộc G3a.
- §4.1 "Giao diện": "Ở `/teacher/exam-sessions`, mỗi hàng thêm "Sửa" và "Huỷ phiên", chỉ bật khi đủ điều kiện (khi không đủ thì **ẩn kèm lý do trong tooltip**, không để nút bấm rồi mới báo 409)": Task 2 (luật), Task 6 (hàng). "Trang `/teacher/exam-sessions/[id]/edit` dùng lại form tạo, khoá các ô lớp và file bắt buộc": Task 4 (ô chung) + Task 5 (lớp chỉ đọc, file bắt buộc chỉ đọc, kèm câu "huỷ phiên và tạo lại"). "'Huỷ phiên' mở hộp thoại xác nhận nêu hậu quả": Task 6. Quy tắc sửa: chỉ năm trường, giờ kiểm trên cặp sau khi sửa (server; web chặn bằng cùng ba luật qua schema dùng chung — Task 3), cửa sổ phương án A (Task 2, 5), đổi phòng cập nhật tên chụp (server). "Banner 'Đã huỷ' ở phòng chờ (nhánh có sẵn)": không đụng.
- §11: **T-SES-11** (nút Sửa và Huỷ phiên ẩn kèm lý do khi không đủ điều kiện, unit): bảng ca `editAvailability`/`cancelAvailability` (Task 2) và ca hàng/trang có `aria-describedby` trỏ tới lý do (Task 6). **T-SES-6** phía web (giữ phòng đã ngừng hoạt động, cả hai chiều): phòng đã ngừng vẫn là lựa chọn và sửa tên không gửi `roomId` (Task 4, 5); chiều "không chọn được phòng ngừng hoạt động cho phiên mới" là `activeOnly: true` (Task 4).
- Quyết định/hệ quả nêu để user duyệt: (a) **"ẩn kèm lý do trong tooltip" được làm thành nút KHÔNG BẤM ĐƯỢC kèm lý do** (`aria-disabled` + tooltip + mô tả ẩn), không phải ẩn hẳn nút — một nút ẩn thì không có chỗ để tooltip, và bàn phím/trình đọc màn hình sẽ không biết vì sao không thấy "Sửa"; (b) **"Huỷ phiên" bật với mọi phiên `active`, kể cả sau giờ bắt đầu** — web không biết ai đã vào phòng; server quyết và câu 409 hiện trong hộp thoại (đúng câu "Nếu chưa ai vào phòng bạn vẫn huỷ được"); (c) **thân PATCH chỉ chứa trường đổi, giờ so theo phút** — để một lần sửa tên không âm thầm đổi giờ lẻ giây của phiên tạo qua API; (d) **lịch tuần không có nút Sửa/Huỷ** (chỉ chế độ Bảng); (e) **danh sách lớp ở form tạo gồm mọi lớp được giao (mọi học kỳ)** — không chặn lớp của kỳ đã kết thúc (§7.3, T-FLT-3), nhãn có học kỳ nên không lẫn; (f) ô phòng hiện thêm "(N chỗ)" khi phòng có sức chứa, **không có cảnh báo sức chứa** (spec không đòi; từng biến mất cùng bảng `room` cũ) — thêm sau nếu muốn; (g) bỏ gợi ý phòng/học kỳ từ phiên cũ (`datalist`) vì không còn ô gõ.
- Không làm ở plan này: lịch tuần (G3b đã đổi `classLabel`), phòng chờ, nhập file danh sách phiên, kênh yêu cầu admin; cutover, backfill và nghiệm thu bằng trình duyệt thật ở plan H.
