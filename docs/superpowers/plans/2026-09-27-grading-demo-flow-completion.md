# Full-flow demo hoàn thiện (đường điều tra, 100% qua UI) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một giảng viên đi được HẾT đường chấm điều tra chỉ bằng chuột — tạo phiên khai `code_project`/ngôn ngữ, tự tay tạo—duyệt—ghim gói test, bấm "Bắt đầu chấm", xem Ma trận/Hồ sơ một bài KHÔNG bị gắn nhãn sai, chốt điểm — không cần Swagger/Postman/SQL tay ở bất kỳ bước nào. Audit đã xác nhận: PR #51/#52/#53 (merged vào `main`) cung cấp backend đủ, nhưng ba khoảng trống chặn đường đi qua UI vẫn còn.

**Architecture:** Không đổi hợp đồng backend nào (đã đủ từ #51/#53) — chỉ thêm bề mặt CLIENT còn thiếu (form field, một trang tác vụ mới, một hàm thuần sửa lỗi) và regenerate OpenAPI client cho khớp `main` hiện tại.

**Tech Stack:** Next.js 15 + React Hook Form + Zod (form), TanStack Query (data), Vitest + RTL (test) — không đổi so với các plan trước.

**Spec:** `docs/superpowers/specs/2026-09-20-grading-agent-investigator-design.md` §14.1 (deliverableType/language), §2.1 (gói test), §0.3 (tự quyết theo pipeline).

## Global Constraints

- Regenerate OpenAPI client CHỈ từ API chạy **local** (`.env.test`), không bao giờ từ `.env` (Supabase/Aiven) — theo đúng cách đã làm ở #53.
- `RequiredDeliverableType`/`DeclaredLanguage` union types đôi khi bị `@nestjs/swagger`'s CLI plugin sinh ra `Record<string, never>` thay vì union thật (đã gặp với `deduction`) — kiểm schema.d.ts SAU khi regen trước khi viết code phụ thuộc nó; nếu vẫn `Record<string, never>` thì dùng `body as never` như quy ước đã có, không chặn lại để sửa decorator.
- `apps/web/src/lib/api/exam-session.ts` là tay viết (không sinh tự động) — mirror kiểu tại đó, không import thẳng từ `schema.d.ts`.
- Mọi trang/hook mới theo đúng khuôn đã lập: mock ở tầng hook trong test (không mock `apiClient`), `useMutation`/`useQuery` qua TanStack Query, không gọi `apiClient` trực tiếp từ component.
- Không đụng vào phần chấm thật (worker, sandbox, model) — máy dev không có sandbox/model thật, nên Task 7 (kiểm thủ công) sẽ dừng ở "Bắt đầu chấm" phản hồi đúng (kể cả khi kết cục cuối là `ungradable/system` vì thiếu sandbox — đó là hành vi ĐÚNG theo §4.4, không phải lỗi).

## Review Focus

1. Phiên có deliverable `document` lẫn `code_project` trong CÙNG một phiên — form phải cho khai khác nhau TỪNG dòng, không phải một lựa chọn chung cho cả phiên.
2. Gói test đã ghim rồi mà giảng viên mở lại trang — phải thấy ĐANG ghim gói nào, không phải form tạo-mới trống trơn mỗi lần.
3. Bài `investigator` có `status='auto_approved'` nhưng KHÔNG được gắn nhãn "Trích dẫn đã đối chiếu" (nhãn của one_shot, ngụ ý một phép đối chiếu chưa từng chạy cho pipeline này).
4. Duyệt một gói rồi bấm ghim gói KHÁC (đổi ý) — phải làm được, không bị khoá cứng vào gói đầu tiên.
5. Tạo case với `caseKey` trùng trong cùng một lượt — server trả 409 (đã có từ #51) — UI phải hiện lỗi đó, không phải "đã lưu" sai.

---

### Task 1: Regenerate OpenAPI client trên `main` mới (có 3d2 + UI)

**Files:** `packages/shared/src/api/schema.d.ts` (sinh lại)

- [ ] **Step 1:** Khởi động API local (`.env.test`, không đụng `.env`) — dùng lại wrapper script đã có khuôn từ #53:
  ```bash
  cd apps/api && pnpm build
  # export .env.test rồi chạy node dist/src/main.js (KHÔNG dùng .env mặc định)
  ```
- [ ] **Step 2:** `pnpm --filter @cine/shared generate:api-client`, dừng server ngay sau.
- [ ] **Step 3:** Xác nhận: `grep -n "deliverableType\|language" packages/shared/src/api/schema.d.ts` — `RequiredFilenameDto` phải có cả hai trường (kiểu thật hoặc `Record<string, never>`, ghi chú lại kiểu nào để Task 2 biết có cần ép `as never` không); `/exam-sessions/{id}/test-bundles*` phải xuất hiện.
- [ ] **Step 4:** Commit riêng: `git add packages/shared/src/api/schema.d.ts && git commit -m "chore(web): regenerate API client trên main đã có 3d2 + UI"`.

---

### Task 2: Form tạo phiên — khai `deliverableType`/`language` từng file

**Files:**
- Modify: `apps/web/src/app/teacher/exam-sessions/new/schema.ts`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/_components/RequiredFilenamesInput.tsx`
- Modify: `apps/web/src/app/teacher/exam-sessions/new/page.tsx`
- Modify: `apps/web/src/lib/api/exam-session.ts`
- Test: `apps/web/src/app/teacher/exam-sessions/new/schema.test.ts` (mở rộng nếu có, tạo nếu chưa)

**Interfaces:**
- Produces: mỗi phần tử `requiredFilenames` của form mang thêm `deliverableType: 'document'|'code_project'|'image'` (mặc định `'document'`) và `language?: 'python'|'cpp'` (chỉ hiện UI khi `deliverableType==='code_project'`; giữ đúng bốn giá trị backend chấp nhận nhưng chỉ hiện hai cái sandbox chạy được — `java`/`node` đi `one_shot`, không đáng làm giảng viên chọn nhầm hy vọng chấm bằng sandbox).

- [ ] **Step 1: Sửa schema.ts** — thêm vào object trong mảng `requiredFilenames`:
  ```ts
  deliverableType: z.enum(['document', 'code_project', 'image']).default('document'),
  language: z.enum(['python', 'cpp']).optional(),
  ```
  Thêm `.refine` mirror `ck_required_deliverable_language` phía backend (chỉ `code_project` mới được có `language`) — thông điệp giống hệt DTO backend.

- [ ] **Step 2: `RequiredFilenamesInput.tsx`** — thêm dưới mỗi ô filename một hàng nhỏ: `<Select>` "Loại bài nộp" (Tài liệu / Mã nguồn / Ảnh chụp), và khi chọn "Mã nguồn" thì hiện thêm `<Select>` "Ngôn ngữ" (C++ / Python). Dùng `Controller` như `examType`/`classId` ở `page.tsx` đã làm (field array nên bind theo `requiredFilenames.${index}.deliverableType`).

- [ ] **Step 3: `page.tsx`'s onSubmit** — map thêm hai trường:
  ```ts
  requiredFilenames: values.requiredFilenames.map((f) => ({
    filename: f.value,
    ...(f.deliverableType !== 'document' ? { deliverableType: f.deliverableType } : {}),
    ...(f.language ? { language: f.language } : {}),
    ...(f.entries?.length ? { entries: f.entries.map((e) => e.value) } : {}),
  })),
  ```
  (Không gửi `deliverableType: 'document'` tường minh — giữ tương thích ngược với hành vi mặc định đã có, tránh gửi field thừa cho ca phổ biến nhất.)

- [ ] **Step 4: `EMPTY_FORM`** — thêm `deliverableType: 'document'` vào phần tử `requiredFilenames` mặc định.

- [ ] **Step 5: `lib/api/exam-session.ts`** — mở rộng `CreateExamSessionInput.requiredFilenames` item với `deliverableType?`/`language?`, và `RequiredDeliverableResponse` với `language?: string | null` (để Task 4 đọc lại session, biết deliverable nào là code + ngôn ngữ gì).

- [ ] **Step 6: Test** — viết/`schema.test.ts` ca: "document + language → lỗi refine"; "code_project không language → hợp lệ (đi one_shot)"; "code_project + cpp → hợp lệ".
  Run: `pnpm --filter web test exam-sessions/new/schema`
  Expected: đỏ trước khi sửa schema, xanh sau.

- [ ] **Step 7:** `pnpm --filter web exec tsc --noEmit` (lọc bỏ lỗi có sẵn của `read-workbook.test.ts`) — 0 lỗi mới. Commit.

---

### Task 3: Client + hook cho gói test

**Files:**
- Create: `apps/web/src/lib/api/test-bundle.ts`
- Create: `apps/web/src/hooks/useTestBundle.ts`

**Interfaces:**
- Produces: `TestBundle`, `TestBundleCase`, `TestBundleSummary` types; `listTestBundles(sessionId)`, `getTestBundle(sessionId, bundleId)`, `createTestBundle(sessionId, cases)`, `approveTestBundle(sessionId, bundleId)`, `pinTestBundle(sessionId, bundleId)`; hooks `useTestBundles(sessionId)`, `useCreateTestBundle(sessionId)`, `useApproveTestBundle(sessionId)`, `usePinTestBundle(sessionId)` — Task 4 dùng các hook này.

- [ ] **Step 1: `lib/api/test-bundle.ts`** — mirror `apps/api/src/grading/test-bundle/test-bundle.controller.ts` + `dto/create-test-bundle.dto.ts`, cùng khuôn `fail()`/wrapper đã lặp lại ở `lib/api/rules.ts`:
  ```ts
  export interface TestBundleCaseInput { caseKey: string; group: string; input: string; expectedOutput: string; constraintQuote?: string; }
  export interface TestBundleSummary { id: string; version: number; approvedAt: string | null; caseCount: number; }
  export interface TestBundleDetail { id: string; version: number; approvedAt: string | null; cases: { caseKey: string; group: string; input: string; expectedOutput: string; autoDroppedReason: string | null }[]; }

  export async function listTestBundles(sessionId: string): Promise<TestBundleSummary[]> { ... apiClient.GET('/exam-sessions/{id}/test-bundles', {params:{path:{id:sessionId}}}) ... }
  export async function getTestBundle(sessionId: string, bundleId: string): Promise<TestBundleDetail> { ... }
  export async function createTestBundle(sessionId: string, cases: TestBundleCaseInput[]): Promise<{id:string; version:number}> { ... apiClient.POST('/exam-sessions/{id}/test-bundles', {params:{path:{id:sessionId}}, body:{cases}}) ... }
  export async function approveTestBundle(sessionId: string, bundleId: string): Promise<void> { ... apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/approve', ...) ... }
  export async function pinTestBundle(sessionId: string, bundleId: string): Promise<void> { ... apiClient.POST('/exam-sessions/{id}/test-bundles/{bundleId}/pin', ...) ... }
  ```

- [ ] **Step 2: `useTestBundle.ts`**:
  ```ts
  export function useTestBundles(sessionId: string | undefined) {
    return useQuery({ queryKey: ['exam-sessions', sessionId, 'test-bundles'], queryFn: () => listTestBundles(sessionId!), enabled: Boolean(sessionId) });
  }
  export function useCreateTestBundle(sessionId: string | undefined) {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (cases: TestBundleCaseInput[]) => createTestBundle(sessionId!, cases),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam-sessions', sessionId, 'test-bundles'] }) });
  }
  export function useApproveTestBundle(sessionId: string | undefined) {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (bundleId: string) => approveTestBundle(sessionId!, bundleId),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ['exam-sessions', sessionId, 'test-bundles'] }) });
  }
  export function usePinTestBundle(sessionId: string | undefined) {
    const qc = useQueryClient();
    return useMutation({ mutationFn: (bundleId: string) => pinTestBundle(sessionId!, bundleId),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['exam-sessions', sessionId, 'test-bundles'] });
        // test_bundle_id vừa đổi ảnh hưởng §14.3 — start-grading có thể hết bị chặn.
        void qc.invalidateQueries({ queryKey: ['exam-session', sessionId] });
      } });
  }
  ```

- [ ] **Step 3:** `pnpm --filter web exec tsc --noEmit` — 0 lỗi mới. Commit.

---

### Task 4: Thẻ "Gói test" trên trang Chấm điểm

**Files:**
- Create: `apps/web/src/app/teacher/grading/_components/TestBundleCard.tsx`
- Modify: `apps/web/src/app/teacher/grading/page.tsx`
- Test: `apps/web/src/app/teacher/grading/_components/TestBundleCard.test.tsx`

**Interfaces:**
- Consumes: `useExamSessionDetail(sessionId)` (đã có, trả `requiredDeliverables`), hooks của Task 3.
- Produces: một `<Card>` hiện TRƯỚC nút "Bắt đầu chấm", CHỈ khi `session.requiredDeliverables.some(d => d.deliverableType === 'code_project')`.

- [ ] **Step 1: Viết test đỏ**
  ```tsx
  // TestBundleCard.test.tsx
  vi.mock('@/hooks/useTestBundle', () => ({
    useTestBundles: () => ({ data: [], isLoading: false }),
    useCreateTestBundle: () => ({ mutate: vi.fn(), isPending: false }),
    useApproveTestBundle: () => ({ mutate: vi.fn(), isPending: false }),
    usePinTestBundle: () => ({ mutate: vi.fn(), isPending: false }),
  }));
  it('chưa có gói nào → hiện form tạo ca đầu tiên', () => {
    render(<TestBundleCard sessionId="s1" pinnedBundleId={null} />);
    expect(screen.getByText(/chưa có gói test/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /thêm ca/i })).toBeInTheDocument();
  });
  ```
  Thêm ca thứ hai: có bundle CHƯA duyệt → hiện nút "Duyệt", KHÔNG hiện nút "Ghim". Có bundle ĐÃ duyệt, `pinnedBundleId !== bundle.id` → hiện nút "Ghim". `pinnedBundleId === bundle.id` → hiện huy hiệu "Đang dùng", không hiện nút ghim nữa.
  Run: `pnpm --filter web test TestBundleCard` → FAIL (file chưa tồn tại).

- [ ] **Step 2: Viết `TestBundleCard.tsx`** — state cục bộ cho danh sách ca đang soạn (mảng `{caseKey,group,input,expectedOutput}`, thêm/xoá dòng), nút "Tạo gói" gọi `useCreateTestBundle`. Với mỗi bundle trong `useTestBundles(sessionId).data`: hiện version, số ca, trạng thái duyệt; nút "Duyệt" (ẩn nếu đã duyệt) gọi `useApproveTestBundle`; nút "Ghim" (ẩn nếu chưa duyệt HOẶC đã là bundle đang ghim) gọi `usePinTestBundle`, huy hiệu "Đang dùng" khi `bundle.id === pinnedBundleId`.

- [ ] **Step 3: Nối vào `page.tsx`** — sau khi có `session` (dòng ~191), thêm:
  ```tsx
  const sessionDetail = useExamSessionDetail(session?.id);
  const needsTestBundle = sessionDetail.data?.requiredDeliverables.some((d) => d.deliverableType === 'code_project');
  ```
  và render `{needsTestBundle && <TestBundleCard sessionId={session.id} pinnedBundleId={sessionDetail.data?.testBundleId ?? null} />}` ngay TRƯỚC card "Kết quả chấm" (trước dòng có nút "Bắt đầu chấm"). *(`ExamSessionResponse` cần thêm `testBundleId: string | null` ở `lib/api/exam-session.ts` VÀ backend `exam-session-response.dto.ts`/`toResponseDto()` phải trả nó — kiểm lại: nếu backend hiện CHƯA trả field này trong response tạo/đọc phiên, thêm một dòng `view.testBundleId = session.testBundleId` vào `toResponseDto()` — cột đã có ở entity từ 3c, chỉ là chưa lộ ra DTO.)*

- [ ] **Step 4:** Chạy lại test, xác nhận xanh. `pnpm --filter web test TestBundleCard grading/page`.

- [ ] **Step 5:** `tsc --noEmit` + `pnpm --filter web build` sạch. Commit (gồm cả phần backend nhỏ `toResponseDto`/DTO nếu cần, ghi rõ trong message).

---

### Task 5: Sửa nhãn sai của Ma trận cho bài đường điều tra

**Files:**
- Modify: `apps/web/src/lib/grading-triage.ts`
- Modify: `apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.tsx`
- Test: `apps/web/src/lib/grading-triage.test.ts`

**Interfaces:**
- Produces: `bucketOf()` không còn đọc `criterionResults` cho bài `pipeline==='investigator'`; `heldForLabel(bucket, pipeline)` mới, thay `HELD_FOR` map cứng trong `MatrixTable.tsx`.

- [ ] **Step 1: Viết test đỏ** (`grading-triage.test.ts`, thêm nếu file đã tồn tại — kiểm trước khi tạo mới):
  ```ts
  it('bài investigator auto_approved KHÔNG được coi là "đã đối chiếu trích dẫn" — bucket theo status, không theo criterionResults rỗng', () => {
    const row = result({ pipeline: 'investigator', status: 'auto_approved', criterionResults: [], confidence: null });
    expect(bucketOf(row, 0)).toBe('high');
  });
  it('bài investigator flagged_for_review vẫn vào nhóm "flagged" như one_shot', () => {
    const row = result({ pipeline: 'investigator', status: 'flagged_for_review' });
    expect(bucketOf(row, 0)).toBe('flagged');
  });
  ```
  Run: xác nhận đỏ nếu logic hiện tại tình cờ đã đúng cho ca 1 (kỳ vọng: SAI, vì `every([])` vẫn `true` — nhưng bug thật nằm ở CHỖ GẮN NHÃN, không phải ở việc phân loại đúng bucket `high`; bucket `high` VẪN đúng, chỉ nhãn hiển thị sai). Viết lại ca test cho đúng bug thật:
  ```ts
  // apps/web/src/app/teacher/grading/matrix/_components/MatrixTable.test.tsx — thêm
  it('bài investigator ở bucket "high" hiện nhãn ĐÚNG, không phải "Trích dẫn đã đối chiếu"', () => {
    show([{ ...withAdvocate, pipeline: 'investigator', status: 'auto_approved', criterionResults: [], confidence: null }]);
    expect(screen.queryByText(/trích dẫn đã đối chiếu/i)).not.toBeInTheDocument();
  });
  ```
  Run: `pnpm --filter web test matrix/_components/MatrixTable` → FAIL (nhãn cũ vẫn hiện, vì `HELD_FOR` là map tĩnh không biết pipeline).

- [ ] **Step 2: Sửa `MatrixTable.tsx`** — thay `HELD_FOR: Record<Bucket, {...}>` bằng hàm:
  ```ts
  function heldFor(bucket: Bucket, pipeline: GradingResult['pipeline']): { label: string; variant: BadgeProps['variant'] } {
    if (bucket === 'flagged') return { label: 'Chờ bạn duyệt', variant: 'warning' };
    if (bucket === 'low') return { label: 'Đang chấm', variant: 'info' };
    if (bucket === 'stuck') return { label: 'Quá hạn xử lý', variant: 'destructive' };
    // bucket === 'high'
    return pipeline === 'investigator'
      ? { label: 'Đạt sàn bằng chứng, tự quyết', variant: 'success' }
      : { label: 'Trích dẫn đã đối chiếu', variant: 'success' };
  }
  ```
  Đổi chỗ dùng `HELD_FOR[bucketOf(row, queueActive)]` thành `heldFor(bucketOf(row, queueActive), row.pipeline)`.

- [ ] **Step 3:** Chạy lại, xác nhận xanh. Chạy CẢ bộ `matrix/` để không hồi quy ca cũ (`pnpm --filter web test matrix/`).

- [ ] **Step 4:** `tsc --noEmit` sạch. Commit.

---

### Task 6: Nối nav cho Trang kiến thức

**Files:** Modify: `apps/web/src/lib/nav-config.ts`

- [ ] **Step 1:** Đọc cấu trúc `TEACHER_NAV` hiện có (icon, path, label từng mục), thêm một mục "Trang kiến thức" trỏ `/teacher/rules`, đặt cạnh "Chấm điểm" (cùng nhóm chức năng).
- [ ] **Step 2:** Nếu `nav-config.ts` có test riêng (kiểm trước khi giả định), chạy lại; nếu không, xác nhận bằng `tsc --noEmit`.
- [ ] **Step 3:** Commit.

---

### Task 7: Kiểm thủ công qua trình duyệt (bắt buộc theo CLAUDE.md cho thay đổi UI)

- [ ] **Step 1:** Dựng docker (Postgres/MinIO/Redis), chạy `pnpm --filter api start:dev`-tương-đương (dùng lại wrapper `.env.test` của #53) VÀ `pnpm --filter web dev`.
- [ ] **Step 2:** Đăng nhập một tài khoản giáo viên có sẵn (hoặc tạo bằng script test helper), tạo một LỚP nếu cần.
- [ ] **Step 3:** Tạo một phiên thi mới, khai MỘT deliverable `code_project` + `cpp` qua form (Task 2) — xác nhận phiên tạo thành công, không lỗi 400.
- [ ] **Step 4:** Vào trang Chấm điểm, chọn phiên đó — xác nhận thẻ "Gói test" (Task 4) HIỆN RA (vì có deliverable code_project). Tạo hai ca, duyệt, ghim — xác nhận không lỗi, huy hiệu "Đang dùng" hiện đúng bundle.
- [ ] **Step 5:** Bấm "Bắt đầu chấm" — CẦN có ít nhất một bài `collected` để có gì mà chấm (nếu môi trường dev không có sinh viên nộp bài thật, ghi lại đây là giới hạn của môi trường, không phải lỗi code — kiểm bằng cách seed một submission qua SQL cho ĐỦ để bấm nút, xác nhận response KHÔNG còn là 400 "chưa ghim gói test" như trước Task 4).
- [ ] **Step 6:** Ghi lại kết quả THẬT của bước 5 (có thể là `ungradable/system` vì thiếu sandbox thật trong môi trường dev — đó là hành vi ĐÚNG) vào báo cáo cuối, không suy đoán.
- [ ] **Step 7:** Vào `/teacher/rules` từ nav (Task 6) — xác nhận trang tải được, không 404.
- [ ] **Step 8:** Dừng cả hai dev server sau khi kiểm xong.

---

## Ngoài phạm vi plan này (note lại sau khi xong)

- **Kiểm mẫu (§8.1)** — cơ chế giữ niềm tin/calibration, không chặn demo full-flow.
- **Tự dựng gói test khi giảng viên chỉ có đề (§2.1, T-RULER-1…6)** — Task 4 chỉ cho giảng viên TỰ TAY gõ ca; sinh ca tự động bằng cách chạy đáp án mẫu qua sandbox (`eval/test-bundle.ts` đã có logic, chưa nối vào đường sản phẩm) là việc lớn hơn, để plan riêng.
- **Chấm lại bài `ungradable/system` sau khi sửa nguyên nhân (§2.3)** — `regrade-stuck` hôm nay chỉ xử lý `ai_grading` treo.
- **Sổ điểm / xuất điểm (§13, `GradeExportEntity`)** — chỉ có entity, chưa có service/controller nào; "chốt điểm" hôm nay dừng ở đổi trạng thái DB, không có bước xuất tiếp theo.
- **UI danh sách bài dành riêng cho investigator** (Ma trận vẫn là công cụ one_shot/Advocate, Task 5 chỉ sửa cho nó KHÔNG NÓI SAI về bài investigator, không làm nó thành công cụ triage investigator đầy đủ).
