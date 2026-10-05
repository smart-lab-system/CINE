# Plan D2 — Lớp do admin quản lý, giảng viên chỉ đọc

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đảo quyền tạo lớp: **admin** tạo, sửa, xoá, giao giảng viên; **giảng viên chỉ đọc** lớp được giao (theo học kỳ). Một lớp là `(học kỳ, lớp danh nghĩa, nhóm, giảng viên)`, hiển thị bằng **một nhãn gộp** `DHKTPM18A – Nhóm 1`. Ba nơi đọc tên lớp còn lại ngoài phạm vi plan D3 (điểm danh, kết quả chấm, trạng thái bài nộp) đọc nhãn từ view `class_label`.

**Architecture:** `ClassService` viết lại quanh admin (`create/update/remove`, `listForAdmin`) và một truy vấn đọc cho giảng viên (`findForTeacher` có lọc năm học/học kỳ); phần "lớp này có phải của bạn không" (`findOwnedByTeacher`, `findTaughtBy`, `findByIdAndCourseName`) giữ nguyên vì roster, tạo phiên và luồng xin phép dựa vào nó. Mọi ghi của admin chạy trong một transaction cùng dòng `audit_log` (`class.create|update|delete|reassign_teacher`). Bất biến "không đổi kỳ của lớp đã có phiên" đã nằm ở DB (plan C); service chỉ thêm câu báo lỗi đọc được.

**Tech Stack:** NestJS 10, TypeORM 0.3, Postgres 16, class-validator, jest e2e.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §2.3 (mục 1, 2), §2.5, §4 (nhóm Lớp), §5.2, §11: T-OWN-1, T-OWN-2, T-OWN-3, T-ADM-1, T-ADM-4, T-MD-5 (mức service), T-MD-8 (lớp), T-AUD-1 (lớp); điểm mở §13 mục 7.

## Global Constraints

- `POST|PATCH|DELETE /classes` và `GET /classes` là **`@Roles('admin')`**; `GET /classes/teaching` là **teacher, chỉ đọc**; các route roster (`/classes/:id/roster…`) giữ **teacher** kèm kiểm `class.teacher_id` (spec §4). Giảng viên gọi `POST|PATCH|DELETE /classes` → **403** (T-OWN-1).
- Một lớp: `semester_id`, `administrative_class_id`, `group_name` (mặc định `''`), `teacher_id`, `course_name = COURSE_NAME` (hằng số, server điền). **Không** ghi `class.name` (cột cũ, bị gỡ ở plan H).
- **Form và route lớp chỉ CHỌN, không tạo mã lớp danh nghĩa.** Nhận `administrativeClassId` **hoặc** `administrativeClassCode` (đúng một trong hai); mã chưa có trong Danh mục → **400** nói rõ "hãy thêm vào Danh mục lớp danh nghĩa trước", và **không** tạo mã (spec §2.2, T-ADM-1).
- **Không đổi `semester_id` của lớp đã có phiên** (DB ép bằng trigger từ plan C; service kiểm trước để nói rõ có bao nhiêu phiên). Lớp chưa có phiên thì đổi thoải mái.
- **Đổi giảng viên của lớp** (spec §2.3 mục 2): trong **một** transaction, `enrollment.home_teacher_id` của lớp đổi theo; `exam_session.teacher_id`, `session_roster.home_teacher_id`, `submission.home_teacher_id` của phiên/bài đã có **KHÔNG đổi** — để không ai sửa được điểm của phiên người khác đã chấm. Giảng viên mới thấy lớp và tạo được phiên mới. Giảng viên đích phải là tài khoản `teacher` **đang hoạt động**.
- Xoá lớp chỉ khi **không** còn sinh viên và **không** còn phiên (FK RESTRICT ở DB là thẩm quyền cuối; service báo lý do cụ thể kèm số lượng).
- Audit, cùng transaction với thay đổi, một dòng mỗi hành động: `class.create`, `class.update` (chỉ các trường đổi, trừ giảng viên), `class.reassign_teacher` (khi giảng viên đổi — PATCH đổi cả hai thì ghi hai dòng, vì là hai hành vi khác nhau), `class.delete`. Quy ước plan B: `newValue.targetLabel` là nhãn gộp kèm học kỳ (`oldValue.targetLabel` với `delete`); các khoá đọc được: `semester`, `administrativeClass`, `groupName`, `teacherName`. Câu mô tả tiếng Việt cho các hành động này thêm ở plan G cùng mọi hành động dữ liệu nền.
- Nhãn lớp **chỉ** đọc qua view `class_label` / `ClassLabelService` / `ClassLabelView`; không nối chuỗi mã + nhóm ở chỗ khác.
- Giữ nguyên tên trường các phản hồi chỉ NHÚNG tên lớp (`className`, `homeClassName` ở điểm danh / kết quả chấm / trạng thái bài nộp): **giá trị** thành nhãn, tên trường không đổi. Hai danh sách có cột học kỳ (`GET /exam-sessions`, `GET /submissions/overview`) đổi sang `classLabel` ở plan D3.
- Chạy e2e theo plan A (Docker `cine-*`, `.env.test`, `--runInBand`). Dữ liệu chung toàn hệ (học kỳ, mã lớp danh nghĩa) dùng hậu tố ngẫu nhiên và năm ≥ 2200 (plan C).

## Review Focus

1. **Quên `@Roles` ở một route ghi lớp.** `RolesGuard` trả `true` khi thiếu metadata, nên một route lớp ghi mở cho giảng viên vẫn biên dịch. → class-level `@Roles('admin')` + test T-OWN-1 gọi cả ba route ghi bằng giảng viên (Task 3).
2. **Đổi giảng viên làm mất điểm của người khác.** Nếu cập nhật nhầm `exam_session.teacher_id` hay `submission.home_teacher_id`, giảng viên mới sửa được điểm của phiên cũ. → T-OWN-3 đọc lại bốn cột đó sau khi đổi (Task 3).
3. **Tạo mã lớp danh nghĩa "tiện tay".** Một nhánh `findOrCreate` ở đây phá chính cái Danh mục sinh ra để chặn. → T-ADM-1 đếm số dòng `administrative_class` trước/sau một lần tạo lớp với mã chưa có (Task 3).
4. **Sửa mã lớp danh nghĩa không lan tới nhãn.** Nhãn là biểu thức, nhưng một nơi nào đó đọc từ bản chụp sẽ giữ nhãn cũ. → T-ADM-4 kiểm nhãn đổi ở danh sách giảng viên, điểm danh, và cả lớp của kỳ cũ (Task 3, 4).
5. **Lớp admin tạo cho một tài khoản không phải giảng viên, hoặc đã bị khoá.** Lớp mồ côi không UI nào chạm tới. → 400 cho cả hai (Task 3).
6. **Xoá lớp còn dữ liệu.** → 409 kèm số sinh viên/phiên, không dòng audit nào (Task 3).

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/course/dto/class.dto.ts` | **Mới.** `CreateClassDto`, `UpdateClassDto`, `SearchClassesDto`, `SearchTeachingClassesDto`. |
| `apps/api/src/course/dto/course.dto.ts` | **Xoá** (chỉ còn hai DTO lớp cũ). |
| `apps/api/src/course/course.types.ts` | `TeachingClassView` mới, `ClassAdminView`. |
| `apps/api/src/course/class.service.ts` | Viết lại. |
| `apps/api/src/course/class.controller.ts` | Đổi vai trò và route. |
| `apps/api/src/course/course.module.ts` | Import `AdminModule` đã có từ plan C; thêm `AdministrativeClassEntity` nếu thiếu. |
| `apps/api/src/accounts/accounts.controller.ts` | Sửa chú thích cũ nhắc "Trưởng khoa". |
| `apps/api/src/agent-connection/attendance.service.ts`, `agent-connection.module.ts` | Nhãn lớp từ view. |
| `apps/api/src/grading/grading.service.ts`, `apps/api/src/submission/submission.service.ts` | Nhãn lớp từ view. |
| `apps/api/test/class-admin.e2e-spec.ts` | **Mới.** |
| `apps/api/test/classes-teacher-crud.e2e-spec.ts` | **Xoá** (đảo ngược bởi spec). |
| `apps/api/test/exam-session.e2e-spec.ts` | Sửa một ca đọc `/classes/teaching`. |
| `packages/shared/src/api/schema.d.ts` | Sinh lại. |

---

### Task 1: Kiểu, DTO, và e2e của lớp do admin quản lý (đỏ)

**Files:**
- Create: `apps/api/src/course/dto/class.dto.ts`
- Modify: `apps/api/src/course/course.types.ts`, `apps/api/test/helpers/master-data.ts`
- Test: `apps/api/test/class-admin.e2e-spec.ts`

**Phụ thuộc:** plan D1 đã xong (`ClassLabelView`/`ClassLabelService`, `ensureTestSemester`, `seedEnrollment` ghi `student`) và plan C (bảng, view, `AdminModule` trong `CourseModule`).

**Interfaces:**
- Produces:

```ts
// class.dto.ts
class CreateClassDto { semesterId: string; administrativeClassId?: string; administrativeClassCode?: string; groupName?: string; teacherId: string }
class UpdateClassDto { semesterId?: string; administrativeClassId?: string; administrativeClassCode?: string; groupName?: string; teacherId?: string }
class SearchClassesDto { semesterId?: string; academicYear?: number; teacherId?: string; q?: string }
class SearchTeachingClassesDto { semesterId?: string; academicYear?: number }
// course.types.ts
class TeachingClassView { id; label; labelWithSemester; courseName; semesterId: string | null; academicYear: number | null; term: number | null; studentCount }
class ClassAdminView { id; label; labelWithSemester; semesterId: string | null; academicYear: number | null; term: number | null;
  administrativeClassId: string | null; administrativeClassCode: string | null; groupName: string;
  teacherId: string; teacherName: string; studentCount: number; sessionCount: number }
```

- [ ] **Step 1: Viết DTO**

Create `apps/api/src/course/dto/class.dto.ts`:

```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

/**
 * Lớp mới. Form CHỈ CHỌN: lớp danh nghĩa phải đã có trong Danh mục (spec §2.2) — nhận id (ô chọn)
 * hoặc mã (script, import), đúng MỘT trong hai; `ClassService` kiểm điều đó và trả 400 nêu Danh mục.
 *
 * KHÔNG có `courseName`: một môn duy nhất, server điền hằng số. Client cũ còn gửi kèm thì
 * `ValidationPipe({ whitelist: true })` lặng lẽ cắt.
 */
export class CreateClassDto {
  @IsUUID()
  semesterId!: string;

  @IsOptional()
  @IsUUID()
  administrativeClassId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  administrativeClassCode?: string;

  /** Nhóm, vd "Nhóm 1". Bỏ trống = không tách nhóm. */
  @IsOptional()
  @IsString()
  @Length(0, 50)
  groupName?: string;

  @IsUUID()
  teacherId!: string;
}

export class UpdateClassDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @IsUUID()
  administrativeClassId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 30)
  administrativeClassCode?: string;

  @IsOptional()
  @IsString()
  @Length(0, 50)
  groupName?: string;

  @IsOptional()
  @IsUUID()
  teacherId?: string;
}

/** Bộ lọc của trang Lớp (admin): năm học, học kỳ, giảng viên và ô tìm mã lớp. Vắng mặt = "tất cả". */
export class SearchClassesDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYear?: number;

  @IsOptional()
  @IsUUID()
  teacherId?: string;

  /** Tìm theo mã lớp danh nghĩa (khớp một phần, không phân biệt hoa-thường). */
  @IsOptional()
  @IsString()
  @Length(1, 50)
  q?: string;
}

/** Bộ lọc "Lớp của tôi" (giảng viên). Học kỳ chỉ thu hẹp tầm nhìn, không bao giờ chặn thao tác (CLAUDE.md §1.2). */
export class SearchTeachingClassesDto {
  @IsOptional()
  @IsUUID()
  semesterId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2999)
  academicYear?: number;
}
```

- [ ] **Step 2: Thay kiểu view trong `course.types.ts`**

Thay interface `TeachingClassView` cuối file bằng hai lớp (lớp, không phải interface, để plugin Swagger sinh schema):

```ts
/**
 * Một lớp như CHÍNH giảng viên của nó thấy: đủ để chọn trong form tạo phiên (nhãn gộp kèm học kỳ) và
 * để cảnh báo phòng nhỏ (`studentCount`), không cần thêm một lượt gọi mỗi dòng. Giảng viên chỉ thấy MỘT nhãn —
 * không có trang, route hay bộ lọc riêng cho lớp danh nghĩa (spec §2.2, §5.2).
 *
 * `studentCount = 0` có nghĩa riêng chứ không phải rỗng: chưa ai nhập danh sách cho lớp đó.
 */
export class TeachingClassView {
  id!: string;
  /** `DHKTPM18A` hoặc `DHKTPM18A – Nhóm 1`. */
  label!: string;
  /** `label` kèm ` · HK1 2026-2027`, để phân biệt hai lớp cùng nhãn ở hai kỳ. */
  labelWithSemester!: string;
  /** Hằng số của hệ thống (một môn). Giữ vì API vẫn trả; không màn hình nào hiện nó như một cột. */
  courseName!: string;
  /** `null` chỉ với lớp cũ chưa backfill. */
  semesterId!: string | null;
  academicYear!: number | null;
  term!: number | null;
  studentCount!: number;
}

/** Một lớp như admin thấy trong trang Lớp. */
export class ClassAdminView {
  id!: string;
  label!: string;
  labelWithSemester!: string;
  semesterId!: string | null;
  academicYear!: number | null;
  term!: number | null;
  administrativeClassId!: string | null;
  administrativeClassCode!: string | null;
  groupName!: string;
  teacherId!: string;
  teacherName!: string;
  studentCount!: number;
  sessionCount!: number;
}
```

- [ ] **Step 2b: Xoá DTO cũ**

`apps/api/src/course/dto/course.dto.ts` chỉ còn `CreateClassDto`/`UpdateClassDto` cũ (plan C đã xoá bảy DTO mồ côi). Xoá file này; `class.controller.ts` và `class.service.ts` sẽ import DTO mới ở Task 2–3.

- [ ] **Step 3: Thêm helper kỳ quá khứ vào `test/helpers/master-data.ts`**

Cho ca "học kỳ đã kết thúc không chặn thao tác" (cuối file e2e dưới đây, và T-FLT-3 ở plan D3). Thêm cuối `apps/api/test/helpers/master-data.ts`:

```ts
/**
 * Một học kỳ có ngày THẬT trong quá khứ (2001-09-01 → 2002-01-31). Nằm NGOÀI vùng tên ≥ 2200 của test (nên
 * `purgeTestSemesters` không đụng) và không đụng dữ liệu thật (2026 trở đi). Idempotent: chạy lại trả cùng một hàng.
 */
export async function ensurePastSemester(db: Queryable): Promise<string> {
  const [existing] = await db.query(
    `SELECT id FROM examcollect.semester WHERE academic_year_start = 2001 AND term = 1`,
  );
  if (existing) return existing.id as string;
  const [row] = await db.query(
    `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
     VALUES (2001, 1, '2001-09-01', '2002-01-31') RETURNING id`,
  );
  return row.id as string;
}
```

- [ ] **Step 4: Viết e2e (đỏ)**

Create `apps/api/test/class-admin.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { ensurePastSemester, ensureTestSemester, purgeTestSemesters, randomTag } from './helpers/master-data';
import { seedEnrollment, seedExamSession } from './helpers/seed';
import { seedResult, seedSession } from './helpers/grading-seed';

/**
 * Lớp do ADMIN quản lý; giảng viên chỉ đọc (spec §2.3, §4). Đảo lại thay đổi 21/09 cho giảng viên
 * tự tạo lớp: admin thành điểm nghẽn, và đó là lựa chọn có ý thức (spec §12 mục 1).
 */
describe('Lớp do admin quản lý (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let adminToken: string;
  let adminId: string;
  let teacherToken: string;
  let teacherId: string;
  let otherTeacherId: string;
  let otherTeacherToken: string;
  let semesterId: string;
  let otherSemesterId: string;
  const createdAdm: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const post = (body: object, token = adminToken) => request(app.getHttpServer()).post('/classes').set(auth(token)).send(body);
  const patch = (id: string, body: object, token = adminToken) =>
    request(app.getHttpServer()).patch(`/classes/${id}`).set(auth(token)).send(body);

  async function account(prefix: string, role: 'admin' | 'teacher') {
    const email = `${prefix}_${randomTag()}@example.com`;
    const id = await createTestAccount(ds, { email, password: 'correct-horse-battery', role });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return { id, token: login.body.accessToken as string };
  }

  async function adminClass(code = `ZZ${randomTag(12)}`): Promise<{ id: string; code: string }> {
    const [row] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [code]);
    createdAdm.push(row.id);
    return { id: row.id, code };
  }

  async function auditCount(action: string) {
    const [row] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.audit_log WHERE action = $1 AND actor_id = $2`, [action, adminId]);
    return row.n as number;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const admin = await account('cls_admin', 'admin');
    adminId = admin.id;
    adminToken = admin.token;
    const teacher = await account('cls_teacher', 'teacher');
    teacherId = teacher.id;
    teacherToken = teacher.token;
    const other = await account('cls_other', 'teacher');
    otherTeacherId = other.id;
    otherTeacherToken = other.token;
    semesterId = await ensureTestSemester(ds, 1);
    otherSemesterId = await ensureTestSemester(ds, 2);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.class WHERE teacher_id = ANY($1)`, [[teacherId, otherTeacherId]]).catch(() => undefined);
    await ds.query(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, [createdAdm]).catch(() => undefined);
    await purgeTestSemesters(ds);
    await app.close();
  });

  describe('phân quyền (T-OWN-1)', () => {
    it('giảng viên không tạo, sửa, xoá được lớp (403), và không đọc được danh sách của admin', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);

      await post({ semesterId, administrativeClassId: adm.id, teacherId }, teacherToken).expect(403);
      await patch(created.body.id, { groupName: 'Nhóm X' }, teacherToken).expect(403);
      await request(app.getHttpServer()).delete(`/classes/${created.body.id}`).set(auth(teacherToken)).expect(403);
      await request(app.getHttpServer()).get('/classes').set(auth(teacherToken)).expect(403);
    });

    it('admin không dùng được route "lớp của tôi" (đó là của giảng viên)', async () => {
      await request(app.getHttpServer()).get('/classes/teaching').set(auth(adminToken)).expect(403);
    });

    it('không token là 401', async () => {
      await request(app.getHttpServer()).get('/classes').expect(401);
      await request(app.getHttpServer()).get('/classes/teaching').expect(401);
    });
  });

  describe('tạo', () => {
    it('chọn lớp danh nghĩa bằng id: nhãn là mã, nhóm rỗng, ghi ĐÚNG MỘT dòng audit (T-AUD-1)', async () => {
      const adm = await adminClass();
      const before = await auditCount('class.create');

      const response = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);

      expect(response.body).toMatchObject({
        label: adm.code,
        groupName: '',
        administrativeClassCode: adm.code,
        teacherId,
        semesterId,
        studentCount: 0,
        sessionCount: 0,
      });
      expect(response.body.labelWithSemester).toMatch(new RegExp(`^${adm.code} · HK1 \\d{4}-\\d{4}$`));
      expect(await auditCount('class.create')).toBe(before + 1);
      const [entry] = await ds.query(`SELECT new_value FROM examcollect.audit_log WHERE target_id = $1`, [response.body.id]);
      expect(entry.new_value).toMatchObject({ targetLabel: response.body.labelWithSemester, groupName: '' });
    });

    it('chọn bằng mã (không phân biệt hoa-thường) và có nhóm: nhãn "mã – nhóm"', async () => {
      const adm = await adminClass();
      const response = await post({
        semesterId,
        administrativeClassCode: adm.code.toLowerCase(),
        groupName: '  Nhóm   2 ',
        teacherId,
      }).expect(201);
      expect(response.body.label).toBe(`${adm.code} – Nhóm 2`);
      expect(response.body.groupName).toBe('Nhóm 2');
    });

    it('T-ADM-1: mã chưa có trong Danh mục là 400 chỉ tới Danh mục, và KHÔNG tạo mã (Review Focus 3)', async () => {
      const missing = `ZZ${randomTag(12)}`;
      const [{ n: before }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.administrative_class`);

      const response = await post({ semesterId, administrativeClassCode: missing, teacherId }).expect(400);

      expect(response.body.message).toContain(missing);
      expect(response.body.message).toMatch(/Danh mục lớp danh nghĩa/);
      const [{ n: after }] = await ds.query(`SELECT count(*)::int AS n FROM examcollect.administrative_class`);
      expect(after).toBe(before);
    });

    it('lớp danh nghĩa được chỉ bằng id mà không có thật là 400; không chỉ lớp nào cũng 400; chỉ cả hai cũng 400', async () => {
      const adm = await adminClass();
      await post({ semesterId, administrativeClassId: '00000000-0000-4000-8000-0000000000cc', teacherId }).expect(400);
      await post({ semesterId, teacherId }).expect(400);
      await post({ semesterId, administrativeClassId: adm.id, administrativeClassCode: adm.code, teacherId }).expect(400);
    });

    it('học kỳ không có thật là 400', async () => {
      const adm = await adminClass();
      await post({ semesterId: '00000000-0000-4000-8000-0000000000dd', administrativeClassId: adm.id, teacherId }).expect(400);
    });

    it('giảng viên phải là tài khoản `teacher` ĐANG hoạt động (Review Focus 5)', async () => {
      const adm = await adminClass();
      await post({ semesterId, administrativeClassId: adm.id, teacherId: adminId }).expect(400); // một admin
      const inactive = await account('cls_inactive', 'teacher');
      await ds.query(`UPDATE examcollect.account SET is_active = false WHERE id = $1`, [inactive.id]);
      await post({ semesterId, administrativeClassId: adm.id, teacherId: inactive.id }).expect(400);
    });

    it('trùng (học kỳ, lớp danh nghĩa, nhóm) là 409 nêu nhãn; khác nhóm hoặc khác kỳ thì được', async () => {
      const adm = await adminClass();
      await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);

      const dup = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId: otherTeacherId }).expect(409);
      expect(dup.body.message).toContain(`${adm.code} – Nhóm 1`);

      await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 2', teacherId }).expect(201);
      await post({ semesterId: otherSemesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
    });

    it('lỗi không để lại dòng audit', async () => {
      const adm = await adminClass();
      const before = await auditCount('class.create');
      await post({ semesterId, administrativeClassCode: `ZZ${randomTag(12)}`, teacherId }).expect(400);
      await post({ semesterId, administrativeClassId: adm.id, teacherId: adminId }).expect(400);
      expect(await auditCount('class.create')).toBe(before);
    });
  });

  describe('đọc: admin và giảng viên', () => {
    it('admin lọc theo học kỳ, theo năm học, theo giảng viên và theo mã lớp', async () => {
      const adm = await adminClass();
      const mine = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      const theirs = await post({ semesterId: otherSemesterId, administrativeClassId: adm.id, teacherId: otherTeacherId }).expect(201);

      const bySemester = await request(app.getHttpServer()).get(`/classes?semesterId=${semesterId}&q=${adm.code}`).set(auth(adminToken)).expect(200);
      expect(bySemester.body.map((c: { id: string }) => c.id)).toEqual([mine.body.id]);

      const byTeacher = await request(app.getHttpServer()).get(`/classes?teacherId=${otherTeacherId}&q=${adm.code.toLowerCase()}`).set(auth(adminToken)).expect(200);
      expect(byTeacher.body.map((c: { id: string }) => c.id)).toEqual([theirs.body.id]);

      const [{ academic_year_start: year }] = await ds.query(`SELECT academic_year_start FROM examcollect.semester WHERE id = $1`, [semesterId]);
      const byYear = await request(app.getHttpServer()).get(`/classes?academicYear=${year}&q=${adm.code}`).set(auth(adminToken)).expect(200);
      expect(byYear.body.map((c: { id: string }) => c.id)).toContain(mine.body.id);
    });

    it('ô tìm mã không coi % và _ là ký tự đại diện', async () => {
      const response = await request(app.getHttpServer()).get(`/classes?q=${encodeURIComponent('%')}`).set(auth(adminToken)).expect(200);
      expect(response.body).toEqual([]);
    });

    it('giảng viên thấy CHỈ lớp của mình, có thể lọc theo học kỳ, và chỉ thấy MỘT nhãn', async () => {
      const adm = await adminClass();
      const mine = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      const theirs = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 2', teacherId: otherTeacherId }).expect(201);

      const all = await request(app.getHttpServer()).get('/classes/teaching').set(auth(teacherToken)).expect(200);
      const ids = all.body.map((c: { id: string }) => c.id);
      expect(ids).toContain(mine.body.id);
      expect(ids).not.toContain(theirs.body.id);
      const row = all.body.find((c: { id: string }) => c.id === mine.body.id);
      expect(row).toMatchObject({ label: `${adm.code} – Nhóm 1`, semesterId });
      expect(row).not.toHaveProperty('administrativeClassCode');
      expect(row).not.toHaveProperty('administrativeClassId');

      const other = await request(app.getHttpServer()).get(`/classes/teaching?semesterId=${otherSemesterId}`).set(auth(teacherToken)).expect(200);
      expect(other.body.map((c: { id: string }) => c.id)).not.toContain(mine.body.id);
    });

    it('semesterId không phải uuid là 400, không bị lặng lẽ bỏ qua', async () => {
      await request(app.getHttpServer()).get('/classes/teaching?semesterId=khong-phai-uuid').set(auth(teacherToken)).expect(400);
    });
  });

  describe('sửa', () => {
    it('T-MD-5 (service): đổi học kỳ của lớp CHƯA có phiên được; lớp ĐÃ có phiên bị chặn kèm số phiên', async () => {
      const adm = await adminClass();
      const free = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      const moved = await patch(free.body.id, { semesterId: otherSemesterId }).expect(200);
      expect(moved.body.semesterId).toBe(otherSemesterId);

      const adm2 = await adminClass();
      const withSession = await post({ semesterId, administrativeClassId: adm2.id, teacherId }).expect(201);
      const start = new Date(Date.now() - 30 * 24 * 3_600_000);
      await seedExamSession(ds, { teacherId, classId: withSession.body.id, startTime: start, endTime: new Date(start.getTime() + 3_600_000), status: 'completed' });

      const blocked = await patch(withSession.body.id, { semesterId: otherSemesterId }).expect(409);
      expect(blocked.body.message).toMatch(/1 phiên/);
    });

    it('đổi nhóm và đổi lớp danh nghĩa; audit chỉ ghi các trường đổi bằng khoá đọc được', async () => {
      const a = await adminClass();
      const b = await adminClass();
      const created = await post({ semesterId, administrativeClassId: a.id, groupName: 'Nhóm 1', teacherId }).expect(201);

      const response = await patch(created.body.id, { groupName: 'Nhóm 9', administrativeClassId: b.id }).expect(200);
      expect(response.body.label).toBe(`${b.code} – Nhóm 9`);

      const [entry] = await ds.query(
        `SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'class.update'`,
        [created.body.id],
      );
      expect(entry.old_value).toEqual({ groupName: 'Nhóm 1', administrativeClass: a.code });
      expect(Object.keys(entry.new_value).sort()).toEqual(['administrativeClass', 'groupName', 'targetLabel']);
      expect(entry.new_value.administrativeClass).toBe(b.code);
    });

    it('đổi sang (kỳ, mã, nhóm) đã có là 409; một lớp không "trùng" với chính nó', async () => {
      const adm = await adminClass();
      const first = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      const second = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 2', teacherId }).expect(201);
      await patch(first.body.id, { groupName: 'Nhóm 1' }).expect(200);
      await patch(second.body.id, { groupName: 'Nhóm 1' }).expect(409);
    });

    it('gửi lại đúng giá trị hiện có là không đổi gì và không ghi audit', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await patch(created.body.id, { semesterId, groupName: '' }).expect(200);
      const rows = await ds.query(`SELECT 1 FROM examcollect.audit_log WHERE target_id = $1 AND action IN ('class.update', 'class.reassign_teacher')`, [created.body.id]);
      expect(rows).toHaveLength(0);
    });

    it('404 cho lớp không tồn tại', async () => {
      await patch('00000000-0000-4000-8000-000000000000', { groupName: 'x' }).expect(404);
    });
  });

  describe('T-OWN-3: đổi giảng viên của lớp', () => {
    it('enrollment.home_teacher_id đổi theo; phiên, ảnh chốt và bài nộp đã có KHÔNG đổi (Review Focus 2)', async () => {
      // `seedSession` dựng giảng viên + lớp + phiên + file bắt buộc + rubric; `seedResult` thêm một bài nộp đã chấm.
      const ctx = await seedSession(ds, `own${randomTag(6)}`);
      await seedResult(ds, ctx);
      const mssv = `OW${randomTag(8)}`;
      await seedEnrollment(ds, { classId: ctx.classId, teacherId: ctx.teacherId, mssv });
      await ds.query(
        `INSERT INTO examcollect.session_roster (exam_session_id, student_mssv, student_name, home_class_id, home_teacher_id, source)
         VALUES ($1, $2, 'Sinh viên cũ', $3, $4, 'frozen')`,
        [ctx.sessionId, mssv, ctx.classId, ctx.teacherId],
      );
      const before = await auditCount('class.reassign_teacher');

      await patch(ctx.classId, { teacherId: otherTeacherId }).expect(200);

      const [klass] = await ds.query(`SELECT teacher_id FROM examcollect.class WHERE id = $1`, [ctx.classId]);
      expect(klass.teacher_id).toBe(otherTeacherId);
      const [enr] = await ds.query(`SELECT home_teacher_id FROM examcollect.enrollment WHERE home_class_id = $1 AND student_mssv = $2`, [ctx.classId, mssv]);
      expect(enr.home_teacher_id).toBe(otherTeacherId);

      const [session] = await ds.query(`SELECT teacher_id FROM examcollect.exam_session WHERE id = $1`, [ctx.sessionId]);
      expect(session.teacher_id).toBe(ctx.teacherId);
      const [roster] = await ds.query(`SELECT home_teacher_id FROM examcollect.session_roster WHERE exam_session_id = $1 AND student_mssv = $2`, [ctx.sessionId, mssv]);
      expect(roster.home_teacher_id).toBe(ctx.teacherId);
      const submissions = await ds.query(`SELECT DISTINCT home_teacher_id FROM examcollect.submission WHERE exam_session_id = $1`, [ctx.sessionId]);
      expect(submissions.map((s: { home_teacher_id: string }) => s.home_teacher_id)).toEqual([ctx.teacherId]);

      expect(await auditCount('class.reassign_teacher')).toBe(before + 1);
      const [entry] = await ds.query(`SELECT old_value, new_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'class.reassign_teacher'`, [ctx.classId]);
      expect(entry.old_value).toHaveProperty('teacherName');
      expect(entry.new_value).toHaveProperty('teacherName');
      expect(entry.new_value).toHaveProperty('targetLabel');
    });

    it('giảng viên mới thấy lớp, giảng viên cũ thì không', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await patch(created.body.id, { teacherId: otherTeacherId }).expect(200);
      const mine = await request(app.getHttpServer()).get('/classes/teaching').set(auth(teacherToken)).expect(200);
      const theirs = await request(app.getHttpServer()).get('/classes/teaching').set(auth(otherTeacherToken)).expect(200);
      expect(mine.body.map((c: { id: string }) => c.id)).not.toContain(created.body.id);
      expect(theirs.body.map((c: { id: string }) => c.id)).toContain(created.body.id);
    });

    it('giảng viên đích không phải giảng viên đang hoạt động là 400 và không đổi gì', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await patch(created.body.id, { teacherId: adminId }).expect(400);
      const [row] = await ds.query(`SELECT teacher_id FROM examcollect.class WHERE id = $1`, [created.body.id]);
      expect(row.teacher_id).toBe(teacherId);
    });

    it('PATCH đổi cả giảng viên lẫn nhóm ghi HAI dòng audit (hai hành vi khác nhau)', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      await patch(created.body.id, { teacherId: otherTeacherId, groupName: 'Nhóm 2' }).expect(200);
      const rows = await ds.query(`SELECT action FROM examcollect.audit_log WHERE target_id = $1 AND action IN ('class.update','class.reassign_teacher') ORDER BY action`, [created.body.id]);
      expect(rows.map((r: { action: string }) => r.action)).toEqual(['class.reassign_teacher', 'class.update']);
    });
  });

  describe('T-ADM-4: sửa mã lớp danh nghĩa đổi nhãn ở mọi nơi', () => {
    it('danh sách giảng viên và danh sách admin đổi nhãn theo, kể cả lớp của kỳ cũ (Review Focus 4)', async () => {
      const typo = await adminClass();
      const current = await post({ semesterId, administrativeClassId: typo.id, groupName: 'Nhóm 1', teacherId }).expect(201);
      const older = await post({ semesterId: otherSemesterId, administrativeClassId: typo.id, teacherId }).expect(201);

      const fixed = `ZZ${randomTag(12)}`;
      await request(app.getHttpServer()).patch(`/administrative-classes/${typo.id}`).set(auth(adminToken)).send({ code: fixed }).expect(200);

      const teaching = await request(app.getHttpServer()).get('/classes/teaching').set(auth(teacherToken)).expect(200);
      const labels = new Map(teaching.body.map((c: { id: string; label: string }) => [c.id, c.label]));
      expect(labels.get(current.body.id)).toBe(`${fixed} – Nhóm 1`);
      expect(labels.get(older.body.id)).toBe(fixed);

      const admin = await request(app.getHttpServer()).get(`/classes?q=${fixed}`).set(auth(adminToken)).expect(200);
      expect(admin.body.map((c: { label: string }) => c.label).sort()).toEqual([fixed, `${fixed} – Nhóm 1`].sort());
    });
  });

  describe('xoá', () => {
    it('xoá được lớp rỗng; audit mang nhãn trong oldValue', async () => {
      const adm = await adminClass();
      const created = await post({ semesterId, administrativeClassId: adm.id, teacherId }).expect(201);
      await request(app.getHttpServer()).delete(`/classes/${created.body.id}`).set(auth(adminToken)).expect(204);
      const [entry] = await ds.query(`SELECT old_value FROM examcollect.audit_log WHERE target_id = $1 AND action = 'class.delete'`, [created.body.id]);
      expect(entry.old_value).toMatchObject({ targetLabel: created.body.labelWithSemester, administrativeClass: adm.code });
    });

    it('T-MD-8 (lớp): lớp còn sinh viên hoặc còn phiên không xoá được; báo số lượng và không để lại audit (Review Focus 6)', async () => {
      const adm = await adminClass();
      const withStudents = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Có SV', teacherId }).expect(201);
      await seedEnrollment(ds, { classId: withStudents.body.id, teacherId, mssv: `DL${randomTag(8)}` });
      const before = await auditCount('class.delete');

      const blocked = await request(app.getHttpServer()).delete(`/classes/${withStudents.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked.body.message).toMatch(/1 sinh viên/);

      const withSession = await post({ semesterId, administrativeClassId: adm.id, groupName: 'Có phiên', teacherId }).expect(201);
      const start = new Date(Date.now() - 31 * 24 * 3_600_000);
      await seedExamSession(ds, { teacherId, classId: withSession.body.id, startTime: start, endTime: new Date(start.getTime() + 3_600_000), status: 'completed' });
      const blocked2 = await request(app.getHttpServer()).delete(`/classes/${withSession.body.id}`).set(auth(adminToken)).expect(409);
      expect(blocked2.body.message).toMatch(/1 phiên/);

      expect(await auditCount('class.delete')).toBe(before);
    });
  });

  it('tạo lớp cho kỳ ĐÃ KẾT THÚC vẫn được: học kỳ không bao giờ chặn thao tác (CLAUDE.md §1.2)', async () => {
    // Một kỳ có ngày THẬT trong quá khứ (2001-09-01 → 2002-01-31), không nằm trong vùng tên ≥ 2200 của test.
    const pastSemesterId = await ensurePastSemester(ds);
    const adm = await adminClass();
    await post({ semesterId: pastSemesterId, administrativeClassId: adm.id, teacherId }).expect(201);
  });
});
```

`seedSession` và `seedResult` (`test/helpers/grading-seed.ts`) tạo giảng viên, lớp, phiên, rubric và một bài nộp riêng cho mỗi lần gọi. Ca T-OWN-3 dùng `ctx.teacherId` làm "giảng viên cũ".

- [ ] **Step 5: Chạy để thấy đỏ**

Run (từ `apps/api`): `npx jest --config ./test/jest-e2e.json test/class-admin.e2e-spec.ts`
Expected: FAIL — chưa có service/route mới (`POST /classes` vẫn là route cũ của giảng viên).

Chưa commit: các Task 1–3 là một khối (DTO, service, controller) và hoàn thiện cùng một commit ở cuối Task 3 để mọi commit đều xanh. Chuyển sang Task 2.

---

### Task 2: `ClassService`

**Files:**
- Modify (viết lại): `apps/api/src/course/class.service.ts`

**Interfaces:**
- Consumes: `AuditLogService.recordUserAction(input, manager)`, `ClassLabelService`, `COURSE_NAME`, `normalizeAdministrativeCode`, `administrativeCodeProblem`, `semesterLabel`.
- Produces:

```ts
class ClassService {
  findForTeacher(teacherId: string, filters: SearchTeachingClassesDto): Promise<TeachingClassView[]>;
  listForAdmin(filters: SearchClassesDto): Promise<ClassAdminView[]>;
  create(actorId: string, dto: CreateClassDto): Promise<ClassAdminView>;
  update(actorId: string, id: string, dto: UpdateClassDto): Promise<ClassAdminView>;
  remove(actorId: string, id: string): Promise<void>;
  // Giữ nguyên chữ ký (roster, tạo phiên, xin phép dựa vào):
  findTaughtBy(id: string, teacherId: string): Promise<ClassEntity>;
  findOwnedByTeacher(id: string, teacherId: string): Promise<ClassEntity>;
  findByIdAndCourseName(id: string, courseName: string): Promise<ClassEntity | null>;
}
```

- [ ] **Step 1: Viết lại service**

Replace `apps/api/src/course/class.service.ts`:

```ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditLogService } from '../admin/audit-log.service';
import { COURSE_NAME } from '../common/course-name';
import {
  administrativeCodeProblem,
  normalizeAdministrativeCode,
} from '../common/master-data-normalize';
import { ClassEntity } from './entities/class.entity';
import {
  CreateClassDto,
  SearchClassesDto,
  SearchTeachingClassesDto,
  UpdateClassDto,
} from './dto/class.dto';
import { ClassAdminView, TeachingClassView } from './course.types';

/** Chuẩn hoá tên nhóm: gộp khoảng trắng, cắt hai đầu. `''` = không tách nhóm. */
function normalizeGroupName(raw: string | undefined): string {
  return (raw ?? '').replace(/\s+/g, ' ').trim();
}

/** Bọc ô tìm thành pattern ILIKE và trung hoà `%`, `_`, `\` bên trong. */
function toLikePattern(q: string): string {
  const escaped = q.trim().replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

interface AdminRow {
  id: string;
  label: string;
  labelWithSemester: string;
  semesterId: string | null;
  academicYear: number | null;
  term: number | null;
  administrativeClassId: string | null;
  administrativeClassCode: string | null;
  groupName: string;
  teacherId: string;
  teacherName: string;
  studentCount: number;
  sessionCount: number;
}

/**
 * Lớp, và quyền sở hữu của giảng viên trên chúng (spec §2.3, §4).
 *
 * ADMIN tạo, sửa, xoá và giao giảng viên; giảng viên chỉ ĐỌC lớp được giao. Đảo lại thay đổi 21/09
 * (giảng viên tự tạo lớp): dữ liệu nền do admin khai và kiểm chứng được bằng khoá ngoại, giảng viên chỉ
 * chọn trong đó. Admin thành điểm nghẽn — lựa chọn có ý thức (spec §12 mục 1).
 *
 * `class.teacher_id` vẫn là TOÀN BỘ phạm vi của một giảng viên, và mọi kiểm tra "lớp này có phải của bạn" là
 * một phép so ở đúng một chỗ: `findOwnedByTeacher`.
 *
 * Bất biến "không đổi học kỳ của lớp đã có phiên" nằm ở DB (trigger, plan C); kiểm ở đây chỉ để câu báo lỗi
 * nói rõ có bao nhiêu phiên thay cho "This request conflicts with an existing record".
 */
@Injectable()
export class ClassService {
  constructor(
    @InjectRepository(ClassEntity)
    private readonly classes: Repository<ClassEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditLogService,
  ) {}

  // ------------------------------------------------------------------ giảng viên đọc

  /**
   * Lớp giảng viên này dạy, cho "Lớp của tôi" và form tạo phiên: MỘT truy vấn có GROUP BY (không đếm
   * từng dòng), vì danh sách này được tải ở mỗi lần vào form. Bộ lọc học kỳ chỉ hẹp tầm nhìn.
   */
  async findForTeacher(
    teacherId: string,
    filters: SearchTeachingClassesDto,
  ): Promise<TeachingClassView[]> {
    const rows: Array<{
      id: string;
      label: string;
      labelWithSemester: string;
      courseName: string;
      semesterId: string | null;
      academicYear: number | null;
      term: number | null;
      studentCount: string;
    }> = await this.dataSource.query(
      `SELECT c.id,
              cl.label,
              cl.label_with_semester AS "labelWithSemester",
              c.course_name AS "courseName",
              sem.id AS "semesterId",
              sem.academic_year_start AS "academicYear",
              sem.term,
              COUNT(e.id) AS "studentCount"
         FROM examcollect.class c
         JOIN examcollect.class_label cl ON cl.class_id = c.id
         LEFT JOIN examcollect.semester sem ON sem.id = c.semester_id
         LEFT JOIN examcollect.enrollment e ON e.home_class_id = c.id
        WHERE c.teacher_id = $1
          AND ($2::uuid IS NULL OR c.semester_id = $2)
          AND ($3::int  IS NULL OR sem.academic_year_start = $3)
        GROUP BY c.id, cl.label, cl.label_with_semester, sem.id, sem.academic_year_start, sem.term
        ORDER BY sem.academic_year_start DESC NULLS LAST, sem.term DESC NULLS LAST, cl.label`,
      [teacherId, filters.semesterId ?? null, filters.academicYear ?? null],
    );
    return rows.map((row) => ({ ...row, studentCount: parseInt(row.studentCount, 10) }));
  }

  /**
   * The class, if this lecturer is the one who teaches it — 404 when it does not exist, 403 when it is a
   * colleague's. A 403 on a class that does not exist would confirm that some other lecturer's class has
   * that id.
   */
  async findTaughtBy(id: string, teacherId: string): Promise<ClassEntity> {
    return this.findOwnedByTeacher(id, teacherId);
  }

  /**
   * Một lớp, giới hạn trong cùng MÔN với phiên thi. Thay `CourseService.findClassForCourse`; giữ lại vì duyệt
   * một yêu cầu xin phép không được gắn sinh viên vào lớp của một môn khác. Hiện luôn đúng (môn là hằng số).
   */
  async findByIdAndCourseName(id: string, courseName: string): Promise<ClassEntity | null> {
    return this.classes.findOne({ where: { id, courseName } });
  }

  /** Vị từ quyền dùng chung: 404 khi không tồn tại, 403 khi tồn tại nhưng của người khác. */
  async findOwnedByTeacher(id: string, teacherId: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
    if (klass.teacherId !== teacherId) {
      throw new ForbiddenException('You do not teach this class');
    }
    return klass;
  }

  // ------------------------------------------------------------------- admin đọc

  async listForAdmin(filters: SearchClassesDto): Promise<ClassAdminView[]> {
    return this.queryAdminRows(
      `WHERE ($1::uuid IS NULL OR c.semester_id = $1)
         AND ($2::int  IS NULL OR sem.academic_year_start = $2)
         AND ($3::uuid IS NULL OR c.teacher_id = $3)
         AND ($4::text IS NULL OR ac.code::text ILIKE $4 ESCAPE '\\')`,
      [
        filters.semesterId ?? null,
        filters.academicYear ?? null,
        filters.teacherId ?? null,
        filters.q ? toLikePattern(filters.q) : null,
      ],
    );
  }

  // ------------------------------------------------------------------ admin ghi

  async create(actorId: string, dto: CreateClassDto): Promise<ClassAdminView> {
    const groupName = normalizeGroupName(dto.groupName);
    return this.dataSource.transaction(async (manager) => {
      await this.assertSemesterExists(manager, dto.semesterId);
      const administrativeClassId = await this.resolveAdministrativeClass(manager, dto);
      const teacher = await this.assertActiveTeacher(manager, dto.teacherId);
      await this.assertGroupFree(manager, dto.semesterId, administrativeClassId, groupName, null);

      const repo = manager.getRepository(ClassEntity);
      const saved = await repo.save(
        repo.create({
          courseName: COURSE_NAME,
          semesterId: dto.semesterId,
          administrativeClassId,
          groupName,
          teacherId: dto.teacherId,
        }),
      );

      const view = await this.readAdminRow(manager, saved.id);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'class.create',
          targetType: 'class',
          targetId: saved.id,
          newValue: {
            targetLabel: view.labelWithSemester,
            semester: view.labelWithSemester.split(' · ')[1] ?? null,
            administrativeClass: view.administrativeClassCode,
            groupName,
            teacherName: teacher.name,
          },
        },
        manager,
      );
      return view;
    });
  }

  async update(actorId: string, id: string, dto: UpdateClassDto): Promise<ClassAdminView> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy lớp.');

      const before = await this.readAdminRow(manager, id);

      const nextSemesterId = dto.semesterId ?? current.semesterId;
      const nextAdministrativeClassId =
        dto.administrativeClassId !== undefined || dto.administrativeClassCode !== undefined
          ? await this.resolveAdministrativeClass(manager, dto)
          : current.administrativeClassId;
      const nextGroup = dto.groupName === undefined ? current.groupName : normalizeGroupName(dto.groupName);
      const nextTeacherId = dto.teacherId ?? current.teacherId;

      const semesterChanged = nextSemesterId !== current.semesterId;
      const administrativeChanged = nextAdministrativeClassId !== current.administrativeClassId;
      const groupChanged = nextGroup !== current.groupName;
      const teacherChanged = nextTeacherId !== current.teacherId;
      if (!semesterChanged && !administrativeChanged && !groupChanged && !teacherChanged) {
        return before;
      }

      if (semesterChanged) {
        if (nextSemesterId) await this.assertSemesterExists(manager, nextSemesterId);
        if (before.sessionCount > 0) {
          throw new ConflictException(
            `Không đổi được học kỳ của lớp ${before.label} vì lớp đã có ${before.sessionCount} phiên thi. ` +
              'Phiên thi đã ghi nhãn học kỳ cũ; muốn đổi thì tạo lớp mới ở kỳ mới.',
          );
        }
      }
      let teacherName: string | null = null;
      if (teacherChanged) teacherName = (await this.assertActiveTeacher(manager, nextTeacherId)).name;
      if (semesterChanged || administrativeChanged || groupChanged) {
        await this.assertGroupFree(manager, nextSemesterId, nextAdministrativeClassId, nextGroup, id);
      }

      current.semesterId = nextSemesterId;
      current.administrativeClassId = nextAdministrativeClassId;
      current.groupName = nextGroup;
      current.teacherId = nextTeacherId;
      await repo.save(current);

      if (teacherChanged) {
        // Chỉ `enrollment` đi theo (spec §2.3 mục 2). Phiên, ảnh chốt và bài nộp đã có GIỮ giảng viên cũ để
        // không ai sửa được điểm của phiên người khác đã chấm.
        await manager.query(`UPDATE examcollect.enrollment SET home_teacher_id = $1 WHERE home_class_id = $2`, [
          nextTeacherId,
          id,
        ]);
      }

      const after = await this.readAdminRow(manager, id);

      if (semesterChanged || administrativeChanged || groupChanged) {
        const oldValue: Record<string, unknown> = {};
        const newValue: Record<string, unknown> = {};
        if (semesterChanged) {
          oldValue.semester = before.labelWithSemester.split(' · ')[1] ?? null;
          newValue.semester = after.labelWithSemester.split(' · ')[1] ?? null;
        }
        if (administrativeChanged) {
          oldValue.administrativeClass = before.administrativeClassCode;
          newValue.administrativeClass = after.administrativeClassCode;
        }
        if (groupChanged) {
          oldValue.groupName = before.groupName;
          newValue.groupName = after.groupName;
        }
        newValue.targetLabel = after.labelWithSemester;
        await this.audit.recordUserAction(
          { actorId, action: 'class.update', targetType: 'class', targetId: id, oldValue, newValue },
          manager,
        );
      }
      if (teacherChanged) {
        await this.audit.recordUserAction(
          {
            actorId,
            action: 'class.reassign_teacher',
            targetType: 'class',
            targetId: id,
            oldValue: { teacherName: before.teacherName },
            newValue: { targetLabel: after.labelWithSemester, teacherName },
          },
          manager,
        );
      }
      return after;
    });
  }

  async remove(actorId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(ClassEntity);
      const current = await repo.findOne({ where: { id } });
      if (!current) throw new NotFoundException('Không tìm thấy lớp.');

      const view = await this.readAdminRow(manager, id);
      const blockers: string[] = [];
      if (view.studentCount > 0) blockers.push(`${view.studentCount} sinh viên`);
      if (view.sessionCount > 0) blockers.push(`${view.sessionCount} phiên thi`);
      if (blockers.length > 0) {
        throw new ConflictException(
          `Lớp ${view.label} còn ${blockers.join(' và ')} nên không xoá được. ` +
            'Hãy xoá danh sách sinh viên (và chuyển hoặc bỏ các phiên thi) trước.',
        );
      }

      await repo.remove(current);
      await this.audit.recordUserAction(
        {
          actorId,
          action: 'class.delete',
          targetType: 'class',
          targetId: id,
          oldValue: {
            targetLabel: view.labelWithSemester,
            semester: view.labelWithSemester.split(' · ')[1] ?? null,
            administrativeClass: view.administrativeClassCode,
            groupName: view.groupName,
            teacherName: view.teacherName,
          },
        },
        manager,
      );
    });
  }

  // ------------------------------------------------------------------- nội bộ

  private async assertSemesterExists(manager: EntityManager, semesterId: string): Promise<void> {
    const [row] = await manager.query(`SELECT 1 AS found FROM examcollect.semester WHERE id = $1`, [semesterId]);
    if (!row) throw new BadRequestException('Không tìm thấy học kỳ đã chọn. Hãy tạo học kỳ trước.');
  }

  /**
   * Chỉ CHỌN, không tạo. Nhận id hoặc mã (đúng một trong hai); mã chưa có trong Danh mục là 400 nói rõ
   * "hãy thêm vào Danh mục lớp danh nghĩa trước" — và KHÔNG tạo mã (spec §2.2).
   */
  private async resolveAdministrativeClass(
    manager: EntityManager,
    dto: { administrativeClassId?: string; administrativeClassCode?: string },
  ): Promise<string> {
    const hasId = dto.administrativeClassId !== undefined;
    const hasCode = dto.administrativeClassCode !== undefined;
    if (hasId === hasCode) {
      throw new BadRequestException(
        'Hãy chọn lớp danh nghĩa bằng đúng một trong hai: administrativeClassId hoặc administrativeClassCode.',
      );
    }
    if (hasId) {
      const [row] = await manager.query(
        `SELECT id FROM examcollect.administrative_class WHERE id = $1`,
        [dto.administrativeClassId],
      );
      if (!row) {
        throw new BadRequestException('Không tìm thấy lớp danh nghĩa đã chọn trong Danh mục lớp danh nghĩa.');
      }
      return row.id as string;
    }
    const code = normalizeAdministrativeCode(dto.administrativeClassCode!);
    const problem = administrativeCodeProblem(code);
    if (problem) throw new BadRequestException(problem);
    const [row] = await manager.query(
      `SELECT id FROM examcollect.administrative_class WHERE code = $1`,
      [code],
    );
    if (!row) {
      throw new BadRequestException(
        `Mã ${code} chưa có trong Danh mục lớp danh nghĩa, hãy thêm nó vào Danh mục trước.`,
      );
    }
    return row.id as string;
  }

  private async assertActiveTeacher(manager: EntityManager, teacherId: string): Promise<{ name: string }> {
    const [row] = await manager.query(
      `SELECT name, role, is_active FROM examcollect.account WHERE id = $1`,
      [teacherId],
    );
    if (!row || row.role !== 'teacher') {
      throw new BadRequestException('Người được giao lớp phải là tài khoản giảng viên.');
    }
    if (!row.is_active) {
      throw new BadRequestException('Tài khoản giảng viên này đã bị vô hiệu hoá nên không giao lớp được.');
    }
    return { name: row.name as string };
  }

  private async assertGroupFree(
    manager: EntityManager,
    semesterId: string | null,
    administrativeClassId: string | null,
    groupName: string,
    excludeId: string | null,
  ): Promise<void> {
    if (!semesterId || !administrativeClassId) return; // lớp cũ chưa đủ khoá: DB không có gì để so
    const [row] = await manager.query(
      `SELECT cl.label_with_semester AS label
         FROM examcollect.class c
         JOIN examcollect.class_label cl ON cl.class_id = c.id
        WHERE c.semester_id = $1 AND c.administrative_class_id = $2 AND c.group_name = $3
          AND ($4::uuid IS NULL OR c.id <> $4)`,
      [semesterId, administrativeClassId, groupName, excludeId],
    );
    if (row) throw new ConflictException(`Đã có lớp ${row.label}.`);
  }

  private async readAdminRow(manager: EntityManager, id: string): Promise<ClassAdminView> {
    const rows = await this.queryAdminRows(`WHERE c.id = $1`, [id], manager);
    if (rows.length === 0) throw new NotFoundException('Không tìm thấy lớp.');
    return rows[0];
  }

  private async queryAdminRows(
    where: string,
    params: unknown[],
    db: { query(sql: string, params?: unknown[]): Promise<any> } = this.dataSource, // eslint-disable-line @typescript-eslint/no-explicit-any
  ): Promise<ClassAdminView[]> {
    const rows: Array<Omit<AdminRow, 'studentCount' | 'sessionCount'> & { studentCount: string; sessionCount: string }> =
      await db.query(
        `SELECT c.id,
                cl.label,
                cl.label_with_semester AS "labelWithSemester",
                sem.id AS "semesterId",
                sem.academic_year_start AS "academicYear",
                sem.term,
                ac.id AS "administrativeClassId",
                ac.code::text AS "administrativeClassCode",
                c.group_name AS "groupName",
                c.teacher_id AS "teacherId",
                t.name AS "teacherName",
                (SELECT count(*) FROM examcollect.enrollment e WHERE e.home_class_id = c.id) AS "studentCount",
                (SELECT count(*) FROM examcollect.exam_session s WHERE s.class_id = c.id) AS "sessionCount"
           FROM examcollect.class c
           JOIN examcollect.class_label cl ON cl.class_id = c.id
           JOIN examcollect.account t ON t.id = c.teacher_id
           LEFT JOIN examcollect.semester sem ON sem.id = c.semester_id
           LEFT JOIN examcollect.administrative_class ac ON ac.id = c.administrative_class_id
          ${where}
          ORDER BY sem.academic_year_start DESC NULLS LAST, sem.term DESC NULLS LAST, cl.label`,
        params,
      );
    return rows.map((row) => ({
      ...row,
      studentCount: parseInt(row.studentCount, 10),
      sessionCount: parseInt(row.sessionCount, 10),
    }));
  }
}
```

Hai chỗ cần để ý khi chép:
- Trong chuỗi SQL của `listForAdmin`, `ESCAPE '\\'` nằm trong template literal TypeScript: `\\` thành một dấu gạch ngược ở SQL (`ESCAPE '\'`) — viết một dấu `\` là lỗi (JS ăn nó).
- `.split(' · ')[1]` lấy phần học kỳ ra khỏi `labelWithSemester` (`"DHKTPM18A – Nhóm 1 · HK1 2026-2027"`). Với lớp cũ chưa có học kỳ, view trả `label_with_semester` không có ` · ` nên kết quả là `null` — đúng.

- [ ] **Step 2: Chưa chạy được** — controller và module ở Task 3.

---

### Task 3: Controller, nối module, và chạy xanh

**Files:**
- Modify (viết lại): `apps/api/src/course/class.controller.ts`
- Modify: `apps/api/src/course/course.module.ts`
- Modify: `apps/api/src/accounts/accounts.controller.ts`
- Delete: `apps/api/test/classes-teacher-crud.e2e-spec.ts`, `apps/api/src/course/dto/course.dto.ts`
- Modify: `apps/api/test/exam-session.e2e-spec.ts`

- [ ] **Step 1: Viết lại controller**

Replace `apps/api/src/course/class.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ClassService } from './class.service';
import { RosterService } from './roster.service';
import {
  CreateClassDto,
  SearchClassesDto,
  SearchTeachingClassesDto,
  UpdateClassDto,
} from './dto/class.dto';
import { ImportRosterDto, RosterStudentDto } from './dto/roster.dto';

/**
 * Lớp. Từ đợt khôi phục master data (spec §4):
 *   - ADMIN tạo, sửa, xoá, giao giảng viên và xem toàn bộ — `@Roles('admin')` ở MỨC CLASS, để route nào bỏ sót
 *     `@Roles` là 403 chứ không phải route mở (`RolesGuard` trả `true` khi thiếu metadata).
 *   - GIẢNG VIÊN chỉ ĐỌC lớp được giao (`GET /classes/teaching`) và QUẢN LÝ DANH SÁCH SINH VIÊN của chính lớp
 *     đó (route roster, kèm kiểm `class.teacher_id`). Đảo lại thay đổi 21/09 cho giảng viên tự tạo lớp.
 */
@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ClassController {
  constructor(
    private readonly classes: ClassService,
    private readonly roster: RosterService,
  ) {}

  /**
   * Lớp của giảng viên đang đăng nhập, kèm sĩ số — nguồn của "Lớp của tôi" và form tạo phiên. Một lớp của
   * người khác xuất hiện ở đây là một cú nhấp từ một kỳ thi.
   *
   * Khai báo TRƯỚC mọi route `:id` để đoạn chữ `teaching` không bị đọc thành một uuid.
   */
  @Get('teaching')
  @Roles('teacher')
  findTeaching(@Query() query: SearchTeachingClassesDto, @Req() req: Request) {
    return this.classes.findForTeacher(req.user!.sub, query);
  }

  @Get()
  list(@Query() query: SearchClassesDto) {
    return this.classes.listForAdmin(query);
  }

  @Post()
  create(@Body() dto: CreateClassDto, @Req() req: Request) {
    return this.classes.create(req.user!.sub, dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClassDto, @Req() req: Request) {
    return this.classes.update(req.user!.sub, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    await this.classes.remove(req.user!.sub, id);
  }

  /**
   * Danh sách sinh viên của lớp — ai được dự thi của lớp này. Của GIẢNG VIÊN: họ là người được phòng đào tạo
   * gửi file và là người phát hiện nó sai vào ngày thi. Chỉ giảng viên của lớp đọc được.
   */
  @Get(':id/roster')
  @Roles('teacher')
  async findRoster(@Param('id', ParseUUIDPipe) id: string, @Req() req: Request) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.listForClass(klass.id);
  }

  /**
   * Applies a parsed Excel roster. The .xlsx itself never reaches this server (Security rule 5), so this takes
   * ordinary JSON that ValidationPipe checks like any other DTO — and one bad row makes the whole request a 400,
   * which is exactly what "nothing is imported" means.
   *
   * 200, not 201: re-importing the same file creates nothing at all.
   */
  @Post(':id/roster')
  @Roles('teacher')
  @HttpCode(200)
  async importRoster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ImportRosterDto,
    @Req() req: Request,
  ) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.importForClass(klass, dto);
  }

  /** One student, typed in. For the late transfer and the correction — the cases where sending the whole file again would be theatre. */
  @Post(':id/roster/students')
  @Roles('teacher')
  async addStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RosterStudentDto,
    @Req() req: Request,
  ) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.addStudent(klass, dto);
  }

  /** The undo for the line above. A lecturer who typed the wrong MSSV needs something better than re-importing the whole file with the removal box ticked. */
  @Delete(':id/roster/students/:studentMssv')
  @Roles('teacher')
  @HttpCode(204)
  async removeStudent(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('studentMssv') studentMssv: string,
    @Req() req: Request,
  ) {
    const klass = await this.classes.findTaughtBy(id, req.user!.sub);
    return this.roster.removeStudent(klass, studentMssv);
  }
}
```

- [ ] **Step 2: Nối module, dọn chú thích và test cũ**

`apps/api/src/course/course.module.ts`: `AdminModule` đã được import từ plan C (cần cho `AuditLogService`); không còn thay đổi nào, trừ chú thích đầu file — sửa đoạn nhắc "hệ thống thôi quản lý dữ liệu nền của trường" thành một câu đúng với hiện trạng: module này sở hữu **học kỳ, phòng, lớp danh nghĩa, sinh viên, lớp và danh sách sinh viên** (dữ liệu nền do admin khai, giảng viên chỉ chọn).

`apps/api/src/accounts/accounts.controller.ts`: sửa chú thích trên `@Get('teachers')` (điểm mở §13 mục 7: nó còn nói "a Trưởng khoa must name a lecturer when creating a class"). Câu đúng: "Overrides nothing — the whole controller is admin-only. It returns id and name and nothing else, and feeds the lecturer picker of the admin Lớp page." Bỏ dòng `@Roles('admin')` thừa trên chính handler (đã có ở mức class) **không** làm; chỉ sửa chữ.

Xoá `apps/api/test/classes-teacher-crud.e2e-spec.ts` (nó kiểm đúng điều spec đã đảo ngược: giảng viên CRUD lớp của mình; `class-admin.e2e-spec.ts` thay nó, T-OWN-1 là phiên bản đảo ngược).

Trong `apps/api/test/exam-session.e2e-spec.ts`, ca `'lists only the classes this lecturer teaches, with their roster size'` (~dòng 353) đọc `/classes/teaching` theo hình dạng cũ (`name`): đổi `name` thành `label` trong các khẳng định, và nếu nó so tên với chuỗi seed thì so với `klass.label` do `seedClass` trả về.

- [ ] **Step 3: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/class-admin.e2e-spec.ts`
Expected: PASS (~28 test).

Rồi các suite có thể bị chạm:

```
npx jest --config ./test/jest-e2e.json test/roster-import.e2e-spec.ts test/exam-session.e2e-spec.ts test/class-scoped-enrollment.e2e-spec.ts test/access-request.e2e-spec.ts test/administrative-class.e2e-spec.ts test/semester.e2e-spec.ts
pnpm exec tsc --noEmit
```

Expected: xanh; `tsc` sạch (`ClassService.createForTeacher` và hai DTO cũ không còn ai import).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/course apps/api/src/accounts/accounts.controller.ts apps/api/test
git commit -m "feat(master-data): lớp do admin quản lý, giảng viên chỉ đọc; đổi giảng viên kéo theo enrollment (T-OWN-1/3, T-ADM-1/4)"
```

---

### Task 4: Nhãn lớp ở ba nơi đọc còn lại (điểm danh, kết quả chấm, trạng thái bài nộp)

**Files:**
- Modify: `apps/api/src/agent-connection/attendance.service.ts`, `apps/api/src/agent-connection/agent-connection.module.ts`
- Modify: `apps/api/src/grading/grading.service.ts`
- Modify: `apps/api/src/submission/submission.service.ts`
- Test: `apps/api/test/class-label-readers.e2e-spec.ts`

**Interfaces:**
- Consumes: `ClassLabelView` (plan D1 Task 1).
- Produces: không đổi hình dạng phản hồi; `AttendanceView.className`, `homeClassName` và `GradingResultView.homeClassName`, `SubmissionStatusView.homeClassName` mang **nhãn gộp**.

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/class-label-readers.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { ensureTestSemester, purgeTestSemesters, randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment, sessionBody } from './helpers/seed';
import { concurrentLiveWindow } from './helpers/session-window';
import { openSession } from './helpers/open-session';

/**
 * Ba nơi nhúng tên lớp — điểm danh, kết quả chấm, trạng thái bài nộp — đọc nhãn từ view `class_label`, không
 * từ `class.name` (cột cũ). Bằng chứng: lớp được dựng với mã danh nghĩa + nhóm, còn `class.name` bị đặt thành một
 * chuỗi sai; nơi đọc quên chuyển sẽ trả chuỗi sai đó.
 */
describe('Nhãn lớp ở nơi đọc nhúng (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let teacherId: string;
  let sessionClassId: string;
  let sessionId: string;
  const POISON = 'TÊN LỚP CŨ SAI';
  const tag = randomTag(8);
  let sessionClassLabel: string;
  let homeClassLabel: string;
  const MAKEUP = `LB${tag}1`;
  const IN_CLASS = `LB${tag}2`;

  const get = (path: string) => request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const email = `labelreaders_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' })).body.accessToken;

    const semesterId = await ensureTestSemester(ds, 1);
    const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag(12)}`]);
    const [adm2] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [`ZZ${randomTag(12)}`]);

    const sessionClass = await seedClass(ds, { teacherId, semesterId, administrativeClassId: adm.id, groupName: 'Nhóm 1' });
    const homeClass = await seedClass(ds, { teacherId, semesterId, administrativeClassId: adm2.id });
    sessionClassId = sessionClass.id;
    const [{ code: c1 }] = await ds.query(`SELECT code::text AS code FROM examcollect.administrative_class WHERE id = $1`, [adm.id]);
    const [{ code: c2 }] = await ds.query(`SELECT code::text AS code FROM examcollect.administrative_class WHERE id = $1`, [adm2.id]);
    sessionClassLabel = `${c1} – Nhóm 1`;
    homeClassLabel = c2;
    // Đầu độc cột cũ của cả hai lớp.
    await ds.query(`UPDATE examcollect.class SET name = $1 WHERE id = ANY($2)`, [POISON, [sessionClass.id, homeClass.id]]);

    await seedEnrollment(ds, { classId: sessionClass.id, teacherId, mssv: IN_CLASS });
    await seedEnrollment(ds, { classId: homeClass.id, teacherId, mssv: MAKEUP });

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send(await sessionBody(ds, { classId: sessionClass.id, name: `Nhãn ${tag}`, ...concurrentLiveWindow() }));
    expect(created.status).toBe(201);
    sessionId = created.body.id;
    await openSession(app, token, sessionId);
    // Em thi bù (lớp gốc khác) được đưa vào ảnh chốt và có mặt trong phòng.
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/roster/students`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mssv: MAKEUP, name: 'Em Thi Bù' })
      .expect(201);
    await ds.query(
      `INSERT INTO examcollect.agent_connection_event (exam_session_id, student_mssv, event_type, joined_late) VALUES ($1, $2, 'connected', false)`,
      [sessionId, MAKEUP],
    );
  });

  afterAll(async () => {
    await purgeTestSemesters(ds);
    await app.close();
  });

  it('điểm danh: className là nhãn lớp của phiên, homeClassName là nhãn lớp gốc của em thi bù', async () => {
    const response = await get(`/exam-sessions/${sessionId}/attendance`).expect(200);
    expect(response.body.className).toBe(sessionClassLabel);
    expect(response.body.makeup).toHaveLength(1);
    expect(response.body.makeup[0].homeClassName).toBe(homeClassLabel);
    expect(response.body.className).not.toBe(POISON);
  });

  it('trạng thái bài nộp của phiên (GET /exam-sessions/:id/submissions): homeClassName là nhãn lớp gốc của em thi bù', async () => {
    const response = await get(`/exam-sessions/${sessionId}/submissions`).expect(200);
    const rows = response.body.items.filter((r: { studentMssv: string }) => r.studentMssv === MAKEUP);
    // Thêm tay em thi bù gieo sẵn một dòng `not_submitted` cho mỗi file bắt buộc (CLAUDE.md §7.1.2).
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.homeClassName).toBe(homeClassLabel);
      expect(row.homeClassName).not.toBe(POISON);
    }
  });

  it('kết quả chấm (GradingService.listForSession): homeClassName là nhãn lớp của bài', async () => {
    // Đọc thẳng service: `seedSession` dựng một giảng viên có mật khẩu giả, không đăng nhập được để gọi HTTP.
    const ctx = await seedSession(ds, `lbl${tag}`);
    const code = `ZZ${randomTag(12)}`;
    const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [code]);
    await ds.query(
      `UPDATE examcollect.class SET administrative_class_id = $1, group_name = 'Nhóm 7', name = $2 WHERE id = $3`,
      [adm.id, POISON, ctx.classId],
    );
    await seedResult(ds, ctx);

    const rows = await app.get(GradingService, { strict: false }).listForSession(ctx.sessionId);

    expect(rows).toHaveLength(1);
    expect(rows[0].homeClassName).toBe(`${code} – Nhóm 7`);
  });
});
```

Thêm vào đầu file: `import { GradingService } from '../src/grading/grading.service';` và `import { seedResult, seedSession } from './helpers/grading-seed';`.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/class-label-readers.e2e-spec.ts`
Expected: FAIL — `className` ra `TÊN LỚP CŨ SAI`.

- [ ] **Step 3: Đổi ba nơi đọc**

`apps/api/src/agent-connection/agent-connection.module.ts`: thêm `import { ClassLabelView } from '../course/entities/class-label.view';` và `ClassLabelView,` vào `forFeature([...])`.

`apps/api/src/agent-connection/attendance.service.ts`:
- Import `ClassLabelView`; thay `@InjectRepository(ClassEntity) private readonly classes: Repository<ClassEntity>` bằng `@InjectRepository(ClassLabelView) private readonly labels: Repository<ClassLabelView>` (xoá import `ClassEntity` nếu hết dùng — `tsc` báo).
- Khối dựng `classNames` đổi thành:

```ts
    const classNames = new Map(
      (
        await this.labels.find({ where: { classId: In(await this.relevantClassIds(session)) } })
      ).map((row) => [row.classId, row.label]),
    );
```

`apps/api/src/grading/grading.service.ts`, `listForSession`: thay

```ts
      .leftJoin('class', 'hc', 'hc.id = s.home_class_id')
      .addSelect([
        ...
        'hc.name AS "homeClassName"',
      ])
```

bằng

```ts
      .leftJoin(ClassLabelView, 'hl', 'hl.classId = s.home_class_id')
      .addSelect([
        's.student_mssv AS "studentMssv"',
        's.student_name_input AS "studentName"',
        's.home_class_id AS "homeClassId"',
        'hl.label AS "homeClassName"',
      ])
```

và thêm `import { ClassLabelView } from '../course/entities/class-label.view';`. (Giữ nguyên các dòng `addSelect` còn lại; chỉ dòng cuối đổi.)

`apps/api/src/submission/submission.service.ts`, `listForSession`: thay `.leftJoin(ClassEntity, 'hc', 'hc.id = sub.home_class_id').addSelect('hc.name', 'homeClassName')` bằng `.leftJoin(ClassLabelView, 'hl', 'hl.classId = sub.home_class_id').addSelect('hl.label', 'homeClassName')`; đổi import `ClassEntity` thành `ClassLabelView` nếu `ClassEntity` hết dùng trong file.

- [ ] **Step 4: Chạy**

```
npx jest --config ./test/jest-e2e.json test/class-label-readers.e2e-spec.ts test/attendance.e2e-spec.ts test/grading-results-view.e2e-spec.ts test/teacher-submissions.e2e-spec.ts test/submission-collection.e2e-spec.ts
pnpm exec tsc --noEmit
```

Expected: xanh. `attendance.e2e-spec.ts` khẳng định `homeClassName: sibling.label` (plan A): lớp `sibling` seed **không** có mã danh nghĩa nên view rơi về `class.name` = nhãn `seedClass` ghi, và hai bên bằng nhau.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src apps/api/test/class-label-readers.e2e-spec.ts
git commit -m "feat(master-data): điểm danh, kết quả chấm, bài nộp đọc nhãn lớp từ view class_label"
```

---

### Task 5: Chạy cả bộ, sinh lại client

- [ ] **Step 1: Cả bộ unit và e2e, so với baseline** — đúng quy trình Task 7 Step 3 của plan D1 (đổi tên file kết quả thành `after-d2`). Expected: suite mới của plan D2 (`class-admin`, `class-label-readers`) xuất hiện (`=>`); `classes-teacher-crud` biến mất (`<=`, đúng — nó đã bị xoá có chủ ý); **không** suite nào khác đổi số test hay đỏ.

- [ ] **Step 2: Sinh lại client OpenAPI** *(hoãn được tới plan G1 Task 1 — xem roadmap, mục "Sinh lại client")* — Task 3 của plan B. Diff thêm `GET /classes`, đổi `POST/PATCH/DELETE /classes` (DTO mới), đổi phản hồi `GET /classes/teaching`. Hunk không liên quan ⇒ tách commit riêng.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/api/schema.d.ts
git commit -m "chore(shared): sinh lại client OpenAPI cho lớp do admin quản lý"
```

---

## Tự kiểm lại plan so với spec

- §2.3 mục 1 (không đổi `semester_id` khi có phiên): DB (plan C) + Task 2 (câu báo lỗi) + test T-MD-5. Mục 2 (đổi giảng viên: `enrollment.home_teacher_id` đổi, phiên/ảnh chốt/bài nộp giữ chủ cũ): Task 2 `update`, test T-OWN-3 (đọc lại cả bốn cột). Mục 3 (phạm vi "cùng học kỳ"): plan D1.
- §2.5 nhãn lớp (11 file đọc tên lớp): `class.service` (Task 2), `roster.service` (D1), `attendance.service` + `attendance.types` (Task 4; types không đổi vì tên trường giữ nguyên), `grading.service` (Task 4), `submission.service` (Task 4). **Còn lại cho plan D3:** `exam-session.service`, `exam-session-response.dto`, `schedule-conflict.service`, `submission-overview.service` + `submission-overview.types` (cùng các file D3 đã phải sửa vì phòng/học kỳ).
- §4 route Lớp: `GET /classes` (admin; lọc `semesterId`, `academicYear`, `teacherId`, `q`), `POST|PATCH /:id|DELETE /:id` (admin), `GET /classes/teaching` (teacher, chỉ đọc, thêm lọc) — Task 3. `POST /classes/import` thuộc plan E.
- §5.2 / T-OWN-1, T-OWN-2 (giảng viên không tạo phiên cho lớp của người khác — kiểm hiện có, giữ: suite `exam-session` chạy lại ở Task 3 Step 3), T-OWN-3, T-ADM-1, T-ADM-4, T-MD-5 (service), T-MD-8 (lớp), T-AUD-1 (lớp: `class.create|update|reassign_teacher|delete`).
- Điểm mở §13 mục 7 (`GET /accounts/teachers` đủ cho combobox giảng viên của admin?): nó trả `{ id, name }` cho `role = 'teacher'` — đủ. Chú thích cũ nhắc "Trưởng khoa" được sửa ở Task 3 Step 2. Nó **không** lọc tài khoản đã bị vô hiệu hoá; admin chọn một tài khoản khoá thì nhận 400 rõ ràng (Review Focus 5). Lọc `is_active` trong danh sách là việc của giao diện (plan G) hoặc một thay đổi nhỏ riêng.
- Cố ý để lại ngoài plan: mô tả tiếng Việt cho `class.*` ở trang audit (plan G cùng mọi hành động dữ liệu nền); `seedClass` mặc định có học kỳ/lớp danh nghĩa và bỏ ghi `class.name` (cuối plan D3, khi mọi nơi đọc `class.name` đã chuyển).
- Route HTTP của các nơi đọc nhúng đã xác nhận trong code: `GET /exam-sessions/:examSessionId/submissions` (→ `{ items }`, `SubmissionStatusView.homeClassName`) và `GradingService.listForSession` (đọc thẳng service vì `seedSession` dựng giảng viên không đăng nhập được).
- Kiểu nhất quán: `ClassAdminView`/`TeachingClassView` khai ở `course.types.ts` và dùng ở `class.service.ts`; tên trường `label`, `labelWithSemester`, `academicYear`, `term`, `semesterId` khớp giữa service, e2e và (sau này) web; `SearchClassesDto.academicYear` là số (`@Type(() => Number)`).
