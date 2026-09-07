# Ranh giới sở hữu giữa ba tier

**Ngày:** 2026-09-07
**Trạng thái:** chờ duyệt
**Tiếp nối:** `2026-09-06-semester-as-system-lens-design.md` (đã dời Học kỳ sang Phòng Đào tạo)

---

## 1. Vấn đề

Spec Học kỳ dời **một** tài nguyên cấp trường về đúng tier của nó. Nó không phát biểu **quy tắc** đã khiến việc dời đó là đúng — nên mọi tài nguyên cấp trường còn lại vẫn nằm sai chỗ, và Phòng Đào tạo còn đúng một trang.

Bốn triệu chứng được báo từ màn hình thật, cùng một gốc:

**1.1 "Trưởng khoa có bị thừa không?"** — Nhìn thì hai role như trùng nhau. Thực ra chúng **không giao nhau chỗ nào**: Phòng Đào tạo sở hữu đúng 1 trang / 4 endpoint, Trưởng khoa sở hữu 4 trang. Nhưng vì tier trên mỏng đến mức đó, nó trông như một mảnh vụn cắt ra từ tier dưới. Cảm giác "thừa" là thật; nó chỉ đang chỉ sai người.

**1.2 Phòng thi: Trưởng khoa sửa tài nguyên toàn trường.** 159 phòng dùng chung, `uq_room_name` unique **toàn cục**, *mọi* Trưởng khoa cùng ghi, không ai sở hữu. `room.entity.ts` tự thú: *"rooms are university-wide and writable by any Trưởng khoa"*. Đây là **cùng một tính chất với Học kỳ** — thứ vừa được dời lên. `uq_room_name` tồn tại vì lý do y hệt `uq_semester_name`: một namespace chung không có chủ. Miếng vá triệu chứng, không phải cách sửa gốc. (Spec trước hoãn nó ở §8; đây là chỗ nó được xử lý.)

**1.3 `admin` giữ "Môn chưa có chủ".** Gán một môn cho một khoa là **phân công học vụ**, không phải quản trị hạ tầng. Trang này ở tier admin vì lúc dựng chưa có tier học vụ nào để đặt vào, không vì nó thuộc về đó. Và module ấy mang ba lỗi thật (§4).

**1.4 Trưởng khoa không thấy mục Học kỳ.** Đúng ý đồ — nhưng `department/dashboard/page.tsx` còn một mảnh vụn từ Task 1: chuỗi `missingLink` trỏ `/department/semesters`, **một route không còn tồn tại** (404), kèm chỉ dẫn *"Tạo học kỳ ngay"* mà API trả 403.

Và một triệu chứng thứ năm thuộc tầng khác: người dùng đọc được chuỗi enum thô trên badge và tưởng hệ thống có hai role riêng biệt (§6.3).

Gốc chung: **quy tắc "cái gì thuộc tier nào" chưa từng được viết ra**, nên mỗi màn hình được đặt theo cảm tính của lúc dựng nó.

---

## 2. Quy tắc sở hữu

| Tier | Sở hữu | Không sở hữu |
|---|---|---|
| **Admin** | Tài khoản, cấu hình AI, chi phí, audit log | Không nắm tài nguyên học vụ nào |
| **Phòng Đào tạo** (`academic_affairs`) | Học kỳ, **Phòng thi**, **Danh mục môn** + phân công môn về khoa | Lớp học, giảng viên |
| **Trưởng khoa** (`department_admin`) | Môn của khoa, Lớp học, Giảng viên đang dạy cho khoa | Học kỳ, phòng thi |

Phát biểu này viết vào spec **và** thành block comment ở đầu `nav-config.ts` — chỗ duy nhất nó được nêu trong code, để lần sau thêm màn hình thì có cái mà chiếu vào thay vì đoán.

**Trưởng khoa không thừa, và không thể thừa.** Không có bảng `department` nào tồn tại. "Khoa" = tập các `course` có `department_head_id = tôi`; `class`, `exam_session`, `enrollment` đều với tới scope của mình qua `course_id`. `department_admin` là role duy nhất mang cái scope đó — bỏ nó thì không còn ai sở hữu môn học, và mô hình phân quyền cấp môn của cả hệ thống sập.

### 2.1 Vòng đời một học kỳ, sau spec này

Phòng Đào tạo mở kỳ → gạt cờ hiện hành → **công bố danh mục môn** (chủ để trống) → **phân môn về Trưởng khoa** → khoa mở lớp + gán giảng viên → giảng viên mở phiên thi.

Đây là mắt nối còn thiếu. Trước spec này Phòng Đào tạo mở được học kỳ nhưng **không công bố được gì bên trong nó** — một quyển lịch rỗng.

### 2.2 Phương án đã cân nhắc và loại

**Chỉ dời "Môn chưa có chủ", để Phòng thi lại ở Trưởng khoa.** Nhỏ hơn, ít fallout test hơn. Loại vì nó để nguyên đúng cái nghịch lý sinh ra câu hỏi 1.1: tier trên vẫn mỏng, tier dưới vẫn ghi tài nguyên toàn trường. Fix hình thức.

**Giữ đường tạo môn chỉ ở Trưởng khoa** (`POST /courses` không mở cho Phòng Đào tạo). Loại vì `createForHead` **luôn** đóng dấu người tạo làm chủ, nên nguồn duy nhất sinh ra môn không chủ là seed migration — ta sẽ dời một trang gần như luôn rỗng sang tier mới để tier đó trông dày hơn. Đó là fix hình thức lần thứ hai.

---

## 3. Thay đổi API

### 3.0 Việc đi trước mọi thứ: `Roles` decorator phải có kiểu

```ts
// Trước
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
// Sau
export const Roles = (...roles: AccountRole[]) => SetMetadata(ROLES_KEY, roles);
```

Hiện `@Roles()` nhận `string[]`. **43 call site.** Một typo — `@Roles('super_admin')`, `@Roles('academic_affair')` — biên dịch sạch, guard không bao giờ khớp, endpoint bị khóa chết **im lặng**: không lỗi biên dịch (decorator nhận string), không lỗi runtime (guard chỉ trả false). Đây là lớp bug "hai tên cho một khái niệm, một tên rò vào code" mà dự án đã bị bắt ở `findActive`, chỉ ở dạng nguy hiểm hơn vì nó fail **đóng** chứ không fail **ồn**.

Spec này thêm `@Roles('academic_affairs')` vào 7 endpoint, nên đây là lúc đóng lỗ, và phải đi **trước** mọi thứ viết `@Roles` — cùng lý do Task 0 của spec trước phải đi đầu. Import type-only từ `identity/entities/account.entity`, không có runtime cycle.

**Ghi lại để không lặp lại lần thứ ba:** một bản phê bình vòng duyệt spec này đề xuất `export const ACADEMIC_AFFAIRS_ROLE = AccountRole.super_admin`, dựa trên tiền đề "enum vẫn là `super_admin`, chỉ nhãn đổi". Tiền đề đó là **bản nháp bị loại** của spec trước, không phải spec đã duyệt (§3.2 spec đó gạch bỏ nó tường minh). Enum thật trong DB, đo lúc viết spec này:

```
admin | teacher | academic_affairs | department_admin      (4 giá trị, không có super_admin)
admin 42 · teacher 264 · academic_affairs 19 · department_admin 41
```

Hằng số đó sẽ **tạo ra đúng cái bug nó cảnh báo**, đảo chiều: ghim code vào giá trị không còn trong enum → 19 tài khoản Phòng Đào tạo bị khóa sạch khỏi mọi endpoint mới. (Phụ: `AccountRole` là union type, không phải enum object; `AccountRole.super_admin` không hợp lệ về cú pháp.) Việc gõ đúng string đã được `AccountRole[]` bảo đảm ở mọi call site — mạnh hơn một hằng số cho một role.

### 3.1 Bảng thay đổi

| Endpoint | Trước | Sau |
|---|---|---|
| `POST/PATCH/DELETE /rooms` | `department_admin` | `academic_affairs` |
| `GET /rooms` | mở (mọi role) | không đổi — form tạo phiên thi cần |
| `GET /courses` | **không có `@Roles`**, mọi kỳ, **không consumer nào ở web** | `academic_affairs` + `?semesterId=&unowned=` + trả kèm tên chủ |
| `GET /courses/unowned` | `admin` | **xoá** — gộp vào trên |
| `POST /courses` | `department_admin` | `department_admin, academic_affairs` |
| `PATCH/DELETE /courses/:id` | `department_admin`, scoped theo chủ | thêm `academic_affairs`, **chỉ trên môn chưa có chủ** |
| `PATCH /courses/:id/owner` | `admin` | `academic_affairs` + kiểm vai người nhận + audit (§4) |

**`GET /courses` là lỗ hở thứ ba cùng loại.** Nó không có `@Roles` (mọi user đăng nhập đọc được mọi môn toàn trường) và không có consumer nào ở `apps/web/src` — chỉ `POST /courses` được dùng. Cùng lớp với `GET /submissions` (không còn consumer) đã ghi nhận trước. Spec này **tái dụng** nó làm endpoint danh mục thay vì thêm endpoint mới: đóng lỗ và có chỗ cho §2.1 bằng cùng một thay đổi.

**Gộp `/courses/unowned` vào `GET /courses`.** Hai endpoint trả dữ liệu chồng nhau thì trang phải chọn một, và cái thứ hai sẽ trôi. Gộp lại thì `findUnowned()` bị **xoá**, nên lỗi thiếu lọc học kỳ của nó (§4.3) hết **theo cấu trúc** thay vì được vá.

**`GET /courses` ≠ `GET /courses/mine`.** Hai endpoint độc lập, không giao nhau, tên gần giống nhau nên nói rõ: `/courses/mine` giữ nguyên `@Roles('department_admin')` → `findForHead(actorId, semesterId)`, danh sách môn **của một khoa**; spec này **không chạm** nó. `GET /courses` là danh mục **toàn trường**, chỉ Phòng Đào tạo dùng để duyệt và phân công. Dashboard Trưởng khoa vẫn link `/department/courses`, chạy trên `/courses/mine` như cũ.

### 3.2 Chủ khi tạo môn: suy từ vai người gọi, không bao giờ từ body

`CreateCourseDto` **vẫn không có** `departmentHeadId` — giữ nguyên invariant `createForHead` đang tuyên bố (*"Ownership is taken from the caller, never from the request body"*). Nếu thêm trường đó vào DTO thì phải chặn `department_admin` set nó (nếu không, một head gán môn cho head khác) — một bài toán phân quyền theo trường body mà ta không cần mở ra.

```ts
// RolesGuard đã hẹp về đúng hai vai. Viết dạng exhaustive để vai thứ ba thêm
// vào sau nổ ở compile-time, không âm thầm sinh ra môn không chủ.
function ownerOnCreate(
  actorRole: 'department_admin' | 'academic_affairs',
  actorId: string,
): string | null {
  switch (actorRole) {
    case 'department_admin':
      return actorId;   // head tự tạo môn của khoa mình — như cũ
    case 'academic_affairs':
      return null;      // công bố danh mục, chờ phân công
    default: {
      // Không phải phòng hộ thừa: tham số hẹp là lời hứa của RolesGuard, còn
      // đây là chỗ lời hứa đó bị kiểm. Thêm vai thứ ba vào `@Roles` mà quên
      // chỗ này thì `never` không nhận được nó và tsc đỏ ngay.
      const unreachable: never = actorRole;
      throw new Error(`Vai không xử lý được khi tạo môn: ${String(unreachable)}`);
    }
  }
}
```

Kiểu tham số hẹp hơn `AccountRole` có chủ đích: hàm này **không** nhận `'admin'` hay `'teacher'`, nên không cần nhánh nào cho chúng, và không thể gọi sai chỗ.

Hệ quả: Phòng Đào tạo công bố **rồi** phân công — hai bước, và bước hai là lý do tồn tại của danh sách "chưa có chủ". Một bước duy nhất "tạo và gán luôn" sẽ phá invariant trên; không làm.

`uq_course_semester_code` trên `(semester_id, code)` vẫn là namespace chung giữa Phòng Đào tạo và mọi Trưởng khoa — đã đúng như vậy từ trước; trùng mã trong cùng kỳ ra 409 qua `PostgresExceptionFilter`.

---

## 4. Ba lỗi thật trong module phân công

`course.service.ts:113`, `assignOwner` hiện tại:

```ts
async assignOwner(id: string, departmentHeadId: string): Promise<CourseEntity> {
  const course = await this.courses.findOne({ where: { id } });
  if (!course) throw new NotFoundException('Course not found');
  course.departmentHeadId = departmentHeadId;   // không kiểm gì
  return this.courses.save(course);
}
```

### 4.1 Không kiểm vai người nhận — và hậu quả không có đường lùi qua UI

`AssignCourseOwnerDto` chỉ có `@IsUUID() departmentHeadId`. FK là `RESTRICT`, nên nó bảo đảm tài khoản **tồn tại**, không bảo đảm **vai trò**. Gán được một môn cho `teacher`, cho `admin`, cho chính `academic_affairs`.

Hậu quả nặng hơn "chưa có chủ": môn đó có `department_head_id IS NOT NULL`, nên danh sách chưa-có-chủ (lọc `IS NULL`) **không còn thấy nó**, mà `/courses/mine` cũng không Trưởng khoa nào trả về. Môn biến mất khỏi **mọi** màn hình, kể cả màn cứu hộ dựng ra để cứu đúng tình huống này. Không có đường sửa qua UI.

**Sửa:** trước khi ghi, đọc tài khoản đích và bắt buộc `role === 'department_admin'`; không thoả → **400** *"Chỉ gán được môn cho Trưởng khoa"*. `CourseModule` đã có `AccountEntity` trong `forFeature`, nên tiêm `Repository<AccountEntity>` là đủ — không import `AccountsModule`, không rủi ro circular dep.

### 4.2 Không ghi audit log

Phân công đổi quyền đọc của cả cây `course → class → exam_session → submission`. **Đây là thao tác duy nhất trong hệ thống dịch chuyển được "ai đọc được bài thi của ai" mà không để lại vết.**

**Sửa:** `recordUserAction({ courseId, code, from, to })` — `from` có thể `null` — trong **cùng transaction** với `save`. Cùng lý do `SemesterService.setCurrent` đã làm: vết audit không được sống sót qua một lần ghi thất bại, và ngược lại. `CourseModule` đã `imports: [AdminModule]`, nên `AuditLogService` tiêm được ngay.

### 4.3 `findUnowned()` không lọc học kỳ

```ts
where: { departmentHeadId: IsNull() }, order: { code: 'ASC' }   // hết
```

Đo trên DB dev lúc viết spec: **157 môn chưa có chủ trải 152 học kỳ, dồn vào một danh sách phẳng.** (157 dòng đó là rác e2e — test `INSERT` môn chỉ với `(code, name, semester_id)`, bỏ trống chủ; mã dạng `AT1788790863998` là dấu vết. Ở production con số hôm nay gần 0, và §2.1 chính là thứ làm nó lớn lên.) Trái đúng nguyên tắc ống kính vừa áp cho 5 màn hình khác.

**Sửa:** không vá. `findUnowned()` bị xoá, `GET /courses` nhận `?semesterId=` như mọi endpoint khác của spec trước, và `unowned=true` chỉ là một filter trên cùng danh sách đó.

---

## 5. Sửa mảnh vụn từ Task 1

`department/dashboard/page.tsx`, chuỗi `missingLink`, đang trỏ một route đã bị xoá và ra lệnh một việc người xem không có quyền làm. Sau spec này, hai nhánh đầu đổi chủ thể:

| Điều kiện | Trước | Sau |
|---|---|---|
| 0 học kỳ | *"Tạo học kỳ ngay"* → `/department/semesters` (**404**, và API 403) | *"Phòng Đào tạo chưa tạo học kỳ nào"* — **không link** |
| 0 môn | *"Tạo môn học ngay"* → `/department/courses` | *"Bạn có thể tự tạo, hoặc chờ Phòng Đào tạo phân công"* → `/department/courses` |
| 0 lớp | không đổi | không đổi |

Nhánh "0 môn" giữ link vì sau §3.2 Trưởng khoa **vẫn** tự tạo được môn của mình; chỉ là giờ có thêm một đường thứ hai để môn tới tay họ.

---

## 6. Web

### 6.1 Điều hướng

```
ACADEMIC_NAV     Học kỳ · Môn học · Phòng thi          (1 → 3 mục)
DEPARTMENT_NAV   Dashboard · Môn học · Lớp học · Giảng viên   (bỏ Phòng thi)
ADMIN_NAV        bỏ "Môn chưa có chủ"
```

### 6.2 Trang

- **`/academic/courses`** (mới) — danh mục theo kỳ: cột **Chủ** (`Chưa có chủ` / tên Trưởng khoa), filter *"Chỉ môn chưa có chủ"*, tạo môn, phân công. Dùng `SemesterFilter` + `useSemesterFilter('academic-courses')`, cùng khuôn 5 màn hình của spec trước. Sửa/xoá chỉ bật trên dòng chưa có chủ.
- **`/academic/rooms`** — dời nguyên trang từ `/department/rooms`.
- **Xoá** `/admin/unowned-courses` và `/department/rooms`. Cả hai chỉ được tham chiếu từ `nav-config.ts` (đã kiểm) — việc dời là sạch.
- **Dashboard Trưởng khoa** — thẻ "Phòng thi 159" giữ lại dạng read-only, đúng khuôn thẻ "Học kỳ" đã làm: biết con số, không sửa được. Cộng §5.

### 6.3 `getRoleDisplay`: role lạ phải trông **lạ**

```ts
return ROLE_DISPLAY[role] ?? { label: role, variant: 'default' };   // in ra chuỗi enum thô
```

Một role không có trong map hiện ra dưới dạng **giá trị enum thô, badge xám** — trông y như một vai trò hợp lệ. Đây là cơ chế khiến người dùng đọc màn hình và kết luận hệ thống có hai role "Phòng Đào tạo" và `super_admin` riêng biệt: một tab giữ bundle cũ, hoặc một JWT phát trước migration rename, là đủ.

**Sửa:** nhãn **"Vai trò không xác định"** kèm giá trị thô trong ngoặc, `variant: 'destructive'`. Cùng nguyên tắc `ROLE_AREAS` đã ghi trong chính repo: *unmapped means visibly unmapped* — thất bại phải nhìn ra được, không được giả trang thành trạng thái bình thường.

---

## 7. Không cần migration

`course.department_head_id` **đã** nullable. Enum `account_role` **đã** đủ 4 giá trị. **Zero schema change.** Nói rõ vì đây là thứ hay bị giả định ngược — cả spec này chỉ đổi `@Roles`, thêm hai bước kiểm trong service, và di chuyển trang.

---

## 8. Kiểm thử

**Cả hai vế cho mọi ranh giới quyền** — khuôn Task 3 của spec trước: một test khẳng định role đúng làm được, một test khẳng định role cũ **không** làm được. Chỉ vế thứ nhất thì một lần nới quyền quá tay sẽ đi qua xanh.

| Vùng | Phải khẳng định |
|---|---|
| `POST/PATCH/DELETE /rooms` | academic 2xx · head **403** · teacher 403 |
| `POST /courses` | head → chủ là chính mình · academic → chủ `null` |
| `PATCH /courses/:id/owner` | gán cho `teacher` → **400** · gán cho head → 200 **và có dòng audit** |
| `GET /courses` | teacher **403** · lọc `semesterId` đúng · lọc `unowned` đúng |
| `PATCH/DELETE /courses/:id` | academic sửa được môn chưa chủ · **403** trên môn đã có chủ |
| `AccountsService.remove` | xoá head còn môn → 409 kèm phụ thuộc **giải được** · xoá tài khoản có `audit_log` → 409 nói rõ **vĩnh viễn** (§9.2) |

**`TestAccountRole` phải hết là danh sách chép tay.** `test/helpers/create-account.ts` đang khai lại `'admin' | 'teacher' | 'academic_affairs' | 'department_admin'` song song với `AccountRole` — hai danh sách thì trôi được. Đổi thành `import type { AccountRole }`; còn đúng một danh sách trong repo.

Chỗ này đã an toàn hơn tưởng và nên ghi lại lý do: `createTestAccount` **INSERT thẳng vào bảng thật**, nên enum của Postgres tự bác giá trị lạ (22P02). Kịch bản "code lẫn test cùng dùng sai một giá trị mà test vẫn xanh" **không xảy ra được** ở API e2e. Đó là lý do các test này là lưới bắt chính cho §3.0, chứ không phải unit test có mock.

**Fallout đã lường:** `department-resources.e2e-spec.ts` **sẽ đỏ** ở phần rooms — nó tạo room bằng token `department_admin`. Sửa bằng **đổi token sang `academic_affairs`**, không nới quyền. Cùng loại fallout Task 3 đã gặp và đã xử lý đúng cách.

---

## 9. Hạn chế cố ý

### 9.1 Không có "bỏ phân công"

Gán sai → gán lại cho head đúng. Không dựng đường về `null`. Và Phòng Đào tạo **không** sửa được môn đã có chủ: sai sót sau phân công là việc của khoa. YAGNI — nếu một môn thật sự phải huỷ, đó là một yêu cầu riêng, có spec riêng.

### 9.2 Vòng đời tài khoản: xoá tài khoản gần như không phải một thao tác có thật

Đây là chỗ bản nháp đầu của spec này **sai về bản chất**, và tự soi lại mới ra. Nháp đó viết: FK `RESTRICT` chặn xoá head còn môn, thất bại thật chỉ là "409 không chẩn đoán được", sửa bằng cách trả kèm con số. Đo trên DB thật thì bức tranh khác hẳn.

**10 bảng trỏ vào `account`, tất cả `ON DELETE RESTRICT`:**

`course.department_head_id` · `class.teacher_id` · `enrollment.home_teacher_id` · `exam_session.teacher_id` · `submission.home_teacher_id` · `teacher_review.teacher_id` · `grade_export.exported_by` · `grading_result.grading_triggered_by` · `grading_pipeline_config.updated_by` · `rubric_template.created_by` · **`audit_log.actor_id`**

Cái cuối là cái quyết định. `audit_log` mang trigger `trg_audit_log_immutable` — `BEFORE UPDATE OR DELETE` → `prevent_append_only_mutation` — nên **các dòng chặn không thể xoá được để giải chặn**. Hệ quả:

> **Một tài khoản đã từng thực hiện dù chỉ một thao tác được audit thì không bao giờ xoá được nữa.**

`AccountsService.remove()` do đó là thao tác **chết** với mọi người dùng thật; nó chỉ chạy được trên tài khoản chưa làm gì cả. Và §4.2 của spec này **làm chuyện đó rộng hơn**: sau khi `assignOwner` ghi audit, mỗi tài khoản Phòng Đào tạo từng phân công một môn trở thành vĩnh viễn không xoá được.

Đó **không phải lỗi cần sửa.** Audit log bất biến là yêu cầu bảo mật của dự án, và một tài khoản không dấu vết thì audit log mất nghĩa. Cái sai là UI đang hứa một thao tác mà hệ thống không thực hiện được.

**Trong phạm vi:** `AccountsService.remove` đếm trước phụ thuộc và trả 409 **tách hai loại**:

- **Giải được** — môn / lớp / phiên thi / rubric: phân công lại hoặc chuyển giao rồi xoá được.
- **Vĩnh viễn** — `audit_log`: không có đường giải, và thông báo phải nói thẳng thế.

Phân biệt này là toàn bộ giá trị của việc đếm. Chỉ trả một con số tổng sẽ hàm ý *"gỡ hết rồi thử lại"* — một lời khuyên không bao giờ chạy được, tức là đúng loại thất bại âm thầm mà việc đếm sinh ra để diệt.

**Ngoài phạm vi, và đây là kết luận thật:** thứ hệ thống cần cho một nhân sự nghỉ việc là **vô hiệu hoá tài khoản**, không phải xoá — và `account` **không có cột nào cho việc đó**. Đó là feature còn thiếu, không phải bug của spec này; nó cần cột, migration, và một quyết định về việc tài khoản bị vô hiệu hoá thì còn giữ quyền sở hữu môn hay không. Đề nghị làm ngay sau spec này, cùng hạng với món `room` mà spec trước hoãn.

Cũng ngoài phạm vi, cố ý: **không** tự động chuyển chủ khi xoá. Phân công lại là bước thủ công bắt buộc, vì nó đi qua `assignOwner` — tức qua kiểm vai (§4.1) và qua audit log (§4.2). Một đường tự động sẽ đi vòng cả hai.

### 9.3 Vẫn không có bảng `department`

Khoa = tập môn của một head. `rubric_template.department_id` vẫn là cột `uuid` treo không bảng nào phía sau (entity tự ghi chú điều đó). Ngoài phạm vi; ghi nhận để không ai tưởng nó là FK.

---

## 10. Sốc vận hành khi deploy

- **41 Trưởng khoa mất quyền tạo/sửa/xoá phòng thi.** Ai đang làm việc đó phải chuyển sang một tài khoản Phòng Đào tạo (đang có 19). Đây là thay đổi duy nhất **lấy đi** quyền của người đang dùng — phải nói trước khi deploy, không để họ phát hiện bằng một 403.
- **Bookmark `/admin/unowned-courses` và `/department/rooms` sẽ 404.** Đề xuất để 404, không dựng redirect: app chưa phát hành, và một redirect từ area này sang area khác sẽ bị `middleware` bật lại về home của role — một vòng lặp khó hiểu hơn cả 404.
- Không có migration, nên không có bước DB nào khi deploy.

---

## 11. Thứ tự thực hiện

1. **§3.0** `Roles` decorator nhận `AccountRole[]`, sửa những gì đỏ — **đi trước mọi thứ viết `@Roles`**
2. §8 `TestAccountRole` → `import type { AccountRole }`
3. §4.1 + §4.2 `assignOwner`: kiểm vai + audit, một transaction — **lỗ thật, sửa trước khi dời tier**
4. §3.1 Rooms đổi sang `academic_affairs` (+ sửa fallout `department-resources.e2e-spec.ts`)
5. §3.1 + §3.2 + §4.3 `GET /courses` thành danh mục, xoá `findUnowned`, `POST /courses` hai vai
6. §3.1 `PATCH/DELETE /courses/:id` cho academic trên môn chưa chủ
7. §9.2 `AccountsService.remove` trả 409 tách phụ thuộc giải được / vĩnh viễn
8. §6.1 + §6.2 Nav + dời/xoá trang + `/academic/courses` mới
9. §5 Sửa `missingLink` ở dashboard Trưởng khoa
10. §6.3 `getRoleDisplay` cho role lạ
11. §2 Viết quy tắc vào block comment đầu `nav-config.ts`

Mục 3 đi trước mục 4–6 có chủ đích: dời một tier mà chưa vá lỗ hở trong nó là **mang cái lỗ sang chỗ mới**.
