# Plan D1 — Sinh viên một chỗ, danh sách lớp, và mọi nơi đọc tên sinh viên

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tên sinh viên nằm ở **một** chỗ (bảng `student`): gõ MSSV là hiện tên (`GET /students/:mssv`), danh sách lớp (nhập file và nhập tay) ghi vào `student` thay vì `enrollment.student_name`, luồng xin phép thi bù không ghi đè tên đã lưu, và sáu nơi hiện đọc tên từ `enrollment` chuyển sang đọc từ `student`. Phạm vi kiểm tra "sinh viên đã ở lớp khác" chuyển từ "cùng môn" sang "cùng học kỳ".

**Architecture:** Một `StudentService` (đọc tên hàng loạt, ghi từ danh sách với luật "file thắng", giữ tên đã lưu khi thêm tay). Mọi nơi đọc tên dùng `COALESCE(student.full_name, enrollment.student_name)` — **ưu tiên `student`, rơi về cột cũ** — để một dòng `enrollment` chưa backfill vẫn có tên trong giai đoạn chuyển tiếp (spec §8.4: "code cũ vẫn chạy", và code mới phải sống được với dữ liệu chưa backfill xong). Thứ tự task là thứ tự giữ **mọi commit xanh**: đọc trước, ghi sau, helper seed cuối cùng.

**Tech Stack:** NestJS 10, TypeORM 0.3, Postgres 16 (`citext`), class-validator, jest (unit + e2e), socket.io-client (một số e2e).

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §2.3 (mục 3 — phạm vi theo học kỳ), §2.6, §4 (nhóm Sinh viên, Danh sách sinh viên của lớp), §6.1 (Sinh viên), §13 mục 3 và 4, §11: T-STU-1…5, T-RW-1, T-RW-2, T-GR-3.

## Global Constraints

- **Một sinh viên chỉ có một tên** (spec §2.6). Nơi **ghi** tên sinh viên: danh sách lớp của giảng viên (nhập file, nhập tay) và luồng xin phép thi bù (chỉ khi MSSV **chưa có**). Không đường nào khác ghi `student`. Trang quản lý sinh viên cho admin **không có** (spec §1.2).
- **Nhập file: file mới nhất thắng; kết quả liệt kê rõ ai bị đổi tên** (`renamed: [{ mssv, from, to }]`), không đổi âm thầm. Đổi tên áp dụng cho mọi lớp vì chỉ có một tên (spec §2.6, §12 mục 3).
- **Nhập tay MSSV đã có: tên được giữ (khoá)**, không ghi đè bằng tên giảng viên gõ; server trả về tên đã lưu. MSSV chưa có thì tạo `student` bằng tên gõ.
- **Luồng xin phép:** MSSV đã có trong `student` → dùng tên đã lưu, **không** ghi đè bằng tên sinh viên tự gõ (T-STU-5); MSSV chưa có → tạo `student` bằng tên gõ. Giá trị sinh viên đã gõ được giữ trong `audit_log` (`typedName`) khi khác tên đã lưu.
- **Đường "thêm sinh viên tại phòng thi"** (`POST /exam-sessions/:id/roster/students`) dùng tên đã lưu nếu có, và **không** tạo `student` mới: ảnh chốt chỉ là bản chụp một buổi thi; một lỗi gõ ở phòng thi không được lan thành tên vĩnh viễn tự điền ở mọi lớp. (Quyết định của plan; spec không nói.)
- **Phạm vi kiểm tra "đã thuộc lớp khác" là CÙNG HỌC KỲ** (spec §2.3 mục 3). Lớp chưa có học kỳ (dữ liệu cũ chưa backfill) chỉ so với chính nó. Sinh viên học lại ở kỳ sau không còn bị chặn (T-STU-4).
- `GET /students/:mssv` tra **đúng một** MSSV, không có route liệt kê; **bắt buộc** có giới hạn tốc độ: **30 lần mỗi phút cho mỗi giảng viên**, giữ trong bộ nhớ tiến trình (cùng giới hạn đã chấp nhận của `AgentJoinLockStore`; với N bản sao tiến trình giới hạn thực là N×30). Chốt mức này là việc của spec §13 mục 3.
- Mọi nơi đọc tên giữ **một** quy tắc: `student.full_name` trước, `enrollment.student_name` sau (cột cũ bị gỡ ở plan H). Quy tắc nằm ở SQL `COALESCE` / hàm `StudentService.findNames`, không rải ra nhiều nơi.
- Giữ nguyên: `session_roster.student_name` và `submission.student_name_input` là **ảnh chụp** tại thời điểm thi, không đọc lại từ `student` (spec §2.6). `exam-session.gateway` (join/agent) đọc ảnh chụp nên **không đổi**.
- Hệ quả của "một tên": hai test cùng seed **một MSSV** với **hai tên khác nhau** không còn hợp lệ (người ghi sau thắng). Nếu một suite hỏng vì điều đó, đổi test sang hai MSSV khác nhau — đừng nới `seedEnrollment`.
- Dùng `python3` nếu cần script; chạy e2e theo plan A (Docker `cine-*`, `.env.test`, `--runInBand` cho cả bộ, ghi kết quả ra file).

## Review Focus

1. **Đọc tên từ cột cũ trong im lặng.** Một nơi đọc quên chuyển vẫn xanh vì cột cũ còn dữ liệu. → test T-RW "đầu độc" cột cũ bằng một chuỗi sai (`TÊN CŨ SAI`) rồi đòi mọi nơi đọc ra tên trong `student` (Task 3).
2. **`citext` so với `text`.** `mssv = ANY($1::text[])` so **phân biệt hoa-thường** (citext ép sang text), làm "SV01" và "sv01" thành hai người. → mọi so khớp hàng loạt dùng `::citext[]`; test gõ khác hoa-thường (Task 2, 5).
3. **Ghi đè tên âm thầm.** Hai đường dễ làm: nhập tay đè tên đã lưu bằng tên gõ lệch; xin phép đè bằng tên sinh viên tự gõ. → T-STU-2, T-STU-5 khẳng định tên **không đổi** (Task 5, 6).
4. **Quét MSSV để lấy tên người khác.** → giới hạn tốc độ có test thật (31 lần → 429) và có route liệt kê không tồn tại (404) (Task 4).
5. **Phạm vi học kỳ rò hai chiều.** Quá rộng (mọi học kỳ) chặn sinh viên học lại; quá hẹp (chỉ lớp này) cho một sinh viên nằm hai lớp cùng kỳ rồi bài nộp định tuyến sai. → hai test đối xứng: cùng kỳ bị chặn, khác kỳ qua (Task 5).
6. **Danh sách có sinh viên mà `student` thiếu (chưa backfill).** Một `INNER JOIN` làm họ biến mất khỏi danh sách và ảnh chốt. → mọi nơi đọc dùng `LEFT JOIN`/rơi về cột cũ; test dòng enrollment không có `student` (Task 3).

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/src/course/entities/class-label.view.ts` | **Mới.** `ViewEntity` cho view `class_label`. |
| `apps/api/src/course/class-label.service.ts` | **Mới.** `labelsFor(ids)`, `labelsWithSemesterFor(ids)`. |
| `apps/api/src/course/student.service.ts` | **Mới.** Tên sinh viên: đọc hàng loạt, ghi từ danh sách, giữ tên đã lưu. |
| `apps/api/src/course/student-lookup.limiter.ts` | **Mới.** Giới hạn tốc độ tra tên (30/phút/giảng viên). |
| `apps/api/src/course/student.controller.ts` | **Mới.** `GET /students/:mssv`. |
| `apps/api/src/course/roster.service.ts`, `enrollment.service.ts`, `course.types.ts` | Viết lại theo `student`, phạm vi học kỳ. |
| `apps/api/src/exam-session/session-roster.service.ts`, `recollect.service.ts`, `access-request.gateway.ts` | Đọc/ghi tên theo `student`. |
| `apps/api/src/agent-connection/attendance.service.ts`, `agent-connection.module.ts` | Đọc tên theo `student`. |
| `apps/api/src/submission/submission-overview.service.ts` | Đọc tên theo `student` (SQL). |
| `apps/api/src/course/course.module.ts`, `apps/api/src/database/data-source.ts` | Đăng ký service/controller/entity. |
| `apps/api/test/entity-schema.e2e-spec.ts` | Bỏ qua view khi so cột. |
| `apps/api/test/{class-label,student,student-lookup,student-name-readers}.e2e-spec.ts` | **Mới.** |
| `apps/api/test/{roster-import,access-request}.e2e-spec.ts` | Cập nhật theo luật mới + ca mới. |
| `apps/api/test/helpers/seed.ts`, `apps/api/test/helpers/master-data.ts` | `seedEnrollment` ghi `student`; helper học kỳ/lớp danh nghĩa dùng chung. |
| `packages/shared/src/api/schema.d.ts` | Sinh lại. |

---

### Task 1: View nhãn lớp — entity và service

**Files:**
- Create: `apps/api/src/course/entities/class-label.view.ts`
- Create: `apps/api/src/course/class-label.service.ts`
- Modify: `apps/api/src/database/data-source.ts`, `apps/api/src/course/course.module.ts`
- Modify: `apps/api/test/entity-schema.e2e-spec.ts`
- Test: `apps/api/test/class-label.e2e-spec.ts`

**Interfaces:**
- Produces (D1, D2, D3 đều dùng):

```ts
@ViewEntity({ name: 'class_label' })
class ClassLabelView { classId: string; label: string; labelWithSemester: string }
class ClassLabelService {
  labelsFor(classIds: string[]): Promise<Map<string, string>>;          // class_id -> "DHKTPM18A – Nhóm 1"
  labelsWithSemesterFor(classIds: string[]): Promise<Map<string, string>>; // class_id -> "… · HK1 2026-2027"
}
```

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/class-label.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { ClassLabelService } from '../src/course/class-label.service';
import { createTestAccount } from './helpers/create-account';
import { freshTestYear, purgeTestSemesters, randomTag, semesterDates } from './helpers/master-data';
import { seedClass } from './helpers/seed';

describe('ClassLabelService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let labels: ClassLabelService;
  let teacherId: string;
  const created: { classes: string[]; semesters: string[]; adm: string[] } = { classes: [], semesters: [], adm: [] };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    labels = app.get(ClassLabelService, { strict: false });
    teacherId = await createTestAccount(ds, {
      email: `classlabel_${randomTag()}@example.com`,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.class WHERE id = ANY($1)`, [created.classes]).catch(() => undefined);
    await ds.query(`DELETE FROM examcollect.administrative_class WHERE id = ANY($1)`, [created.adm]).catch(() => undefined);
    await purgeTestSemesters(ds);
    await app.close();
  });

  it('trả nhãn "mã – nhóm" và nhãn kèm học kỳ cho từng lớp, bỏ qua id không có thật', async () => {
    const year = await freshTestYear(ds);
    const { startDate, endDate } = semesterDates(year, 1);
    const [sem] = await ds.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date) VALUES ($1, 1, $2, $3) RETURNING id`,
      [year, startDate, endDate],
    );
    const code = `ZZ${randomTag()}`;
    const [adm] = await ds.query(`INSERT INTO examcollect.administrative_class (code) VALUES ($1) RETURNING id`, [code]);
    created.adm.push(adm.id);

    const plain = await seedClass(ds, { teacherId, semesterId: sem.id, administrativeClassId: adm.id });
    const grouped = await seedClass(ds, { teacherId, semesterId: sem.id, administrativeClassId: adm.id, groupName: 'Nhóm 1' });
    created.classes.push(plain.id, grouped.id);
    const ghost = '00000000-0000-4000-8000-0000000000bb';

    const simple = await labels.labelsFor([plain.id, grouped.id, ghost]);
    expect(simple.get(plain.id)).toBe(code);
    expect(simple.get(grouped.id)).toBe(`${code} – Nhóm 1`);
    expect(simple.has(ghost)).toBe(false);

    const withSemester = await labels.labelsWithSemesterFor([plain.id, grouped.id]);
    expect(withSemester.get(plain.id)).toBe(`${code} · HK1 ${year}-${year + 1}`);
    expect(withSemester.get(grouped.id)).toBe(`${code} – Nhóm 1 · HK1 ${year}-${year + 1}`);
  });

  it('danh sách rỗng thì bản đồ rỗng và không truy vấn', async () => {
    expect((await labels.labelsFor([])).size).toBe(0);
    expect((await labels.labelsWithSemesterFor([])).size).toBe(0);
  });

  it('lớp cũ chưa có lớp danh nghĩa rơi về tên cũ, không ra NULL', async () => {
    const legacy = await seedClass(ds, { teacherId, groupName: 'Lớp cũ chưa gán' });
    created.classes.push(legacy.id);
    const map = await labels.labelsFor([legacy.id]);
    expect(map.get(legacy.id)).toBe(legacy.label);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run (từ `apps/api`): `npx jest --config ./test/jest-e2e.json test/class-label.e2e-spec.ts`
Expected: FAIL — `Cannot find module '../src/course/class-label.service'`.

- [ ] **Step 3: Viết view entity và service**

Create `apps/api/src/course/entities/class-label.view.ts`:

```ts
import { ViewColumn, ViewEntity } from 'typeorm';

/**
 * View `examcollect.class_label` — MỘT nguồn duy nhất cho nhãn lớp (spec §2.5):
 * mã lớp danh nghĩa + nhóm, kèm học kỳ khi cần phân biệt.
 *
 * Là entity (thay vì chuỗi tên bảng trong `leftJoin('class_label', …)`) vì
 * TypeORM chỉ gắn tên schema vào những bảng nó biết: một tên chuỗi không khớp
 * entity nào bị viết ra không kèm `examcollect.`, và chạy được hay không tuỳ
 * `search_path` của kết nối. `class` được `leftJoin('class', …)` an toàn chính vì
 * nó là một entity.
 *
 * KHÔNG có `expression`: view do migration `ExpandMasterDataEntities` tạo và
 * `synchronize` tắt. Nhãn lớp là BIỂU THỨC, không phải bản chụp — sửa mã lớp
 * danh nghĩa thì mọi nơi đổi nhãn theo, kể cả lớp của kỳ cũ (spec §2.2).
 */
@ViewEntity({ name: 'class_label' })
export class ClassLabelView {
  @ViewColumn({ name: 'class_id' })
  classId!: string;

  /** `DHKTPM18A` hoặc `DHKTPM18A – Nhóm 1`. */
  @ViewColumn()
  label!: string;

  /** `label` cộng ` · HK1 2026-2027`. */
  @ViewColumn({ name: 'label_with_semester' })
  labelWithSemester!: string;
}
```

Create `apps/api/src/course/class-label.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Nhãn hiển thị của lớp, đọc từ view `class_label` — cách DUY NHẤT để lấy "tên
 * lớp" từ khi `class.name` bị bỏ (spec §2.5). Giảng viên chỉ thấy MỘT nhãn ở mọi
 * nơi hiện tên lớp: không có trang, route hay bộ lọc riêng cho lớp danh nghĩa.
 *
 * Một truy vấn cho cả danh sách id (tối đa vài trăm), không phải một truy vấn
 * mỗi lớp. Id không có thật không xuất hiện trong bản đồ — người gọi quyết định
 * điền gì thay.
 */
@Injectable()
export class ClassLabelService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  labelsFor(classIds: string[]): Promise<Map<string, string>> {
    return this.read('label', classIds);
  }

  labelsWithSemesterFor(classIds: string[]): Promise<Map<string, string>> {
    return this.read('label_with_semester', classIds);
  }

  private async read(column: 'label' | 'label_with_semester', classIds: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (classIds.length === 0) return map;
    const rows: { class_id: string; label: string }[] = await this.dataSource.query(
      `SELECT class_id, ${column} AS label FROM examcollect.class_label WHERE class_id = ANY($1::uuid[])`,
      [classIds],
    );
    for (const row of rows) map.set(row.class_id, row.label);
    return map;
  }
}
```

`column` chỉ nhận hai giá trị cố định (kiểu `'label' | 'label_with_semester'`), nên nội suy vào SQL không mở đường tiêm.

- [ ] **Step 4: Đăng ký, và dạy bài kiểm "entity khớp schema" bỏ qua view**

Trong `apps/api/src/database/data-source.ts`: thêm `import { ClassLabelView } from '../course/entities/class-label.view';` và `ClassLabelView,` vào mảng `entities` ngay sau `StudentEntity,`.

Trong `apps/api/src/course/course.module.ts`: thêm `import { ClassLabelService } from './class-label.service';`, thêm `ClassLabelService` vào `providers` **và** `exports`.

Trong `apps/api/test/entity-schema.e2e-spec.ts`, vòng `for (const meta of ds.entityMetadatas)` bỏ view (cột view luôn `is_nullable = 'YES'` trong `information_schema`, còn `@ViewColumn` không có tuỳ chọn nullable nên so nullable sẽ luôn lệch):

```ts
    for (const meta of ds.entityMetadatas) {
      // View không có ràng buộc NOT NULL để so; `information_schema` ghi mọi cột view là nullable.
      // Cột của view vẫn phải CÓ trong DB — kiểm riêng bên dưới.
      if (meta.tableType === 'view') {
        for (const col of meta.columns) {
          const key = `${meta.tableName}.${col.databaseName}`;
          if (!db.has(key)) problems.push(`${key}: không có trong DB`);
        }
        continue;
      }
      for (const col of meta.columns) {
        ...giữ nguyên thân vòng lặp cũ...
      }
    }
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/class-label.e2e-spec.ts test/entity-schema.e2e-spec.ts`
Expected: PASS (3 test + 1 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course apps/api/src/database/data-source.ts apps/api/test/class-label.e2e-spec.ts apps/api/test/entity-schema.e2e-spec.ts
git commit -m "feat(master-data): ClassLabelService đọc nhãn lớp từ view class_label"
```

---

### Task 2: `StudentService`

**Files:**
- Create: `apps/api/src/course/student.service.ts`
- Modify: `apps/api/src/course/course.module.ts`
- Test: `apps/api/test/student.e2e-spec.ts`

**Interfaces:**
- Consumes: `StudentEntity` (plan C).
- Produces:

```ts
export interface StudentView { mssv: string; fullName: string }
export interface RosterRow { mssv: string; name: string }
export interface RenamedStudent { mssv: string; from: string; to: string }
type Queryable = { query(sql: string, params?: unknown[]): Promise<any> };
class StudentService {
  findByMssv(mssv: string): Promise<StudentView | null>;
  /** key = MSSV viết thường -> họ tên. MSSV không có thì vắng trong bản đồ. */
  findNames(db: Queryable, mssvs: string[]): Promise<Map<string, string>>;
  /** File thắng. Trả số tạo mới và danh sách đổi tên. */
  upsertFromRoster(manager: EntityManager, rows: RosterRow[]): Promise<{ created: number; renamed: RenamedStudent[] }>;
  /** Có rồi thì giữ tên đã lưu; chưa có thì tạo bằng tên gõ. Trả tên đang lưu. */
  ensureKeepingStoredName(manager: EntityManager, mssv: string, typedName: string): Promise<string>;
}
```

- [ ] **Step 1: Viết e2e (đỏ)**

Create `apps/api/test/student.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { StudentService } from '../src/course/student.service';
import { randomTag } from './helpers/master-data';

describe('StudentService (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let students: StudentService;
  const made: string[] = [];

  /** MSSV duy nhất mỗi lần, 4–20 ký tự chữ/số. */
  const mssv = () => `ST${randomTag(10)}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
    students = app.get(StudentService, { strict: false });
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.student WHERE mssv = ANY($1::citext[])`, [made]).catch(() => undefined);
    await app.close();
  });

  const nameOf = async (m: string) =>
    (await ds.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [m]))[0]?.full_name;

  describe('findByMssv / findNames', () => {
    it('tìm không phân biệt hoa-thường và trả MSSV theo cách đã lưu', async () => {
      const id = mssv();
      made.push(id);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Nguyễn Văn A')`, [id]);
      expect(await students.findByMssv(id.toLowerCase())).toEqual({ mssv: id, fullName: 'Nguyễn Văn A' });
      expect(await students.findByMssv(`ZZ${randomTag(8)}`)).toBeNull();
    });

    it('findNames so khớp bằng citext: gõ khác hoa-thường vẫn ra (Review Focus 2)', async () => {
      const a = mssv();
      const b = mssv();
      made.push(a, b);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Trần Thị B'), ($2, 'Lê Văn C')`, [a, b]);
      const names = await students.findNames(ds, [a.toLowerCase(), b.toUpperCase(), `KHONG${randomTag(8)}`]);
      expect(names.get(a.toLowerCase())).toBe('Trần Thị B');
      expect(names.get(b.toLowerCase())).toBe('Lê Văn C');
      expect(names.size).toBe(2);
    });

    it('danh sách rỗng thì bản đồ rỗng', async () => {
      expect((await students.findNames(ds, [])).size).toBe(0);
    });
  });

  describe('upsertFromRoster — file thắng', () => {
    it('tạo sinh viên mới và đếm đúng', async () => {
      const a = mssv();
      const b = mssv();
      made.push(a, b);
      const result = await ds.transaction((m) =>
        students.upsertFromRoster(m, [{ mssv: a, name: 'Sinh viên A' }, { mssv: b, name: 'Sinh viên B' }]),
      );
      expect(result).toEqual({ created: 2, renamed: [] });
      expect(await nameOf(a)).toBe('Sinh viên A');
    });

    it('tên khác thì ĐỔI và LIỆT KÊ (từ, thành), tên giống thì không đụng', async () => {
      const changed = mssv();
      const same = mssv();
      made.push(changed, same);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Nguyen Van I'), ($2, 'Trần Thị J')`, [changed, same]);

      const result = await ds.transaction((m) =>
        students.upsertFromRoster(m, [
          { mssv: changed.toLowerCase(), name: 'Nguyễn Văn I' },
          { mssv: same, name: 'Trần Thị J' },
        ]),
      );

      expect(result.created).toBe(0);
      expect(result.renamed).toEqual([{ mssv: changed, from: 'Nguyen Van I', to: 'Nguyễn Văn I' }]);
      expect(await nameOf(changed)).toBe('Nguyễn Văn I');
      expect(await nameOf(same)).toBe('Trần Thị J');
    });

    it('MSSV giữ cách viết của lần ghi đầu, kể cả khi file gõ khác hoa-thường', async () => {
      const id = mssv();
      made.push(id);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Giữ nguyên')`, [id]);
      await ds.transaction((m) => students.upsertFromRoster(m, [{ mssv: id.toLowerCase(), name: 'Giữ nguyên' }]));
      const [row] = await ds.query(`SELECT mssv::text AS mssv FROM examcollect.student WHERE mssv = $1`, [id]);
      expect(row.mssv).toBe(id);
    });

    it('cắt khoảng trắng đầu-cuối của tên trước khi so và ghi', async () => {
      const id = mssv();
      made.push(id);
      await ds.transaction((m) => students.upsertFromRoster(m, [{ mssv: id, name: '  Có khoảng trắng  ' }]));
      expect(await nameOf(id)).toBe('Có khoảng trắng');
    });
  });

  describe('ensureKeepingStoredName', () => {
    it('chưa có thì tạo bằng tên gõ và trả tên đó', async () => {
      const id = mssv();
      made.push(id);
      const name = await ds.transaction((m) => students.ensureKeepingStoredName(m, id, 'Em gõ tên'));
      expect(name).toBe('Em gõ tên');
      expect(await nameOf(id)).toBe('Em gõ tên');
    });

    it('có rồi thì GIỮ tên đã lưu, bỏ qua tên gõ (Review Focus 3)', async () => {
      const id = mssv();
      made.push(id);
      await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Tên đã lưu')`, [id]);
      const name = await ds.transaction((m) => students.ensureKeepingStoredName(m, id.toLowerCase(), 'Tên em gõ lệch'));
      expect(name).toBe('Tên đã lưu');
      expect(await nameOf(id)).toBe('Tên đã lưu');
    });

    it('hai lần gọi chạy đua trên cùng MSSV mới không nổ và cùng ra một tên', async () => {
      const id = mssv();
      made.push(id);
      const [first, second] = await Promise.all([
        ds.transaction((m) => students.ensureKeepingStoredName(m, id, 'Tên thứ nhất')),
        ds.transaction((m) => students.ensureKeepingStoredName(m, id, 'Tên thứ hai')),
      ]);
      expect(first).toBe(second);
      expect(['Tên thứ nhất', 'Tên thứ hai']).toContain(first);
    });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/student.e2e-spec.ts`
Expected: FAIL — không import được `StudentService`.

- [ ] **Step 3: Viết service**

Create `apps/api/src/course/student.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { StudentEntity } from './entities/student.entity';

export interface StudentView {
  mssv: string;
  fullName: string;
}

export interface RosterRow {
  mssv: string;
  name: string;
}

export interface RenamedStudent {
  mssv: string;
  from: string;
  to: string;
}

/** DataSource, EntityManager hay QueryRunner. */
type Queryable = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params?: unknown[]): Promise<any>;
};

const INSERT_CHUNK = 100;

/**
 * Tên sinh viên ở MỘT chỗ (spec §2.6). Trước đây mỗi dòng `enrollment` mang một
 * bản `student_name` riêng: cùng một em ở hai lớp có thể mang hai tên, và gõ
 * MSSV không tra lại được tên đã nhập ở lớp trước.
 *
 * Ba việc, mỗi việc một luật:
 *   - `findNames`: đọc hàng loạt, cho mọi nơi hiện tên (danh sách, ảnh chốt,
 *     điểm danh, thu lại, bài thu).
 *   - `upsertFromRoster`: danh sách lớp của giảng viên — FILE THẮNG, và liệt kê
 *     rõ ai bị đổi tên. Đổi tên áp dụng cho mọi lớp vì chỉ có một tên.
 *   - `ensureKeepingStoredName`: nhập tay và luồng xin phép — MSSV đã có thì
 *     GIỮ tên đã lưu (khoá), không ghi đè bằng tên người gõ.
 *
 * `student` không bao giờ bị xoá tự động: một sinh viên nối qua nhiều học kỳ.
 */
@Injectable()
export class StudentService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findByMssv(mssv: string): Promise<StudentView | null> {
    const row = await this.dataSource.getRepository(StudentEntity).findOne({ where: { mssv } });
    return row ? { mssv: row.mssv, fullName: row.fullName } : null;
  }

  /**
   * MSSV (viết thường) -> họ tên. `::citext[]` là BẮT BUỘC: `mssv = ANY($1::text[])`
   * ép cột citext sang text và so PHÂN BIỆT hoa-thường, làm "SV01" và "sv01" thành
   * hai người — đúng lỗi mà kiểu cột citext sinh ra để tránh.
   */
  async findNames(db: Queryable, mssvs: string[]): Promise<Map<string, string>> {
    const names = new Map<string, string>();
    if (mssvs.length === 0) return names;
    const rows: { mssv: string; full_name: string }[] = await db.query(
      `SELECT mssv::text AS mssv, full_name FROM examcollect.student WHERE mssv = ANY($1::citext[])`,
      [mssvs],
    );
    for (const row of rows) names.set(row.mssv.toLowerCase(), row.full_name);
    return names;
  }

  async upsertFromRoster(
    manager: EntityManager,
    rows: RosterRow[],
  ): Promise<{ created: number; renamed: RenamedStudent[] }> {
    const repo = manager.getRepository(StudentEntity);
    const existing = await repo.find({
      where: { mssv: In(rows.map((row) => row.mssv)) },
      // Hai lần import song song không cùng đổi một người, và không cùng tạo một người.
      lock: { mode: 'pessimistic_write' },
    });
    const byMssv = new Map(existing.map((student) => [student.mssv.toLowerCase(), student]));

    const toInsert: { mssv: string; fullName: string }[] = [];
    const renamed: RenamedStudent[] = [];
    for (const row of rows) {
      const name = row.name.trim();
      const current = byMssv.get(row.mssv.toLowerCase());
      if (!current) {
        toInsert.push({ mssv: row.mssv, fullName: name });
        continue;
      }
      if (current.fullName !== name) {
        // MSSV giữ cách viết của lần ghi đầu: chỉ TÊN đổi.
        renamed.push({ mssv: current.mssv, from: current.fullName, to: name });
        await repo.update(current.id, { fullName: name });
      }
    }
    for (let i = 0; i < toInsert.length; i += INSERT_CHUNK) {
      await repo.insert(toInsert.slice(i, i + INSERT_CHUNK));
    }
    return { created: toInsert.length, renamed };
  }

  async ensureKeepingStoredName(
    manager: EntityManager,
    mssv: string,
    typedName: string,
  ): Promise<string> {
    const repo = manager.getRepository(StudentEntity);
    const existing = await repo.findOne({ where: { mssv } });
    if (existing) return existing.fullName;

    // `orIgnore`: hai giám thị duyệt cùng một em, hoặc hai tab cùng thêm một MSSV mới,
    // cho ra MỘT dòng — không phải một lỗi khoá duy nhất.
    await repo
      .createQueryBuilder()
      .insert()
      .values({ mssv, fullName: typedName.trim() })
      .orIgnore()
      .execute();
    const saved = await repo.findOneOrFail({ where: { mssv } });
    return saved.fullName;
  }
}
```

- [ ] **Step 4: Đăng ký trong module**

Trong `apps/api/src/course/course.module.ts`: thêm `import { StudentService } from './student.service';`, thêm `StudentService` vào `providers` **và** `exports`.

- [ ] **Step 5: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/student.e2e-spec.ts`
Expected: PASS (9 test). Ca chạy đua: nếu nó nổ `23505`, `orIgnore` đang không hoạt động trên `uq_student_mssv` — kiểm chỉ mục có đúng là unique.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course/student.service.ts apps/api/src/course/course.module.ts apps/api/test/student.e2e-spec.ts
git commit -m "feat(master-data): StudentService — tên sinh viên ở một chỗ, file thắng, nhập tay giữ tên đã lưu"
```

---

### Task 3: Mọi nơi đọc tên chuyển sang `student` (T-RW-1, T-RW-2)

**Files:**
- Modify: `apps/api/src/exam-session/session-roster.service.ts`, `apps/api/src/exam-session/recollect.service.ts`
- Modify: `apps/api/src/agent-connection/attendance.service.ts`, `apps/api/src/agent-connection/agent-connection.module.ts`
- Modify: `apps/api/src/submission/submission-overview.service.ts`
- Test: `apps/api/test/student-name-readers.e2e-spec.ts`

**Interfaces:**
- Consumes: `StudentService.findNames` (Task 2). Trong `AgentConnectionModule` (không import `CourseModule` — xem doc của module) dùng `Repository<StudentEntity>`.
- Produces: không đổi hình dạng phản hồi nào; chỉ đổi NGUỒN tên.

- [ ] **Step 1: Viết e2e "đầu độc cột cũ" (đỏ)**

Create `apps/api/test/student-name-readers.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';
import { seedClass, seedEnrollment, sessionBody } from './helpers/seed';
import { concurrentLiveWindow } from './helpers/session-window';
import { openSession } from './helpers/open-session';

/**
 * Mọi nơi hiện tên sinh viên phải đọc từ `student`, không phải từ cột cũ
 * `enrollment.student_name` (spec §2.6, T-RW-1, T-RW-2).
 *
 * Cách chứng minh: sau khi seed, GHI ĐÈ cột cũ bằng một chuỗi sai rõ ràng. Một nơi đọc quên
 * chuyển vẫn đọc cột cũ sẽ ra "TÊN CŨ SAI" — và test đỏ. Đọc từ `student` thì ra tên thật.
 * Không có ca này, một nơi đọc cũ vẫn xanh vì cột cũ còn dữ liệu đúng.
 */
describe('Nơi đọc tên sinh viên (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let token: string;
  let teacherId: string;
  let classId: string;
  let sessionId: string;
  const POISON = 'TÊN CŨ SAI';
  const tag = randomTag(8);
  const PRESENT = `NR${tag}1`;
  const ABSENT = `NR${tag}2`;
  const NAMES = new Map([
    [PRESENT, 'Nguyễn Văn Có Mặt'],
    [ABSENT, 'Trần Thị Vắng Mặt'],
  ]);

  const get = (path: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);

    const email = `namereaders_${tag}@example.com`;
    teacherId = await createTestAccount(ds, { email, password: 'correct-horse-battery', role: 'teacher' });
    const login = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    token = login.body.accessToken;

    const klass = await seedClass(ds, { teacherId });
    classId = klass.id;
    for (const [mssv, name] of NAMES) {
      await seedEnrollment(ds, { classId, teacherId, mssv, name });
    }
    // ĐẦU ĐỘC cột cũ: sau dòng này chỉ `student` còn mang tên đúng.
    await ds.query(`UPDATE examcollect.enrollment SET student_name = $1 WHERE home_class_id = $2`, [POISON, classId]);

    const created = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${token}`)
      .send(await sessionBody(ds, { classId, name: `Đọc tên ${tag}`, ...concurrentLiveWindow() }));
    expect(created.status).toBe(201);
    sessionId = created.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('T-RW (đóng băng): ảnh chốt chụp tên từ `student`, không từ cột cũ', async () => {
    await openSession(app, token, sessionId);
    const rows = await ds.query(
      `SELECT student_mssv::text AS mssv, student_name FROM examcollect.session_roster WHERE exam_session_id = $1`,
      [sessionId],
    );
    const byMssv = new Map(rows.map((r: { mssv: string; student_name: string }) => [r.mssv, r.student_name]));
    expect(byMssv.get(PRESENT)).toBe(NAMES.get(PRESENT));
    expect(byMssv.get(ABSENT)).toBe(NAMES.get(ABSENT));
    // Dòng submission được gieo cũng mang tên từ `student`.
    const subs = await ds.query(
      `SELECT DISTINCT student_mssv::text AS mssv, student_name_input FROM examcollect.submission WHERE exam_session_id = $1`,
      [sessionId],
    );
    for (const row of subs) expect(row.student_name_input).toBe(NAMES.get(row.mssv));
  });

  it('điểm danh: nhóm có mặt và vắng mặt hiện tên từ `student`', async () => {
    await ds.query(
      `INSERT INTO examcollect.agent_connection_event (exam_session_id, student_mssv, event_type, joined_late)
       VALUES ($1, $2, 'connected', false)`,
      [sessionId, PRESENT],
    );
    const response = await get(`/exam-sessions/${sessionId}/attendance`).expect(200);
    expect(response.body.present.map((s: { name: string }) => s.name)).toEqual([NAMES.get(PRESENT)]);
    expect(response.body.absent.map((s: { name: string }) => s.name)).toEqual([NAMES.get(ABSENT)]);
  });

  it('T-RW-2 (thu lại, SQL thô): danh sách em chưa nộp kèm tên từ `student`', async () => {
    await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/finalize`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const response = await request(app.getHttpServer())
      .post(`/exam-sessions/${sessionId}/recollect`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // Không có agent nào đang kết nối, nên em có mặt (đã có event) mà chưa nộp là "unreachable" — và tên của em hiện ra.
    expect(response.body.missing).toBe(1);
    expect(response.body.unreachableNames).toEqual([NAMES.get(PRESENT)]);
  });

  it('T-RW-1 (bài thu, SQL thô): từ khoá tìm theo TÊN trong `student`, và danh sách khớp mang tên từ `student`', async () => {
    const response = await get(`/submissions/overview?student=${encodeURIComponent('Có Mặt')}`).expect(200);
    const item = response.body.items.find((s: { id: string }) => s.id === sessionId);
    expect(item).toBeDefined();
    expect(item.matchedStudents).toEqual([{ mssv: PRESENT, name: NAMES.get(PRESENT) }]);
    // Từ khoá của cột cũ không tìm ra gì: cột cũ không còn là nguồn tên.
    const poisoned = await get(`/submissions/overview?student=${encodeURIComponent('TÊN CŨ')}`).expect(200);
    expect(poisoned.body.items.find((s: { id: string }) => s.id === sessionId)).toBeUndefined();
  });

  it('Review Focus 6: dòng enrollment chưa có sinh viên trong `student` vẫn hiện bằng tên cũ, không biến mất', async () => {
    const legacyMssv = `NR${tag}3`;
    // Hình dạng TRƯỚC backfill: có `enrollment.student_name`, không có hàng `student`.
    await seedEnrollment(ds, { classId, teacherId, mssv: legacyMssv, legacyName: 'Tên cũ chưa backfill' });
    // Lớp của phiên: roster API đọc theo lớp.
    const roster = await get(`/classes/${classId}/roster`).expect(200);
    const legacy = roster.body.find((r: { mssv: string }) => r.mssv === legacyMssv);
    expect(legacy).toEqual({ mssv: legacyMssv, name: 'Tên cũ chưa backfill' });
    // Và những em đã có `student` vẫn ra tên mới.
    const present = roster.body.find((r: { mssv: string }) => r.mssv === PRESENT);
    expect(present.name).toBe(NAMES.get(PRESENT));
  });
});
```

Test này cần hai thứ mà `seedEnrollment` của plan A chưa có: ghi **cả** `student` (để có tên mới mà đầu độc cột cũ rồi so) và dựng được một dòng ở hình dạng **trước backfill**. Làm ở bước kế.

- [ ] **Step 2: Ghi kép `seedEnrollment` và thêm cờ `legacyName`**

Trong `apps/api/test/helpers/seed.ts`, thay `SeedEnrollmentOptions` và `seedEnrollment` bằng bản **ghi kép** (giai đoạn này; Task 7 gỡ nửa ghi cột cũ):

```ts
export interface SeedEnrollmentOptions {
  classId: string;
  /** Chủ lớp: `enrollment.home_teacher_id` luôn là giảng viên của lớp. */
  teacherId: string;
  mssv: string;
  /** Mặc định `Sinh viên <mssv>`. Ghi vào `student` (tên ở MỘT chỗ). */
  name?: string;
  /**
   * Chỉ cho test về GIAI ĐOẠN CHUYỂN TIẾP: dựng một dòng ở hình dạng TRƯỚC backfill — có
   * `enrollment.student_name`, KHÔNG có hàng trong `student`. Có cờ này thì `name` bị bỏ qua.
   */
  legacyName?: string;
}

export async function seedEnrollment(db: Queryable, o: SeedEnrollmentOptions): Promise<void> {
  if (o.legacyName !== undefined) {
    await db.query(
      `INSERT INTO examcollect.enrollment (student_mssv, student_name, home_class_id, home_teacher_id)
       VALUES ($1, $2, $3, $4)`,
      [o.mssv, o.legacyName, o.classId, o.teacherId],
    );
    return;
  }
  const name = o.name ?? `Sinh viên ${o.mssv}`;
  // Tên sinh viên ở MỘT chỗ: upsert, người ghi sau thắng — giống "file thắng" của import danh sách.
  // Hệ quả cho test: hai lần seed cùng MỘT MSSV với HAI tên khác nhau chỉ còn tên sau.
  await db.query(
    `INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, $2)
     ON CONFLICT (mssv) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()`,
    [o.mssv, name],
  );
  // TẠM ghi kép: cột cũ còn được đọc ở những nơi chưa chuyển (Task 3 Step 4–7). Task 7 bỏ nửa này.
  await db.query(
    `INSERT INTO examcollect.enrollment (student_mssv, student_name, home_class_id, home_teacher_id)
     VALUES ($1, $2, $3, $4)`,
    [o.mssv, name, o.classId, o.teacherId],
  );
}
```

`legacyName` không bị guard của plan A cản: mọi câu `INSERT INTO examcollect.enrollment` vẫn nằm trong `seed.ts`.

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/student-name-readers.e2e-spec.ts`
Expected: FAIL — tên đọc ra là `TÊN CŨ SAI` ở ảnh chốt, điểm danh, thu lại; tìm theo `Có Mặt` không ra.

- [ ] **Step 4: `SessionRosterService` — đóng băng và thêm tay tại phòng thi**

Trong `apps/api/src/exam-session/session-roster.service.ts`:

1. Thêm `import { StudentService } from '../course/student.service';` và đổi constructor thành:

```ts
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly students: StudentService,
  ) {}
```

(`ExamSessionModule` đã `imports: [CourseModule]` và `CourseModule` xuất `StudentService`.)

2. Trong `freeze`, ngay sau khối `if (enrolled.length === 0) {…}` và trước `await this.insertChunked(`, thêm:

```ts
      // Tên đến từ `student` (spec §2.6), rơi về cột cũ chỉ cho dòng chưa backfill. Ảnh chốt
      // CHỤP tên tại đây: sửa tên ở `student` sau này không đổi bảng điểm đã có.
      const names = await this.students.findNames(
        manager,
        enrolled.map((row) => row.studentMssv),
      );
      const nameOf = (row: EnrollmentEntity) =>
        names.get(row.studentMssv.toLowerCase()) ?? row.studentName ?? row.studentMssv;
```

Rồi đổi hai chỗ dùng `row.studentName`: trong `insertChunked(... studentName: row.studentName ...)` thành `studentName: nameOf(row)`, và trong `seedSeats(... name: row.studentName ...)` thành `name: nameOf(row)`.

3. Trong `addManually(session, student)`: trong transaction, ngay sau khối `if (existing) {…}` thêm:

```ts
      // Tên đã lưu thắng tên gõ ở phòng thi; không tạo `student` mới (ảnh chốt chỉ là bản chụp
      // một buổi thi — một lỗi gõ ở đây không được thành tên vĩnh viễn tự điền ở mọi lớp).
      const stored = await this.students.findNames(manager, [student.mssv]);
      const name = stored.get(student.mssv.toLowerCase()) ?? student.name;
```

và đổi `studentName: student.name` thành `studentName: name`, cùng `{ mssv: student.mssv, name: student.name, … }` trong `seedSeats` thành `name`.

- [ ] **Step 5: `RecollectService`**

Trong `apps/api/src/exam-session/recollect.service.ts`, trong câu SQL của `findMissing` đổi ba chỗ:

```sql
       SELECT e.student_mssv AS mssv, COALESCE(st.full_name, e.student_name) AS name
         FROM attended a
         JOIN examcollect.exam_session s ON s.id = $1
         JOIN examcollect.enrollment e
           ON e.home_class_id = s.class_id AND e.student_mssv = a.student_mssv
         LEFT JOIN examcollect.student st ON st.mssv = e.student_mssv
         LEFT JOIN collected c ON c.student_mssv = a.student_mssv
        WHERE COALESCE(c.n, 0) < (SELECT n FROM required)
        ORDER BY COALESCE(st.full_name, e.student_name)
```

`LEFT JOIN`, không phải `JOIN`: dòng enrollment chưa có `student` không được biến mất khỏi danh sách "thu lại". Cập nhật chú thích đầu hàm nếu nó còn nhắc `enrollment.student_name`.

- [ ] **Step 6: `AttendanceService`**

Trong `apps/api/src/agent-connection/agent-connection.module.ts`: thêm `import { StudentEntity } from '../course/entities/student.entity';` và `StudentEntity,` vào `forFeature([...])`. (Module này cố ý đăng ký entity thay vì import module khác — xem doc của nó.)

Trong `apps/api/src/agent-connection/attendance.service.ts`:

1. Import `StudentEntity` và thêm vào constructor:

```ts
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
```

2. Thêm phương thức riêng:

```ts
  /** MSSV (viết thường) -> họ tên từ `student`. `In()` trên cột citext so không phân biệt hoa-thường. */
  private async studentNames(mssvs: string[]): Promise<Map<string, string>> {
    if (mssvs.length === 0) return new Map();
    const rows = await this.students.find({ where: { mssv: In(mssvs) } });
    return new Map(rows.map((row) => [row.mssv.toLowerCase(), row.fullName]));
  }
```

3. Trong `buildView`, ngay sau khi có `enrolled`/`byMssv`:

```ts
    const names = await this.studentNames(enrolled.map((row) => row.studentMssv));
    const nameOf = (row: EnrollmentEntity) =>
      names.get(row.studentMssv.toLowerCase()) ?? row.studentName ?? row.studentMssv;
```

và thay mọi `enrollment.studentName` (ba chỗ: nhóm có mặt/vắng, nhóm thi bù) bằng `nameOf(enrollment)`.

4. `buildDiscrepancy` nhận thêm `names` và dùng thay `enrollment?.studentName ?? mssv`:

```ts
    const names = await this.studentNames(rows.map(({ mssv }) => mssv));
    // …
        const enrollment = byMssv.get(mssv.toLowerCase());
        const name = names.get(mssv.toLowerCase()) ?? enrollment?.studentName ?? mssv;
        const view = this.toView(mssv, name, seen, confirmedAt);
```

Xoá mọi `?? ''` tạm mà plan C Task 4 Step 7 đã thêm vào các chỗ này.

- [ ] **Step 7: `SubmissionOverviewService` (SQL thô)**

Trong `apps/api/src/submission/submission-overview.service.ts`, CTE `roster_students`:

```sql
      roster_students AS (
        SELECT s.id AS exam_session_id, e.student_mssv,
               COALESCE(st.full_name, e.student_name) AS student_name
        FROM ${schema}.exam_session s
        JOIN ${schema}.enrollment e
          ON e.home_class_id = s.class_id
        LEFT JOIN ${schema}.student st ON st.mssv = e.student_mssv
        WHERE s.teacher_id = $1
      ),
```

(các CTE sau đọc `r.student_name` nên giữ nguyên; `LEFT JOIN`, không phải `JOIN`, vì cùng lý do ở Review Focus 6.)

- [ ] **Step 8: Chạy**

Run: `npx jest --config ./test/jest-e2e.json test/student-name-readers.e2e-spec.ts`
Expected: PASS 5 test. Chạy lại các suite có thể bị chạm để chắc không hồi quy:

```
npx jest --config ./test/jest-e2e.json test/attendance.e2e-spec.ts test/recollect.e2e-spec.ts test/session-roster-freeze.e2e-spec.ts test/submission-overview.e2e-spec.ts test/submission-overview-makeup-search.e2e-spec.ts test/submission-overview-attendance.e2e-spec.ts
pnpm exec tsc --noEmit
```

Expected: xanh, số test mỗi suite đúng baseline (`md-restore-baseline.tsv`); `tsc` sạch.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src apps/api/test/student-name-readers.e2e-spec.ts apps/api/test/helpers/seed.ts
git commit -m "feat(master-data): mọi nơi đọc tên sinh viên chuyển sang student (rơi về cột cũ cho dòng chưa backfill)"
```

---

### Task 4: `GET /students/:mssv` và giới hạn tốc độ

**Files:**
- Create: `apps/api/src/course/student-lookup.limiter.ts`, `apps/api/src/course/student-lookup.limiter.spec.ts`, `apps/api/src/course/student.controller.ts`
- Modify: `apps/api/src/course/course.module.ts`
- Test: `apps/api/test/student-lookup.e2e-spec.ts`

**Interfaces:**
- Consumes: `StudentService.findByMssv`, `STUDENT_MSSV_REGEX`.
- Produces:

```ts
class StudentLookupLimiter {
  static readonly MAX_PER_WINDOW = 30;
  static readonly WINDOW_MS = 60_000;
  consume(key: string): { allowed: true } | { allowed: false; retryAfterMs: number };
}
// Route (teacher): GET /students/:mssv -> 200 { mssv, fullName } | 400 | 404 | 429
```

- [ ] **Step 1: Viết unit test cho bộ giới hạn (đỏ)**

Create `apps/api/src/course/student-lookup.limiter.spec.ts`:

```ts
import { StudentLookupLimiter } from './student-lookup.limiter';

describe('StudentLookupLimiter', () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => jest.restoreAllMocks());

  it('cho 30 lần trong một phút, lần thứ 31 bị chặn và báo còn bao lâu', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) {
      expect(limiter.consume('gv1')).toEqual({ allowed: true });
      now += 100;
    }
    const verdict = limiter.consume('gv1');
    expect(verdict.allowed).toBe(false);
    // Lần đầu là lúc 1_000_000; cửa sổ 60_000 ms; hiện tại 1_003_000.
    expect(verdict).toEqual({ allowed: false, retryAfterMs: 57_000 });
  });

  it('cửa sổ trượt: lần cũ nhất rơi ra thì có chỗ trống', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) limiter.consume('gv1');
    expect(limiter.consume('gv1').allowed).toBe(false);
    now += 60_001;
    expect(limiter.consume('gv1')).toEqual({ allowed: true });
  });

  it('mỗi giảng viên một phần riêng — người này hết lượt không chặn người kia', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) limiter.consume('gv1');
    expect(limiter.consume('gv1').allowed).toBe(false);
    expect(limiter.consume('gv2')).toEqual({ allowed: true });
  });

  it('lần bị chặn KHÔNG tính vào hạn mức (không tự kéo dài việc bị chặn)', () => {
    const limiter = new StudentLookupLimiter();
    for (let i = 0; i < 30; i++) limiter.consume('gv1');
    for (let i = 0; i < 50; i++) limiter.consume('gv1');
    now += 60_001;
    expect(limiter.consume('gv1')).toEqual({ allowed: true });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ rồi viết bộ giới hạn**

Run: `npx jest src/course/student-lookup.limiter.spec.ts` — Expected: FAIL (không có module).

Create `apps/api/src/course/student-lookup.limiter.ts`:

```ts
import { Injectable } from '@nestjs/common';

/**
 * Giới hạn tốc độ tra tên sinh viên theo MSSV: 30 lần mỗi phút cho mỗi giảng viên.
 *
 * Vì sao BẮT BUỘC (spec §2.6): `GET /students/:mssv` trả họ tên của bất kỳ MSSV nào
 * đã có trong hệ thống. Không giới hạn thì một giảng viên quét được cả dải MSSV để lấy
 * tên của sinh viên không thuộc lớp họ. 30/phút đủ cho người gõ tay (mỗi MSSV một lần
 * tra, đã debounce ở giao diện) và biến việc quét thành chuyện hàng giờ.
 *
 * Giữ trong BỘ NHỚ tiến trình, cùng khuôn và cùng giới hạn đã chấp nhận của
 * `AgentJoinLockStore`: không sống qua khởi động lại, và với N bản sao tiến trình giới
 * hạn thực là N×30. Đủ cho "chặn lần quét tiếp theo"; sai cho bất kỳ thứ gì cần tra cứu
 * về sau. Không có dọn dẹp chủ động: mỗi giảng viên một mảng ≤ 30 mốc thời gian.
 *
 * Cửa sổ TRƯỢT, không phải cửa sổ cố định: cửa sổ cố định cho 60 lần liền nhau quanh
 * ranh giới phút. Lần bị chặn KHÔNG ghi mốc mới, để người bị chặn không tự kéo dài
 * thời gian chặn bằng cách bấm tiếp.
 */
@Injectable()
export class StudentLookupLimiter {
  static readonly MAX_PER_WINDOW = 30;
  static readonly WINDOW_MS = 60_000;

  private readonly hits = new Map<string, number[]>();

  consume(key: string): { allowed: true } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter(
      (at) => now - at < StudentLookupLimiter.WINDOW_MS,
    );
    if (recent.length >= StudentLookupLimiter.MAX_PER_WINDOW) {
      this.hits.set(key, recent);
      return {
        allowed: false,
        retryAfterMs: StudentLookupLimiter.WINDOW_MS - (now - recent[0]),
      };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }
}
```

Run lại: Expected PASS (4 test).

- [ ] **Step 3: Viết e2e cho route (đỏ)**

Create `apps/api/test/student-lookup.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { createTestAccount } from './helpers/create-account';
import { randomTag } from './helpers/master-data';

describe('GET /students/:mssv (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let teacherToken: string;
  let adminToken: string;
  const known = `LK${randomTag(10)}`;

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer()).post('/auth/login').send({ email, password: 'correct-horse-battery' });
    return response.body.accessToken;
  }

  async function account(prefix: string, role: 'admin' | 'teacher') {
    const email = `${prefix}_${randomTag()}@example.com`;
    await createTestAccount(ds, { email, password: 'correct-horse-battery', role });
    return login(email);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    ds = app.get(DataSource);
    teacherToken = await account('lookup_teacher', 'teacher');
    adminToken = await account('lookup_admin', 'admin');
    await ds.query(`INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Phạm Thị Tra Cứu')`, [known]);
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM examcollect.student WHERE mssv = $1`, [known]).catch(() => undefined);
    await app.close();
  });

  const lookup = (mssv: string, token = teacherToken) =>
    request(app.getHttpServer()).get(`/students/${encodeURIComponent(mssv)}`).set('Authorization', `Bearer ${token}`);

  it('T-STU-1: trả họ tên của đúng MSSV đó, không phân biệt hoa-thường, và MSSV theo cách đã lưu', async () => {
    const response = await lookup(known.toLowerCase()).expect(200);
    expect(response.body).toEqual({ mssv: known, fullName: 'Phạm Thị Tra Cứu' });
  });

  it('T-STU-1: MSSV chưa có là 404', async () => {
    await lookup(`ZZ${randomTag(10)}`).expect(404);
  });

  it('T-STU-1: KHÔNG có route liệt kê sinh viên (Review Focus 4)', async () => {
    await request(app.getHttpServer()).get('/students').set('Authorization', `Bearer ${teacherToken}`).expect(404);
  });

  it('MSSV sai định dạng là 400, và không tốn lượt tra', async () => {
    await lookup('SV 01').expect(400);
    await lookup('ab').expect(400);
    await lookup('A'.repeat(21)).expect(400);
  });

  it('chỉ giảng viên: không token 401, admin 403', async () => {
    await request(app.getHttpServer()).get(`/students/${known}`).expect(401);
    await lookup(known, adminToken).expect(403);
  });

  it('Review Focus 4: lần thứ 31 trong một phút là 429, và người khác vẫn tra được', async () => {
    const heavy = await account('lookup_heavy', 'teacher');
    for (let i = 0; i < 30; i++) {
      // MSSV không có: 404 vẫn tính một lượt — chính cách quét sẽ sinh ra những lượt này.
      await lookup(`ZZ${randomTag(10)}`, heavy).expect(404);
    }
    const blocked = await lookup(`ZZ${randomTag(10)}`, heavy).expect(429);
    expect(blocked.body.message).toMatch(/quá nhanh/);
    await lookup(known, teacherToken).expect(200);
  });
});
```

- [ ] **Step 4: Viết controller và nối module**

Create `apps/api/src/course/student.controller.ts`:

```ts
import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { STUDENT_MSSV_REGEX } from '../common/student-mssv';
import { StudentLookupLimiter } from './student-lookup.limiter';
import { StudentService, StudentView } from './student.service';

/**
 * Tra tên theo MSSV, để ô thêm tay hiện tên ngay khi gõ MSSV đã từng nhập ở lớp trước
 * (spec §2.6).
 *
 * CHỈ theo đúng một MSSV, và KHÔNG có route liệt kê: một giảng viên không có cách nào lấy
 * danh sách sinh viên của người khác. Giới hạn tốc độ là bắt buộc — thiếu nó thì quét dải MSSV
 * lấy tên là việc của vài phút.
 *
 * Định dạng sai là 400 và KHÔNG tốn lượt: chúng không chạm DB và không phải cách quét.
 */
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('teacher')
export class StudentController {
  constructor(
    private readonly students: StudentService,
    private readonly limiter: StudentLookupLimiter,
  ) {}

  @Get(':mssv')
  async lookup(@Param('mssv') mssv: string, @Req() req: Request): Promise<StudentView> {
    if (!STUDENT_MSSV_REGEX.test(mssv)) {
      throw new BadRequestException('MSSV phải gồm 4-20 chữ cái hoặc chữ số, không có dấu cách');
    }
    const verdict = this.limiter.consume(req.user!.sub);
    if (!verdict.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Tra cứu quá nhanh. Hãy thử lại sau ${Math.ceil(verdict.retryAfterMs / 1000)} giây.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const found = await this.students.findByMssv(mssv);
    if (!found) throw new NotFoundException('Chưa có sinh viên này trong hệ thống.');
    return found;
  }
}
```

Trong `apps/api/src/course/course.module.ts`: thêm `StudentController` vào `controllers`, `StudentLookupLimiter` vào `providers`.

- [ ] **Step 5: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/student-lookup.e2e-spec.ts` — Expected: PASS (6 test).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course apps/api/test/student-lookup.e2e-spec.ts
git commit -m "feat(master-data): GET /students/:mssv tra tên theo đúng một MSSV, giới hạn 30 lần/phút/giảng viên"
```

---

### Task 5: Danh sách lớp — nhập file, nhập tay, phạm vi học kỳ

**Files:**
- Modify: `apps/api/src/course/roster.service.ts`, `apps/api/src/course/course.types.ts`
- Modify: `apps/api/test/roster-import.e2e-spec.ts`, `apps/api/test/helpers/master-data.ts`

**Interfaces:**
- Consumes: `StudentService`, `ClassLabelService`.
- Produces:

```ts
// course.types.ts
export interface RenamedStudent { mssv: string; from: string; to: string }
export interface RosterImportResult { added; updated; unchanged; removed; missing: RosterEntry[]; renamed: RenamedStudent[] }
// master-data.ts (helper test, plan D2/D3 dùng lại)
export function ensureTestSemester(db: Queryable, term?: 1 | 2 | 3): Promise<string>;
```

Ngữ nghĩa các số đếm của `importForClass`:
- `added` — sinh viên mới vào **lớp này** (một dòng `enrollment` mới);
- `updated` — dòng `enrollment` đã có mà **có gì đó đổi**: giảng viên của lớp đổi, hoặc tên sinh viên bị file đổi;
- `unchanged` — dòng đã có và không đổi gì;
- `removed` / `missing` — như cũ; `missing[].name` lấy từ `student`;
- `renamed` — **mọi** sinh viên trong file bị đổi tên (kể cả em mới vào lớp này nhưng đã có tên khác ở lớp khác).

- [ ] **Step 1: Thêm helper học kỳ dùng chung**

Trong `apps/api/test/helpers/master-data.ts` thêm (cuối file):

```ts
const sharedSemesters = new Map<number, Promise<string>>();

/** Năm của các học kỳ MẶC ĐỊNH dùng chung — cố định, đầu vùng tên test (xem `freshTestYear`: không bao giờ cấp năm này). */
export const DEFAULT_TEST_YEAR = TEST_YEAR_FLOOR;

/**
 * Học kỳ MẶC ĐỊNH dùng chung: (2200, term). Tạo một lần (get-or-create) rồi dùng lại giữa MỌI file test và MỌI lần chạy.
 *
 * Cần cho mọi test về PHẠM VI THEO HỌC KỲ (hai lớp "cùng học kỳ" phải trỏ cùng một hàng) và cho `seedClass` mặc định
 * (plan D3). CỐ ĐỊNH chứ không sinh mới mỗi file: một học kỳ đã có lớp thì không xoá được (FK RESTRICT) nên
 * `purgeTestSemesters` bỏ qua nó, và nếu mỗi file test tạo một cái thì cả bộ e2e ăn dần vùng năm 2200–2999 — hết chỗ
 * sau vài lần chạy.
 *
 * `term` 1/2/3 cho ba kỳ không chồng ngày của năm 2200 (`semesterDates`).
 */
export function ensureTestSemester(db: Queryable, term: 1 | 2 | 3 = 1): Promise<string> {
  const cached = sharedSemesters.get(term);
  if (cached) return cached;
  const created = (async () => {
    const { startDate, endDate } = semesterDates(DEFAULT_TEST_YEAR, term);
    await db.query(
      `INSERT INTO examcollect.semester (academic_year_start, term, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (academic_year_start, term) DO NOTHING`,
      [DEFAULT_TEST_YEAR, term, startDate, endDate],
    );
    const [row] = await db.query(
      `SELECT id FROM examcollect.semester WHERE academic_year_start = $1 AND term = $2`,
      [DEFAULT_TEST_YEAR, term],
    );
    return row.id as string;
  })();
  sharedSemesters.set(term, created);
  return created;
}
```

- [ ] **Step 2: Cập nhật `roster-import.e2e-spec.ts` theo luật mới (đỏ)**

Trong `apps/api/test/roster-import.e2e-spec.ts` (đã chuyển sang `seedClass` ở plan A):

1. Import `ensureTestSemester` từ `./helpers/master-data`, và trong `beforeAll` lấy `semesterId = await ensureTestSemester(dataSource)`; truyền `semesterId` vào **mọi** `seedClass` của file (`classId`, `siblingClassId`, và `freshClass()`). Lưu `siblingLabel = sibling.label` để dùng bên dưới.
2. Ca `'refuses a student who already belongs to another class of the course'` đổi tên thành `'… of the SEMESTER'`; khẳng định `expect(response.body.message).toContain(siblingLabel)` thay cho `toContain('Nhóm phụ')`.
3. Ca `'updates a name that changed and leaves the rest alone'`: giữ `toMatchObject({ added: 0, updated: 1, unchanged: 1 })` và thêm
   `expect(response.body.renamed).toEqual([{ mssv: changed, from: 'Nguyen Van I', to: 'Nguyễn Văn I' }]);`
4. Thêm các ca mới, trong `describe('Roster import (e2e)')` (T-STU-2/3/4):

```ts
  it('T-STU-3: file ghi tên khác tên đã lưu thì FILE THẮNG, và kết quả liệt kê ai bị đổi tên — kể cả ở lớp khác', async () => {
    const idA = await freshClass();
    const shared = mssv('q');
    await importRoster(idA, teacherToken, { students: [{ mssv: shared, name: 'Tên cũ ở lớp A' }] });

    // Lớp B ở KỲ KHÁC nên em nhập được vào đó (T-STU-4); file của B mang tên mới.
    const otherSemester = await ensureTestSemester(dataSource, 2);
    const klassB = await seedClass(dataSource, { teacherId: lecturerId, semesterId: otherSemester });
    const response = await importRoster(klassB.id, teacherToken, {
      students: [{ mssv: shared, name: 'Tên mới theo file' }],
    });

    expect(response.status).toBe(200);
    expect(response.body.renamed).toEqual([{ mssv: shared, from: 'Tên cũ ở lớp A', to: 'Tên mới theo file' }]);
    // Chỉ có MỘT tên: lớp A cũng đọc ra tên mới.
    expect(await readRoster(idA)).toContain(`${shared}|Tên mới theo file`);
  });

  it('T-STU-4: sinh viên học lại ở kỳ sau được nhập vào lớp của kỳ mới (Review Focus 5)', async () => {
    const shared = mssv('r');
    await importRoster(classId, teacherToken, { students: [{ mssv: shared, name: 'Học lại' }] });

    const nextSemester = await ensureTestSemester(dataSource, 3);
    const nextTerm = await seedClass(dataSource, { teacherId: lecturerId, semesterId: nextSemester });
    const response = await importRoster(nextTerm.id, teacherToken, {
      students: [{ mssv: shared, name: 'Học lại' }],
    });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ added: 1, updated: 0, unchanged: 0 });
    // Và ở kỳ cũ em vẫn còn nguyên.
    expect(await readRoster(classId)).toContain(`${shared}|Học lại`);
  });

  it('cùng kỳ thì vẫn bị chặn — cùng một sinh viên ở hai lớp một kỳ làm bài nộp định tuyến sai', async () => {
    const shared = mssv('s2');
    await importRoster(siblingClassId, teacherToken, { students: [{ mssv: shared, name: 'Cùng kỳ' }] });
    const response = await importRoster(classId, teacherToken, { students: [{ mssv: shared, name: 'Cùng kỳ' }] });
    expect(response.status).toBe(409);
  });

  it('lớp chưa có học kỳ (dữ liệu cũ chưa backfill) chỉ so với chính nó, không chặn nhầm', async () => {
    const legacy = await seedClass(dataSource, { teacherId: lecturerId }); // semester_id NULL
    const shared = mssv('s3');
    await importRoster(siblingClassId, teacherToken, { students: [{ mssv: shared, name: 'Ở lớp có kỳ' }] });
    const response = await importRoster(legacy.id, teacherToken, { students: [{ mssv: shared, name: 'Ở lớp có kỳ' }] });
    expect(response.status).toBe(200);
  });

  it('MSSV gõ khác hoa-thường là CÙNG MỘT sinh viên: không sinh thêm hàng student (Review Focus 2)', async () => {
    const person = mssv('s4');
    const nextSemester = await ensureTestSemester(dataSource, 2);
    const first = await freshClass();
    await importRoster(first, teacherToken, { students: [{ mssv: person, name: 'Một Người' }] });
    const other = await seedClass(dataSource, { teacherId: lecturerId, semesterId: nextSemester });
    await importRoster(other.id, teacherToken, { students: [{ mssv: person.toLowerCase(), name: 'Một Người' }] });

    const rows = await dataSource.query(`SELECT count(*)::int AS n FROM examcollect.student WHERE mssv = $1`, [person]);
    expect(rows[0].n).toBe(1);
  });
```

5. Trong `describe('adding and removing one student by hand')` thêm T-STU-2:

```ts
    it('T-STU-2: nhập tay MSSV đã có thì GIỮ tên đã lưu, không ghi đè bằng tên gõ (Review Focus 3)', async () => {
      const id = await freshClass();
      const known = mssv('s5');
      // Tên đã lưu từ một lớp trước, ở KỲ KHÁC (không bị chặn thành "ở lớp khác").
      const earlier = await seedClass(dataSource, { teacherId: lecturerId, semesterId: await ensureTestSemester(dataSource, 3) });
      await importRoster(earlier.id, teacherToken, { students: [{ mssv: known, name: 'Tên đã lưu đúng' }] });

      const response = await request(app.getHttpServer())
        .post(`/classes/${id}/roster/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ mssv: known, name: 'Tên gõ lệch' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ mssv: known, name: 'Tên đã lưu đúng' });
      expect(await readRoster(id)).toContain(`${known}|Tên đã lưu đúng`);
      const [stored] = await dataSource.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [known]);
      expect(stored.full_name).toBe('Tên đã lưu đúng');
    });

    it('MSSV chưa có thì tạo sinh viên bằng tên gõ', async () => {
      const id = await freshClass();
      const fresh = mssv('s6');
      const response = await request(app.getHttpServer())
        .post(`/classes/${id}/roster/students`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({ mssv: fresh, name: 'Sinh viên mới tinh' });
      expect(response.status).toBe(201);
      const [stored] = await dataSource.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [fresh]);
      expect(stored.full_name).toBe('Sinh viên mới tinh');
    });
```

Cũng đổi mô tả `'refuses a student who already sits in a sibling class'` sang "… of the semester" (nội dung không đổi: `siblingClassId` và `classId` cùng `semesterId`).

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/roster-import.e2e-spec.ts`
Expected: FAIL ở các ca mới (và `renamed` chưa có).

- [ ] **Step 4: Viết lại `RosterService`**

Thay `apps/api/src/course/course.types.ts` phần `RosterImportResult`:

```ts
import type { RenamedStudent } from './student.service';

// Một khai báo duy nhất, ở `student.service.ts`; re-export để người dùng kiểu này không phải biết nó nằm đâu.
export type { RenamedStudent };

/**
 * What an import actually did, counted server-side.
 *
 * The browser showed a preview before the user confirmed; these numbers are
 * the database's answer, which is the one worth reporting back. `missing` is
 * present whether or not `removeMissing` was set — naming who is on the list
 * but not in the file is the whole point of reporting it.
 *
 * `updated` đếm dòng danh sách ĐÃ CÓ mà có gì đó đổi (giảng viên của lớp, hoặc tên sinh
 * viên bị file đổi); `renamed` liệt kê MỌI sinh viên trong file bị đổi tên — kể cả em vừa vào
 * lớp này nhưng đã có tên khác ở lớp khác. Chỉ có MỘT tên cho một sinh viên, nên đổi tên ở đây
 * áp dụng cho mọi lớp (spec §2.6, §12 mục 3): giảng viên phải thấy ai bị đổi.
 */
export interface RosterImportResult {
  added: number;
  updated: number;
  unchanged: number;
  removed: number;
  missing: RosterEntry[];
  renamed: RenamedStudent[];
}
```

Replace `apps/api/src/course/roster.service.ts` toàn bộ bằng:

```ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In } from 'typeorm';
import { ClassEntity } from './entities/class.entity';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { ImportRosterDto, RosterStudentDto } from './dto/roster.dto';
import { RosterEntry, RosterImportResult } from './course.types';
import { ClassLabelService } from './class-label.service';
import { StudentService } from './student.service';

/**
 * The class list — the Excel the training office issues, or a name typed in
 * one at a time.
 *
 * It writes `enrollment`, the table `agent:join` authenticates against, which is
 * why an import is a deliberate act with an explicit removal step rather than a
 * mirror of whatever file was dragged in last. Names go to `student`, not to
 * `enrollment` (spec §2.6): one name per student, however many classes they sit in.
 *
 * Ownership is decided before anything here is called: the controller resolves the
 * class through `ClassService`, which is the single place "is this class yours" is
 * answered (`class.teacher_id`).
 */
@Injectable()
export class RosterService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly students: StudentService,
    private readonly labels: ClassLabelService,
  ) {}

  /**
   * `COALESCE(student, enrollment)`: tên trong `student` thắng; cột cũ chỉ cứu dòng chưa
   * backfill, để một dòng như vậy không biến mất khỏi danh sách. Cột cũ bị gỡ ở plan H.
   */
  async listForClass(classId: string): Promise<RosterEntry[]> {
    return this.dataSource.query(
      `SELECT e.student_mssv::text AS mssv,
              COALESCE(s.full_name, e.student_name, '') AS name
         FROM examcollect.enrollment e
         LEFT JOIN examcollect.student s ON s.mssv = e.student_mssv
        WHERE e.home_class_id = $1
        ORDER BY e.student_mssv`,
      [classId],
    );
  }

  /**
   * Applies a parsed file to one class, in one transaction.
   *
   * The whole file lands or none of it does — a partially applied roster is the failure
   * mode this phase exists to remove. The diff is recomputed here from the database
   * rather than trusted from the client: the browser shows the user a preview, but what
   * a preview said five minutes ago is not authority over what is written now.
   */
  async importForClass(klass: ClassEntity, dto: ImportRosterDto): Promise<RosterImportResult> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);

      // Phạm vi là HỌC KỲ của lớp (spec §2.3 mục 3): "em đã ở một lớp khác CÙNG KỲ" là ca đáng
      // chặn. Khoá ghi trong suốt giao dịch để hai lượt import song song không cùng nhận một sinh viên.
      const existing = await this.siblingEnrollments(manager, klass);
      const byMssv = new Map(existing.map((row) => [row.studentMssv.toLowerCase(), row]));

      await this.assertNoCrossClassMove(klass, dto.students, byMssv);

      // Tên: FILE THẮNG. Làm trước enrollment để một lỗi ở đây không để lại nửa danh sách.
      const { renamed } = await this.students.upsertFromRoster(manager, dto.students);
      const renamedKeys = new Set(renamed.map((row) => row.mssv.toLowerCase()));

      let added = 0;
      let updated = 0;
      let unchanged = 0;

      for (const student of dto.students) {
        const key = student.mssv.toLowerCase();
        const current = byMssv.get(key);

        if (!current) {
          await repo.insert({
            studentMssv: student.mssv,
            homeClassId: klass.id,
            // Taken from the class, never from the file: the file has no column for it, and
            // inventing one would be the guessing this project forbids.
            homeTeacherId: klass.teacherId,
          });
          added++;
          continue;
        }

        // The class carries the lecturer; the file carries the name. Either drifting is a real
        // change worth reporting, and neither should be left stale on a row a submission is
        // routed through.
        if (current.homeTeacherId !== klass.teacherId) {
          await repo.update(current.id, { homeTeacherId: klass.teacherId });
          updated++;
        } else if (renamedKeys.has(key)) {
          updated++;
        } else {
          unchanged++;
        }
      }

      const inFile = new Set(dto.students.map((s) => s.mssv.toLowerCase()));
      const missing = existing.filter(
        (row) => row.homeClassId === klass.id && !inFile.has(row.studentMssv.toLowerCase()),
      );
      const missingNames = await this.students.findNames(
        manager,
        missing.map((row) => row.studentMssv),
      );

      let removed = 0;
      if (dto.removeMissing && missing.length > 0) {
        await repo.delete(missing.map((row) => row.id));
        removed = missing.length;
      }

      return {
        added,
        updated,
        unchanged,
        removed,
        // Always reported, even when they were just deleted, so the caller can name who left
        // rather than only counting them. Chỉ enrollment bị xoá — `student` không bao giờ.
        missing: missing.map((row) => ({
          mssv: row.studentMssv,
          name: missingNames.get(row.studentMssv.toLowerCase()) ?? row.studentName ?? '',
        })),
        renamed,
      };
    });
  }

  /**
   * Adds one student by hand.
   *
   * The bulk import is for the file the training office sends; this is for the student who is
   * genuinely on the class list and simply not in it — a late transfer, a correction. Same rules
   * as a row of the file: the MSSV is validated identically, and a student already sitting in a
   * sibling class of the same semester is refused rather than moved.
   *
   * TÊN: MSSV đã có thì tên được GIỮ — người gõ không sửa được tên qua ô này (spec §2.6), và
   * phản hồi trả tên đang lưu để giao diện hiện đúng thứ đã ghi. MSSV chưa có thì tạo `student`
   * bằng tên gõ.
   *
   * Not audited, and that is deliberate. The access-request path writes an `audit_log` entry
   * because a machine-enforced refusal is being opened by a human at exam time; editing your own
   * class list beforehand is ordinary preparation, and auditing it would bury the entries that
   * matter under the ones that do not.
   */
  async addStudent(klass: ClassEntity, student: RosterStudentDto): Promise<RosterEntry> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(EnrollmentEntity);
      const existing = await this.siblingEnrollments(manager, klass);
      const byMssv = new Map(existing.map((row) => [row.studentMssv.toLowerCase(), row]));

      await this.assertNoCrossClassMove(klass, [student], byMssv);

      const name = await this.students.ensureKeepingStoredName(manager, student.mssv, student.name);

      const current = byMssv.get(student.mssv.toLowerCase());
      if (current) {
        // Already in THIS class. The caller's intent is "this student should be on the list", and
        // they already are — only the routing teacher can need fixing.
        if (current.homeTeacherId !== klass.teacherId) {
          await repo.update(current.id, { homeTeacherId: klass.teacherId });
        }
      } else {
        await repo.insert({
          studentMssv: student.mssv,
          homeClassId: klass.id,
          homeTeacherId: klass.teacherId,
        });
      }

      return { mssv: student.mssv, name };
    });
  }

  /**
   * Removes one student from this class's list.
   *
   * The counterpart to adding by hand: a lecturer who typed the wrong MSSV needs an undo that is
   * not "re-import the whole file with a tick". Scoped to the class, so a valid MSSV from a sibling
   * class reads as not-found rather than deleting someone else's student.
   */
  async removeStudent(klass: ClassEntity, studentMssv: string): Promise<void> {
    const repo = this.dataSource.getRepository(EnrollmentEntity);
    const enrollment = await repo.findOne({
      where: { studentMssv, homeClassId: klass.id },
    });
    if (!enrollment) {
      throw new NotFoundException('Sinh viên này không có trong danh sách lớp.');
    }
    await repo.remove(enrollment);
  }

  /**
   * Mọi enrollment của các lớp CÙNG HỌC KỲ với lớp này, khoá ghi trong giao dịch.
   *
   * Từng là các lớp "cùng môn" (`class.course_name` bằng nhau). Môn là hằng số nên tập đó là MỌI lớp
   * mọi kỳ — một sinh viên học lại ở kỳ sau bị chặn oan. Phạm vi đúng là học kỳ (spec §2.3 mục 3).
   *
   * Lớp chưa có học kỳ (dữ liệu cũ chưa backfill) chỉ so với chính nó: không có căn cứ nào để gọi lớp
   * khác là "cùng kỳ", và chặn nhầm tệ hơn bỏ sót ở một trạng thái chuyển tiếp ngắn.
   */
  private async siblingEnrollments(
    manager: EntityManager,
    klass: ClassEntity,
  ): Promise<EnrollmentEntity[]> {
    const classIds: string[] = klass.semesterId
      ? (
          await manager.query(`SELECT id FROM examcollect.class WHERE semester_id = $1`, [klass.semesterId])
        ).map((row: { id: string }) => row.id)
      : [klass.id];
    return manager.getRepository(EnrollmentEntity).find({
      where: { homeClassId: In(classIds) },
      lock: { mode: 'pessimistic_write' },
    });
  }

  /**
   * A student in the file who is already enrolled in the same semester through a DIFFERENT class
   * stops the import.
   *
   * Silently moving them would change where their submission is routed — home_class_id and
   * home_teacher_id are copied onto every submission they make — and it would happen as a side effect
   * of a file someone dragged in. A transfer between classes is a decision; the path is to remove them
   * from the old class's roster first, which takes the explicit tick.
   */
  private async assertNoCrossClassMove(
    klass: ClassEntity,
    students: RosterStudentDto[],
    byMssv: Map<string, EnrollmentEntity>,
  ): Promise<void> {
    const clashes = students
      .map((student) => byMssv.get(student.mssv.toLowerCase()))
      .filter(
        (row): row is EnrollmentEntity => row !== undefined && row.homeClassId !== klass.id,
      );

    if (clashes.length === 0) {
      return;
    }

    const names = await this.labels.labelsFor(Array.from(new Set(clashes.map((row) => row.homeClassId))));

    const detail = clashes
      .map((row) => `${row.studentMssv} (đang ở lớp "${names.get(row.homeClassId) ?? '?'}")`)
      .join(', ');

    throw new ConflictException(
      `Những sinh viên sau đã thuộc một lớp khác của cùng học kỳ: ${detail}. ` +
        'Hãy xoá họ khỏi danh sách lớp cũ trước, rồi import lại — chuyển lớp ' +
        'sẽ đổi nơi bài làm của họ được gửi về.',
    );
  }
}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/roster-import.e2e-spec.ts`
Expected: PASS (~24 test: 17 cũ + các ca mới). Ca "lớp chưa có học kỳ" xanh chứng minh nhánh `klass.semesterId == null`.

Rồi chạy các suite khác đụng roster/enrollment: `npx jest --config ./test/jest-e2e.json test/class-scoped-enrollment.e2e-spec.ts test/session-roster-freeze.e2e-spec.ts test/teacher-submissions.e2e-spec.ts`.

Expected: xanh. Nếu `class-scoped-enrollment` đỏ ở ca cuối ("thêm tay lấy lớp gốc trong ĐÚNG MÔN"), kiểm rằng hai lớp seed trong đó dùng **đúng một MSSV với đúng một tên** (`'Sinh vien lop B'`) — ca này seed cùng MSSV vào hai lớp khác môn; từ khi có `student`, hai lần `seedEnrollment` với hai tên khác nhau sẽ để người ghi sau thắng.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/course apps/api/test/roster-import.e2e-spec.ts apps/api/test/helpers/master-data.ts
git commit -m "feat(master-data): danh sách lớp ghi tên vào student, phạm vi chặn theo học kỳ, liệt kê ai bị đổi tên"
```

---

### Task 6: Luồng xin phép thi bù không ghi đè tên (T-STU-5)

**Files:**
- Modify: `apps/api/src/course/enrollment.service.ts`
- Modify: `apps/api/src/exam-session/access-request.gateway.ts`
- Modify: `apps/api/test/access-request.e2e-spec.ts`

**Interfaces:**
- Consumes: `StudentService.ensureKeepingStoredName`.
- Produces: `EnrollmentService.addManually(input): Promise<{ enrollment: EnrollmentEntity; studentName: string }>` — **trả tên đã giải quyết** (tên đang lưu), để người gọi dùng đúng tên đó cho ảnh chốt và audit.

- [ ] **Step 1: Cập nhật test (đỏ)**

Trong `apps/api/test/access-request.e2e-spec.ts` (chuyển sang helper ở plan A):

1. Dòng ~206: `SELECT student_name, home_class_id, home_teacher_id FROM examcollect.enrollment …` đổi thành đọc tên từ `student`:
```ts
    const [enrollment] = await dataSource.query(
      `SELECT s.full_name AS student_name, e.home_class_id, e.home_teacher_id
         FROM examcollect.enrollment e
         JOIN examcollect.student s ON s.mssv = e.student_mssv
        WHERE e.student_mssv = $1 AND e.home_class_id = $2`,
      [STRANGER_MSSV, classId],
    );
```
(giữ `expect(enrollment.student_name).toBe(STRANGER_NAME)`: MSSV này **chưa có** `student`, nên tên gõ được dùng.)

2. Thêm một hàm trợ giúp cục bộ (cạnh `ack`, `once`, `open`, `connected` đã có trong file) chạy luồng "em xin phép → giảng viên duyệt → em vào lại" cho một MSSV bất kỳ, và trả tên mà agent nhận được lúc vào lại:

```ts
  /** Em `mssv` xin phép với tên tự gõ `typedName`, giảng viên duyệt, em vào lại. Trả tên trong ack lúc vào lại. */
  async function requestAndApprove(mssv: string, typedName: string): Promise<{ ackName: string }> {
    const teacher = open({ cookie: accessCookie });
    await connected(teacher);
    teacher.emit('teacher:subscribe', { examSessionId: sessionId });
    await new Promise((r) => setTimeout(r, 300));

    const agent = open();
    await connected(agent);
    const pending = once<{ requestId: string }>(teacher, 'lobby:access_request');
    const requested = await ack<{ ok: boolean }>(agent, 'agent:request-access', {
      sessionCode,
      studentId: mssv,
      fullName: typedName,
      reason: REASON,
    });
    expect(requested.ok).toBe(true);
    const seen = await pending;

    const granted = once<{ examSessionId: string }>(agent, 'agent:access-granted');
    const resolved = await ack<{ ok: boolean }>(teacher, 'teacher:resolve-access-request', {
      requestId: seen.requestId,
      approve: true,
      homeClassId: classId,
    });
    expect(resolved.ok).toBe(true);
    await granted;

    const rejoined = open();
    await connected(rejoined);
    const ackBody = await new Promise<{ studentName: string }>((resolve, reject) => {
      rejoined.on('agent:join:ack', resolve);
      rejoined.on('agent:join:error', (e) => reject(new Error(JSON.stringify(e))));
      rejoined.emit('agent:join', { fullName: 'bỏ qua', studentId: mssv, sessionCode });
    });
    return { ackName: ackBody.studentName };
  }
```

3. Thêm hai ca (T-STU-5 và ca đối xứng), cạnh ca `'lets an approved student in…'`:

```ts
  it('T-STU-5: MSSV đã có thì duyệt KHÔNG ghi đè tên đã lưu bằng tên em tự gõ (Review Focus 3)', async () => {
    const stored = `AR${randomTag(8)}`;
    await dataSource.query(
      `INSERT INTO examcollect.student (mssv, full_name) VALUES ($1, 'Tên chuẩn đã lưu')`,
      [stored],
    );

    const { ackName } = await requestAndApprove(stored, 'Em tự gõ tên khác hẳn');

    // Em vào bằng tên ĐÃ LƯU: ack, ảnh chốt và `student` đều mang tên đó.
    expect(ackName).toBe('Tên chuẩn đã lưu');
    const [row] = await dataSource.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [stored]);
    expect(row.full_name).toBe('Tên chuẩn đã lưu');
    const [snap] = await dataSource.query(
      `SELECT student_name FROM examcollect.session_roster WHERE exam_session_id = $1 AND student_mssv = $2`,
      [sessionId, stored],
    );
    expect(snap.student_name).toBe('Tên chuẩn đã lưu');
    // Audit giữ cả hai: đã duyệt vào bằng tên nào, và em đã gõ gì.
    const [entry] = await dataSource.query(
      `SELECT new_value FROM examcollect.audit_log
        WHERE target_id = $1 AND action = 'exam_session.access_granted' AND new_value->>'studentMssv' = $2`,
      [sessionId, stored],
    );
    expect(entry.new_value).toMatchObject({
      studentName: 'Tên chuẩn đã lưu',
      typedName: 'Em tự gõ tên khác hẳn',
    });
  });

  it('MSSV chưa có thì tạo sinh viên bằng tên em gõ, và audit không thêm typedName khi hai tên giống nhau', async () => {
    const fresh = `AR${randomTag(8)}`;
    const { ackName } = await requestAndApprove(fresh, 'Em Mới Hoàn Toàn');

    expect(ackName).toBe('Em Mới Hoàn Toàn');
    const [row] = await dataSource.query(`SELECT full_name FROM examcollect.student WHERE mssv = $1`, [fresh]);
    expect(row.full_name).toBe('Em Mới Hoàn Toàn');
    const [entry] = await dataSource.query(
      `SELECT new_value FROM examcollect.audit_log
        WHERE target_id = $1 AND action = 'exam_session.access_granted' AND new_value->>'studentMssv' = $2`,
      [sessionId, fresh],
    );
    expect(entry.new_value).not.toHaveProperty('typedName');
  });
```

Thêm `import { randomTag } from './helpers/master-data';` ở đầu file.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `npx jest --config ./test/jest-e2e.json test/access-request.e2e-spec.ts`
Expected: FAIL — ca T-STU-5 (tên em gõ đang ghi đè) và ca đầu (cột cũ không còn được ghi).

- [ ] **Step 3: Viết lại `EnrollmentService.addManually`**

Thay phần import đầu và constructor của `apps/api/src/course/enrollment.service.ts`, và phương thức `addManually`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { EnrollmentEntity } from './entities/enrollment.entity';
import { StudentService } from './student.service';
```

```ts
  constructor(
    @InjectRepository(EnrollmentEntity)
    private readonly enrollments: Repository<EnrollmentEntity>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly students: StudentService,
  ) {}
```

```ts
  /**
   * Adds a student the roster did not have, on an invigilator's decision.
   *
   * Approving an access request has to write this row rather than grant a one-off pass: a
   * submission is NOT NULL on home_class_id and home_teacher_id, and inventing a routing at
   * collection time is exactly the guessing this project forbids. The invigilator names the
   * class, so nothing is inferred.
   *
   * TÊN (spec §2.6): MSSV đã có trong `student` → dùng tên ĐÃ LƯU, KHÔNG ghi đè bằng tên em tự gõ;
   * chưa có → tạo `student` bằng tên gõ. Trả về tên đang lưu, để người gọi dùng đúng tên ấy cho ảnh
   * chốt và audit thay vì tên gõ.
   *
   * The roster gaining a person is not silent — the caller writes an audit_log entry naming who
   * approved it and why.
   *
   * Idempotent against uq_enrollment_class_student: two invigilators approving the same student
   * produce one row, not a unique violation.
   */
  async addManually(input: {
    studentMssv: string;
    studentName: string;
    homeClassId: string;
    homeTeacherId: string;
  }): Promise<{ enrollment: EnrollmentEntity; studentName: string }> {
    const studentName = await this.dataSource.transaction(async (manager) => {
      const name = await this.students.ensureKeepingStoredName(manager, input.studentMssv, input.studentName);
      await manager
        .getRepository(EnrollmentEntity)
        .createQueryBuilder()
        .insert()
        .values({
          studentMssv: input.studentMssv,
          homeClassId: input.homeClassId,
          homeTeacherId: input.homeTeacherId,
        })
        .orIgnore()
        .execute();
      return name;
    });

    const saved = await this.findForClass(input.homeClassId, input.studentMssv);
    if (!saved) {
      throw new Error(`enrollment for ${input.studentMssv} vanished immediately after insert`);
    }
    return { enrollment: saved, studentName };
  }
```

Giữ nguyên `findForClass`.

- [ ] **Step 4: Cập nhật `AccessRequestGateway`**

Trong `apps/api/src/exam-session/access-request.gateway.ts`, khối từ `await this.enrollments.addManually({…})` tới `auditLog.recordUserAction`:

```ts
    const { studentName } = await this.enrollments.addManually({
      studentMssv: request.studentId,
      studentName: request.fullName,
      homeClassId: homeClass.id,
      homeTeacherId: homeClass.teacherId,
    });

    // Vào ảnh chốt luôn, không chỉ vào enrollment (CLAUDE.md §7.1.1). Tên là tên ĐANG LƯU, không phải
    // tên em tự gõ — một sinh viên chỉ có một tên (spec §2.6).
    await this.sessionRoster.ensureManual(session.id, {
      mssv: request.studentId,
      name: studentName,
      homeClassId: homeClass.id,
      homeTeacherId: homeClass.teacherId,
    });

    // Written before the student is told, so a trace can never be missing for access that was
    // actually granted. `typedName` chỉ có khi em gõ khác tên đã lưu: vết của việc "em đã khai gì".
    await this.auditLog.recordUserAction({
      actorId: actor.sub,
      action: 'exam_session.access_granted',
      targetType: 'exam_session',
      targetId: session.id,
      newValue: {
        studentMssv: request.studentId,
        studentName,
        ...(studentName !== request.fullName ? { typedName: request.fullName } : {}),
        reason: request.reason,
        homeClassId: homeClass.id,
      },
    });
```

(Giữ nguyên phần còn lại của hàm.)

Bộ mô tả audit của plan B đã đọc `newValue.studentName`, `studentMssv`, `reason` — `typedName` là trường thêm, không làm gãy câu mô tả.

- [ ] **Step 5: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/access-request.e2e-spec.ts` — Expected: PASS (ca cũ + T-STU-5).
Rồi: `pnpm exec tsc --noEmit` — Expected: sạch.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src apps/api/test/access-request.e2e-spec.ts
git commit -m "feat(master-data): duyệt thi bù giữ tên đã lưu, ghi tên em gõ vào audit (T-STU-5)"
```

---

### Task 7: Gỡ nửa ghi cột cũ của `seedEnrollment`; chạy cả bộ; sinh lại client

**Files:**
- Modify: `apps/api/test/helpers/seed.ts`
- Modify: `packages/shared/src/api/schema.d.ts`

**Interfaces:**
- Produces: `seedEnrollment` ở hình dạng ĐÍCH: ghi `student` (upsert) và `enrollment` KHÔNG kèm `student_name`. Từ đây trở đi cột cũ chỉ được ghi bởi cờ `legacyName` (test giai đoạn chuyển tiếp) — nên plan H bỏ cột đi mà **không phải đụng seed**.

- [ ] **Step 1: Bỏ nửa ghi cột cũ**

Mọi nơi đọc tên đã chuyển sang `student` ở Task 3, nên nửa "ghi kép" thêm ở Task 3 Step 2 hết tác dụng. Trong `apps/api/test/helpers/seed.ts`, ở hàm `seedEnrollment`, thay câu `INSERT INTO examcollect.enrollment` **của nhánh mặc định** (nhánh sau `if (o.legacyName !== undefined)`) bằng bản không có `student_name`, và xoá dòng chú thích "TẠM ghi kép…":

```ts
  await db.query(
    `INSERT INTO examcollect.enrollment (student_mssv, home_class_id, home_teacher_id)
     VALUES ($1, $2, $3)`,
    [o.mssv, o.classId, o.teacherId],
  );
```

Nhánh `legacyName` giữ nguyên. Test `student-name-readers` vẫn "đầu độc" cột cũ bằng `UPDATE … student_name = 'TÊN CŨ SAI'` trong `beforeAll` — **giữ nó**: sau bước này cột cũ của lớp đó đã NULL, và NULL cho phép một nơi đọc quên chuyển ra chuỗi rỗng chứ không ra sai; một chuỗi sai rõ ràng mới làm test đỏ.

- [ ] **Step 2: Chạy cả bộ e2e và unit, so với baseline**

```powershell
cd apps/api
pnpm exec tsc --noEmit
pnpm test 2>&1 | Out-File C:/tmp/unit-after-d1.txt
Select-String C:/tmp/unit-after-d1.txt -Pattern '^Tests:|^Test Suites:'
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest' } | Select-Object ProcessId, CommandLine
npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e-after-d1.json
node scripts/e2e-summary.cjs C:/tmp/e2e-after-d1.json | Out-File -Encoding utf8 C:/tmp/after-d1.tsv
$base = Get-Content ../../docs/superpowers/plans/md-restore-baseline.tsv | Where-Object { $_ -notmatch '^#' -and $_ -notmatch '^TOTAL' }
$after = Get-Content C:/tmp/after-d1.tsv | Where-Object { $_ -notmatch '^TOTAL' }
Compare-Object $base $after
```

Expected: `Compare-Object` chỉ thấy (a) các suite **mới** của plan A–D1 (`=>`), (b) các suite D1 đổi số test: `roster-import` (tăng, vì có ca mới) và `access-request` (tăng 1). **Không** dòng `<=` nào cho suite khác, và không `failed > 0`. Nếu một suite cũ đỏ vì "người ghi sau thắng" (một MSSV hai tên), đổi test sang hai MSSV khác nhau.

- [ ] **Step 3: Sinh lại client OpenAPI** *(hoãn được tới plan G1 Task 1 — xem roadmap, mục "Sinh lại client")*

Làm đúng Task 3 của plan B. Diff phải thêm `GET /students/{mssv}` và đổi `RosterImportResult`/phản hồi roster (nếu plugin sinh được). Hunk không liên quan ⇒ tách commit riêng như plan B.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test packages/shared/src/api/schema.d.ts
git commit -m "test(e2e): seedEnrollment chỉ ghi student (tên một chỗ); sinh lại client OpenAPI cho /students"
```

---

## Tự kiểm lại plan so với spec

- §2.6 (tên một chỗ, sáu nơi đọc/ghi chuyển sang `student`, nhập tay khoá tên, file thắng + liệt kê đổi tên, luồng xin phép không ghi đè, `GET /students/:mssv` + giới hạn tốc độ, không route liệt kê): Task 2–6. **Sáu file:** `attendance.service` (Task 3), `session-roster.service` (Task 3), `roster.service` (Task 5), `enrollment.service` (Task 6), và hai nơi SQL thô `recollect.service` + `submission-overview.service` (Task 3). `exam-session.gateway` không đổi (đọc ảnh chốt) — đúng như spec đã ghi.
- §2.3 mục 3 (phạm vi "cùng học kỳ"): Task 5 (`siblingEnrollments`, `assertNoCrossClassMove`), T-STU-4. Hai phần khác của §2.3 (không đổi `semester_id` khi có phiên — đã ở DB từ plan C; đổi giảng viên của lớp cập nhật `home_teacher_id`) thuộc plan D2 (`ClassService`).
- §13 mục 3 (mức giới hạn tốc độ): **30 lần/phút/giảng viên, trong bộ nhớ** (Global Constraints, Task 4). Mục 4 (`addManually` với luật "một sinh viên một lớp một kỳ"): `EnrollmentService.addManually` **không** áp luật này (nó dùng `orIgnore` trên `(lớp, MSSV)`, không có kiểm chéo lớp) — không đổi, chỉ đổi chính sách tên. Đường nhập danh sách (`RosterService`) mới là nơi luật chéo lớp sống.
- §11: T-STU-1 (Task 4), T-STU-2 (Task 5), T-STU-3 (Task 5), T-STU-4 (Task 5), T-STU-5 (Task 6), T-RW-1 và T-RW-2 (Task 3), T-GR-3 (agent join + thi bù: suite `agent-join`, `access-request`, `class-scoped-enrollment` chạy lại nguyên vẹn ở Task 5 Step 5 và Task 7 Step 3).
- Không thuộc plan này: nhãn lớp ở các chỗ đọc `class.name` (plan D2), phòng/học kỳ trên phiên (plan D3), import (plan E).
- Thứ tự giữ mọi commit xanh: Task 3 ghi kép `seedEnrollment` (student + cột cũ) **trước** khi chuyển các nơi đọc; Task 7 mới gỡ nửa cột cũ. Không còn `it.skip` hay SQL thô dựng `enrollment` ngoài `seed.ts`.
- Kiểu nhất quán: `StudentService.findNames(db, mssvs): Map<lowercase mssv, name>` dùng ở `SessionRosterService`, `RosterService`; `RenamedStudent` khai MỘT lần ở `student.service.ts` và `course.types.ts` chỉ re-export.
