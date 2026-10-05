# Plan A — Gom seed e2e vào một helper (chưa đổi schema) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa mọi chỗ e2e dựng lớp, enrollment, phiên thi bằng `INSERT` SQL thô và mọi thân `POST /exam-sessions` về một file helper duy nhất, để các plan sau (đổi schema) chỉ sửa helper chứ không sửa 39 bộ test. **Không đổi hành vi nào của hệ thống.**

**Architecture:** Thêm `apps/api/test/helpers/seed.ts` với bốn hàm (`seedClass`, `seedEnrollment`, `seedExamSession`, `sessionBody`) sinh đúng câu SQL/thân request mà các test đang tự viết. Chuyển dần 39 file sang helper theo bốn đợt; một **bài kiểm tra ratchet** (`src/common/e2e-seed-hygiene.spec.ts`) giữ cho mọi commit đều xanh: danh sách "file còn được phép dùng SQL thô" chỉ được co lại, và mục nào đã hết vi phạm thì bắt buộc bị xoá khỏi danh sách.

**Tech Stack:** NestJS 10, TypeORM 0.3, Jest 29 (unit: `apps/api/src/**/*.spec.ts`; e2e: `apps/api/test/*.e2e-spec.ts`), Postgres 16 local (docker, cổng 5442), `supertest`.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §10 bước 1, §13 mục 13, T-GR-1.

## Global Constraints

- **Không đổi hành vi.** Mỗi bộ e2e phải cho **cùng số test pass** trước và sau (so từng file, không chỉ tổng). Spec §10 bước 1: "e2e xanh trước và sau".
- **Kết luận "xong" chỉ dựa trên chạy trọn bộ e2e**, không dựa vào `tsc`: seed là SQL thô nên hỏng lúc chạy, không lúc biên dịch (spec §10 bước 1).
- E2E chỉ chạy trên hạ tầng local (`.env.test`: Postgres `localhost:5442`, Redis `6390`, MinIO `9010`); `test/setup-env.ts` từ chối chạy nếu trỏ ra ngoài. **Không** đặt `E2E_ALLOW_REMOTE_INFRA`.
- Chạy cả bộ bằng `npx jest --config ./test/jest-e2e.json --runInBand` từ `apps/api`. `pnpm test:e2e -- --runInBand` KHÔNG hoạt động (pnpm biến cờ thành pattern tên test). Ghi kết quả ra file rồi đọc, đừng tin exit code sau một pipe.
- Không sửa file source khi bộ e2e đang chạy (`ts-jest` biên dịch từng suite lúc đó).
- Trước mỗi lần chạy cả bộ: tắt mọi tiến trình `jest`/`nest` mồ côi (chúng ăn job BullMQ từ Redis và làm hỏng kết quả).
- Dùng `python3`, **không** `python`, nếu cần script.
- Mỗi helper nhận `Queryable` (`{ query(sql, params) }`) chứ không import TypeORM, như `releaseTeacherSessions` trong `session-window.ts`.
- Từ vựng của helper dùng **ngôn ngữ của schema đích** (lớp = `code` + `groupName`, nhãn = `code – groupName`) dù hôm nay chúng được ghi vào cột `class.name`. Đó là điều làm plan D chỉ phải sửa một file.

## Review Focus

Những điều spec không nói nhưng dễ cắn nhất khi chuyển hàng loạt seed:

1. **Test xanh vì sai lý do**: một test chuyển sang helper vẫn pass nhưng không còn dựng đúng tình huống (vd lớp "môn khác" bị helper điền môn mặc định). → mọi file chuyển xong phải **giữ nguyên `courseName`, tên phòng, học kỳ** nó đang dùng, và số test pass phải khớp baseline (Task 0 ghi, mỗi đợt so lại).
2. **Mã lớp trùng giữa các lần chạy**: e2e không dọn dữ liệu, khoá duy nhất hôm nay là `(teacher_id, course_name, name)` và sau plan D sẽ là `(semester, mã, nhóm)`. → mã tự sinh phải chứa thời gian + bộ đếm, chỉ gồm chữ HOA và số, dài 3–30 ký tự (khớp `ck` của `administrative_class.code` ở plan C) — test ở Task 1.
3. **Phiên thi bị gạt khỏi quy tắc giờ**: `sessionBody` mặc định khung giờ `concurrentLiveWindow()` (chỉ an toàn cho các giảng viên khác nhau). → helper phải **từ chối** khi chỉ truyền một đầu của khung giờ (không âm thầm ghép đầu kia từ mặc định) — test ở Task 1.
4. **Ratchet bị lách**: ai đó thêm file mới vào allow-list để qua mặt guard. → guard cũng bắt "mục dư" (đã sạch mà vẫn nằm trong danh sách) và danh sách rule 2 có giá trị cuối cùng cố định ba file — test ở Task 2.
5. **Đổi tên nhãn lớp làm gãy khẳng định**: chỉ `attendance.e2e-spec.ts` khẳng định tên lớp (`homeClassName`). → khẳng định phải đọc `klass.label` từ helper chứ không còn chuỗi cứng — Task 5.

---

## File Structure

| File | Việc |
|---|---|
| `apps/api/test/helpers/seed.ts` | **Mới.** `Queryable`, `classLabel`, `seedClass`, `seedEnrollment`, `seedExamSession`, `sessionBody`. Nơi DUY NHẤT còn được viết `INSERT INTO examcollect.(class|enrollment|exam_session)`. |
| `apps/api/test/seed-helper.e2e-spec.ts` | **Mới.** Kiểm chính helper trên DB thật. |
| `apps/api/src/common/e2e-seed-hygiene.spec.ts` | **Mới.** Guard ratchet (unit spec, quét thư mục `test/`). |
| `apps/api/scripts/e2e-summary.cjs` | **Mới.** Tóm tắt JSON của jest thành bảng `suite<TAB>passed<TAB>failed<TAB>pending`. |
| `docs/superpowers/plans/md-restore-baseline.tsv` | **Mới.** Bảng baseline (commit cùng Task 0). |
| `apps/api/test/helpers/grading-seed.ts` + 38 file `*.e2e-spec.ts` | Chuyển sang helper (Task 3–6). |

Không file nào dưới `apps/api/src/` (trừ guard) và không migration nào bị đụng.

---

### Task 0: Dựng môi trường và ghi baseline

**Files:**
- Create: `apps/api/scripts/e2e-summary.cjs`
- Create: `docs/superpowers/plans/md-restore-baseline.tsv`

**Interfaces:**
- Produces: bảng baseline `suite<TAB>passed<TAB>failed<TAB>pending` mà Task 3–6 so lại bằng `diff`.

- [ ] **Step 1: Cài phụ thuộc cho worktree bằng kho ảo dùng chung**

Cài đầy đủ trên máy này mất hàng giờ; đường tắt 14 giây dùng lại `.pnpm` của checkout gốc (cùng lockfile). Từ thư mục worktree (PowerShell):

```powershell
$env:CI = 'true'
pnpm install --frozen-lockfile --config.verify-store-integrity=false "--config.virtual-store-dir=C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE\node_modules\.pnpm"
```

Expected: kết thúc trong vài chục giây, `apps/api/node_modules/.bin/jest` tồn tại. Không chạy `pnpm install` thường ở worktree này về sau.

- [ ] **Step 2: Bật hạ tầng local và tạo bucket**

Máy này đã có sẵn các container của project `cine` (`cine-postgres-1`, `cine-redis-1`, `cine-minio-1`, cổng 5442/6390/9010). **Dùng lại chúng**, đừng `docker compose up` từ thư mục worktree: tên project theo tên thư mục sẽ khác (`master-data-restore`) và tranh cổng với container cũ.

```powershell
docker ps -a --format "{{.Names}} {{.Status}}" | Select-String 'cine-'
docker start cine-postgres-1 cine-redis-1 cine-minio-1
```

Expected: ba container `Up`. Nếu chúng chưa tồn tại, tạo từ checkout gốc (`C:\Users\Admin\Main\Desktop\HKI 2026-2027\KLTN\CINE`): `docker compose -p cine up -d postgres redis minio`. Nếu engine Docker chết thì mở Docker Desktop trước.

```powershell
docker run --rm --network host --entrypoint sh minio/mc:latest -c "mc alias set local http://localhost:9010 examcollect_admin examcollect_admin_password && mc mb --ignore-existing local/examcollect-submissions"
```

- [ ] **Step 3: Chạy migration lên DB LOCAL (không phải Supabase)**

`.env` của `apps/api` trỏ Supabase từ xa, nên PHẢI ghi đè `DATABASE_URL`:

```powershell
cd apps/api
$env:DATABASE_URL = 'postgresql://examcollect_admin:examcollect_admin_password@localhost:5442/examcollect'
$env:DATABASE_SSL = 'false'
pnpm migration:run
```

Expected: các migration chưa áp được chạy, không lỗi. Kiểm lại đúng DB:

```powershell
docker exec cine-postgres-1 psql -U examcollect_admin -d examcollect -c "SELECT count(*) FROM examcollect.migrations"
```

Expected: một số ≥ 46. Nếu `migration:run` dừng ở `AddAiUsage` với "đã tồn tại" thì bạn đang trỏ nhầm DB (đây là lỗi lịch sử migration lệch của Supabase, xem spec §8.4 bước 0b; ở DB local không xảy ra).

- [ ] **Step 4: Viết script tóm tắt kết quả jest**

Create `apps/api/scripts/e2e-summary.cjs`:

```js
// Tóm tắt báo cáo JSON của jest thành bảng so sánh được bằng `diff`.
//
//   npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e.json
//   node scripts/e2e-summary.cjs C:/tmp/e2e.json > after.tsv
//
// Một suite KHÔNG biên dịch được không có assertion nào; nó được ghi là
// `failed = 1` kèm hậu tố `!` ở tên, để `diff` không bao giờ coi nó là "0 test
// pass, 0 test fail" rồi cho qua.
const fs = require('node:fs');
const path = require('node:path');

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/e2e-summary.cjs <jest-json-file>');
  process.exit(2);
}

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const rows = report.testResults
  .map((suite) => {
    const count = (status) => suite.assertionResults.filter((a) => a.status === status).length;
    const broken = suite.assertionResults.length === 0 && suite.status === 'failed';
    return [
      path.basename(suite.name) + (broken ? '!' : ''),
      count('passed'),
      broken ? 1 : count('failed'),
      count('pending') + count('todo'),
    ];
  })
  .sort((a, b) => a[0].localeCompare(b[0]));

for (const row of rows) {
  console.log(row.join('\t'));
}
const sum = (i) => rows.reduce((total, row) => total + row[i], 0);
console.log(['TOTAL', sum(1), sum(2), sum(3)].join('\t'));
```

- [ ] **Step 5: Tắt tiến trình mồ côi rồi chạy cả bộ e2e để lấy baseline**

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest' } | Select-Object ProcessId, CommandLine
```

Chỉ `Stop-Process -Id <PID>` đúng những PID liệt kê ở đây (đừng giết theo tên). Rồi:

```powershell
cd apps/api
npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e-baseline.json
node scripts/e2e-summary.cjs C:/tmp/e2e-baseline.json | Out-File -Encoding utf8 ../../docs/superpowers/plans/md-restore-baseline.tsv
Get-Content ../../docs/superpowers/plans/md-restore-baseline.tsv -Tail 3
```

Expected: dòng `TOTAL` có cột `failed = 0`. Nếu có test đỏ **trước khi bạn sửa gì**, dừng lại: ghi tên test đỏ vào đầu `md-restore-baseline.tsv` dưới dạng dòng chú thích `# đỏ sẵn: <suite> <test>`, báo chủ đồ án, và chỉ tiếp tục khi họ xác nhận đó là lỗi có sẵn (kiểm trước: Docker chạy, bucket tồn tại, không còn jest mồ côi, `docker compose ps` xanh).

Chạy bộ unit để có baseline thứ hai:

```powershell
pnpm test 2>&1 | Out-File C:/tmp/unit-baseline.txt
Select-String -Path C:/tmp/unit-baseline.txt -Pattern '^Tests:|^Test Suites:'
```

Thêm hai dòng `Tests:`/`Test Suites:` đó vào cuối `md-restore-baseline.tsv` dạng chú thích `# unit: ...`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/scripts/e2e-summary.cjs docs/superpowers/plans/md-restore-baseline.tsv
git commit -m "test(e2e): script tóm tắt jest và baseline số test trước khi gom seed"
```

---

### Task 1: Helper `seed.ts` và bài kiểm tra của nó

**Files:**
- Create: `apps/api/test/helpers/seed.ts`
- Test: `apps/api/test/seed-helper.e2e-spec.ts`

**Interfaces:**
- Consumes: `COURSE_NAME` từ `apps/api/src/common/course-name.ts`; `concurrentLiveWindow` từ `test/helpers/session-window.ts`; `createTestAccount` từ `test/helpers/create-account.ts`.
- Produces (các task sau và plan C, D dựa vào đúng tên và kiểu này):

```ts
export interface Queryable { query(sql: string, params?: unknown[]): Promise<any>; }
export function classLabel(code: string, groupName: string): string;
export interface SeedClassOptions { teacherId: string; code?: string; groupName?: string; courseName?: string; }
export interface SeededClass { id: string; code: string; groupName: string; label: string; }
export function seedClass(db: Queryable, o: SeedClassOptions): Promise<SeededClass>;
export interface SeedEnrollmentOptions { classId: string; teacherId: string; mssv: string; name?: string; }
export function seedEnrollment(db: Queryable, o: SeedEnrollmentOptions): Promise<void>;
export interface SeedExamSessionOptions {
  teacherId: string; classId: string; startTime: Date; endTime: Date;
  name?: string; code?: string; examType?: 'TK' | 'GK' | 'CK';
  status?: 'draft' | 'scheduled' | 'active' | 'collecting' | 'completed' | 'cancelled';
  roomName?: string; semesterName?: string; courseName?: string;
}
export interface SeededExamSession { id: string; code: string; roomName: string; semesterName: string; courseName: string; }
export function seedExamSession(db: Queryable, o: SeedExamSessionOptions): Promise<SeededExamSession>;
export interface SessionBodyOptions {
  classId: string; name?: string; roomName?: string; semesterName?: string; rubricId?: string;
  examType?: 'TK' | 'GK' | 'CK'; startTime?: string; endTime?: string;
  requiredFilenames?: Array<string | { filename: string; deliverableType?: string; language?: string; entries?: string[] }>;
}
export function sessionBody(db: Queryable, o: SessionBodyOptions): Promise<Record<string, unknown>>;
```

- [ ] **Step 1: Viết bài kiểm tra e2e cho helper (sẽ đỏ vì chưa có file)**

Create `apps/api/test/seed-helper.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';
import { COURSE_NAME } from '../src/common/course-name';
import { createTestAccount } from './helpers/create-account';
import {
  classLabel,
  seedClass,
  seedEnrollment,
  seedExamSession,
  sessionBody,
} from './helpers/seed';

describe('seed helper (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let teacherId: string;
  let teacherToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();
    dataSource = app.get(DataSource);

    const email = `seed_helper_${Date.now()}@example.com`;
    teacherId = await createTestAccount(dataSource, {
      email,
      password: 'correct-horse-battery',
      role: 'teacher',
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'correct-horse-battery' });
    teacherToken = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('classLabel hiện nhóm sau dấu gạch ngang, và chỉ mã khi không tách nhóm', () => {
    expect(classLabel('DHKTPM18A', '')).toBe('DHKTPM18A');
    expect(classLabel('DHKTPM18A', 'Nhóm 1')).toBe('DHKTPM18A – Nhóm 1');
  });

  it('seedClass dựng một lớp thật và trả nhãn', async () => {
    const klass = await seedClass(dataSource, { teacherId, groupName: 'Nhóm 2' });

    expect(klass.label).toBe(`${klass.code} – Nhóm 2`);
    const [row] = await dataSource.query(
      `SELECT course_name, name, teacher_id FROM examcollect.class WHERE id = $1`,
      [klass.id],
    );
    expect(row.course_name).toBe(COURSE_NAME);
    expect(row.name).toBe(klass.label);
    expect(row.teacher_id).toBe(teacherId);
  });

  it('seedClass giữ courseName khi test cố ý dùng môn khác', async () => {
    const klass = await seedClass(dataSource, { teacherId, courseName: 'Môn khác hẳn' });
    const [row] = await dataSource.query(
      `SELECT course_name FROM examcollect.class WHERE id = $1`,
      [klass.id],
    );
    expect(row.course_name).toBe('Môn khác hẳn');
  });

  it('mã lớp tự sinh duy nhất, chỉ gồm chữ HOA và số, dài 3–30 ký tự', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 25; i++) {
      codes.add((await seedClass(dataSource, { teacherId })).code);
    }
    expect(codes.size).toBe(25);
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z0-9]{3,30}$/);
    }
  });

  it('seedEnrollment ghi đúng bốn cột và đặt tên mặc định khi không cho', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const mssv = `SH${Date.now().toString(36)}`.toUpperCase().slice(0, 12);
    await seedEnrollment(dataSource, { classId: klass.id, teacherId, mssv });

    const [row] = await dataSource.query(
      `SELECT student_mssv, student_name, home_class_id, home_teacher_id
         FROM examcollect.enrollment WHERE home_class_id = $1`,
      [klass.id],
    );
    expect(row).toMatchObject({
      student_mssv: mssv,
      student_name: `Sinh viên ${mssv}`,
      home_class_id: klass.id,
      home_teacher_id: teacherId,
    });
  });

  it('seedExamSession chèn thẳng một phiên mà service sẽ từ chối, và trả đủ định danh', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const start = new Date(Date.now() - 3 * 24 * 3_600_000);
    const session = await seedExamSession(dataSource, {
      teacherId,
      classId: klass.id,
      startTime: start,
      endTime: new Date(start.getTime() + 3_600_000),
      status: 'completed',
    });

    expect(session.code).toMatch(/^[A-Z0-9]{1,20}$/);
    const [row] = await dataSource.query(
      `SELECT status, room_name, semester_name, course_name FROM examcollect.exam_session WHERE id = $1`,
      [session.id],
    );
    expect(row).toMatchObject({
      status: 'completed',
      room_name: session.roomName,
      semester_name: 'HK kiểm thử',
      course_name: COURSE_NAME,
    });
  });

  it('sessionBody mặc định đủ để POST /exam-sessions trả 201', async () => {
    const klass = await seedClass(dataSource, { teacherId });
    const body = await sessionBody(dataSource, { classId: klass.id });

    const response = await request(app.getHttpServer())
      .post('/exam-sessions')
      .set('Authorization', `Bearer ${teacherToken}`)
      .send(body);

    expect(response.status).toBe(201);
    expect(response.body.classId).toBe(klass.id);
    // Dọn để không giữ chỗ giảng viên này cho các ca sau.
    await dataSource.query(
      `UPDATE examcollect.exam_session SET status = 'completed' WHERE teacher_id = $1`,
      [teacherId],
    );
  });

  it('sessionBody từ chối khi chỉ truyền một đầu của khung giờ', async () => {
    await expect(
      sessionBody(dataSource, { classId: 'x', startTime: new Date().toISOString() }),
    ).rejects.toThrow(/startTime và endTime/);
    await expect(
      sessionBody(dataSource, { classId: 'x', endTime: new Date().toISOString() }),
    ).rejects.toThrow(/startTime và endTime/);
  });

  it('sessionBody giữ nguyên phòng, học kỳ và tên file mà test truyền vào', async () => {
    const body = await sessionBody(dataSource, {
      classId: 'c1',
      roomName: 'P Cố Định',
      semesterName: 'HK Riêng',
      requiredFilenames: ['A.docx', { filename: 'B.zip', entries: ['x.txt'] }],
    });

    expect(body).toMatchObject({
      classId: 'c1',
      roomName: 'P Cố Định',
      semesterName: 'HK Riêng',
      examType: 'TK',
      requiredFilenames: ['A.docx', { filename: 'B.zip', entries: ['x.txt'] }],
    });
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run (từ `apps/api`): `npx jest --config ./test/jest-e2e.json test/seed-helper.e2e-spec.ts`
Expected: FAIL — `Cannot find module './helpers/seed'`.

- [ ] **Step 3: Viết helper**

Create `apps/api/test/helpers/seed.ts`:

```ts
import { COURSE_NAME } from '../../src/common/course-name';
import { concurrentLiveWindow } from './session-window';

/**
 * Nơi DUY NHẤT trong `test/` được viết `INSERT INTO examcollect.class`,
 * `enrollment` hay `exam_session`, và nơi DUY NHẤT dựng thân của
 * `POST /exam-sessions`.
 *
 * Vì sao có file này: các bộ e2e dựng lớp, sinh viên và phiên thi bằng SQL
 * thô, và SQL thô hỏng lúc CHẠY chứ không lúc biên dịch. Đợt khôi phục master
 * data đổi cả ba bảng (xem spec 2026-10-04 §10 bước 1); nếu 39 file mỗi file
 * tự viết SQL của mình thì mỗi lần đổi schema là 39 chỗ phải sửa và 39 cơ hội
 * để một test xanh vì sai lý do. Gom về đây thì chỉ file này đổi.
 *
 * Từ vựng ở đây là của schema ĐÍCH: một lớp có `code` (mã lớp danh nghĩa) và
 * `groupName`, và nhãn hiển thị là `code – groupName`. Hôm nay hai thứ ấy được
 * ghép lại và ghi vào cột `class.name`; sau plan D chúng đi vào
 * `administrative_class` và `class.group_name`. Test chỉ nói chuyện bằng
 * `code`/`groupName`/`label`, nên không phải biết bên dưới là cột nào.
 */

/** Bất kỳ thứ gì có `.query(sql, params)`: DataSource, EntityManager, QueryRunner. */
export interface Queryable {
  // `any` có chủ đích: kết quả của `DataSource.query` là `any`, và các test
  // hiện có đều giải cấu trúc nó (`const [row] = await ds.query(...)`).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query(sql: string, params?: unknown[]): Promise<any>;
}

let counter = 0;

/**
 * Chuỗi duy nhất giữa các lần chạy và trong cùng một lần chạy: thời gian (base36)
 * cộng một bộ đếm của module. HOA để dùng thẳng làm mã lớp.
 */
function stamp(): string {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`.toUpperCase();
}

/** Nhãn hiển thị của một lớp: `DHKTPM18A` hoặc `DHKTPM18A – Nhóm 1`. */
export function classLabel(code: string, groupName: string): string {
  return groupName ? `${code} – ${groupName}` : code;
}

export interface SeedClassOptions {
  teacherId: string;
  /** Mã lớp danh nghĩa. Mặc định: một mã duy nhất tự sinh (`ADM…`). */
  code?: string;
  /** Nhóm, vd "Nhóm 1". Mặc định `''` = không tách nhóm. */
  groupName?: string;
  /**
   * Chỉ truyền khi test CỐ Ý cần một môn khác (vd kiểm phép "cùng môn").
   * Mặc định là hằng số của hệ thống.
   */
  courseName?: string;
}

export interface SeededClass {
  id: string;
  code: string;
  groupName: string;
  /** Nhãn hiển thị — thứ mà API trả ra ở mọi nơi hiện tên lớp. */
  label: string;
}

export async function seedClass(db: Queryable, o: SeedClassOptions): Promise<SeededClass> {
  const code = o.code ?? `ADM${stamp()}`;
  const groupName = o.groupName ?? '';
  const label = classLabel(code, groupName);
  const [row] = await db.query(
    `INSERT INTO examcollect.class (course_name, name, teacher_id)
     VALUES ($1, $2, $3) RETURNING id`,
    [o.courseName ?? COURSE_NAME, label, o.teacherId],
  );
  return { id: row.id as string, code, groupName, label };
}

export interface SeedEnrollmentOptions {
  classId: string;
  /** Chủ lớp: `enrollment.home_teacher_id` luôn là giảng viên của lớp. */
  teacherId: string;
  mssv: string;
  /** Mặc định `Sinh viên <mssv>`. */
  name?: string;
}

export async function seedEnrollment(db: Queryable, o: SeedEnrollmentOptions): Promise<void> {
  await db.query(
    `INSERT INTO examcollect.enrollment
       (student_mssv, student_name, home_class_id, home_teacher_id)
     VALUES ($1, $2, $3, $4)`,
    [o.mssv, o.name ?? `Sinh viên ${o.mssv}`, o.classId, o.teacherId],
  );
}

type SessionStatus = 'draft' | 'scheduled' | 'active' | 'collecting' | 'completed' | 'cancelled';
type ExamType = 'TK' | 'GK' | 'CK';

export interface SeedExamSessionOptions {
  teacherId: string;
  classId: string;
  startTime: Date;
  endTime: Date;
  name?: string;
  /** Tối đa 20 ký tự, HOA/số. Mặc định tự sinh. */
  code?: string;
  examType?: ExamType;
  /** Mặc định `active`, như `ExamSessionService.create`. */
  status?: SessionStatus;
  roomName?: string;
  /** Mặc định `HK kiểm thử` — giá trị mà 57/70 chỗ dùng trong e2e. */
  semesterName?: string;
  courseName?: string;
}

export interface SeededExamSession {
  id: string;
  code: string;
  roomName: string;
  semesterName: string;
  courseName: string;
}

/**
 * Chèn thẳng một phiên thi, BỎ QUA service. Dùng cho test cần một trạng thái
 * mà service không tạo được (`collecting` quá hạn, `completed` trong quá
 * khứ) hoặc cần chứng minh một luật là tính chất của DỮ LIỆU chứ không của
 * một đường code (`exam-schedule-conflict`).
 */
export async function seedExamSession(
  db: Queryable,
  o: SeedExamSessionOptions,
): Promise<SeededExamSession> {
  const s = stamp();
  const code = (o.code ?? `S${s}`).slice(0, 20);
  const roomName = o.roomName ?? `P ${s}`;
  const semesterName = o.semesterName ?? 'HK kiểm thử';
  const courseName = o.courseName ?? COURSE_NAME;
  const [row] = await db.query(
    `INSERT INTO examcollect.exam_session
       (name, code, class_id, teacher_id, exam_type, start_time, end_time, status,
        semester_name, course_name, room_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
    ],
  );
  return { id: row.id as string, code, roomName, semesterName, courseName };
}

export interface SessionBodyOptions {
  classId: string;
  name?: string;
  roomName?: string;
  semesterName?: string;
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
 * Thân hợp lệ của `POST /exam-sessions`.
 *
 * `async` và nhận `db` dù hôm nay không cần: sau plan D, phòng là một hàng
 * (`roomId`) nên hàm này sẽ phải tạo/tra phòng theo `roomName`, và `semesterName`
 * sẽ biến khỏi thân. Chữ ký cố định từ bây giờ để 29 file gọi không đổi theo.
 */
export async function sessionBody(
  _db: Queryable,
  o: SessionBodyOptions,
): Promise<Record<string, unknown>> {
  if ((o.startTime === undefined) !== (o.endTime === undefined)) {
    // Ghép một đầu do test chọn với một đầu mặc định là cách tạo ra một khung
    // giờ âm hoặc quá ngắn mà không ai nhận ra mình đã chọn nó.
    throw new Error('sessionBody: phải truyền cả startTime và endTime, hoặc không truyền cái nào.');
  }
  const window =
    o.startTime !== undefined && o.endTime !== undefined
      ? { startTime: o.startTime, endTime: o.endTime }
      : concurrentLiveWindow();
  const s = stamp();
  return {
    name: o.name ?? `Phiên ${s}`,
    classId: o.classId,
    roomName: o.roomName ?? `P ${s}`,
    semesterName: o.semesterName ?? 'HK kiểm thử',
    examType: o.examType ?? 'TK',
    ...window,
    requiredFilenames: o.requiredFilenames ?? ['Cau1.docx'],
    ...(o.rubricId ? { rubricId: o.rubricId } : {}),
  };
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `npx jest --config ./test/jest-e2e.json test/seed-helper.e2e-spec.ts`
Expected: PASS, 8 test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test/helpers/seed.ts apps/api/test/seed-helper.e2e-spec.ts
git commit -m "test(e2e): helper seed gom lớp, enrollment, phiên thi và thân POST /exam-sessions"
```

---

### Task 2: Guard ratchet

**Files:**
- Create: `apps/api/src/common/e2e-seed-hygiene.spec.ts`

**Interfaces:**
- Produces: hai danh sách `RAW_SEED_ALLOWLIST`, `SESSION_BODY_ALLOWLIST` mà Task 3–6 cắt dần.

Guard là unit spec (`pnpm test`), quét thư mục `test/`. Nó chạy được ngay vì hai allow-list khởi đầu **đúng bằng** tập vi phạm hiện tại (đã tính bằng chính hai biểu thức chính quy dưới đây ngày 05/10 trên `4cb6bca`: 35 file rule 1, 32 file rule 2).

- [ ] **Step 1: Viết guard**

Create `apps/api/src/common/e2e-seed-hygiene.spec.ts`:

```ts
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Ratchet: các bộ e2e dựng dữ liệu nền qua `test/helpers/seed.ts`, không bằng
 * SQL thô và không tự dựng thân `POST /exam-sessions`.
 *
 * Vì sao phải là guard chứ không chỉ là quy ước: SQL thô hỏng lúc CHẠY, sau
 * khi schema đổi, ở file nào đó mà không ai mở lại (xem spec 2026-10-04 §10
 * bước 1). Một ngày nào đó có người viết `INSERT INTO examcollect.class` vào
 * một spec mới vì "nhanh hơn" — guard này làm việc đó đỏ ngay hôm ấy.
 *
 * Hai danh sách dưới đây là NỢ ĐANG TRẢ, không phải ngoại lệ vĩnh viễn:
 *   - mỗi file chuyển sang helper phải bị xoá khỏi danh sách trong CÙNG commit;
 *   - một mục không còn vi phạm mà vẫn nằm trong danh sách làm test này đỏ
 *     ("mục dư"), để danh sách không bao giờ phình lại bằng cách im lặng.
 * Kết thúc plan A: `RAW_SEED_ALLOWLIST` rỗng; `SESSION_BODY_ALLOWLIST` còn đúng
 * ba file kiểm chính tính năng phòng/học kỳ gõ tay, sẽ bị plan D viết lại.
 */
const TEST_ROOT = join(__dirname, '..', '..', 'test');
/** Chỗ duy nhất được phép chứa SQL dựng ba bảng này. */
const SEED_HELPER = 'helpers/seed.ts';

/** SQL thô dựng lớp / enrollment / phiên thi. */
const RAW_SEED = /INSERT INTO examcollect\.(class|exam_session|enrollment)\b/;
/**
 * Một lời gọi `POST /exam-sessions` mà `.send(` ĐẦU TIÊN sau nó nhận một object
 * literal viết tay (`.send({`). Thân dựng bằng `sessionBody` thì là
 * `.send(await sessionBody(` nên không khớp. Phần `(?!\.send\()` buộc regex
 * dừng ở `.send(` đầu tiên: không có nó, một `.send({})` của request KHÁC nằm
 * trong 400 ký tự sau sẽ bị tính nhầm cho lời gọi này.
 *
 * Quét thân literal chứ không quét tên `roomName`/`semesterName`: test đã
 * chuyển vẫn truyền `roomName` cho `sessionBody` (nó cần làm sạch/khẳng định
 * theo phòng), nên tên đó không phân biệt được hai cách.
 */
const SESSION_POST_LITERAL_BODY =
  /\.post\(\s*['"`]\/exam-sessions['"`]\s*\)(?:(?!\.send\()[\s\S]){0,400}\.send\(\s*\{/;

export const RAW_SEED_ALLOWLIST = new Set<string>([
  'access-request.e2e-spec.ts',
  'accounts.e2e-spec.ts',
  'advocate-end-to-end.e2e-spec.ts',
  'agent-join-rate-limit.e2e-spec.ts',
  'agent-join.e2e-spec.ts',
  'anchor-freeze.e2e-spec.ts',
  'archive-check.e2e-spec.ts',
  'attendance.e2e-spec.ts',
  'backup.e2e-spec.ts',
  'bulk-review.e2e-spec.ts',
  'class-scoped-enrollment.e2e-spec.ts',
  'classes-teacher-crud.e2e-spec.ts',
  'collection-phase.e2e-spec.ts',
  'exam-authoring-attach.e2e-spec.ts',
  'exam-material.e2e-spec.ts',
  'exam-schedule-conflict.e2e-spec.ts',
  'exam-session-reassign.e2e-spec.ts',
  'exam-session-semester-name.e2e-spec.ts',
  'exam-session.e2e-spec.ts',
  'grading-lifecycle.e2e-spec.ts',
  'grading-queue.e2e-spec.ts',
  'grading-reference.e2e-spec.ts',
  'grading-results-view.e2e-spec.ts',
  'grading.e2e-spec.ts',
  'helpers/grading-seed.ts',
  'investigator-end-to-end.e2e-spec.ts',
  'recollect.e2e-spec.ts',
  'roster-import.e2e-spec.ts',
  'session-roster-freeze.e2e-spec.ts',
  'session-rubric.e2e-spec.ts',
  'start-grading-test-bundle-guard.e2e-spec.ts',
  'submission-collection.e2e-spec.ts',
  'submission-text.e2e-spec.ts',
  'teacher-review.e2e-spec.ts',
  'teacher-submissions.e2e-spec.ts',
]);

export const SESSION_BODY_ALLOWLIST = new Set<string>([
  'access-request.e2e-spec.ts',
  'advocate-end-to-end.e2e-spec.ts',
  'agent-join-rate-limit.e2e-spec.ts',
  'agent-join.e2e-spec.ts',
  'archive-check.e2e-spec.ts',
  'attendance.e2e-spec.ts',
  'backup.e2e-spec.ts',
  'bulk-review.e2e-spec.ts',
  'class-scoped-enrollment.e2e-spec.ts',
  'collection-phase.e2e-spec.ts',
  'exam-authoring-attach.e2e-spec.ts',
  'exam-material.e2e-spec.ts',
  'exam-schedule-conflict.e2e-spec.ts',
  'exam-session-reassign.e2e-spec.ts',
  'exam-session-semester-name.e2e-spec.ts',
  'exam-session.e2e-spec.ts',
  'grading-queue.e2e-spec.ts',
  'grading-results-view.e2e-spec.ts',
  'grading.e2e-spec.ts',
  'investigator-end-to-end.e2e-spec.ts',
  'recollect.e2e-spec.ts',
  'session-lifecycle.e2e-spec.ts',
  'session-roster-freeze.e2e-spec.ts',
  'session-rubric.e2e-spec.ts',
  'start-grading-test-bundle-guard.e2e-spec.ts',
  'submission-collection.e2e-spec.ts',
  'submission-overview-attendance.e2e-spec.ts',
  'submission-overview-makeup-search.e2e-spec.ts',
  'submission-overview.e2e-spec.ts',
  'submission-text.e2e-spec.ts',
  'teacher-review.e2e-spec.ts',
  'teacher-submissions.e2e-spec.ts',
]);

/** Ba file kiểm chính tính năng phòng/học kỳ gõ tay — giá trị cuối của rule 2. */
export const PERMANENT_SESSION_BODY_FILES = [
  'exam-schedule-conflict.e2e-spec.ts',
  'exam-session-semester-name.e2e-spec.ts',
  'exam-session.e2e-spec.ts',
];

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

function testFiles(): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(TEST_ROOT)) {
    if (entry.endsWith('.ts')) out.push(entry);
  }
  for (const entry of readdirSync(join(TEST_ROOT, 'helpers'))) {
    if (entry.endsWith('.ts')) out.push(`helpers/${entry}`);
  }
  return out.sort();
}

function offenders(pattern: RegExp): string[] {
  return testFiles().filter(
    (file) =>
      file !== SEED_HELPER &&
      pattern.test(stripComments(readFileSync(join(TEST_ROOT, file), 'utf8'))),
  );
}

describe('e2e seed hygiene (ratchet)', () => {
  it('không có file nào ngoài helper/seed.ts dùng SQL thô dựng lớp, enrollment, phiên thi — trừ nợ đã khai', () => {
    const found = offenders(RAW_SEED);
    const unexpected = found.filter((file) => !RAW_SEED_ALLOWLIST.has(file));
    expect(unexpected).toEqual([]);
  });

  it('RAW_SEED_ALLOWLIST không chứa mục đã sạch (xoá nó khỏi danh sách)', () => {
    const found = new Set(offenders(RAW_SEED));
    const stale = [...RAW_SEED_ALLOWLIST].filter((file) => !found.has(file));
    expect(stale).toEqual([]);
  });

  it('không có file nào ngoài helper tự viết object literal làm thân POST /exam-sessions — trừ nợ đã khai', () => {
    const found = offenders(SESSION_POST_LITERAL_BODY);
    const unexpected = found.filter((file) => !SESSION_BODY_ALLOWLIST.has(file));
    expect(unexpected).toEqual([]);
  });

  it('SESSION_BODY_ALLOWLIST không chứa mục đã sạch (xoá nó khỏi danh sách)', () => {
    const found = new Set(offenders(SESSION_POST_LITERAL_BODY));
    const stale = [...SESSION_BODY_ALLOWLIST].filter((file) => !found.has(file));
    expect(stale).toEqual([]);
  });

  it('danh sách rule 2 chỉ được phép co về đúng ba file kiểm tính năng phòng/học kỳ gõ tay', () => {
    const extra = [...SESSION_BODY_ALLOWLIST].filter(
      (file) => !PERMANENT_SESSION_BODY_FILES.includes(file),
    );
    // Khẳng định này CHỦ Ý chưa bật cho tới hết Task 6: nó là đích của cả plan.
    // Xem Step 1 của Task 6 để biết cách nó được bật.
    if (process.env.SEED_HYGIENE_FINAL === '1') {
      expect(extra).toEqual([]);
    }
  });
});
```

- [ ] **Step 2: Chạy guard — phải xanh ngay**

Run (từ `apps/api`): `npx jest src/common/e2e-seed-hygiene.spec.ts`
Expected: PASS, 5 test (hai danh sách khởi đầu đúng bằng tập vi phạm hiện tại). Nếu "mục dư" hoặc "ngoài dự kiến" đỏ, đối chiếu lại với `git status`: có ai thêm/bớt file e2e kể từ khi plan này viết.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/common/e2e-seed-hygiene.spec.ts
git commit -m "test: guard ratchet cấm SQL thô dựng lớp/phiên trong e2e (nợ còn 35 + 32 file)"
```

---

## Công thức chuyển đổi (dùng cho Task 3–6)

Bốn công thức dưới đây là TOÀN BỘ phép biến đổi; mỗi task nhắc lại những cái nó cần.

**R1 — lớp.** Trước:
```ts
const [klass] = await dataSource.query(
  `INSERT INTO examcollect.class (course_name, name, teacher_id)
   VALUES ($1, $2, $3) RETURNING id`,
  [courseName, `Nhóm của tôi ${Date.now()}`, ownerId],
);
classId = klass.id;
```
Sau:
```ts
const klass = await seedClass(dataSource, {
  teacherId: ownerId,
  courseName,                       // GIỮ nếu test dùng biến courseName
  groupName: `Nhóm của tôi ${Date.now()}`,
});
classId = klass.id;
```
Tên cũ (tham số thứ hai):
- chữ mô tả có khoảng trắng, chữ thường hoặc dấu tiếng Việt (`Nhóm của tôi …`, `Nhom A …`) → `groupName`;
- mã ngắn kiểu `'N01'`, `'N02'` → **bỏ hẳn** (để helper tự sinh `code` duy nhất). Không test nào khẳng định chữ đó, và một mã cố định dùng lại ở nhiều test sẽ va khoá duy nhất `(kỳ, mã, nhóm)` sau plan D;
- ngoại lệ: test **đọc lại** nhãn lớp (chỉ `attendance`, Task 5) thì truyền `code` tường minh và khẳng định bằng `klass.label`.
Nếu test không truyền môn (không có biến `courseName`), bỏ `courseName` — helper dùng hằng số hệ thống. Nếu test dùng một môn riêng (vd `otherCourse.name`, `'Môn ${label}'`), **giữ nguyên** nó qua `courseName`.

**R2 — enrollment.** Trước:
```ts
await dataSource.query(
  `INSERT INTO examcollect.enrollment
     (student_mssv, student_name, home_class_id, home_teacher_id)
   VALUES ($1, $2, $3, $4)`,
  [mssv, name, homeClassId, teacherId],
);
```
Sau:
```ts
await seedEnrollment(dataSource, { mssv, name, classId: homeClassId, teacherId });
```
Thứ tự tham số cũ là `[mssv, name, classId, teacherId]` — không đảo.

**R3 — phiên thi chèn thẳng.** Trước (`now() - interval '1 hour'` … `now() + interval '1 hour'`):
```ts
const [session] = await dataSource.query(`INSERT INTO examcollect.exam_session (...) VALUES (...) RETURNING id`, [...]);
```
Sau:
```ts
const session = await seedExamSession(dataSource, {
  teacherId, classId, name: 'Phiên anchor', code: `ANC${stamp}`,
  examType: 'CK',
  startTime: new Date(Date.now() - 3_600_000),
  endTime: new Date(Date.now() + 3_600_000),
  roomName: room.name, semesterName: `HK Anchor ${stamp}`, courseName,
});
sessionId = session.id;
```
Mọi giá trị (`status`, `examType`, tên phòng, học kỳ, môn) **phải khớp** với SQL cũ; `now() ± interval` thành `new Date(Date.now() ± ms)`.

**R4 — thân POST.** Trước:
```ts
.send({
  name: `Phiên đóng băng ${suffix}`,
  classId: klass.id,
  roomName: room.name,
  semesterName: 'HK kiểm thử',
  examType: 'TK',
  ...concurrentLiveWindow(),
  requiredFilenames: options.deliverables ?? ['Cau1.docx'],
});
```
Sau:
```ts
.send(await sessionBody(dataSource, {
  name: `Phiên đóng băng ${suffix}`,
  classId: klass.id,
  roomName: room.name,              // GIỮ: test có thể làm sạch/khẳng định theo phòng
  ...concurrentLiveWindow(),        // GIỮ khung giờ test đang dùng
  requiredFilenames: options.deliverables ?? ['Cau1.docx'],
}));
```
Bỏ `semesterName` khi nó là `'HK kiểm thử'` (mặc định của helper) và `examType` khi là `'TK'`; **giữ** `semesterName` khi giá trị khác hoặc test khẳng định trên nó. `roomName` luôn được giữ nguyên biểu thức cũ. Nếu `dataSource` không nằm trong phạm vi hàm, dùng biến DataSource của spec (mọi spec đều có `dataSource` hoặc `ds` ở mức `describe`).

Sau mỗi file: chạy riêng file đó (`npx jest --config ./test/jest-e2e.json <tên file>`), đối chiếu số test pass với dòng của nó trong `md-restore-baseline.tsv`, rồi mới sang file tiếp.

---

### Task 3: Đợt 1 — họ chấm điểm (10 file)

**Files:**
- Modify: `apps/api/test/helpers/grading-seed.ts`, `anchor-freeze.e2e-spec.ts`, `grading-lifecycle.e2e-spec.ts`, `grading-reference.e2e-spec.ts`, `grading-queue.e2e-spec.ts`, `grading-results-view.e2e-spec.ts`, `grading.e2e-spec.ts`, `advocate-end-to-end.e2e-spec.ts`, `investigator-end-to-end.e2e-spec.ts`, `start-grading-test-bundle-guard.e2e-spec.ts` (đều dưới `apps/api/test/`)
- Modify: `apps/api/src/common/e2e-seed-hygiene.spec.ts` (cắt allow-list)

**Interfaces:**
- Consumes: `seedClass`, `seedEnrollment`, `seedExamSession`, `sessionBody` từ Task 1.

Vị trí cần sửa (số dòng đo ngày 05/10 trên `4cb6bca`; `cls` = R1, `enr` = R2, `ses` = R3, `post` = R4):

| File | Vị trí |
|---|---|
| `helpers/grading-seed.ts` | `cls@46` `ses@50` |
| `anchor-freeze.e2e-spec.ts` | `cls@46` `ses@53` |
| `grading-lifecycle.e2e-spec.ts` | `cls@49` `ses@56` |
| `grading-reference.e2e-spec.ts` | `cls@50` `ses@65` |
| `grading-queue.e2e-spec.ts` | `cls@34` `enr@68` `post@49` |
| `grading-results-view.e2e-spec.ts` | `cls@168` `enr@176` `post@47` |
| `grading.e2e-spec.ts` | `cls@147,437` `enr@153` `post@160,449` |
| `advocate-end-to-end.e2e-spec.ts` | `cls@199` `enr@206` `post@84` |
| `investigator-end-to-end.e2e-spec.ts` | `cls@110` `enr@163` `post@124` |
| `start-grading-test-bundle-guard.e2e-spec.ts` | `cls@76` `enr@50` `post@91,118,162,194` |

- [ ] **Step 1: `helpers/grading-seed.ts`**

Hàm `seedSession(ds, label, opts)` hiện chèn lớp rồi phiên (dòng 46–58). Thay hai câu `ds.query` đó bằng (giữ nguyên `Môn ${label}`, `HK ${label} ${s}`, `P ${label} ${s}`, `S${s}`, `Phiên ${label}`, khung giờ `startHoursAgo` giờ trước đến +2 giờ, trạng thái `active`, `CK`):

```ts
import { seedClass, seedExamSession } from './seed';
// …
  const klass = await seedClass(ds, {
    teacherId,
    courseName: `Môn ${label}`,
  });
  const startMs = Date.now() - (opts.startHoursAgo ?? 1) * 3_600_000;
  const session = await seedExamSession(ds, {
    teacherId,
    classId: klass.id,
    name: `Phiên ${label}`,
    code: `S${s}`,
    examType: 'CK',
    startTime: new Date(startMs),
    endTime: new Date(startMs + 2 * 3_600_000),
    semesterName: `HK ${label} ${s}`,
    courseName: `Môn ${label}`,
    roomName: `P ${label} ${s}`,
  });
```
và đổi hai chỗ dùng tiếp theo: `klass.id` giữ nguyên, `session.id` giữ nguyên (cả hai đã là thuộc tính `id`). Biến `s` (`stamp()`) của file này giữ nguyên.

- [ ] **Step 2: Bảy file chỉ có `cls`/`ses`/`enr`/`post` còn lại**

Áp R1–R4 vào đúng các dòng trong bảng. Ghi chú theo file:
- `anchor-freeze`, `grading-lifecycle`, `grading-reference`: R1 bỏ mã `'N01'` (helper tự sinh) và giữ `courseName` đang có; R3 với `examType: 'CK'`, giữ `room.name`, `HK … ${stamp}`; `anchor-freeze` có `start = now − 1 giờ`, `end = now + 1 giờ`.
- `grading-queue`, `grading-results-view`, `grading`, `advocate-end-to-end`, `investigator-end-to-end`, `start-grading-test-bundle-guard`: R1 + R2 + R4. Với `start-grading-test-bundle-guard` có bốn lời gọi POST: mỗi lời gọi là một R4 riêng; nếu chúng truyền khung giờ khác nhau, giữ từng khung.
- Nếu một test cần ID của lớp sau R1, vẫn là `klass.id`.

- [ ] **Step 3: Chạy từng file và đối chiếu số test với baseline**

```powershell
cd apps/api
foreach ($f in 'anchor-freeze','grading-lifecycle','grading-reference','grading-queue','grading-results-view','grading','advocate-end-to-end','investigator-end-to-end','start-grading-test-bundle-guard') {
  npx jest --config ./test/jest-e2e.json "test/$f.e2e-spec.ts"
}
```

Expected: mỗi file xanh, số test pass đúng bằng dòng của nó trong `docs/superpowers/plans/md-restore-baseline.tsv`. `helpers/grading-seed.ts` được kiểm qua các file trên (chúng gọi `seedSession`).

- [ ] **Step 4: Cắt allow-list**

Trong `apps/api/src/common/e2e-seed-hygiene.spec.ts`:
- Xoá khỏi `RAW_SEED_ALLOWLIST`: `anchor-freeze`, `grading-lifecycle`, `grading-queue`, `grading-reference`, `grading-results-view`, `grading`, `helpers/grading-seed.ts`, `advocate-end-to-end`, `investigator-end-to-end`, `start-grading-test-bundle-guard` (mười mục, đủ tên đầy đủ `….e2e-spec.ts`).
- Xoá khỏi `SESSION_BODY_ALLOWLIST`: `advocate-end-to-end`, `grading-queue`, `grading-results-view`, `grading`, `investigator-end-to-end`, `start-grading-test-bundle-guard`.

Run: `npx jest src/common/e2e-seed-hygiene.spec.ts` — Expected: PASS. Nếu đỏ "ngoài dự kiến" thì còn một chỗ chưa chuyển trong file đó; nếu đỏ "mục dư" thì bạn xoá nhầm một file còn vi phạm hay quên một file đã sạch.

- [ ] **Step 5: Commit**

```bash
git add apps/api/test apps/api/src/common/e2e-seed-hygiene.spec.ts
git commit -m "test(e2e): họ chấm điểm dùng helper seed (10 file)"
```

---

### Task 4: Đợt 2 — nộp bài và thu bài (12 file)

**Files:**
- Modify (dưới `apps/api/test/`): `submission-collection`, `submission-text`, `submission-overview`, `submission-overview-attendance`, `submission-overview-makeup-search`, `recollect`, `collection-phase`, `archive-check`, `backup`, `bulk-review`, `teacher-review`, `teacher-submissions` (đều `.e2e-spec.ts`)
- Modify: `apps/api/src/common/e2e-seed-hygiene.spec.ts`

**Interfaces:**
- Consumes: Task 1.

| File | Vị trí |
|---|---|
| `submission-collection` | `cls@71` `enr@78` `post@85` |
| `submission-text` | `cls@162` `enr@169` `post@53` |
| `submission-overview` | `post@61,400` |
| `submission-overview-attendance` | `post@56` |
| `submission-overview-makeup-search` | `post@63` |
| `recollect` | `cls@75` `enr@115` `post@87` |
| `collection-phase` | `cls@69,376` `enr@211` `ses@384` `post@75,442` |
| `archive-check` | `cls@259` `enr@176,266` `post@273` |
| `backup` | `cls@91` `enr@99` `post@107` |
| `bulk-review` | `cls@230` `enr@81` `post@58` |
| `teacher-review` | `cls@232` `enr@238` `post@48` |
| `teacher-submissions` | `cls@119,128,141` `enr@147,153` `post@185` |

- [ ] **Step 1: Áp R1–R4 theo bảng**

Ghi chú:
- `collection-phase` có **một** R3 ở dòng 384: phiên quá hạn ở trạng thái `collecting`, khung giờ `longAgoStart`/`longAgoEnd`, phòng `oldRoom.name`, học kỳ `'HK kiểm thử'`, `examType: 'TK'`. Giữ `status: 'collecting'`.
- `recollect`, `submission-overview*`: thân POST đôi khi dùng `liveSessionWindow()` hoặc `concurrentLiveWindow()`; giữ chính hàm nó đang gọi (`...liveSessionWindow()` rải vào tuỳ chọn `startTime`/`endTime` của `sessionBody` đúng như R4).
- `submission-overview.e2e-spec.ts` dòng 400 và các file `submission-overview-*` truyền học kỳ khác `'HK kiểm thử'` (đếm được 2 lần `semesterName` ở `submission-overview`, 2 ở `-attendance`): **giữ** `semesterName` ở những chỗ đó vì chúng khẳng định bộ lọc học kỳ.

- [ ] **Step 2: Chạy từng file, đối chiếu baseline**

```powershell
cd apps/api
foreach ($f in 'submission-collection','submission-text','submission-overview','submission-overview-attendance','submission-overview-makeup-search','recollect','collection-phase','archive-check','backup','bulk-review','teacher-review','teacher-submissions') {
  npx jest --config ./test/jest-e2e.json "test/$f.e2e-spec.ts"
}
```

Expected: xanh, số test đúng baseline.

- [ ] **Step 3: Cắt allow-list**

Xoá khỏi `RAW_SEED_ALLOWLIST`: `archive-check`, `backup`, `bulk-review`, `collection-phase`, `recollect`, `submission-collection`, `submission-text`, `teacher-review`, `teacher-submissions`.
Xoá khỏi `SESSION_BODY_ALLOWLIST`: `archive-check`, `backup`, `bulk-review`, `collection-phase`, `recollect`, `submission-collection`, `submission-overview`, `submission-overview-attendance`, `submission-overview-makeup-search`, `submission-text`, `teacher-review`, `teacher-submissions`.

Chạy `npx jest src/common/e2e-seed-hygiene.spec.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test apps/api/src/common/e2e-seed-hygiene.spec.ts
git commit -m "test(e2e): họ nộp bài/thu bài dùng helper seed (12 file)"
```

---

### Task 5: Đợt 3 — agent, điểm danh, danh sách lớp, xin phép (9 file)

**Files:**
- Modify (dưới `apps/api/test/`): `agent-join`, `agent-join-rate-limit`, `access-request`, `attendance`, `class-scoped-enrollment`, `session-roster-freeze`, `roster-import`, `accounts`, `classes-teacher-crud` (đều `.e2e-spec.ts`)
- Modify: `apps/api/src/common/e2e-seed-hygiene.spec.ts`

**Interfaces:**
- Consumes: Task 1.

| File | Vị trí |
|---|---|
| `agent-join` | `cls@116,134,321` `enr@147,156,326` `post@163,186,333,372` |
| `agent-join-rate-limit` | `cls@136` `enr@66` `post@142,167` |
| `access-request` | `cls@98` `enr@110` `post@117` |
| `attendance` | `cls@162,169` `enr@190` `post@97,253` |
| `class-scoped-enrollment` | `cls@98,104,215` `enr@64,222` `post@114` |
| `session-roster-freeze` | `cls@60` `enr@71,256` `post@85` |
| `roster-import` | `cls@86,95,109` |
| `accounts` | `cls@165` `enr@170` |
| `classes-teacher-crud` | `cls@46` |

- [ ] **Step 1: Áp R1–R4 theo bảng, kèm ba ngoại lệ có chủ ý**

1. **`attendance.e2e-spec.ts` — nhãn lớp được khẳng định (Review Focus #5).** Lớp "N05" (dòng 169) đổi thành `const sibling = await seedClass(dataSource, { teacherId, courseName, code: \`N05${stamp.toUpperCase()}\` });` rồi `siblingClassId = sibling.id;`, và khẳng định ở dòng ~301 đổi từ `homeClassName: \`Nhóm N05 ${stamp}\`` thành `homeClassName: sibling.label` — nên hãy lưu `sibling` ở mức `describe` (`let sibling: SeededClass;`, `import type { SeededClass } from './helpers/seed'`). Lớp chính (dòng 162) dùng `groupName: \`Nhóm chính ${stamp}\``. Bốn enrollment trong vòng lặp `for` (dòng ~190) đổi thành `await seedEnrollment(dataSource, { mssv, name, classId: home, teacherId });`.
2. **`class-scoped-enrollment.e2e-spec.ts` — lớp "môn khác" phải giữ môn khác.** Dòng 215 chèn lớp của môn `otherCourse` cho `otherTeacherId`: dùng `seedClass(dataSource, { teacherId: otherTeacherId, courseName: otherCourse, groupName: \`Nhom mon khac ${stamp}\` })`. Đừng bỏ `courseName` ở đây: bỏ nó biến ca "lớp của môn khác" thành "lớp cùng môn", test vẫn xanh nhưng không còn kiểm điều nó nói. (Plan D sẽ viết lại ca này vì phạm vi "cùng môn" đổi thành "cùng học kỳ".)
3. **`roster-import.e2e-spec.ts`, `classes-teacher-crud.e2e-spec.ts`:** chỉ phần `INSERT` dựng lớp mồi chuyển sang `seedClass`. Các lời gọi `POST /classes` qua API (CRUD của giảng viên) **giữ nguyên** — plan D viết lại chúng thành CRUD của admin.

- [ ] **Step 2: Chạy từng file, đối chiếu baseline**

```powershell
cd apps/api
foreach ($f in 'agent-join','agent-join-rate-limit','access-request','attendance','class-scoped-enrollment','session-roster-freeze','roster-import','accounts','classes-teacher-crud') {
  npx jest --config ./test/jest-e2e.json "test/$f.e2e-spec.ts"
}
```

Expected: xanh, số test đúng baseline.

- [ ] **Step 3: Cắt allow-list**

Xoá khỏi `RAW_SEED_ALLOWLIST`: `access-request`, `accounts`, `agent-join-rate-limit`, `agent-join`, `attendance`, `class-scoped-enrollment`, `classes-teacher-crud`, `roster-import`, `session-roster-freeze`.
Xoá khỏi `SESSION_BODY_ALLOWLIST`: `access-request`, `agent-join-rate-limit`, `agent-join`, `attendance`, `class-scoped-enrollment`, `session-roster-freeze`.

Chạy `npx jest src/common/e2e-seed-hygiene.spec.ts` → PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/api/test apps/api/src/common/e2e-seed-hygiene.spec.ts
git commit -m "test(e2e): họ agent/điểm danh/danh sách lớp dùng helper seed (9 file)"
```

---

### Task 6: Đợt 4 — phiên thi và phần còn lại (8 file), rồi chốt

**Files:**
- Modify (dưới `apps/api/test/`): `exam-session`, `exam-schedule-conflict`, `exam-session-semester-name`, `exam-session-reassign`, `exam-material`, `exam-authoring-attach`, `session-lifecycle`, `session-rubric` (đều `.e2e-spec.ts`)
- Modify: `apps/api/src/common/e2e-seed-hygiene.spec.ts`

**Interfaces:**
- Consumes: Task 1.

| File | Vị trí | Loại |
|---|---|---|
| `exam-session-reassign` | `cls@60` `post@67` | R1 + R4 |
| `exam-material` | `cls@97,315` `enr@103,321` `post@110,328` | R1 + R2 + R4 |
| `exam-authoring-attach` | `cls@100` `post@46` | R1 + R4 |
| `session-lifecycle` | `post@62` | R4 |
| `session-rubric` | `cls@104,110,115` `post@45` | R1 + R4 |
| `exam-session` | `cls@116,125,136` `enr@356` (21 POST) | **chỉ R1 + R2** |
| `exam-schedule-conflict` | `cls@109,115,132` `ses@423` `post@62` | **chỉ R1 + R3** |
| `exam-session-semester-name` | `cls@51` `post@76` | **chỉ R1** |

Ba file cuối **giữ nguyên các thân POST** (`roomName`, `semesterName` nằm trong thân): chúng là bài kiểm chính tính năng "phòng và học kỳ gõ tay" nên plan D viết lại chúng, không chuyển. Vì thế chúng ở lại `SESSION_BODY_ALLOWLIST` vĩnh viễn (tới plan D).

- [ ] **Step 1: Áp công thức; ba ngoại lệ**

- `exam-session.e2e-spec.ts`: ba lớp ở dòng 116/125/136. Lớp thứ ba (`otherKlass`) dùng môn `otherCourse.name` cho `ownerId` — **giữ `courseName: otherCourse.name`**. Dùng `groupName` cho cả ba (`Nhóm của tôi ${Date.now()}`, `Nhóm của người khác ${Date.now()}`, `Nhóm kỳ sau ${Date.now()}`). Enrollment ở dòng 356 → R2.
- `exam-schedule-conflict.e2e-spec.ts`: R1 cho ba lớp (dòng 109/115/132, giữ `courseName` nó đang dùng) và R3 cho ca chèn thẳng ở dòng 423: `status: 'active'` (mặc định), `examType: 'TK'`, `startTime`/`endTime` là các biến `startTime`/`endTime` đang dùng nhưng helper nhận `Date`: bọc `new Date(startTime)`, `new Date(endTime)`; code `RAW${Date.now() % 1000}`; `semesterName: 'HK kiểm thử'` (mặc định); `courseName`, `roomName` giữ biến hiện có. Ca này chờ `{ code: '23P01' }`: **không đổi** khẳng định.
- `exam-session-semester-name.e2e-spec.ts`: chỉ R1 (dòng 51).

- [ ] **Step 2: Chạy từng file, đối chiếu baseline**

```powershell
cd apps/api
foreach ($f in 'exam-session','exam-schedule-conflict','exam-session-semester-name','exam-session-reassign','exam-material','exam-authoring-attach','session-lifecycle','session-rubric') {
  npx jest --config ./test/jest-e2e.json "test/$f.e2e-spec.ts"
}
```

Expected: xanh, số test đúng baseline.

- [ ] **Step 3: Cắt allow-list lần cuối và bật khẳng định đích**

Xoá khỏi `RAW_SEED_ALLOWLIST` bảy mục còn lại: `exam-authoring-attach`, `exam-material`, `exam-schedule-conflict`, `exam-session-reassign`, `exam-session-semester-name`, `exam-session`, `session-rubric` (`session-lifecycle` không nằm trong danh sách này vì nó chưa từng có SQL thô; nó chỉ có ở danh sách rule 2). Sau bước này `RAW_SEED_ALLOWLIST` rỗng: đổi nó thành `new Set<string>([])`.
Xoá khỏi `SESSION_BODY_ALLOWLIST`: `exam-authoring-attach`, `exam-material`, `exam-session-reassign`, `session-lifecycle`, `session-rubric`. Còn lại đúng ba file trong `PERMANENT_SESSION_BODY_FILES`.

Bật khẳng định đích bằng cách bỏ điều kiện môi trường ở bài kiểm cuối của guard: thay khối

```ts
    if (process.env.SEED_HYGIENE_FINAL === '1') {
      expect(extra).toEqual([]);
    }
```

bằng

```ts
    expect(extra).toEqual([]);
```

và xoá hai dòng chú thích "Khẳng định này CHỦ Ý chưa bật…" / "Xem Step 1 của Task 6…" ngay trên nó.

Run: `npx jest src/common/e2e-seed-hygiene.spec.ts` → PASS (5 test, `RAW_SEED_ALLOWLIST` rỗng).

- [ ] **Step 4: Chạy cả bộ e2e và so với baseline từng file**

```powershell
Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match 'jest|nest' } | Select-Object ProcessId, CommandLine
cd apps/api
npx jest --config ./test/jest-e2e.json --runInBand --json --outputFile=C:/tmp/e2e-after-a.json
node scripts/e2e-summary.cjs C:/tmp/e2e-after-a.json | Out-File -Encoding utf8 C:/tmp/after-a.tsv
```

Đối chiếu với baseline, bỏ dòng chú thích `#`:

```powershell
$base = Get-Content ../../docs/superpowers/plans/md-restore-baseline.tsv | Where-Object { $_ -notmatch '^#' }
$after = Get-Content C:/tmp/after-a.tsv
Compare-Object $base $after
```

Expected: đúng ba dòng khác biệt hợp lệ — dòng `seed-helper.e2e-spec.ts` (8 pass, 0 fail, 0 pending) mới xuất hiện, cùng dòng `TOTAL` cũ và mới (số test pass tăng đúng 8). Mọi dòng khác phải giống hệt. Bất kỳ khác biệt nào khác nghĩa là một test đã đổi hành vi: dừng lại, tìm file đó, so với bản trước (`git diff <baseline commit> -- <file>`).

Chạy bộ unit: `pnpm test 2>&1 | Out-File C:/tmp/unit-after-a.txt; Select-String C:/tmp/unit-after-a.txt -Pattern '^Tests:|^Test Suites:'`. Expected: số test = baseline unit + 5 (guard).

- [ ] **Step 5: Commit**

```bash
git add apps/api/test apps/api/src/common/e2e-seed-hygiene.spec.ts
git commit -m "test(e2e): hoàn tất gom seed; guard ratchet chỉ còn ba file kiểm tính năng phòng/học kỳ gõ tay"
```

---

## Tự kiểm lại plan so với spec

- Spec §10 bước 1 (gom `INSERT` thô vào một helper, e2e xanh trước và sau, kết luận bằng chạy cả bộ): Task 0 (baseline) + Task 1–6 + Task 6 Step 4.
- Spec §13 mục 13 (helper phải tạo mã danh nghĩa trước khi dựng lớp): `seedClass` đã nói bằng từ vựng `code`/`groupName`; plan D thêm bước tạo hàng `administrative_class` **bên trong** `seedClass` mà không đổi chữ ký.
- Spec T-GR-1 ("toàn bộ e2e chấm điểm hiện có xanh sau khi đổi helper seed"): Task 3 và Task 6 Step 4.
- Không có migration, không có route, không đụng `apps/api/src/` ngoài guard: Global Constraints.
