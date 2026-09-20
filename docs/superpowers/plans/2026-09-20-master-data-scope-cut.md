# Thu hẹp phạm vi master data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gỡ rubric khỏi quyền sở hữu của môn học, chuyển lớp về cho giảng viên, và cắt phần quản trị dữ liệu nền ra khỏi hệ thống — để việc xây lại phần chấm điểm không phải xây trên nền sắp bị xoá.

**Architecture:** Dùng khuôn **expand/contract** thay vì một lần cắt. Trước hết chuyển quyền bốn route lớp sang giảng viên (hệ thống vẫn chạy đầy đủ). Rồi **mở rộng**: thêm cột văn bản mới cạnh khoá ngoại cũ, backfill, chưa bỏ gì. Rồi viết lại mười file để đọc từ cột mới. Cuối cùng **thu hẹp**: bỏ cột cũ, bỏ ba bảng, xoá route và trang, rút vai trò.

**Tech Stack:** NestJS 11 + TypeORM + PostgreSQL 16 (schema `examcollect`), Next.js App Router + shadcn, Jest, `openapi-typescript`.

**Spec:** `docs/superpowers/specs/2026-09-20-master-data-scope-cut-design.md`

> **Plan này TINH CHỈNH thứ tự của spec §8, không mâu thuẫn với nó.** Spec nói
> migration + viết lại 10 file + xoá phải đi **cùng một lần** vì tách ra sẽ có một
> commit ở giữa nơi hệ thống không chạy. Đúng **với cách tách theo tầng**. Nhưng
> tách theo **expand/contract** thì không: mỗi trạng thái trung gian đều biên dịch
> được, chạy được, và deploy được. Task 3-4-5 dưới đây là bản tách đó. Lý do đáng
> làm: gộp thành một khối thì không ai review nổi, và điểm không-quay-lại-được bị
> đẩy vào giữa một PR khổng lồ thay vì đứng riêng một task.

## Trạng thái thực thi (cập nhật 2026-09-20)

> **Đọc mục này TRƯỚC khi chạy bất cứ task nào.** Nó ghi những gì đã xảy ra
> thật, gồm cả mấy thứ plan gốc đoán sai.

| Task | Trạng thái |
|---|---|
| 1 — chuyển quyền lớp sang giảng viên | ✅ commit `3c3dc31` |
| 2 — giao diện lớp cho giảng viên | ⏸ **hoãn có chủ ý** — xem dưới |
| 3 — EXPAND | ✅ migration đã áp local, chờ commit |
| 4 — viết lại 10 file | ⬜ **bắt đầu từ đây** |
| 5 — CONTRACT | ⬜ điểm không quay lại được |
| 6 — CLAUDE.md + client | ⬜ |
| 7 — đánh dấu thi bù | ⬜ |

**Task 2 hoãn xuống sau Task 5, không phải bỏ.** Form tạo lớp cần một
dropdown chọn môn học, mà Task 3 đổi `class.course_id` thành `course_name`
dạng văn bản — dropdown dựng bây giờ bị Task 5 xoá và thay bằng ô nhập chữ.
Dựng giao diện MỘT LẦN trên hình dạng cuối.

### Môi trường — ba cái bẫy đã mất thời gian thật

1. **`apps/api/.env` trỏ vào SUPABASE, không phải local.** `pnpm migration:run`
   trần sẽ chạy migration chưa ai review lên DB hosted. Mọi lệnh phải ép biến
   môi trường, và biến shell thắng `.env` vì `dotenv` không ghi đè:
   ```bash
   export DATABASE_URL=$(grep -E "^DATABASE_URL=" .env.test | cut -d= -f2-)
   [ "${DATABASE_URL#*localhost}" != "$DATABASE_URL" ] && echo "OK: localhost"
   ```
2. **Docker Desktop hay tự tắt.** `docker ps` báo `open //./pipe/dockerDesktopLinuxEngine`
   thì mở lại `C:\Program Files\Docker\Docker\Docker Desktop.exe`, rồi
   `docker compose up -d postgres minio redis`. Container không tự start lại.
3. **DB local đi TRƯỚC nhánh này.** Nó có `AddCodeGradingSchema1789300000000`
   từ nhánh `feature/code-autograder-plan-1`, gồm cả cột `test_run`. Đừng
   ngạc nhiên khi thấy bảng và cột không có trên nhánh hiện tại.

### Những gì plan gốc đoán sai

- **`POST /classes/import` không chuyển được bằng cách đổi guard.** Nó nhận
  email giảng viên theo từng dòng, tạo môn dưới quyền sở hữu khoa, và kiểm
  phạm vi liên khoa. Thiết kế lại sau Task 5.
- **T-CLS-1 như plan mô tả đã tồn tại** và vẫn xanh. Ca migration thật sự vá
  là `class_id` rỗng khiến exclusion constraint bị Postgres bỏ qua — test mới
  nằm ở `exam-schedule-conflict.e2e-spec.ts`, đặt ở tầng HTTP.
- **Migration trigger phải TỰ HỢP danh sách cột**, không ghi cứng. Nhánh
  autograder cùng sửa `guard_grading_result_ai_immutable`, hai file khác nhau
  nên git không báo xung đột và cái chạy sau gỡ cột của cái chạy trước. Xem
  `1789310000000-AddAdvocateOutcome.ts` để lấy khuôn.

### Dọn dẹp đã làm trên DB local

- Sao lưu: `~/examcollect-backups/before-contract-*.sql` (26MB).
- Xoá **92 phiên thi** có `class_id IS NULL` cùng chuỗi phụ thuộc. Cả 92 đều
  `completed`, mỗi phiên đúng 1 bài nộp — dữ liệu e2e. **Trên Supabase phải
  đếm và quyết lại**, migration có guard dừng kèm số lượng.

### Ghi chú cho Task 5

`exam-schedule-conflict.e2e-spec.ts` dọn dẹp trong `afterAll` bằng cách xoá
theo `room_id`. Task 5 bỏ cột đó ⇒ phần dọn dẹp vỡ, phải sửa cùng lúc.

---

## Global Constraints

- Schema Postgres là `examcollect`. SQL thô phải ghi rõ tiền tố.
- Migration **viết tay**, timestamp tăng dần, lớn hơn `1789310000000` (advocate đã dùng số đó); expand = `1789320000000`, contract = `1789330000000`.
- **Không** dùng `migration:generate` cho các bước bỏ cột/bỏ bảng — generator không biết thứ tự an toàn và sẽ bỏ bảng trước khi khoá ngoại biến mất.
- Sao lưu DB dev **trước Task 5**. Task 5 là điểm không quay lại được.
- Khuôn kiểm sở hữu đã có, dùng lại nguyên văn: `if (x.teacherId !== teacherId) throw new ForbiddenException(...)` — xem `class.service.ts:222`.
- Vai trò sau đợt này chỉ còn `'admin' | 'teacher'`. Cột `account.role` là NOT NULL, nên tài khoản mang vai trò bị xoá phải được chuyển **trong cùng migration**.
- Lệnh kiểm trước mỗi commit: `npx tsc --noEmit` · `npx jest` · `npx eslint src test --ext .ts` · `node ../../scripts/find-import-cycles.js src` (phải in **0**).
- e2e cần Postgres + MinIO + Redis chạy **và** bucket `examcollect-submissions` đã tạo. Thiếu bucket cho ra lỗi trông y hệt lỗi nghiệp vụ.
- e2e chạy `maxWorkers: 1`, **không được nâng** — ba suite lái `ExamSessionScheduler.sweep()` vốn là toàn cục.

---

### Task 1: Giảng viên tạo, sửa, xoá được lớp của mình

**Files:**
- Modify: `apps/api/src/course/class.service.ts` (thêm ba hàm cạnh `createForHead`/`updateForHead`/`removeForHead`)
- Modify: `apps/api/src/course/class.controller.ts:88-112` (bốn route)
- Test: `apps/api/test/classes-teacher-crud.e2e-spec.ts` (tạo mới)

**Interfaces:**
- Consumes: `CreateClassDto`, `UpdateClassDto` đang có trong `dto/`; `ClassEntity`.
- Produces: `ClassService.createForTeacher(teacherId, dto)`, `.updateForTeacher(id, teacherId, dto)`, `.removeForTeacher(id, teacherId)`, `.importForTeacher(teacherId, dto)` — cả bốn `Promise<...>` giống hệt bản `*ForHead` tương ứng, chỉ khác vị từ quyền.

- [ ] **Step 1: Viết test thất bại — giảng viên tạo được lớp**

Tạo `apps/api/test/classes-teacher-crud.e2e-spec.ts`. Dùng đúng khuôn dựng app và đăng nhập mà `apps/api/test/classes-import.e2e-spec.ts` đang dùng.

```ts
it('T-OWN-1: giảng viên tạo được lớp của mình', async () => {
  const res = await request(app.getHttpServer())
    .post('/classes')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: 'CTDL-01', courseId })
    .expect(201);

  expect(res.body.teacherId).toBe(teacherId);
});
```

- [ ] **Step 2: Chạy, phải ĐỎ**

```bash
cd apps/api && npx jest --config test/jest-e2e.json -t "T-OWN-1"
```

Expected: FAIL với 403 — route đang gắn `@Roles('department_admin')`.

- [ ] **Step 3: Thêm ba hàm vào `class.service.ts`**

Đặt ngay dưới `removeForHead`. Mỗi hàm là bản sao của `*ForHead` với **đúng một khác biệt**: vị từ quyền.

```ts
  /**
   * Bản cho giảng viên của `createForHead`.
   *
   * Khác biệt duy nhất: chủ sở hữu là chính người gọi, không phải trưởng
   * khoa gán cho người khác. Trưởng khoa trước đây thấy mọi lớp trong khoa
   * nên không cần kiểm; giảng viên thì cần, và bỏ sót chỗ này là một giảng
   * viên sửa được lớp của người khác.
   */
  async createForTeacher(teacherId: string, dto: CreateClassDto): Promise<ClassEntity> {
    return this.classes.save(
      this.classes.create({ ...dto, teacherId }),
    );
  }

  async updateForTeacher(
    id: string,
    teacherId: string,
    dto: UpdateClassDto,
  ): Promise<ClassEntity> {
    const klass = await this.findOwnedByTeacher(id, teacherId);
    Object.assign(klass, dto);
    return this.classes.save(klass);
  }

  async removeForTeacher(id: string, teacherId: string): Promise<void> {
    const klass = await this.findOwnedByTeacher(id, teacherId);
    await this.classes.remove(klass);
  }

  /**
   * Dùng chung vị từ quyền cho cả ba hàm trên — một chỗ để sửa, một chỗ để
   * test. Khuôn `throw` lấy nguyên văn từ `findForTeacher` (dòng 222) để
   * thông báo lỗi nhất quán trên toàn module.
   */
  private async findOwnedByTeacher(id: string, teacherId: string): Promise<ClassEntity> {
    const klass = await this.classes.findOne({ where: { id } });
    if (!klass) {
      throw new NotFoundException('Class not found');
    }
    if (klass.teacherId !== teacherId) {
      throw new ForbiddenException('You do not teach this class');
    }
    return klass;
  }
```

**`updateForTeacher` không được cho đổi `teacherId`.** `updateForHead` có nhánh xử lý việc đó (dòng ~263); bản cho giảng viên thì không — cho phép nghĩa là một giảng viên chuyển lớp của mình sang người khác rồi mất quyền, hoặc tệ hơn, nhận lớp của người khác về. Nếu `UpdateClassDto` có trường `teacherId` thì xoá nó khỏi `dto` trước `Object.assign`.

- [ ] **Step 4: Đổi vai trò bốn route**

Trong `apps/api/src/course/class.controller.ts`, đổi **chỉ bốn route này**:

| Dòng | Route | Trước | Sau |
|---|---|---|---|
| 95 | `@Post()` | `@Roles('department_admin')` | `@Roles('teacher')` |
| 101 | `@Patch(':id')` | `@Roles('department_admin')` | `@Roles('teacher')` |
| 111 | `@Delete(':id')` | `@Roles('department_admin')` | `@Roles('teacher')` |

Và đổi thân hàm gọi sang bản `*ForTeacher`, truyền `req.user!.sub` thay cho `headId`.

**Không đụng** `@Get('mine')`, `@Get('teachers')` ở dòng 41 và 56 — chúng bị xoá ở Task 5, không phải bây giờ.

> **`@Post('import')` KHÔNG chuyển ở task này — phát hiện lúc thực thi.**
> Bản đầu của plan xếp nó chung với ba route CRUD, coi như một lần đổi guard.
> Sai. `importForHead` nhận **email giảng viên theo từng dòng**, **tạo môn học**
> dưới quyền sở hữu của khoa (`course.departmentHeadId`), và **kiểm phạm vi liên
> khoa** trước khi dùng lại một môn đã có. Ba thứ đó không có nghĩa gì với một
> giảng viên tự nhập lớp của chính mình, và đổi guard ở đây là cho một giảng
> viên tạo môn rồi gán lớp cho người khác.
>
> Nó được thiết kế lại **sau Task 3**, khi `course` thành văn bản: lúc đó mỗi
> dòng chỉ còn tên lớp cộng danh sách sinh viên, chủ sở hữu là người bấm, và cả
> ba vấn đề trên tự biến mất. Task 2 vì thế **chưa dời** hộp thoại nhập tệp.

- [ ] **Step 5: Chạy test, phải XANH**

```bash
cd apps/api && npx jest --config test/jest-e2e.json -t "T-OWN-1"
```

Expected: PASS.

- [ ] **Step 6: Viết test cấm chéo (T-OWN-2)**

```ts
it('T-OWN-2: giảng viên không sửa được lớp của giảng viên khác', async () => {
  const other = await seedClassOwnedBy(otherTeacherId);

  await request(app.getHttpServer())
    .patch(`/classes/${other.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: 'cướp lớp' })
    .expect(403);

  await request(app.getHttpServer())
    .delete(`/classes/${other.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(403);
});
```

Ca này quan trọng hơn T-OWN-1: T-OWN-1 hỏng thì ai cũng thấy ngay, còn T-OWN-2 hỏng thì **không ai thấy cho tới khi có người mất dữ liệu**.

- [ ] **Step 7: Chạy toàn bộ**

```bash
cd apps/api && npx tsc --noEmit && npx jest && npx eslint src test --ext .ts
npx jest --config test/jest-e2e.json
```

Expected: tất cả PASS. Một số e2e cũ đang đăng nhập bằng `department_admin` để tạo lớp sẽ đỏ — sửa chúng sang `teacher`, đó là thay đổi đúng.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/course/class.service.ts \
        apps/api/src/course/class.controller.ts \
        apps/api/test/
git commit -m "feat(class): giảng viên tạo sửa xoá được lớp của mình"
```

---

### Task 2: Giao diện lớp cho giảng viên

**Files:**
- Modify: `apps/web/src/app/teacher/classes/page.tsx`
- Move: `apps/web/src/app/department/classes/_components/import-classes-dialog.tsx` → `apps/web/src/app/teacher/classes/_components/import-classes-dialog.tsx`
- Create: `apps/web/src/app/teacher/classes/_components/class-form-dialog.tsx`
- Test: `apps/web/src/app/teacher/classes/page.test.tsx`

**Interfaces:**
- Consumes: bốn route đã đổi vai trò ở Task 1.
- Produces: trang `teacher/classes` có nút Tạo lớp, Sửa, Xoá, Nhập từ tệp.

- [ ] **Step 1: Dời hộp thoại nhập tệp, KHÔNG viết lại**

```bash
git mv apps/web/src/app/department/classes/_components/import-classes-dialog.tsx \
       apps/web/src/app/teacher/classes/_components/import-classes-dialog.tsx
```

Sửa đường dẫn import bên trong cho khớp vị trí mới. **Đây là chức năng đang chạy** — viết lại từ đầu là tự chuốc lỗi mới vào một thứ đã đúng.

- [ ] **Step 2: Viết test thất bại**

```tsx
it('hiện nút tạo lớp cho giảng viên', () => {
  render(<TeacherClassesPage />);
  expect(screen.getByRole('button', { name: /tạo lớp/i })).toBeInTheDocument();
});
```

- [ ] **Step 3: Chạy, phải ĐỎ**

```bash
cd apps/web && npx vitest run src/app/teacher/classes
```

Expected: FAIL — trang hiện chỉ đọc.

- [ ] **Step 4: Thêm form và nút**

Lấy giao diện từ `apps/web/src/app/department/classes/page.tsx` làm gốc, đổi nguồn dữ liệu sang `GET /classes/teaching` và bỏ ô chọn giảng viên (chủ sở hữu luôn là người đang đăng nhập).

- [ ] **Step 5: Chạy test và build**

```bash
cd apps/web && npx vitest run && npx next build
```

Expected: test PASS, build sạch.

- [ ] **Step 6: Kiểm bằng tay**

Đăng nhập bằng một tài khoản `teacher`, tạo một lớp, nhập danh sách sinh viên từ tệp, sửa tên lớp, xoá lớp. **Không dùng tài khoản `department_admin` cho bước này** — mục đích là chứng minh giảng viên tự làm được.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/teacher/classes/ apps/web/src/app/department/classes/
git commit -m "feat(web): giảng viên tạo và nhập lớp ngay trên trang của mình"
```

> **Dừng lại ở đây được.** Task 1 và 2 an toàn tuyệt đối, hệ thống vẫn chạy đầy
> đủ, và chúng merge riêng được. Nếu cần tạm dừng đợt này thì đây là chỗ dừng.

---

### Task 3: EXPAND — thêm cột mới, chưa bỏ gì

**Files:**
- Create: `apps/api/src/database/migrations/1789320000000-ExpandMasterDataToText.ts`
- Modify: `apps/api/src/course/entities/class.entity.ts`
- Modify: `apps/api/src/exam-session/entities/exam-session.entity.ts`
- Modify: `apps/api/src/grading/entities/rubric.entity.ts`
- Modify: `apps/api/src/course/entities/enrollment.entity.ts`
- Test: `apps/api/test/master-data-expand.e2e-spec.ts` (tạo mới)

**Interfaces:**
- Consumes: không có.
- Produces: `class.courseName`, `examSession.courseName`, `examSession.roomName`, `rubric.teacherId`, `rubric.name` — tất cả đã backfill, **cột cũ vẫn còn**.

- [ ] **Step 1: Đếm dòng sẽ chặn migration**

```bash
docker exec -i cine-postgres-1 psql -U examcollect_admin -d examcollect -c \
  "SELECT count(*) FROM examcollect.exam_session WHERE class_id IS NULL"
```

Ghi lại con số. **Nếu > 0 thì dừng và hỏi chủ đồ án** gán lớp nào hay xoá. Spec nói rõ: không đoán.

- [ ] **Step 2: Viết migration mở rộng**

Tạo `1789320000000-ExpandMasterDataToText.ts`:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nửa MỞ RỘNG của expand/contract. Sau migration này, mọi cột mới đã có và
 * đã backfill, còn khoá ngoại cũ vẫn nguyên — hệ thống chạy được ở cả hai
 * đường đọc. Nửa THU HẸP nằm ở migration sau, chạy sau khi mười file đã
 * chuyển sang đọc cột mới.
 */
export class ExpandMasterDataToText1789320000000 implements MigrationInterface {
  name = 'ExpandMasterDataToText1789320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- class.course_name ---
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class" ADD COLUMN "course_name" varchar(200)
    `);
    await queryRunner.query(`
      UPDATE "examcollect"."class" c
         SET "course_name" = co."name"
        FROM "examcollect"."course" co
       WHERE co."id" = c."course_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."class" ALTER COLUMN "course_name" SET NOT NULL
    `);

    // --- exam_session.course_name + room_name ---
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ADD COLUMN "course_name" varchar(200),
        ADD COLUMN "room_name"   varchar(150)
    `);
    await queryRunner.query(`
      UPDATE "examcollect"."exam_session" es
         SET "course_name" = co."name",
             "room_name"   = r."name"
        FROM "examcollect"."course" co, "examcollect"."room" r
       WHERE co."id" = es."course_id" AND r."id" = es."room_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        ALTER COLUMN "course_name" SET NOT NULL,
        ALTER COLUMN "room_name"   SET NOT NULL
    `);

    // --- exam_session.class_id thành BẮT BUỘC ---
    //
    // Đây không chỉ là dọn dẹp. `ex_exam_session_class_overlap` là exclusion
    // constraint trên `class_id`, và Postgres BỎ QUA dòng có khoá NULL — nên
    // mọi phiên không gắn lớp đang thoát hoàn toàn khỏi phép chống trùng lịch
    // lớp. NOT NULL làm ràng buộc đó có hiệu lực lần đầu tiên.
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT count(*) INTO n FROM examcollect.exam_session WHERE class_id IS NULL;
        IF n > 0 THEN
          RAISE EXCEPTION
            'Còn % phiên thi chưa gắn lớp. Gán tay hoặc xoá trước khi chạy migration này — KHÔNG đoán.', n;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "class_id" SET NOT NULL
    `);

    // --- rubric về tay giảng viên ---
    //
    // Rubric nào không suy ra được chủ thì DỪNG, không gán bừa cho admin:
    // một rubric sai chủ là một giảng viên sửa được điểm của người khác.
    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        ADD COLUMN "teacher_id" uuid,
        ADD COLUMN "name"       varchar(200)
    `);
    await queryRunner.query(`
      UPDATE "examcollect"."rubric" ru
         SET "teacher_id" = sub.teacher_id,
             "name"       = sub.course_name
        FROM (
          SELECT DISTINCT ON (c."course_id")
                 c."course_id", c."teacher_id", co."name" AS course_name
            FROM "examcollect"."class" c
            JOIN "examcollect"."course" co ON co."id" = c."course_id"
           ORDER BY c."course_id", c."created_at"
        ) sub
       WHERE sub."course_id" = ru."course_id"
    `);
    await queryRunner.query(`
      DO $$
      DECLARE n int;
      BEGIN
        SELECT count(*) INTO n FROM examcollect.rubric WHERE teacher_id IS NULL;
        IF n > 0 THEN
          RAISE EXCEPTION
            'Còn % rubric không suy ra được chủ (môn không có lớp nào). Gán tay trước — KHÔNG gán bừa cho admin.', n;
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        ALTER COLUMN "teacher_id" SET NOT NULL,
        ALTER COLUMN "name"       SET NOT NULL,
        ADD CONSTRAINT "fk_rubric_teacher"
            FOREIGN KEY ("teacher_id") REFERENCES "examcollect"."account"("id")
            ON DELETE RESTRICT
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_rubric_teacher_name_version"
          ON "examcollect"."rubric" ("teacher_id", "name", "version")
    `);

    // --- enrollment: khoá duy nhất mới, chưa bỏ cái cũ ---
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_enrollment_class_student"
          ON "examcollect"."enrollment" ("home_class_id", "student_mssv")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_enrollment_class_student"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_rubric_teacher_name_version"`);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."rubric"
        DROP CONSTRAINT IF EXISTS "fk_rubric_teacher",
        DROP COLUMN "teacher_id",
        DROP COLUMN "name"
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session" ALTER COLUMN "class_id" DROP NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "examcollect"."exam_session"
        DROP COLUMN "course_name", DROP COLUMN "room_name"
    `);
    await queryRunner.query(`ALTER TABLE "examcollect"."class" DROP COLUMN "course_name"`);
  }
}
```

**`DISTINCT ON (c."course_id") ... ORDER BY c."course_id", c."created_at"`** chọn lớp **được tạo sớm nhất** của môn đó làm nguồn chủ sở hữu. Đây là một lựa chọn tuỳ tiện nhưng **xác định** — nếu một môn có nhiều giảng viên, ai đó phải thắng, và "người tạo lớp đầu tiên" ít bất ngờ hơn "ngẫu nhiên". Ghi con số bị ảnh hưởng vào mô tả PR.

- [ ] **Step 3: Chạy migration**

```bash
cd apps/api && pnpm migration:run
```

Expected: chạy sạch. Nếu nổ với thông báo "Còn N phiên thi chưa gắn lớp" hoặc "Còn N rubric không suy ra được chủ" thì **migration đang làm đúng việc của nó** — xử lý dữ liệu rồi chạy lại.

- [ ] **Step 4: Thêm cột mới vào entity**

Thêm cột mới **cạnh** cột cũ, chưa xoá gì:

- `class.entity.ts`: `@Column({ name: 'course_name', type: 'varchar', length: 200 }) courseName!: string;`
- `exam-session.entity.ts`: `courseName` (200) và `roomName` (150), cùng khuôn.
- `rubric.entity.ts`: `teacherId!: string` với `@ManyToOne(() => AccountEntity, { onDelete: 'RESTRICT' })`, và `name!: string` (200).

`class_id` trên `exam-session.entity.ts` đổi `nullable: true` → bỏ hẳn `nullable`, và kiểu TS từ `string | null` → `string`.

- [ ] **Step 5: Viết test T-CLS-1 — ràng buộc chống trùng lịch lớp giờ mới có hiệu lực**

Thêm vào `apps/api/test/exam-schedule-conflict.e2e-spec.ts`:

```ts
it('T-CLS-1: hai phiên cùng lớp, giờ chồng nhau → bị chặn', async () => {
  const start = new Date('2026-10-01T02:00:00Z');
  const end = new Date('2026-10-01T04:00:00Z');
  await createSession({ classId: classA.id, startTime: start, endTime: end });

  await expect(
    createSession({
      classId: classA.id,
      startTime: new Date('2026-10-01T03:00:00Z'),
      endTime: new Date('2026-10-01T05:00:00Z'),
    }),
  ).rejects.toThrow(/ex_exam_session_class_overlap|conflict/i);
});
```

Ca này **chưa từng chạy được trước migration** vì `class_id` nullable và exclusion constraint của Postgres bỏ qua dòng có khoá NULL. Nó ở đây để khoá lại một lỗ vừa được bịt, không phải để kiểm một thứ đã đúng.

- [ ] **Step 6: Verify schema và chạy test**

```bash
cd apps/api && npx ts-node src/database/verify-schema.ts
npx tsc --noEmit && npx jest && npx jest --config test/jest-e2e.json
```

Expected: verify-schema báo đủ bảng, mọi test PASS. Hệ thống **vẫn đọc từ cột cũ** ở bước này — đó là đúng.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/database/migrations/1789320000000-ExpandMasterDataToText.ts \
        apps/api/src/course/entities/ apps/api/src/exam-session/entities/ \
        apps/api/src/grading/entities/rubric.entity.ts
git commit -m "feat(schema): thêm cột văn bản và chủ sở hữu rubric, chưa bỏ gì"
```

---

### Task 4: Viết lại mười file sang đọc cột mới

**Files:** đúng mười file ở spec §4.4. Sửa từng file, chạy test sau mỗi file.

| # | File | Dòng | Đổi thành |
|---|---|---|---|
| 1 | `grading/rubric.service.ts` | 54, 62-178 | Bỏ `assertTeachesCourse()`; quyền thành `rubric.teacherId === teacherId` |
| 2 | `grading/grading.controller.ts` | **55, 66** | `courses/:courseId/rubrics` → `rubrics`, lọc theo `req.user.sub` |
| 3 | `submission/submission-overview.service.ts` | 75, 211, 225-227 | Bỏ ba `JOIN`, đọc `course_name`/`semester_name`/`room_name` từ `exam_session`; nối enrollment qua `e.home_class_id = es.class_id` |
| 4 | `exam-session/session-roster.service.ts` | 70, 160 | `{ courseId: session.courseId }` → `{ homeClassId: session.classId }` |
| 5 | `exam-session/exam-session.gateway.ts` | 427, 430 | `findForCourse` → `findForClass(session.classId, …)`; sửa cả dòng log |
| 6 | `exam-session/recollect.service.ts` | 67 | `ON e.course_id = s.course_id` → `ON e.home_class_id = s.class_id` |
| 7 | `exam-session/access-request.gateway.ts` | 112, 196 | Tra theo lớp; `homeClassId` **vẫn do giám thị chọn**, không suy luận |
| 8 | `agent-connection/attendance.service.ts` | 131 | `{ courseId: session.courseId }` → `{ homeClassId: session.classId }` |
| 9 | `exam-session/exam-session.service.ts` | — | DTO nhận `courseName`/`roomName` văn bản; `classId` bắt buộc |
| 10 | `exam-session/schedule-conflict.service.ts` | 67-73, 96, 101 | `{ column: 'room_id', table: 'room' }` → `room_name`; tham số `roomId` → `roomName` |

**Interfaces:**
- Consumes: cột mới từ Task 3.
- Produces: `EnrollmentService.findForClass(classId, studentMssv)` thay `findForCourse`; `GradingController` route `GET /rubrics` và `POST /rubrics`.

- [ ] **Step 1: Sửa file 1 và 2 trước (rubric) — đây là mục đích của cả đợt**

Viết test trước:

```ts
it('T-OWN-3: giảng viên không đọc được rubric của người khác', async () => {
  const other = await seedRubricOwnedBy(otherTeacherId);
  await request(app.getHttpServer())
    .get(`/rubrics/${other.id}`)
    .set('Authorization', `Bearer ${teacherToken}`)
    .expect(403);
});

it('T-RUB-1: tạo và ghim rubric không cần bảng course', async () => {
  const res = await request(app.getHttpServer())
    .post('/rubrics')
    .set('Authorization', `Bearer ${teacherToken}`)
    .send({ name: 'Giữa kỳ CTDL', criteria: [{ description: 'Đúng thuật toán', maxPoints: 5 }] })
    .expect(201);
  expect(res.body.teacherId).toBe(teacherId);
});
```

Thêm ca thứ ba, khoá lại thứ **không được đổi**:

```ts
it('T-RUB-2: guard_rubric_criteria_immutable vẫn chặn sau khi rubric đổi khoá', async () => {
  const rubric = await seedRubricOwnedBy(teacherId);
  await seedGradingResultAgainst(rubric.id);

  await expect(
    dataSource.query(
      `UPDATE examcollect.rubric_criterion SET description = 'sửa lén' WHERE rubric_id = $1`,
      [rubric.id],
    ),
  ).rejects.toThrow(/immutable|cannot be modified/i);
});
```

Trigger này đọc `rubric_criterion` và `grading_result`, **không** đọc `course_id`, nên nó không bị ảnh hưởng bởi đợt đổi khoá. Ca test ở đây để **chứng minh điều đó**, không phải để sửa gì. **Đừng sửa trigger "cho chắc"** — đụng vào là tự tạo rủi ro ở một thứ đang đúng.

Chạy → ĐỎ ở hai ca đầu, XANH ở T-RUB-2. Sửa hai file → cả ba XANH.

> **Hai route rubric ở `grading.controller.ts:55` và `:66` là cái bẫy tệ nhất
> của cả đợt.** Chúng nằm trong controller **chấm điểm**, không nằm trong
> `course.controller.ts`, nên xoá cả file controller môn học ở Task 5 vẫn để
> chúng lại — và chúng **vẫn biên dịch được** cho tới lúc chạy thật.

- [ ] **Step 2: Sửa file 3 (trang bài nộp) — SQL thô, rủi ro cao nhất**

Viết test T-RW-1 trước: gọi endpoint tổng quan bài nộp, khẳng định trả đúng số dòng và `courseName` không rỗng. Rồi bỏ ba `JOIN` và đổi nguồn cột.

Chạy `npx jest --config test/jest-e2e.json -t "T-RW-1"` sau khi sửa. **Trang này là màn hình chính của giảng viên** — đỏ ở đây nghĩa là hỏng thứ họ dùng hằng ngày.

- [ ] **Step 3: Sửa file 4-8 (đường xác thực agent và roster)**

Năm file này đều là cùng một phép đổi: lọc theo lớp thay vì theo môn. Sửa cả năm, rồi viết bốn test:

```ts
it('T-RW-2: freeze roster đúng theo lớp của phiên', async () => {
  const session = await seedSession({ classId: classA.id });
  await seedEnrollment({ homeClassId: classA.id, studentMssv: 'SV001' });
  await seedEnrollment({ homeClassId: classB.id, studentMssv: 'SV002' });

  await rosterService.freeze(session.id);

  const frozen = await dataSource.query(
    `SELECT student_mssv FROM examcollect.session_roster WHERE exam_session_id = $1`,
    [session.id],
  );
  expect(frozen.map((r: { student_mssv: string }) => r.student_mssv)).toEqual(['SV001']);
});

it('T-RW-3: sinh viên đúng lớp vào được, lớp khác bị từ chối', async () => {
  const session = await seedSession({ classId: classA.id, status: 'active' });
  await seedEnrollment({ homeClassId: classA.id, studentMssv: 'SV001' });
  await seedEnrollment({ homeClassId: classB.id, studentMssv: 'SV002' });

  await expect(joinAs(session.code, 'SV001')).resolves.toMatchObject({ ok: true });
  await expect(joinAs(session.code, 'SV002')).resolves.toMatchObject({
    reason: 'NOT_ENROLLED',
  });
});

it('T-MU-1: sinh viên lớp khác xin phép được, giám thị chọn lớp gốc', async () => {
  const session = await seedSession({ classId: classA.id, status: 'active' });
  await seedEnrollment({ homeClassId: classB.id, studentMssv: 'SV002' });

  await joinAs(session.code, 'SV002');
  const pending = await requestAccess(session.code, 'SV002', 'thi bù do ốm');
  expect(pending.reason).toBe('thi bù do ốm');

  await resolveAccess(pending.requestId, { approve: true, homeClassId: classB.id });
  await expect(joinAs(session.code, 'SV002')).resolves.toMatchObject({ ok: true });
});

it('T-RW-4: recollect nối đúng bài nộp với sinh viên', async () => {
  const session = await seedSession({ classId: classA.id });
  await seedEnrollment({ homeClassId: classA.id, studentMssv: 'SV001' });
  await seedSubmission({ examSessionId: session.id, studentMssv: 'SV001' });

  const rows = await recollectService.listMissing(session.id);
  expect(rows).toHaveLength(0);
});
```

Tên helper (`seedSession`, `seedEnrollment`, `joinAs`, …) lấy theo đúng helper đang có trong `apps/api/test/agent-join.e2e-spec.ts` và `access-request.e2e-spec.ts` — **đọc hai file đó trước khi gõ**, đừng dựng harness mới cho thứ đã có.

> **T-RW-3 khoá một thay đổi hành vi thấy được.** Trước đợt này, xác thực chạy ở
> **mức môn học**, cố ý, để sinh viên thi bù từ lớp khác cùng môn vào thẳng được.
> Sau đợt này họ bị từ chối và đi qua luồng xin phép kèm lý do. **Đó là hành vi
> đã chọn, không phải hỏng** — test phải khẳng định đúng hành vi mới.

- [ ] **Step 4: Sửa file 9 và 10 (tạo phiên và chống trùng lịch)**

File 10 có một đánh đổi phải khoá lại bằng test, không được xoá test cũ cho xanh:

```ts
it('T-ROOM-1: trùng phòng gõ GIỐNG HỆT thì chặn, gõ khác cách thì KHÔNG', async () => {
  await createSession({ roomName: 'P.A101', start, end });

  await expect(createSession({ roomName: 'P.A101', start, end })).rejects.toThrow();
  await expect(createSession({ roomName: 'P A101', start, end })).resolves.toBeDefined();
});
```

Vế thứ hai là vế dễ bị bỏ. Không có nó thì sự suy giảm ở spec §3.4 sẽ bị quên mất sau vài tháng.

- [ ] **Step 5: Kiểm toàn bộ**

```bash
cd apps/api && npx tsc --noEmit && npx jest && npx eslint src test --ext .ts
node ../../scripts/find-import-cycles.js src
docker compose up -d postgres minio redis
npx jest --config test/jest-e2e.json
```

Expected: tất cả PASS, cycles in **0**.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "refactor(api): mười đường đọc chuyển sang cột văn bản và khoá theo lớp"
```

---

### Task 5: CONTRACT — bỏ cột cũ, bỏ ba bảng, xoá route và trang

> ⚠️ **Đây là điểm không quay lại được.** Sao lưu DB dev trước:
> `docker exec cine-postgres-1 pg_dump -U examcollect_admin examcollect > ~/examcollect-before-contract.sql`

**Files:**
- Create: `apps/api/src/database/migrations/1789330000000-ContractMasterData.ts`
- Delete: `apps/api/src/course/course.controller.ts`, `course.service.ts`, `semester.controller.ts`, `semester.service.ts`, `apps/api/src/room/` (cả module)
- Delete: `apps/web/src/app/department/` (cả thư mục), `apps/web/src/app/admin/rooms/`, `admin/semesters/`, `admin/unowned-courses/`
- Modify: `apps/api/src/identity/entities/account.entity.ts` (rút `AccountRole`), `apps/web/src/middleware.ts`

- [ ] **Step 1: Viết migration thu hẹp**

Thứ tự **bắt buộc**: bỏ khoá ngoại → bỏ cột → chuyển vai trò → bỏ bảng.

```ts
public async up(queryRunner: QueryRunner): Promise<void> {
  await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_enrollment_course_student"`);
  await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_rubric_course_version"`);
  await queryRunner.query(`DROP INDEX IF EXISTS "examcollect"."uq_class_course_name"`);

  await queryRunner.query(`ALTER TABLE "examcollect"."enrollment"   DROP COLUMN "course_id"`);
  await queryRunner.query(`ALTER TABLE "examcollect"."rubric"       DROP COLUMN "course_id"`);
  await queryRunner.query(`ALTER TABLE "examcollect"."class"        DROP COLUMN "course_id"`);
  await queryRunner.query(`ALTER TABLE "examcollect"."exam_session" DROP COLUMN "course_id", DROP COLUMN "room_id"`);

  await queryRunner.query(`
    CREATE UNIQUE INDEX "uq_class_teacher_course_name"
        ON "examcollect"."class" ("teacher_id", "course_name", "name")
  `);

  // Vai trò: account.role là NOT NULL nên phải chuyển TRƯỚC khi thu enum.
  await queryRunner.query(`
    UPDATE "examcollect"."account"
       SET "role" = 'teacher'
     WHERE "role" IN ('department_admin', 'super_admin')
  `);

  await queryRunner.query(`DROP TABLE "examcollect"."room"`);
  await queryRunner.query(`DROP TABLE "examcollect"."course"`);
  await queryRunner.query(`DROP TABLE "examcollect"."semester"`);
}
```

`down()` cho migration này **không khôi phục được dữ liệu** — ghi rõ điều đó trong docblock thay vì giả vờ ngược lại được. Cho `down()` ném lỗi có thông báo rõ ràng, trỏ tới bản sao lưu.

**`super_admin` chuyển sang `teacher` hay `admin`?** Spec không nói. Mặc định `teacher` như trên là lựa chọn an toàn hơn (ít quyền hơn); nếu có tài khoản `super_admin` thật đang dùng thì **hỏi trước**, đừng hạ quyền của người đang vận hành hệ thống.

- [ ] **Step 2: Chạy migration và verify**

```bash
cd apps/api && pnpm migration:run && npx ts-node src/database/verify-schema.ts
```

- [ ] **Step 3: Xoá code API**

```bash
git rm apps/api/src/course/course.controller.ts apps/api/src/course/course.service.ts \
       apps/api/src/course/semester.controller.ts apps/api/src/course/semester.service.ts
git rm -r apps/api/src/room
git rm apps/api/src/course/entities/course.entity.ts \
       apps/api/src/course/entities/semester.entity.ts
```

Rồi gỡ chúng khỏi `course.module.ts`, `app.module.ts`, `data-source.ts`. Xoá `@Get('mine')` và `@Get('teachers')` khỏi `class.controller.ts`, và bỏ `'department_admin'` khỏi `@Roles` của `@Get(':id/roster')`.

- [ ] **Step 4: Rút vai trò**

`account.entity.ts`: `AccountRole` từ bốn giá trị còn `'admin' | 'teacher'`. `tsc` sẽ chỉ ra mọi chỗ còn tham chiếu hai vai trò đã xoá.

- [ ] **Step 5: Xoá trang web**

```bash
git rm -r apps/web/src/app/department
git rm -r apps/web/src/app/admin/rooms apps/web/src/app/admin/semesters \
          apps/web/src/app/admin/unowned-courses
```

Sửa `middleware.ts` và trang chuyển hướng sau đăng nhập còn hai vai trò. **Giữ nguyên** `admin/accounts`, `admin/ai-config`, `admin/audit-log`, `admin/cost` — chúng là vận hành, không phải dữ liệu nền.

- [ ] **Step 6: Đổi form tạo phiên thi sang ô nhập văn bản**

`apps/web/src/app/teacher/exam-sessions/new/page.tsx` đang chọn môn học, phòng và học kỳ từ danh sách thả xuống — ba nguồn dữ liệu đó **vừa biến mất ở Step 3**, nên trang này sẽ vỡ nếu bỏ qua bước này.

- Môn học, phòng, học kỳ → ô nhập văn bản (`<Input>`), gửi lên `courseName`, `roomName`, `semesterName`.
- Lớp → **vẫn là danh sách thả xuống**, nguồn `GET /classes/teaching`, và **bắt buộc** (bỏ lựa chọn rỗng).
- Cập nhật schema Zod của form cho khớp: ba trường chuỗi bắt buộc, `classId` là UUID bắt buộc.

Thêm một test cho schema:

```ts
it('từ chối phiên thi không gắn lớp', () => {
  const result = createExamSessionSchema.safeParse({
    name: 'Thi CK', courseName: 'CTDL&GT', roomName: 'P.A101',
    semesterName: 'HK1 2026-2027', classId: '',
  });
  expect(result.success).toBe(false);
});
```

> **Cảnh báo cho người dùng, không chỉ cho code.** Tên phòng thành văn bản tự do
> nghĩa là gõ lệch một ký tự sẽ tạo ra một phòng khác, và phép chống trùng lịch
> phòng không bắt được. Cân nhắc gợi ý tự động từ các giá trị đã nhập trước của
> chính giảng viên đó — rẻ, và nó bù lại phần lớn thứ vừa mất.

- [ ] **Step 7: Xử lý bộ lọc học kỳ trên web**

`useSemesterFilter`, `FilterRail`, `submission-filters.ts` và năm trang trở lên đang lọc theo `semesterId`. **Không phải việc xoá** — trang bài nộp cần giữ khả năng lọc. Chọn một và **ghi lại đã chọn gì** trong mô tả PR: lọc theo `semester_name` dạng văn bản, hoặc bỏ lọc học kỳ và giữ lọc theo lớp.

- [ ] **Step 8: Viết test T-ROLE-1**

```ts
it('T-ROLE-1: không còn route nào chấp nhận department_admin', () => {
  const sources = globSync('apps/api/src/**/*.controller.ts');
  for (const file of sources) {
    expect(readFileSync(file, 'utf8')).not.toMatch(/department_admin|super_admin/);
  }
});
```

- [ ] **Step 9: Kiểm toàn bộ**

```bash
cd apps/api && npx tsc --noEmit && npx jest && npx eslint src test --ext .ts
node ../../scripts/find-import-cycles.js src
npx jest --config test/jest-e2e.json
cd ../web && npx vitest run && npx next build
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: cắt quản trị dữ liệu nền, rút còn hai vai trò"
```

---

### Task 6: `CLAUDE.md` và regenerate client

**Files:**
- Modify: `CLAUDE.md`
- Modify: `packages/shared/src/api/schema.d.ts` (sinh lại, không sửa tay)

- [ ] **Step 1: Sửa `CLAUDE.md`**

Ba chỗ thành sai sau đợt này:

1. Bảng tầng **Tham chiếu** liệt kê `Semester` / `Room` / `Course` / `Class` / `Account` / `Enrollment` → còn `Class` / `Account` / `Enrollment`.
2. Quy tắc xác thực agent join ở **mức môn học** → đổi thành **mức lớp**. Để nguyên thì người sau sẽ giữ lại code xác thực theo môn vì tài liệu bảo thế.
3. Mục `assignOwner` cho `Course` mồ côi thuộc `admin` → xoá hẳn.

Thêm một dòng nguyên tắc: *hệ thống không quản lý dữ liệu nền của trường; nó chỉ ghi lại những gì giảng viên khai cho một phiên thi.*

- [ ] **Step 2: Sinh lại client**

```bash
cd apps/api && pnpm start:dev   # nền, chờ API sẵn sàng
cd ../.. && pnpm generate:api-client
```

`schema.d.ts` sinh **từ API đang chạy**, không từ source. Bỏ bước này thì `apps/web` fail typecheck ở đúng dòng gọi route vừa xoá.

- [ ] **Step 3: Build cả hai và commit**

```bash
pnpm build && pnpm lint
git add CLAUDE.md packages/shared/src/api/schema.d.ts
git commit -m "docs: CLAUDE.md khớp mô hình mới, sinh lại API client"
```

---

### Task 7: Đánh dấu sinh viên thi bù

**Files:**
- Modify: `apps/web/src/app/teacher/submissions/[sessionId]/page.tsx`
- Modify: `apps/web/src/app/teacher/grading/page.tsx`
- Test: `apps/web/src/lib/grading-triage.test.ts`

- [ ] **Step 1: Viết hàm thuần + test (T-MU-2)**

**Không cần cột mới.** Phép so sánh đã tồn tại và đang chạy ở `attendance.service.ts:158`.

```ts
export function isMakeupSubmission(
  submissionHomeClassId: string,
  sessionClassId: string,
): boolean {
  return submissionHomeClassId !== sessionClassId;
}
```

```ts
it('T-MU-2: bài có lớp gốc khác lớp phiên → thi bù', () => {
  expect(isMakeupSubmission('class-b', 'class-a')).toBe(true);
  expect(isMakeupSubmission('class-a', 'class-a')).toBe(false);
});
```

`class_id` thành NOT NULL ở Task 3 làm phép so sánh này **đáng tin hơn**, vì không còn vế rỗng.

> **Đừng suy ra "thi bù" từ `agent_connection_event.joined_late`.** Vào muộn và
> thi bù là hai chuyện khác nhau: một sinh viên của đúng lớp vào muộn 10 phút
> không phải thi bù, và một sinh viên thi bù có thể vào đúng giờ.

- [ ] **Step 2: Hiện nhãn ở hai màn hình**

Màn bài nộp: một cột hoặc nhãn màu. Màn chấm: nhãn cạnh tên sinh viên **kèm tên lớp gốc** — biết "thi bù" mà không biết "từ lớp nào" thì giảng viên vẫn phải đi tra.

- [ ] **Step 3: Kiểm và commit**

```bash
cd apps/web && npx vitest run && npx next build
git add apps/web/src
git commit -m "feat(web): đánh dấu bài thi bù ở màn bài nộp và màn chấm"
```

---

## Ghi chú cho người thực thi

**Điểm dừng an toàn duy nhất là sau Task 2.** Từ Task 3 trở đi, dừng giữa chừng để lại schema có cột thừa (vô hại) hoặc thiếu đường đọc (có hại). Task 3-4-5 nên đi chung một PR dù là ba commit.

**Task 5 không đảo ngược được.** Sao lưu trước, và đừng chạy nó vào cuối ngày.

**Nếu plan advocate (`2026-09-20-advocate-outcome-state.md`) chưa chạy**, chạy nó trước. Nó nhỏ, độc lập, và đụng bảng khác — trộn hai đợt migration vào nhau chỉ tạo rủi ro thứ tự mà không được gì.
