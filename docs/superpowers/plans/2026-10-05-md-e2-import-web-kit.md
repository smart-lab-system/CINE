# Plan E2 — Bộ nhập file dùng chung trên trình duyệt (web)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Một bộ import **điều khiển bằng mô tả cột** cho bốn loại dữ liệu nền (học kỳ, phòng thi, Danh mục lớp danh nghĩa, lớp): đọc .xlsx **trong trình duyệt**, tự nhận diện cột theo tên (cho chỉnh tay), gọi `dryRun` ở server để xem trước **đúng cái lần ghi thật sẽ làm**, và chỉ ghi khi admin xác nhận. Kèm **file mẫu tải về** cho từng loại và bản sửa `readWorkbook` để **ô ngày** không còn bị đọc thành `Date.toString()`.

**Architecture:** Phần thuần (mô tả cột, nhận diện cột, tách dòng, dựng file mẫu) nằm ở `lib/import/` và được test bằng dữ liệu thật; phần giao diện tách làm ba lớp: `ImportPreview` (chỉ vẽ một `ImportResult`), `ImportWizard` (trạng thái + nhận `run` và `readSheets` từ ngoài, nên test không cần mạng hay file), và `ImportDialog` (keo dán: chọn bộ chạy theo loại, bọc trong hộp thoại). Trang admin ở plan G chỉ cần `<ImportDialog kind={ROOM_KIND} onImported={…} />`. Roster của giảng viên **giữ nguyên** (`components/roster/*`, `roster-file.ts`) — plan này không sửa chúng, chỉ dùng lại `trimTrailingBlankRows`.

**Tech Stack:** Next.js 15, React 19, exceljs 4.4 (nạp lười), Radix Select/Dialog (shadcn có sẵn), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §6.1 (cột trong file), §6.2 nguyên tắc 3, 4, 5, 8, §6.3 (bộ dùng chung, giới hạn 5MB/2.000 dòng/40 cột, trần dòng, ô ngày), §5.1 (nút "Nhập từ file"), §11: T-IMP-1, T-IMP-4, T-IMP-5, T-IMP-6 (phần hiển thị), T-IMP-8 (phần hiển thị).

**Phụ thuộc:** plan E1 đã xong (bốn route `…/import`, hình dạng `ImportResult`) **và đã sinh lại** `packages/shared/src/api/schema.d.ts` (E1 Task 7).

## Global Constraints

- **File không lên server** (CLAUDE.md Security rule 5, spec §6.3): exceljs đọc trong trình duyệt, chỉ **các dòng chữ** được gửi dưới dạng JSON. Giữ nguyên giới hạn `readWorkbook` (5MB / 2.000 dòng / 40 cột).
- **Mọi ô gửi lên là CHỮ**, kèm `line` = số dòng như Excel hiện ra (vị trí trong sheet, 1-based, **không** đếm lại sau khi bỏ dòng trống). Client không hiểu số/ngày/học kỳ — server làm (E1 `import-cells.ts`); client chỉ kiểm cấu trúc (có cột bắt buộc không, có dòng dữ liệu không, có vượt trần dòng không).
- **Ô ngày phải ra `yyyy-mm-dd` theo UTC** (`getUTC*`), không theo múi giờ máy: exceljs dựng `Date` ở nửa đêm UTC từ số sê-ri, nên getter địa phương sẽ lệch ngày ở múi giờ âm. `cell.text` của ô ngày là `Date.toString()` ("Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)") — server từ chối chuỗi đó có chủ ý (E1), nên **không bao giờ** được để nó rời trình duyệt.
- **Nhận diện cột theo tên trước, chỉnh tay sau** (nguyên tắc 8): so tên cột sau chuẩn hoá (bỏ dấu, hoa-thường, ký tự lạ) với tên chính thức và các bí danh; quét tối đa 10 dòng đầu để tìm dòng tiêu đề; **chỉ coi là nhận diện được khi MỌI cột bắt buộc đều khớp**; nếu không, ghép theo thứ tự cột và **mở sẵn bước chỉnh cột** kèm lời nói rõ là chưa nhận diện được. Một cột của file không bao giờ gán cho hai trường (kể cả khi chỉnh tay: chọn một cột đang thuộc trường khác thì hai trường hoán đổi cột).
- **Xem trước = ghi** (nguyên tắc 5): bản xem trước **luôn** là kết quả của `run({ dryRun: true })` trên server — client không tự tính diff. Nút xác nhận gửi **đúng các dòng** đã được xem trước. Đáp ứng cũ đến muộn không được ghi đè đáp ứng mới (cả hai là `dryRun`).
- **Bản xem trước phải đủ để quyết định** (nguyên tắc 2, 3, 4): dòng lỗi kèm **số dòng**; dòng cập nhật kèm **từ → đến** ("Giảng viên: A → B"); mục mới **gần giống** hiện cạnh mục bị so ("X" (mới) gần giống "Y" (đã có) / (dòng N trong file)) kèm lý do bằng chữ; nút xác nhận **tắt** khi còn lỗi, khi không có gì để ghi, và khi còn mục gần giống mà chưa tick xác nhận. `confirmSimilar: true` chỉ được gửi khi đã tick.
- File mẫu: `.xlsx` sinh trong trình duyệt, **đúng tên cột chính thức**, một dòng ví dụ, ô định dạng chữ (để Excel không tự đổi `2026-09-01` thành ngày hay `1` thành số); thêm một sheet "Huong dan" giải thích từng cột. File mẫu phải **tự nhận diện được** bằng chính bộ nhận diện (kiểm bằng vòng khứ hồi thật).
- Giao diện không có chỗ ghi **số liệu hay dữ liệu thật của người dùng** vào `localStorage`/URL; mọi trạng thái nằm trong React state và mất khi đóng hộp thoại (Radix gỡ nội dung khi đóng).
- **Phân lớp gọi API** (CLAUDE.md: trang và component gọi **hook**, không gọi `lib/api` trực tiếp): `ImportDialog` lấy bộ chạy từ `useImportRunner`; hook đó bọc `lib/api/master-data-import.ts` và **làm mới danh sách** sau lần ghi thật đã áp dụng, nên không trang nào phải nhớ gọi `refetch` sau khi nhập. Khoá truy vấn lấy từ `hooks/master-data-keys.ts`, dùng chung với các hook đọc của plan G1/G2.
- Chỉ dùng thành phần UI có sẵn (`components/ui/*`); không thêm thư viện. Lint (`eslint .`), `tsc` và `next build` phải sạch; không có bước e2e trình duyệt trong plan này (đã có lượt browser pass riêng ở plan H).

## Review Focus

1. **Ô ngày bị đọc thành chuỗi rác hoặc lệch một ngày** (múi giờ). → test bằng .xlsx thật chứa ô ngày và ô công thức ra ngày (Task 1); getter UTC.
2. **Nhận diện nhầm cột** (hai tên giống nhau, dòng tiêu đề nằm sau tiêu đề bìa, cột lạ chen giữa, cột bắt buộc thiếu). → bảng ca ở Task 2; không bao giờ gán một cột cho hai trường.
3. **Số dòng trong lỗi lệch so với Excel** vì dòng trống bị bỏ. → `line` lấy từ vị trí trong sheet; test có dòng trống ở giữa (Task 2).
4. **Đáp ứng `dryRun` cũ đến muộn ghi đè đáp ứng mới**, hiện bản xem trước của file khác. → test hai lần chọn file với lời hứa trả muộn (Task 6).
5. **Xác nhận bản xem trước đã lỗi thời / xác nhận khi còn gần giống chưa tick / bấm hai lần.** → nút tắt theo từng điều kiện, `saving` khoá nút; server từ chối kèm bản xem trước mới thì hiện lại (Task 6).
6. **File vượt trần dòng mà vẫn bị gửi đi.** → chặn ở client với câu rõ ràng, không gọi `run` (Task 2, 6); server vẫn chặn (E1).
7. **File mẫu và bộ nhận diện lệch nhau**, mẫu tải về không tự nhận diện được. → vòng khứ hồi thật cho cả bốn loại (Task 3).
8. **Lỗi mạng khi xem trước bị nuốt** — admin thấy "không có gì" và tưởng file trống. → lỗi hiện thành `Alert`, không phải bản xem trước rỗng (Task 6).

---

## File Structure

| File | Việc |
|---|---|
| `apps/web/src/lib/read-workbook.ts` (+ test) | Ô ngày → `yyyy-mm-dd` (UTC), kể cả ô công thức ra ngày. |
| `apps/web/src/lib/import/import-types.ts` | **Mới.** Kiểu phản chiếu `ImportResult` của server, `ImportRowInput`, `RunImport`, `ImportRejectedError`. |
| `apps/web/src/lib/import/columns.ts` (+ test) | **Mới.** `ImportKind`/`ImportColumn`, bốn mô tả (`SEMESTER_KIND`…), `normalizeHeader`, `detectMapping`, `detectBestSheet`, `extractImportRows`, `columnLabel`. |
| `apps/web/src/lib/import/template.ts` (+ test) | **Mới.** `buildTemplateBytes`, `downloadTemplate`. |
| `apps/web/src/lib/api/master-data-import.ts` (+ test) | **Mới.** Bốn hàm gọi API + `IMPORT_RUNNERS`. |
| `apps/web/src/components/import/import-preview.tsx` (+ test) | **Mới.** |
| `apps/web/src/components/import/import-column-mapper.tsx` | **Mới.** |
| `apps/web/src/components/import/import-wizard.tsx` (+ test) | **Mới.** |
| `apps/web/src/components/import/import-dialog.tsx` (+ test) | **Mới.** Nút + hộp thoại; lấy bộ chạy từ `useImportRunner`. |
| `apps/web/src/hooks/master-data-keys.ts` | **Mới.** Khoá truy vấn dữ liệu nền dùng chung với plan G1/G2. |
| `apps/web/src/hooks/useMasterDataImport.ts` (+ test) | **Mới.** `useImportRunner`: bọc `IMPORT_RUNNERS`, làm mới danh sách sau lần ghi thật. |

---

### Task 1: `readWorkbook` đọc ô ngày

**Files:**
- Modify: `apps/web/src/lib/read-workbook.ts`
- Test: `apps/web/src/lib/read-workbook.test.ts`

**Interfaces:**
- Consumes: không.
- Produces: `readWorkbook(file)` trả `SheetData[]` mà **ô ngày** (giá trị `Date`, hoặc ô công thức có `result` là `Date`) ra `yyyy-mm-dd`; mọi loại ô khác giữ nguyên hành vi.

- [ ] **Step 1: Viết test (đỏ)**

Trong `apps/web/src/lib/read-workbook.test.ts`, thêm import `Workbook` và một nhóm test mới ở cuối file. Đầu file thêm:

```ts
import { Workbook } from 'exceljs';
```

Cuối file thêm:

```ts
/**
 * Ô ngày. exceljs trả giá trị `Date`, còn `cell.text` của nó là `Date.toString()` theo múi giờ máy
 * ("Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)") — một chuỗi không parser nào của chúng ta nhận, và server từ chối
 * nó có chủ ý. Bộ test này dựng một .xlsx THẬT chứ không giả `cell`, vì điều cần chứng minh là cái exceljs thật sự trả.
 */
async function workbookFile(fill: (sheet: import('exceljs').Worksheet) => void): Promise<File> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet('S');
  fill(sheet);
  const buffer = await workbook.xlsx.writeBuffer();
  return new File([buffer], 'ngay.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

describe('readWorkbook: ô ngày', () => {
  it('ô ngày ra yyyy-mm-dd, bất kể định dạng hiển thị của ô', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const file = await workbookFile((sheet) => {
      sheet.getCell('A1').value = new Date(Date.UTC(2026, 8, 1)); // 01/09/2026
      sheet.getCell('A1').numFmt = 'dd/mm/yyyy';
      sheet.getCell('A2').value = new Date(Date.UTC(2027, 0, 31));
      sheet.getCell('A2').numFmt = 'yyyy-mm-dd';
      sheet.getCell('A3').value = new Date(Date.UTC(2027, 1, 1));
      sheet.getCell('A3').numFmt = 'd mmm yyyy';
    });

    const [sheet] = await readWorkbook(file);

    // Không có `GMT`, không có tên thứ: đó là dấu hiệu của `Date.toString()`.
    expect(sheet.rows.map((row) => row[0])).toEqual(['2026-09-01', '2027-01-31', '2027-02-01']);
  });

  it('ô công thức cho ra ngày cũng ra yyyy-mm-dd', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const file = await workbookFile((sheet) => {
      sheet.getCell('A1').value = new Date(Date.UTC(2026, 8, 1));
      sheet.getCell('B1').value = { formula: 'A1+30', result: new Date(Date.UTC(2026, 9, 1)) };
    });

    const [sheet] = await readWorkbook(file);

    expect(sheet.rows[0]).toEqual(['2026-09-01', '2026-10-01']);
  });

  it('ô chữ trông như ngày, ô số, ô chữ thường giữ NGUYÊN — chỉ ô ngày thật mới được đổi', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const file = await workbookFile((sheet) => {
      sheet.getCell('A1').value = '01/09/2026';
      sheet.getCell('B1').value = '2026-09-01';
      sheet.getCell('C1').value = 40;
      sheet.getCell('D1').value = 'HK1 2026-2027';
      sheet.getCell('E1').value = '  Phòng H3.03  ';
    });

    const [sheet] = await readWorkbook(file);

    expect(sheet.rows[0]).toEqual(['01/09/2026', '2026-09-01', '40', 'HK1 2026-2027', 'Phòng H3.03']);
  });
});
```

Dòng đầu của file hiện đã có `import { describe, expect, it } from 'vitest';` và `PARSE_TIMEOUT_MS` — dùng lại, không khai báo lại.

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/read-workbook.test.ts`
Expected: FAIL ở hai ca đầu — ô ngày ra `Tue Sep 01 2026 …` thay vì `2026-09-01` (đây chính là lỗi cần sửa). Ca thứ ba xanh ngay (hành vi cũ đúng cho ô không phải ngày).

- [ ] **Step 3: Sửa `cellText`**

Trong `apps/web/src/lib/read-workbook.ts`, thay hàm `cellText` và khối chú thích của nó bằng:

```ts
/**
 * `.text` is the displayed value, which is what the user matched their
 * column choice against — a student id stored as a number reads back as the
 * digits they see, and a formula reads back as its result rather than its
 * source.
 *
 * Ngoại lệ DUY NHẤT: ô ngày. exceljs trả giá trị `Date`, và `.text` của nó là `Date.toString()` theo múi giờ máy
 * ("Tue Sep 01 2026 07:00:00 GMT+0700 (Indochina Time)") — không ai gõ chuỗi đó và không parser nào nhận nó. Ngày được đọc
 * từ GIÁ TRỊ bằng getter UTC: exceljs dựng `Date` ở nửa đêm UTC từ số sê-ri của Excel, nên getter địa phương sẽ cho ngày
 * hôm trước ở mọi múi giờ phía tây Greenwich. Kết quả là `yyyy-mm-dd`, một trong hai dạng không mơ hồ mà server nhận.
 */
function cellText(cell: { text?: string; value?: unknown }): string {
  const date = dateOf(cell.value);
  if (date) {
    return isoDate(date);
  }
  const text = cell.text;
  if (typeof text === 'string') {
    return text.trim();
  }
  const value = cell.value;
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Giá trị là `Date`, hoặc là ô công thức mà kết quả là `Date`. */
function dateOf(value: unknown): Date | null {
  const candidate =
    value instanceof Date
      ? value
      : typeof value === 'object' && value !== null && 'result' in value
        ? (value as { result: unknown }).result
        : null;
  return candidate instanceof Date && !Number.isNaN(candidate.getTime()) ? candidate : null;
}

function isoDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${month}-${day}`;
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/read-workbook.test.ts`
Expected: PASS (cả hai ca fixture demo cũ lẫn ba ca mới). Nếu ca thứ nhất còn đỏ ở một ô duy nhất, kiểm `numFmt` của ô đó: exceljs chỉ coi là ngày khi giá trị là `Date`, không phụ thuộc `numFmt`, nên lỗi ở đây gần như chắc chắn là getter địa phương lọt vào.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/read-workbook.ts apps/web/src/lib/read-workbook.test.ts
git commit -m "fix(web): readWorkbook đọc ô ngày thành yyyy-mm-dd (UTC) thay vì Date.toString()"
```

---

### Task 2: Kiểu, mô tả cột, nhận diện cột, tách dòng

**Files:**
- Create: `apps/web/src/lib/import/import-types.ts`, `apps/web/src/lib/import/columns.ts`
- Test: `apps/web/src/lib/import/columns.test.ts`

**Interfaces:**
- Consumes: `trimTrailingBlankRows` (`@/lib/roster-file`), `SheetData` (`@/lib/read-workbook`).
- Produces:

```ts
// import-types.ts
export type ImportRowStatus = 'new' | 'update' | 'unchanged' | 'error';
export interface ImportChange { field: string; label: string; from: string | null; to: string | null }
export interface ImportSimilar { id: string | null; name: string; reason: 'normalized' | 'insert_delete' | 'swap'; source: 'existing' | 'file'; line: number | null }
export interface ImportRowResult { line: number; status: ImportRowStatus; label: string; changes: ImportChange[]; errors: string[]; similar: ImportSimilar[] }
export interface ImportResult { dryRun: boolean; applied: boolean; counts: { added: number; updated: number; unchanged: number; errors: number }; rows: ImportRowResult[]; needsSimilarConfirmation: boolean }
export type ImportRowInput = { line: number } & Record<string, string | number>;
export interface ImportRequest { rows: ImportRowInput[]; dryRun: boolean; confirmSimilar?: boolean }
export type RunImport = (request: ImportRequest) => Promise<ImportResult>;
export class ImportRejectedError extends Error { code: 'IMPORT_HAS_ERRORS' | 'NEAR_DUPLICATE'; preview: ImportResult }
// columns.ts
export type ImportKindId = 'semester' | 'room' | 'administrative-class' | 'class';
export interface ImportColumn { key: string; label: string; required: boolean; aliases: readonly string[]; example: string; hint: string }
export interface ImportKind { id: ImportKindId; title: string; noun: string; columns: readonly ImportColumn[]; maxRows: number; sheetName: string; fileName: string }
export const SEMESTER_KIND, ROOM_KIND, ADMINISTRATIVE_CLASS_KIND, CLASS_KIND: ImportKind;
export const IMPORT_KINDS: Record<ImportKindId, ImportKind>;
export interface ImportMapping { headerRows: number; columns: Record<string, number | null> }
export function normalizeHeader(text: string): string;
export function detectMapping(rows: string[][], kind: ImportKind): { mapping: ImportMapping; detected: boolean };
export function detectBestSheet(sheets: readonly SheetData[], kind: ImportKind): number;
export function extractImportRows(rows: string[][], mapping: ImportMapping, kind: ImportKind): { rows: ImportRowInput[]; problems: string[] };
export function columnLabel(index: number): string;   // 0 -> 'A', 26 -> 'AA'
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/import/columns.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  ADMINISTRATIVE_CLASS_KIND,
  CLASS_KIND,
  IMPORT_KINDS,
  ROOM_KIND,
  SEMESTER_KIND,
  columnLabel,
  detectBestSheet,
  detectMapping,
  extractImportRows,
  normalizeHeader,
} from './columns';

describe('normalizeHeader', () => {
  it.each([
    ['Tên phòng', 'ten phong'],
    ['SỨC CHỨA', 'suc chua'],
    ['Đại sảnh', 'dai sanh'],
    ['  Mã lớp  danh-nghĩa ', 'ma lop danh nghia'],
    ['Email (giảng viên)', 'email giang vien'],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeHeader(input)).toBe(expected);
  });
});

describe('columnLabel', () => {
  it('đặt tên cột như Excel', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(columnLabel)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });
});

describe('IMPORT_KINDS', () => {
  it('trần dòng khớp spec §6.3 và khớp server (E1)', () => {
    expect(SEMESTER_KIND.maxRows).toBe(20);
    expect(ROOM_KIND.maxRows).toBe(500);
    expect(ADMINISTRATIVE_CLASS_KIND.maxRows).toBe(500);
    expect(CLASS_KIND.maxRows).toBe(200);
  });

  it('khoá cột khớp tên trường của DTO server', () => {
    expect(SEMESTER_KIND.columns.map((c) => c.key)).toEqual(['academicYear', 'term', 'startDate', 'endDate']);
    expect(ROOM_KIND.columns.map((c) => c.key)).toEqual(['name', 'capacity']);
    expect(ADMINISTRATIVE_CLASS_KIND.columns.map((c) => c.key)).toEqual(['code']);
    expect(CLASS_KIND.columns.map((c) => c.key)).toEqual(['semester', 'administrativeClassCode', 'groupName', 'teacherEmail']);
  });

  it('chỉ sức chứa và nhóm là không bắt buộc', () => {
    const optional = Object.values(IMPORT_KINDS).flatMap((k) => k.columns.filter((c) => !c.required).map((c) => c.key));
    expect(optional.sort()).toEqual(['capacity', 'groupName']);
  });
});

describe('detectMapping', () => {
  it('nhận diện theo tên chính thức ở dòng đầu', () => {
    const result = detectMapping([['Tên phòng', 'Sức chứa'], ['H3.03', '40']], ROOM_KIND);
    expect(result).toEqual({ detected: true, mapping: { headerRows: 1, columns: { name: 0, capacity: 1 } } });
  });

  it('không phụ thuộc thứ tự cột, dấu hay hoa-thường', () => {
    const result = detectMapping([['SUC CHUA', 'ten phong'], ['40', 'H3.03']], ROOM_KIND);
    expect(result.mapping.columns).toEqual({ name: 1, capacity: 0 });
    expect(result.detected).toBe(true);
  });

  it('tìm dòng tiêu đề sau một dòng tiêu đề bìa và một dòng trống (Review Focus 2)', () => {
    const rows = [
      ['DANH SÁCH PHÒNG THI HỌC KỲ 1', ''],
      ['', ''],
      ['STT', 'Phòng', 'Số chỗ'],
      ['1', 'H3.03', '40'],
    ];
    const result = detectMapping(rows, ROOM_KIND);
    expect(result.detected).toBe(true);
    expect(result.mapping).toEqual({ headerRows: 3, columns: { name: 1, capacity: 2 } });
  });

  it('bỏ qua cột lạ chen giữa', () => {
    const result = detectMapping([['STT', 'Tên phòng', 'Ghi chú', 'Sức chứa'], ['1', 'H3.03', '', '40']], ROOM_KIND);
    expect(result.mapping.columns).toEqual({ name: 1, capacity: 3 });
  });

  it('cột không bắt buộc vắng mặt thì là null mà vẫn nhận diện được', () => {
    const result = detectMapping([['Tên phòng'], ['H3.03']], ROOM_KIND);
    expect(result).toEqual({ detected: true, mapping: { headerRows: 1, columns: { name: 0, capacity: null } } });
  });

  it('thiếu cột BẮT BUỘC thì không nhận diện: ghép theo thứ tự, một dòng tiêu đề (Review Focus 2)', () => {
    const result = detectMapping([['Cái này', 'Cái kia'], ['H3.03', '40']], ROOM_KIND);
    expect(result).toEqual({ detected: false, mapping: { headerRows: 1, columns: { name: 0, capacity: 1 } } });
  });

  it('dòng tiêu đề nằm quá xa (sau 10 dòng) thì không tìm', () => {
    const filler = Array.from({ length: 11 }, () => ['x', 'y']);
    const result = detectMapping([...filler, ['Tên phòng', 'Sức chứa']], ROOM_KIND);
    expect(result.detected).toBe(false);
  });

  it('học kỳ: bốn cột bắt buộc, "Học kỳ" là cột kỳ', () => {
    const result = detectMapping([['Năm học', 'Học kỳ', 'Ngày bắt đầu', 'Ngày kết thúc']], SEMESTER_KIND);
    expect(result.mapping.columns).toEqual({ academicYear: 0, term: 1, startDate: 2, endDate: 3 });
    expect(result.detected).toBe(true);
  });

  it('lớp: nhận cả tên chính thức lẫn bí danh ngắn', () => {
    const official = detectMapping([['Học kỳ', 'Mã lớp danh nghĩa', 'Nhóm', 'Email giảng viên']], CLASS_KIND);
    expect(official.mapping.columns).toEqual({ semester: 0, administrativeClassCode: 1, groupName: 2, teacherEmail: 3 });
    const short = detectMapping([['HK', 'Lớp', 'Group', 'Email']], CLASS_KIND);
    expect(short.detected).toBe(true);
    expect(short.mapping.columns).toEqual({ semester: 0, administrativeClassCode: 1, groupName: 2, teacherEmail: 3 });
  });

  it('một cột của file không bao giờ gán cho hai trường', () => {
    // Cả hai tên đều khớp bí danh của `semester` ("hoc ky" và "ky"); chỉ MỘT cột được nhận, cột còn lại bị bỏ.
    const result = detectMapping([['Học kỳ', 'Kỳ', 'Mã lớp', 'Email']], CLASS_KIND);
    const assigned = Object.values(result.mapping.columns).filter((v): v is number => v !== null);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('danh mục lớp danh nghĩa: một cột "Mã lớp"', () => {
    const result = detectMapping([['Mã lớp'], ['DHKTPM18A']], ADMINISTRATIVE_CLASS_KIND);
    expect(result).toEqual({ detected: true, mapping: { headerRows: 1, columns: { code: 0 } } });
  });
});

describe('detectBestSheet', () => {
  it('chọn sheet đầu tiên nhận diện được, bỏ qua sheet bìa', () => {
    const sheets = [
      { name: 'Bia', rows: [['Giới thiệu']] },
      { name: 'DS', rows: [['Tên phòng'], ['H3.03']] },
    ];
    expect(detectBestSheet(sheets, ROOM_KIND)).toBe(1);
  });

  it('không sheet nào nhận diện được thì lấy sheet đầu', () => {
    expect(detectBestSheet([{ name: 'A', rows: [['x']] }, { name: 'B', rows: [['y']] }], ROOM_KIND)).toBe(0);
  });
});

describe('extractImportRows', () => {
  const MAPPING = { headerRows: 1, columns: { name: 0, capacity: 1 } };

  it('đọc cột đã ghép, cắt khoảng trắng, mang số dòng như Excel hiện ra', () => {
    const result = extractImportRows([['Tên', 'Sức'], ['H3.03', ' 40 '], ['H3.04', '']], MAPPING, ROOM_KIND);
    expect(result.problems).toEqual([]);
    expect(result.rows).toEqual([
      { line: 2, name: 'H3.03', capacity: '40' },
      { line: 3, name: 'H3.04', capacity: '' },
    ]);
  });

  it('dòng trống ở giữa bị bỏ qua nhưng số dòng của các dòng sau KHÔNG xê dịch (Review Focus 3)', () => {
    const result = extractImportRows([['h'], ['A'], [''], ['B'], ['', '']], { headerRows: 1, columns: { name: 0, capacity: null } }, ROOM_KIND);
    expect(result.rows.map((r) => [r.line, r.name])).toEqual([[2, 'A'], [4, 'B']]);
  });

  it('dòng chỉ có dữ liệu ở cột KHÔNG được ghép coi như trống', () => {
    const result = extractImportRows([['h'], ['', 'ghi chú'], ['A']], { headerRows: 1, columns: { name: 0, capacity: null } }, ROOM_KIND);
    expect(result.rows.map((r) => r.name)).toEqual(['A']);
  });

  it('cột không bắt buộc chưa ghép cho chuỗi rỗng', () => {
    const result = extractImportRows([['h'], ['A']], { headerRows: 1, columns: { name: 0, capacity: null } }, ROOM_KIND);
    expect(result.rows[0]).toEqual({ line: 2, name: 'A', capacity: '' });
  });

  it('cột BẮT BUỘC chưa ghép là một vấn đề nêu tên cột', () => {
    const result = extractImportRows([['h'], ['A']], { headerRows: 1, columns: { name: null, capacity: 1 } }, ROOM_KIND);
    expect(result.problems).toEqual(['Chưa chọn cột "Tên phòng".']);
  });

  it('không có dòng dữ liệu nào sau tiêu đề là một vấn đề', () => {
    const result = extractImportRows([['Tên phòng', 'Sức chứa']], MAPPING, ROOM_KIND);
    expect(result.problems).toEqual(['Không có dòng dữ liệu nào sau phần tiêu đề.']);
  });

  it('vượt trần dòng là một vấn đề nêu cả số dòng lẫn trần (Review Focus 6)', () => {
    const header = [['Năm học', 'Kỳ', 'Ngày bắt đầu', 'Ngày kết thúc']];
    const data = Array.from({ length: 21 }, () => ['2026', '1', '2026-09-01', '2027-01-31']);
    const mapping = { headerRows: 1, columns: { academicYear: 0, term: 1, startDate: 2, endDate: 3 } };
    const result = extractImportRows([...header, ...data], mapping, SEMESTER_KIND);
    expect(result.problems).toEqual(['File có 21 dòng dữ liệu, tối đa 20 dòng mỗi lần nhập.']);
  });

  it('đúng bằng trần thì không có vấn đề', () => {
    const header = [['Năm học', 'Kỳ', 'Ngày bắt đầu', 'Ngày kết thúc']];
    const data = Array.from({ length: 20 }, () => ['2026', '1', '2026-09-01', '2027-01-31']);
    const mapping = { headerRows: 1, columns: { academicYear: 0, term: 1, startDate: 2, endDate: 3 } };
    expect(extractImportRows([...header, ...data], mapping, SEMESTER_KIND).problems).toEqual([]);
  });

  it('số dòng tiêu đề lớn hơn một: dòng đầu tiên của dữ liệu mang đúng số dòng', () => {
    const result = extractImportRows([['bìa'], ['', ''], ['Tên phòng', 'Sức chứa'], ['H3.03', '40']], { headerRows: 3, columns: { name: 0, capacity: 1 } }, ROOM_KIND);
    expect(result.rows[0].line).toBe(4);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/import/columns.test.ts`
Expected: FAIL — không import được `./columns`.

- [ ] **Step 3: Viết kiểu**

Create `apps/web/src/lib/import/import-types.ts`:

```ts
/**
 * Kiểu của một lần import, phản chiếu `apps/api/src/course/import/import.types.ts` (plan E1). Viết tay thay vì lấy từ
 * schema sinh ra vì hai lý do: cấu trúc này là hợp đồng ổn định giữa hai plan, và UI cần `RunImport` — một hàm — mà schema
 * không mô tả. Nếu server đổi hình dạng, `lib/api/master-data-import.test.ts` và các test giao diện là nơi vỡ đầu tiên.
 */
export type ImportRowStatus = 'new' | 'update' | 'unchanged' | 'error';

/** Một trường sẽ đổi — chỉ có ở dòng `update`: "Giảng viên: A → B". */
export interface ImportChange {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

/** Một mục "gần giống" của một dòng MỚI. */
export interface ImportSimilar {
  /** Id của mục có sẵn; `null` khi mục kia là một dòng khác trong cùng file. */
  id: string | null;
  name: string;
  reason: 'normalized' | 'insert_delete' | 'swap';
  source: 'existing' | 'file';
  line: number | null;
}

export interface ImportRowResult {
  /** Số dòng như Excel hiện ra. */
  line: number;
  status: ImportRowStatus;
  label: string;
  changes: ImportChange[];
  errors: string[];
  similar: ImportSimilar[];
}

export interface ImportResult {
  dryRun: boolean;
  /** `true` chỉ khi lần gọi này ĐÃ ghi gì đó. */
  applied: boolean;
  counts: { added: number; updated: number; unchanged: number; errors: number };
  rows: ImportRowResult[];
  /** Có mục mới gần giống mục khác — ghi thật cần `confirmSimilar: true`. */
  needsSimilarConfirmation: boolean;
}

/** Một dòng gửi lên: `line` cùng các ô CHỮ theo khoá cột của loại đang nhập. */
export type ImportRowInput = { line: number } & Record<string, string | number>;

export interface ImportRequest {
  rows: ImportRowInput[];
  dryRun: boolean;
  confirmSimilar?: boolean;
}

/** Thứ duy nhất mà giao diện cần biết về mạng. Test truyền một hàm giả vào đây. */
export type RunImport = (request: ImportRequest) => Promise<ImportResult>;

/**
 * Server từ chối lần GHI THẬT (400 `IMPORT_HAS_ERRORS` hoặc 409 `NEAR_DUPLICATE`) và kèm bản xem trước MỚI NHẤT — trạng thái
 * có thể đã đổi từ lúc xem trước (người khác thêm phòng trong lúc admin đọc). Giao diện hiện lại bản này thay vì chỉ một câu.
 */
export class ImportRejectedError extends Error {
  constructor(
    message: string,
    readonly code: 'IMPORT_HAS_ERRORS' | 'NEAR_DUPLICATE',
    readonly preview: ImportResult,
  ) {
    super(message);
    this.name = 'ImportRejectedError';
  }
}
```

- [ ] **Step 4: Viết mô tả cột, nhận diện cột, tách dòng**

Create `apps/web/src/lib/import/columns.ts`:

```ts
import type { SheetData } from '@/lib/read-workbook';
import { trimTrailingBlankRows } from '@/lib/roster-file';
import type { ImportRowInput } from './import-types';

/**
 * Mô tả cột của từng loại dữ liệu nền (spec §6.3): MỘT cấu trúc điều khiển bộ nhận diện cột, file mẫu, bước ghép cột và bản
 * xem trước. Khoá cột (`key`) là tên trường của DTO server (E1) — đổi một bên là đổi cả hai, và test ghim điều đó.
 *
 * Client chỉ hiểu CẤU TRÚC (có cột không, có dòng không, có vượt trần không). Số, ngày, học kỳ do server hiểu (E1
 * `import-cells.ts`) để chỉ có một chỗ hiểu.
 */

export type ImportKindId = 'semester' | 'room' | 'administrative-class' | 'class';

export interface ImportColumn {
  /** Tên trường trong thân yêu cầu. */
  key: string;
  /** Tên chính thức: tiêu đề cột trong file mẫu. */
  label: string;
  required: boolean;
  /** Tên cột khác cũng được nhận (chưa chuẩn hoá — `normalizeHeader` lo). Tên chính thức luôn được nhận. */
  aliases: readonly string[];
  /** Giá trị ở dòng ví dụ của file mẫu. */
  example: string;
  /** Giải thích ngắn cho sheet "Huong dan" của file mẫu. */
  hint: string;
}

export interface ImportKind {
  id: ImportKindId;
  /** Tiêu đề hộp thoại: "Nhập {title thường} từ file". */
  title: string;
  /** Danh từ trong câu xác nhận "gần giống": "…đúng là những {noun} khác nhau". */
  noun: string;
  columns: readonly ImportColumn[];
  /** Trần dòng — khớp `IMPORT_ROW_LIMITS` của server (spec §6.3). */
  maxRows: number;
  sheetName: string;
  fileName: string;
}

export const SEMESTER_KIND: ImportKind = {
  id: 'semester',
  title: 'Học kỳ',
  noun: 'học kỳ',
  maxRows: 20,
  sheetName: 'HocKy',
  fileName: 'mau-hoc-ky.xlsx',
  columns: [
    {
      key: 'academicYear',
      label: 'Năm học',
      required: true,
      aliases: ['nam', 'nam bat dau', 'academic year'],
      example: '2026',
      hint: 'Năm bắt đầu của năm học, vd 2026 cho năm học 2026-2027.',
    },
    {
      key: 'term',
      label: 'Kỳ',
      required: true,
      aliases: ['hoc ky', 'hk', 'term'],
      example: '1',
      hint: '1, 2 hoặc 3.',
    },
    {
      key: 'startDate',
      label: 'Ngày bắt đầu',
      required: true,
      aliases: ['bat dau', 'ngay bd', 'tu ngay', 'start date', 'start'],
      example: '2026-09-01',
      hint: 'yyyy-mm-dd hoặc dd/mm/yyyy.',
    },
    {
      key: 'endDate',
      label: 'Ngày kết thúc',
      required: true,
      aliases: ['ket thuc', 'ngay kt', 'den ngay', 'end date', 'end'],
      example: '2027-01-31',
      hint: 'yyyy-mm-dd hoặc dd/mm/yyyy. Không được chồng ngày với học kỳ khác.',
    },
  ],
};

export const ROOM_KIND: ImportKind = {
  id: 'room',
  title: 'Phòng thi',
  noun: 'phòng',
  maxRows: 500,
  sheetName: 'PhongThi',
  fileName: 'mau-phong-thi.xlsx',
  columns: [
    {
      key: 'name',
      label: 'Tên phòng',
      required: true,
      aliases: ['ten', 'phong', 'ten phong thi', 'room', 'name'],
      example: 'Phòng máy A1',
      hint: 'Khoá nhận diện. Tên khác là một phòng MỚI; muốn đổi tên một phòng thì sửa thủ công.',
    },
    {
      key: 'capacity',
      label: 'Sức chứa',
      required: false,
      aliases: ['so cho', 'so cho ngoi', 'si so', 'so may', 'capacity'],
      example: '40',
      hint: 'Không bắt buộc, số nguyên 1–1000. Để trống thì không đổi sức chứa đang có.',
    },
  ],
};

export const ADMINISTRATIVE_CLASS_KIND: ImportKind = {
  id: 'administrative-class',
  title: 'Danh mục lớp danh nghĩa',
  noun: 'mã lớp danh nghĩa',
  maxRows: 500,
  sheetName: 'LopDanhNghia',
  fileName: 'mau-lop-danh-nghia.xlsx',
  columns: [
    {
      key: 'code',
      label: 'Mã lớp danh nghĩa',
      required: true,
      aliases: ['ma lop', 'lop danh nghia', 'lop', 'ma', 'code'],
      example: 'DHKTPM18A',
      hint: 'Chữ và số, 3–30 ký tự; tự viết hoa. Chỉ thêm mã mới — không sửa hay xoá bằng file.',
    },
  ],
};

export const CLASS_KIND: ImportKind = {
  id: 'class',
  title: 'Lớp',
  noun: 'lớp',
  maxRows: 200,
  sheetName: 'Lop',
  fileName: 'mau-lop.xlsx',
  columns: [
    {
      key: 'semester',
      label: 'Học kỳ',
      required: true,
      aliases: ['hk', 'semester', 'ky'],
      example: 'HK1 2026-2027',
      hint: 'Dạng HK1 2026-2027. Học kỳ phải đã có.',
    },
    {
      key: 'administrativeClassCode',
      label: 'Mã lớp danh nghĩa',
      required: true,
      aliases: ['ma lop', 'lop danh nghia', 'lop', 'code'],
      example: 'DHKTPM18A',
      hint: 'Phải đã có trong Danh mục lớp danh nghĩa.',
    },
    {
      key: 'groupName',
      label: 'Nhóm',
      required: false,
      aliases: ['group', 'nhom hoc phan'],
      example: 'Nhóm 1',
      hint: 'Không bắt buộc. Để trống nếu lớp không tách nhóm.',
    },
    {
      key: 'teacherEmail',
      label: 'Email giảng viên',
      required: true,
      aliases: ['email gv', 'email', 'giang vien', 'gv'],
      example: 'giangvien@truong.edu.vn',
      hint: 'Tài khoản giảng viên đang hoạt động.',
    },
  ],
};

export const IMPORT_KINDS: Record<ImportKindId, ImportKind> = {
  semester: SEMESTER_KIND,
  room: ROOM_KIND,
  'administrative-class': ADMINISTRATIVE_CLASS_KIND,
  class: CLASS_KIND,
};

/** Cột được chọn cho từng trường: chỉ số cột (0-based) hoặc `null` = không có cột này. */
export interface ImportMapping {
  /** Số dòng đầu cần bỏ qua trước khi tới dữ liệu. */
  headerRows: number;
  columns: Record<string, number | null>;
}

/** Bỏ dấu (kể cả đ/Đ), hạ chữ thường, mọi ký tự không phải chữ/số thành một khoảng trắng. */
export function normalizeHeader(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Tên cột như Excel: 0 → A, 25 → Z, 26 → AA. */
export function columnLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

/** Quét tối đa chừng này dòng đầu để tìm dòng tiêu đề: đủ cho một tiêu đề bìa, không đủ để nhận nhầm dữ liệu làm tiêu đề. */
const HEADER_SCAN_ROWS = 10;

export interface DetectedMapping {
  mapping: ImportMapping;
  /** `true` khi MỌI cột bắt buộc khớp theo tên. `false` = giao diện phải mở sẵn bước chỉnh cột. */
  detected: boolean;
}

/**
 * Tự ghép cột theo TÊN (spec §6.2 nguyên tắc 8). Trong 10 dòng đầu, chọn dòng khớp nhiều cột nhất MÀ có đủ cột bắt buộc; một
 * cột của file không bao giờ gán cho hai trường. Không đủ thì ghép theo thứ tự cột với một dòng tiêu đề và báo `detected:
 * false` — người dùng chỉnh tay, đúng cái bước ghép cột mà roster vẫn hỏi.
 */
export function detectMapping(rows: string[][], kind: ImportKind): DetectedMapping {
  const names = kind.columns.map(
    (column) => new Set([normalizeHeader(column.label), ...column.aliases.map(normalizeHeader)]),
  );

  let best: { rowIndex: number; columns: Record<string, number | null>; matched: number } | null = null;
  const limit = Math.min(rows.length, HEADER_SCAN_ROWS);
  for (let rowIndex = 0; rowIndex < limit; rowIndex++) {
    const headers = rows[rowIndex].map(normalizeHeader);
    const used = new Set<number>();
    const columns: Record<string, number | null> = {};
    let matched = 0;
    kind.columns.forEach((column, i) => {
      const found = headers.findIndex((header, index) => header !== '' && !used.has(index) && names[i].has(header));
      if (found >= 0) {
        used.add(found);
        columns[column.key] = found;
        matched += 1;
      } else {
        columns[column.key] = null;
      }
    });
    const requiredOk = kind.columns.every((column) => !column.required || columns[column.key] !== null);
    if (requiredOk && (!best || matched > best.matched)) {
      best = { rowIndex, columns, matched };
    }
  }

  if (best) {
    return { detected: true, mapping: { headerRows: best.rowIndex + 1, columns: best.columns } };
  }
  const positional: Record<string, number | null> = {};
  kind.columns.forEach((column, i) => {
    positional[column.key] = i;
  });
  return { detected: false, mapping: { headerRows: 1, columns: positional } };
}

/** Sheet đầu tiên nhận diện được cột; không có thì sheet đầu. Bỏ qua sheet bìa/hướng dẫn. */
export function detectBestSheet(sheets: readonly SheetData[], kind: ImportKind): number {
  const index = sheets.findIndex((sheet) => detectMapping(sheet.rows, kind).detected);
  return index >= 0 ? index : 0;
}

export interface ExtractedRows {
  rows: ImportRowInput[];
  /** Vấn đề CẤU TRÚC khiến chưa nên gửi lên. Rỗng = gửi được; giá trị từng ô là việc của server. */
  problems: string[];
}

/**
 * Tách các dòng dữ liệu theo cột đã ghép. `line` là vị trí trong sheet (1-based) — KHÔNG đếm lại sau khi bỏ dòng trống, để
 * "Dòng 7" trong báo lỗi là dòng 7 mà người dùng thấy ở Excel (Review Focus 3). Dòng trống (theo CÁC CỘT ĐÃ GHÉP) bị bỏ
 * qua: khác roster, nơi một dòng trống ở giữa là dấu hiệu ghép sai cột, danh sách phòng/mã có dòng trống ngăn nhóm là chuyện
 * thường và máy chủ cũng không coi dòng trống là lỗi.
 */
export function extractImportRows(rows: string[][], mapping: ImportMapping, kind: ImportKind): ExtractedRows {
  const problems: string[] = [];
  for (const column of kind.columns) {
    if (column.required && mapping.columns[column.key] == null) {
      problems.push(`Chưa chọn cột "${column.label}".`);
    }
  }

  const mappedIndexes = kind.columns
    .map((column) => mapping.columns[column.key])
    .filter((index): index is number => index !== null && index !== undefined);
  const body = trimTrailingBlankRows(rows).slice(mapping.headerRows);
  const extracted: ImportRowInput[] = [];

  body.forEach((cells, offset) => {
    const isBlank = mappedIndexes.every((index) => (cells[index] ?? '').trim() === '');
    if (isBlank) return;
    const row: ImportRowInput = { line: mapping.headerRows + offset + 1 };
    for (const column of kind.columns) {
      const index = mapping.columns[column.key];
      row[column.key] = index === null || index === undefined ? '' : (cells[index] ?? '').trim();
    }
    extracted.push(row);
  });

  if (problems.length === 0 && extracted.length === 0) {
    problems.push('Không có dòng dữ liệu nào sau phần tiêu đề.');
  }
  if (extracted.length > kind.maxRows) {
    problems.push(`File có ${extracted.length} dòng dữ liệu, tối đa ${kind.maxRows} dòng mỗi lần nhập.`);
  }
  return { rows: extracted, problems };
}
```

Hai chỗ cần để ý: (1) `detectMapping` chỉ nhận một dòng khi **có đủ cột bắt buộc** — vì thế "dòng khớp nhiều cột nhất" không bao giờ là dòng thiếu cột bắt buộc dù nó khớp nhiều cột không bắt buộc; (2) trong ca "một cột không gán cho hai trường", cột `Kỳ` khớp bí danh `ky` của trường `semester` còn `Học kỳ` khớp tên chính thức — chỉ một trong hai được nhận, cột kia bị bỏ.

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/import/columns.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/import
git commit -m "feat(web): mô tả cột, nhận diện cột theo tên và tách dòng cho bộ import dữ liệu nền"
```

---

### Task 3: File mẫu tải về

**Files:**
- Create: `apps/web/src/lib/import/template.ts`
- Test: `apps/web/src/lib/import/template.test.ts`

**Interfaces:**
- Consumes: `ImportKind`, `IMPORT_KINDS`, `detectBestSheet`, `detectMapping`, `extractImportRows` (Task 2), `readWorkbook` (Task 1).
- Produces:

```ts
export function buildTemplateBytes(kind: ImportKind): Promise<Uint8Array>;
export function downloadTemplate(kind: ImportKind): Promise<void>;   // keo dán trình duyệt
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/import/template.test.ts`:

```ts
import { File } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { readWorkbook } from '@/lib/read-workbook';
import { IMPORT_KINDS, detectBestSheet, detectMapping, extractImportRows } from './columns';
import { buildTemplateBytes } from './template';

/**
 * Vòng khứ hồi THẬT: file mẫu → exceljs đọc lại → bộ nhận diện → bộ tách dòng. Nếu mẫu và bộ nhận diện lệch nhau (đổi tên
 * cột ở một bên), mẫu tải về sẽ không tự nhận diện được — đúng cái người dùng gặp ngay lần đầu dùng (Review Focus 7).
 */
const PARSE_TIMEOUT_MS = 30_000;

describe('buildTemplateBytes', () => {
  it.each(Object.values(IMPORT_KINDS))(
    'mẫu của "$id" tự nhận diện được cột và cho đúng một dòng ví dụ không có vấn đề cấu trúc',
    { timeout: PARSE_TIMEOUT_MS },
    async (kind) => {
      const bytes = await buildTemplateBytes(kind);
      const sheets = await readWorkbook(new File([bytes], kind.fileName) as unknown as globalThis.File);

      // Sheet hướng dẫn đi sau và không được nhận nhầm là sheet dữ liệu.
      expect(sheets.map((s) => s.name)).toEqual([kind.sheetName, 'Huong dan']);
      const index = detectBestSheet(sheets, kind);
      expect(index).toBe(0);

      const { mapping, detected } = detectMapping(sheets[index].rows, kind);
      expect(detected).toBe(true);
      expect(mapping.headerRows).toBe(1);

      const extracted = extractImportRows(sheets[index].rows, mapping, kind);
      expect(extracted.problems).toEqual([]);
      expect(extracted.rows).toEqual([
        { line: 2, ...Object.fromEntries(kind.columns.map((c) => [c.key, c.example])) },
      ]);
    },
  );

  it('dòng tiêu đề là tên chính thức, và ô ví dụ là CHỮ nguyên văn (không bị Excel đổi thành ngày/số)', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const kind = IMPORT_KINDS.semester;
    const sheets = await readWorkbook(new File([await buildTemplateBytes(kind)], 'x.xlsx') as unknown as globalThis.File);
    expect(sheets[0].rows[0]).toEqual(kind.columns.map((c) => c.label));
    expect(sheets[0].rows[1]).toEqual(['2026', '1', '2026-09-01', '2027-01-31']);
  });

  it('sheet hướng dẫn liệt kê từng cột kèm bắt buộc hay không', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const kind = IMPORT_KINDS.room;
    const sheets = await readWorkbook(new File([await buildTemplateBytes(kind)], 'x.xlsx') as unknown as globalThis.File);
    expect(sheets[1].rows).toEqual([
      ['Cột', 'Bắt buộc', 'Giải thích'],
      ['Tên phòng', 'Có', kind.columns[0].hint],
      ['Sức chứa', 'Không', kind.columns[1].hint],
    ]);
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/import/template.test.ts`
Expected: FAIL — không import được `./template`.

- [ ] **Step 3: Viết bộ dựng mẫu**

Create `apps/web/src/lib/import/template.ts`:

```ts
import type { ImportKind } from './columns';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * File mẫu của một loại (spec §6.2 nguyên tắc 8): đúng tên cột chính thức, một dòng ví dụ, và một sheet "Huong dan" giải
 * thích từng cột. Dựng trong trình duyệt bằng exceljs đã dùng để ĐỌC — không thêm thư viện, không thêm file tĩnh để lệch
 * khỏi `columns.ts` (test khứ hồi bắt lệch).
 *
 * Ô ví dụ định dạng CHỮ (`@`): nếu không, Excel mở file và tự đổi `2026-09-01` thành ngày, `1` thành số — và lần lưu lại sẽ gửi
 * một chuỗi khác với cái mẫu viết.
 */
export async function buildTemplateBytes(kind: ImportKind): Promise<Uint8Array> {
  // Nạp lười như `readWorkbook`: thư viện lớn và chỉ màn hình này cần nó.
  const { Workbook } = await import('exceljs');
  const workbook = new Workbook();

  const data = workbook.addWorksheet(kind.sheetName);
  data.addRow(kind.columns.map((column) => column.label));
  data.addRow(kind.columns.map((column) => column.example));
  data.getRow(1).font = { bold: true };
  data.getRow(2).eachCell((cell) => {
    cell.numFmt = '@';
  });
  kind.columns.forEach((column, index) => {
    data.getColumn(index + 1).width = Math.max(column.label.length, column.example.length, 12) + 4;
  });

  const guide = workbook.addWorksheet('Huong dan');
  guide.addRow(['Cột', 'Bắt buộc', 'Giải thích']);
  for (const column of kind.columns) {
    guide.addRow([column.label, column.required ? 'Có' : 'Không', column.hint]);
  }
  guide.getRow(1).font = { bold: true };
  guide.getColumn(1).width = 24;
  guide.getColumn(2).width = 12;
  guide.getColumn(3).width = 70;

  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** Tải file mẫu về máy. Keo dán trình duyệt (không test — phần đáng test là `buildTemplateBytes`). */
export async function downloadTemplate(kind: ImportKind): Promise<void> {
  const bytes = await buildTemplateBytes(kind);
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: XLSX_TYPE }));
  const link = document.createElement('a');
  link.href = url;
  link.download = kind.fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/import/template.test.ts`
Expected: PASS (6 ca: bốn loại + hai ca nội dung). Nếu ca khứ hồi của một loại đỏ ở `detected`, so tên cột trong `columns.ts` với bí danh — mẫu viết đúng `label`, nên lỗi ở đây là `normalizeHeader` của `label` không tự nằm trong tập tên khớp (không thể, vì `detectMapping` luôn thêm `label` vào tập) hoặc `readWorkbook` đọc sai ô.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/import/template.ts apps/web/src/lib/import/template.test.ts
git commit -m "feat(web): file mẫu .xlsx cho bốn loại import dữ liệu nền (khứ hồi với bộ nhận diện)"
```

---

### Task 4: Lớp gọi API

**Files:**
- Create: `apps/web/src/lib/api/master-data-import.ts`
- Test: `apps/web/src/lib/api/master-data-import.test.ts`

**Interfaces:**
- Consumes: `apiClient` (`@/lib/api-client`), kiểu của Task 2, bốn route của E1 (đã có trong `schema.d.ts`).
- Produces:

```ts
export const importSemesters: RunImport;
export const importRooms: RunImport;
export const importAdministrativeClasses: RunImport;
export const importClasses: RunImport;
export const IMPORT_RUNNERS: Record<ImportKindId, RunImport>;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/api/master-data-import.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportRejectedError, type ImportResult } from '@/lib/import/import-types';

const post = vi.fn();
vi.mock('@/lib/api-client', () => ({ apiClient: { POST: (...args: unknown[]) => post(...args) } }));

import {
  IMPORT_RUNNERS,
  importAdministrativeClasses,
  importClasses,
  importRooms,
  importSemesters,
} from './master-data-import';

const RESULT: ImportResult = {
  dryRun: true,
  applied: false,
  counts: { added: 1, updated: 0, unchanged: 0, errors: 0 },
  rows: [{ line: 2, status: 'new', label: 'H3.03', changes: [], errors: [], similar: [] }],
  needsSimilarConfirmation: false,
};
const ok = (data: unknown) => ({ data, error: undefined, response: { ok: true, status: 200 } });
const failed = (status: number, error: unknown) => ({ data: undefined, error, response: { ok: false, status } });

describe('master-data-import', () => {
  beforeEach(() => post.mockReset());

  it.each([
    ['semester', importSemesters, '/semesters/import'],
    ['room', importRooms, '/rooms/import'],
    ['administrative-class', importAdministrativeClasses, '/administrative-classes/import'],
    ['class', importClasses, '/classes/import'],
  ] as const)('%s gọi đúng route và gửi nguyên yêu cầu', async (id, run, path) => {
    post.mockResolvedValue(ok(RESULT));
    const request = { rows: [{ line: 2, name: 'x' }], dryRun: true };

    await expect(run(request)).resolves.toEqual(RESULT);

    expect(post).toHaveBeenCalledWith(path, { body: request });
    expect(IMPORT_RUNNERS[id]).toBe(run);
  });

  it('400 IMPORT_HAS_ERRORS và 409 NEAR_DUPLICATE ném ImportRejectedError kèm bản xem trước mới nhất', async () => {
    post.mockResolvedValueOnce(failed(400, { error: 'IMPORT_HAS_ERRORS', message: 'File có 1 dòng lỗi', preview: RESULT }));
    const first = await importRooms({ rows: [], dryRun: false }).catch((e: unknown) => e);
    expect(first).toBeInstanceOf(ImportRejectedError);
    expect(first).toMatchObject({ code: 'IMPORT_HAS_ERRORS', preview: RESULT, message: 'File có 1 dòng lỗi' });

    post.mockResolvedValueOnce(failed(409, { error: 'NEAR_DUPLICATE', message: 'Có mục gần giống', preview: RESULT }));
    const second = await importRooms({ rows: [], dryRun: false }).catch((e: unknown) => e);
    expect(second).toMatchObject({ code: 'NEAR_DUPLICATE' });
  });

  it('lỗi khác (403, 500, mảng message của ValidationPipe) ném Error thường mang chữ của server', async () => {
    post.mockResolvedValueOnce(failed(400, { message: ['rows must contain at least 1 elements', 'dryRun must be a boolean value'] }));
    await expect(importRooms({ rows: [], dryRun: true })).rejects.toThrow(
      'rows must contain at least 1 elements; dryRun must be a boolean value',
    );

    post.mockResolvedValueOnce(failed(500, undefined));
    await expect(importRooms({ rows: [], dryRun: true })).rejects.toThrow('Yêu cầu thất bại (HTTP 500)');
  });

  it('409 KHÔNG phải NEAR_DUPLICATE (vd va chạm DB) là Error thường, không phải ImportRejectedError', async () => {
    post.mockResolvedValueOnce(failed(409, { message: 'This request conflicts with an existing record.' }));
    const error = await importRooms({ rows: [], dryRun: false }).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(ImportRejectedError);
    expect((error as Error).message).toBe('This request conflicts with an existing record.');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/api/master-data-import.test.ts`
Expected: FAIL — không import được `./master-data-import`.

- [ ] **Step 3: Viết lớp API**

Create `apps/web/src/lib/api/master-data-import.ts`:

```ts
import { apiClient } from '@/lib/api-client';
import type { ImportKindId } from '@/lib/import/columns';
import {
  ImportRejectedError,
  type ImportResult,
  type RunImport,
} from '@/lib/import/import-types';

/**
 * Gọi bốn route import của admin (plan E1). Mỗi hàm là một `RunImport`, nên giao diện không biết gì về đường dẫn hay mã lỗi.
 *
 * Bốn hàm viết riêng (không một hàm nhận `path`) vì `openapi-fetch` gõ kiểu thân yêu cầu theo từng đường dẫn; một hàm
 * chung với `path` là hợp của bốn kiểu thân và không còn gì được kiểm tra. `body: request as never` là chỗ DUY NHẤT hai
 * hệ kiểu gặp nhau: dòng gửi lên là `Record` chữ do bộ mô tả cột dựng, còn DTO của server có tên trường cố định — khoá cột
 * trong `columns.ts` khớp DTO được ghim bằng test, không bằng kiểu.
 */
function unwrap(result: { data?: unknown; error?: unknown; response: { ok: boolean; status: number } }): ImportResult {
  if (!result.error && result.response.ok) {
    return result.data as ImportResult;
  }
  const body = (result.error ?? {}) as {
    error?: string;
    message?: string | string[];
    preview?: ImportResult;
  };
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  // Chỉ HAI mã lỗi này mang bản xem trước; một 409 khác (va chạm DB lọt qua planner) là lỗi thường.
  if ((body.error === 'IMPORT_HAS_ERRORS' || body.error === 'NEAR_DUPLICATE') && body.preview) {
    throw new ImportRejectedError(message ?? 'Máy chủ từ chối lần nhập này.', body.error, body.preview);
  }
  throw new Error(message ?? `Yêu cầu thất bại (HTTP ${result.response.status})`);
}

export const importSemesters: RunImport = async (request) =>
  unwrap(await apiClient.POST('/semesters/import', { body: request as never }));

export const importRooms: RunImport = async (request) =>
  unwrap(await apiClient.POST('/rooms/import', { body: request as never }));

export const importAdministrativeClasses: RunImport = async (request) =>
  unwrap(await apiClient.POST('/administrative-classes/import', { body: request as never }));

export const importClasses: RunImport = async (request) =>
  unwrap(await apiClient.POST('/classes/import', { body: request as never }));

export const IMPORT_RUNNERS: Record<ImportKindId, RunImport> = {
  semester: importSemesters,
  room: importRooms,
  'administrative-class': importAdministrativeClasses,
  class: importClasses,
};
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/api/master-data-import.test.ts && npx tsc --noEmit`
Expected: PASS và `tsc` sạch. Nếu `tsc` báo `'/rooms/import' is not assignable…`, `schema.d.ts` chưa được sinh lại ở E1 Task 7 — dừng và làm bước đó trước (`packages/shared/src/api/schema.d.ts` phải chứa bốn đường dẫn `…/import`).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/api/master-data-import.ts apps/web/src/lib/api/master-data-import.test.ts
git commit -m "feat(web): lớp gọi API import dữ liệu nền (RunImport theo từng loại, ImportRejectedError)"
```

---

### Task 5: Bản xem trước

**Files:**
- Create: `apps/web/src/components/import/import-preview.tsx`
- Test: `apps/web/src/components/import/import-preview.test.tsx`

**Interfaces:**
- Consumes: `ImportResult`, `ImportKind`.
- Produces:

```tsx
export function ImportPreview(props: {
  kind: ImportKind;
  result: ImportResult;
  confirmSimilar: boolean;
  onConfirmSimilarChange: (value: boolean) => void;
}): JSX.Element;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/components/import/import-preview.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { CLASS_KIND, ROOM_KIND } from '@/lib/import/columns';
import type { ImportResult, ImportRowResult } from '@/lib/import/import-types';
import { ImportPreview } from './import-preview';

const row = (overrides: Partial<ImportRowResult> & Pick<ImportRowResult, 'line' | 'status' | 'label'>): ImportRowResult => ({
  changes: [],
  errors: [],
  similar: [],
  ...overrides,
});

function result(rows: ImportRowResult[], overrides: Partial<ImportResult> = {}): ImportResult {
  return {
    dryRun: true,
    applied: false,
    counts: {
      added: rows.filter((r) => r.status === 'new').length,
      updated: rows.filter((r) => r.status === 'update').length,
      unchanged: rows.filter((r) => r.status === 'unchanged').length,
      errors: rows.filter((r) => r.status === 'error').length,
    },
    rows,
    needsSimilarConfirmation: rows.some((r) => r.status === 'new' && r.similar.length > 0),
    ...overrides,
  };
}

const noop = () => {};

describe('ImportPreview', () => {
  it('hiện số lượng thêm / sửa / giữ nguyên', () => {
    const preview = result([
      row({ line: 2, status: 'new', label: 'H3.03' }),
      row({ line: 3, status: 'new', label: 'H3.04' }),
      row({ line: 4, status: 'update', label: 'A1', changes: [{ field: 'capacity', label: 'Sức chứa', from: '40', to: '45' }] }),
      row({ line: 5, status: 'unchanged', label: 'B1' }),
    ]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);

    expect(screen.getByText('Thêm 2')).toBeInTheDocument();
    expect(screen.getByText('Sửa 1')).toBeInTheDocument();
    expect(screen.getByText('Giữ nguyên 1')).toBeInTheDocument();
    expect(screen.queryByText(/^Lỗi/)).not.toBeInTheDocument();
  });

  it('dòng lỗi hiện kèm SỐ DÒNG và lý do, và nói rõ không có dòng nào được nhập', () => {
    const preview = result([
      row({ line: 2, status: 'new', label: 'H3.03' }),
      row({ line: 7, status: 'error', label: 'Dòng 7', errors: ['Sức chứa "abc" không hợp lệ.', 'Tên phòng không được để trống.'] }),
    ]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);

    expect(screen.getByText('Lỗi 1')).toBeInTheDocument();
    expect(screen.getByText(/không có dòng nào được nhập/i)).toBeInTheDocument();
    expect(screen.getByText('Dòng 7')).toBeInTheDocument();
    expect(screen.getByText('Sức chứa "abc" không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByText('Tên phòng không được để trống.')).toBeInTheDocument();
  });

  it('T-IMP-6: dòng cập nhật hiện "từ → đến", không chỉ đếm số dòng', () => {
    const preview = result([
      row({
        line: 2,
        status: 'update',
        label: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
        changes: [{ field: 'teacher', label: 'Giảng viên', from: 'Giảng viên A', to: 'Giảng viên B' }],
      }),
    ]);
    render(<ImportPreview kind={CLASS_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);

    expect(screen.getByText('DHKTPM18A – Nhóm 1 · HK1 2026-2027')).toBeInTheDocument();
    expect(screen.getByText('Giảng viên: Giảng viên A → Giảng viên B')).toBeInTheDocument();
  });

  it('thay đổi từ "trống" ghi rõ là trống', () => {
    const preview = result([
      row({ line: 2, status: 'update', label: 'B1', changes: [{ field: 'capacity', label: 'Sức chứa', from: null, to: '60' }] }),
    ]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
    expect(screen.getByText('Sức chứa: (trống) → 60')).toBeInTheDocument();
  });

  describe('gần giống (T-IMP-8)', () => {
    const similarResult = result([
      row({
        line: 2,
        status: 'new',
        label: 'H303',
        similar: [{ id: 'r3', name: 'H3.03', reason: 'normalized', source: 'existing', line: null }],
      }),
      row({
        line: 3,
        status: 'new',
        label: 'P.A101',
        similar: [{ id: null, name: 'P A101', reason: 'normalized', source: 'file', line: 4 }],
      }),
    ]);

    it('mục mới hiện cạnh mục bị so, nêu lý do và nguồn (đã có / dòng trong file)', () => {
      render(<ImportPreview kind={ROOM_KIND} result={similarResult} confirmSimilar={false} onConfirmSimilarChange={noop} />);

      expect(screen.getByText('"H303" (mới) gần giống "H3.03" (đã có)')).toBeInTheDocument();
      expect(screen.getByText('"P.A101" (mới) gần giống "P A101" (dòng 4 trong file)')).toBeInTheDocument();
      expect(screen.getAllByText(/chỉ khác dấu, hoa-thường hoặc ký tự đặc biệt/)).toHaveLength(2);
    });

    it('có ô xác nhận nêu đúng loại; tick gọi onConfirmSimilarChange(true)', () => {
      const onChange = vi.fn();
      render(<ImportPreview kind={ROOM_KIND} result={similarResult} confirmSimilar={false} onConfirmSimilarChange={onChange} />);

      const box = screen.getByRole('checkbox', { name: /đúng là những phòng khác nhau/i });
      expect(box).not.toBeChecked();
      fireEvent.click(box);
      expect(onChange).toHaveBeenCalledWith(true);
    });

    it('phản ánh trạng thái đã tick', () => {
      render(<ImportPreview kind={ROOM_KIND} result={similarResult} confirmSimilar onConfirmSimilarChange={noop} />);
      expect(screen.getByRole('checkbox', { name: /đúng là những phòng khác nhau/i })).toBeChecked();
    });

    it('không có mục gần giống thì không có ô xác nhận', () => {
      const clean = result([row({ line: 2, status: 'new', label: 'H3.03' })]);
      render(<ImportPreview kind={ROOM_KIND} result={clean} confirmSimilar={false} onConfirmSimilarChange={noop} />);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('lý do khác hiện đúng chữ', () => {
      const preview = result([
        row({
          line: 2,
          status: 'new',
          label: 'DHKTPM18ATTT',
          similar: [
            { id: 'a', name: 'DHKTPM18ATT', reason: 'insert_delete', source: 'existing', line: null },
            { id: 'b', name: 'DHKPTM18ATTT', reason: 'swap', source: 'existing', line: null },
          ],
        }),
      ]);
      render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
      expect(screen.getByText(/hơn kém đúng một ký tự/)).toBeInTheDocument();
      expect(screen.getByText(/hai ký tự liền kề đổi chỗ/)).toBeInTheDocument();
    });
  });

  it('không có gì để ghi: báo file khớp hoàn toàn', () => {
    const preview = result([row({ line: 2, status: 'unchanged', label: 'A1' })]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
    expect(screen.getByText(/khớp hoàn toàn/i)).toBeInTheDocument();
  });

  it('khi còn lỗi thì không nói "khớp hoàn toàn" dù không có dòng thêm/sửa', () => {
    const preview = result([row({ line: 2, status: 'error', label: 'Dòng 2', errors: ['x'] })]);
    render(<ImportPreview kind={ROOM_KIND} result={preview} confirmSimilar={false} onConfirmSimilarChange={noop} />);
    expect(screen.queryByText(/khớp hoàn toàn/i)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/components/import/import-preview.test.tsx`
Expected: FAIL — không import được `./import-preview`.

- [ ] **Step 3: Viết component**

Create `apps/web/src/components/import/import-preview.tsx`:

```tsx
'use client';

import { CircleAlert, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { ImportKind } from '@/lib/import/columns';
import type { ImportResult, ImportRowResult, ImportSimilar } from '@/lib/import/import-types';

const REASON_TEXT: Record<ImportSimilar['reason'], string> = {
  normalized: 'chỉ khác dấu, hoa-thường hoặc ký tự đặc biệt',
  insert_delete: 'hơn kém đúng một ký tự',
  swap: 'hai ký tự liền kề đổi chỗ',
};

interface ImportPreviewProps {
  kind: ImportKind;
  result: ImportResult;
  confirmSimilar: boolean;
  onConfirmSimilarChange: (value: boolean) => void;
}

/**
 * Mọi thứ giữa "đã đọc file" và "xác nhận" — vẽ NGUYÊN VĂN kết quả `dryRun` của server (spec §6.2 nguyên tắc 5). Component
 * này không tính gì: nó không biết thế nào là "gần giống" hay "chồng ngày", chỉ biết trình bày. Vì thế bản xem trước và lần
 * ghi thật không thể lệch nhau ở phía trình duyệt.
 *
 * Thứ tự là thứ tự quyết định: lỗi (chặn tất cả) → mục gần giống (cần để ý) → cập nhật (có từ → đến) → thêm.
 */
export function ImportPreview({ kind, result, confirmSimilar, onConfirmSimilarChange }: ImportPreviewProps) {
  const { counts, rows } = result;
  const errors = rows.filter((r) => r.status === 'error');
  const added = rows.filter((r) => r.status === 'new');
  const updated = rows.filter((r) => r.status === 'update');
  const similar = added.filter((r) => r.similar.length > 0);
  const nothingToDo = counts.errors === 0 && counts.added === 0 && counts.updated === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">Thêm {counts.added}</Badge>
        <Badge variant="info">Sửa {counts.updated}</Badge>
        <Badge>Giữ nguyên {counts.unchanged}</Badge>
        {counts.errors > 0 && <Badge variant="destructive">Lỗi {counts.errors}</Badge>}
      </div>

      {errors.length > 0 && (
        <div className="flex flex-col gap-3">
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>
              File có {errors.length} dòng lỗi. Không có dòng nào được nhập — hãy sửa file rồi chọn lại.
            </AlertDescription>
          </Alert>
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border border-border bg-surface-2 p-4">
            {errors.map((row) => (
              <li key={row.line} className="flex flex-col gap-0.5 text-small">
                <span className="font-mono text-muted-foreground">Dòng {row.line}</span>
                {row.errors.map((message, index) => (
                  <span key={index}>{message}</span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nothingToDo && (
        <Alert variant="info">
          <AlertDescription>
            File này khớp hoàn toàn với dữ liệu hiện có — nhập lại sẽ không thay đổi gì.
          </AlertDescription>
        </Alert>
      )}

      {similar.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-subtle p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p className="text-small font-medium">{similar.length} mục mới gần giống mục khác</p>
              <p className="text-caption text-muted-foreground">
                Hệ thống không biết đó là cùng một thứ hay hai thứ khác nhau, nên hỏi trước khi ghi. Nếu là cùng một
                thứ, sửa file rồi chọn lại.
              </p>
            </div>
          </div>
          <ul className="flex max-h-56 flex-col gap-2 overflow-y-auto pl-6">
            {similar.flatMap((row) =>
              row.similar.map((entry, index) => (
                <li key={`${row.line}-${index}`} className="flex flex-col text-small">
                  <span>{describeSimilar(row, entry)}</span>
                  <span className="text-caption text-muted-foreground">
                    Dòng {row.line} · {REASON_TEXT[entry.reason]}
                  </span>
                </li>
              )),
            )}
          </ul>
          <label className="flex cursor-pointer items-start gap-2 pl-6 text-small">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary"
              checked={confirmSimilar}
              onChange={(event) => onConfirmSimilarChange(event.target.checked)}
            />
            <span>Tôi đã xem các mục gần giống ở trên và đúng là những {kind.noun} khác nhau.</span>
          </label>
        </div>
      )}

      {updated.length > 0 && (
        <ChangeList
          title="Sẽ cập nhật"
          items={updated.map((row) => ({
            key: row.line,
            label: row.label,
            lines: row.changes.map((c) => `${c.label}: ${c.from ?? '(trống)'} → ${c.to ?? '(trống)'}`),
          }))}
        />
      )}

      {added.length > 0 && (
        <ChangeList
          title="Sẽ thêm"
          items={added.map((row) => ({ key: row.line, label: row.label, lines: [] }))}
        />
      )}
    </div>
  );
}

function describeSimilar(row: ImportRowResult, entry: ImportSimilar): string {
  const where = entry.source === 'existing' ? 'đã có' : `dòng ${entry.line} trong file`;
  return `"${row.label}" (mới) gần giống "${entry.name}" (${where})`;
}

function ChangeList({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: number; label: string; lines: string[] }>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small font-medium">{title}</p>
      <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface-2 p-4">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col text-small">
            <span className="font-mono">{item.label}</span>
            {item.lines.map((line, index) => (
              <span key={index} className="text-caption text-muted-foreground">
                {line}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/components/import/import-preview.test.tsx`
Expected: PASS. Hai ca dễ trượt: `getByText('Thêm 2')` đòi nội dung của `Badge` là **một** chuỗi (JSX `Thêm {counts.added}` tạo hai nút văn bản liền nhau — Testing Library gộp chúng khi khớp theo `getByText` trên phần tử cha, nên xanh); và ca `kind.noun = 'phòng'` đòi nhãn checkbox chứa "những phòng khác nhau".

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/import/import-preview.tsx apps/web/src/components/import/import-preview.test.tsx
git commit -m "feat(web): bản xem trước import (lỗi theo dòng, từ → đến, gần giống kèm xác nhận)"
```

---

### Task 6: Bước ghép cột và `ImportWizard`

**Files:**
- Create: `apps/web/src/components/import/import-column-mapper.tsx`, `apps/web/src/components/import/import-wizard.tsx`
- Test: `apps/web/src/components/import/import-wizard.test.tsx`

**Interfaces:**
- Consumes: Task 1–5; `readWorkbook`, `SheetData`; `downloadTemplate`.
- Produces:

```tsx
export function ImportColumnMapper(props: { kind: ImportKind; rows: string[][]; mapping: ImportMapping; onChange: (m: ImportMapping) => void }): JSX.Element;
export function ImportWizard(props: {
  kind: ImportKind;
  run: RunImport;                                            // BẮT BUỘC — không có mặc định để test không kéo apiClient vào
  readSheets?: (file: File) => Promise<SheetData[]>;         // mặc định readWorkbook
  onImported?: (result: ImportResult) => void;
}): JSX.Element;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/components/import/import-wizard.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ROOM_KIND } from '@/lib/import/columns';
import { ImportRejectedError, type ImportResult, type ImportRowResult, type RunImport } from '@/lib/import/import-types';
import type { SheetData } from '@/lib/read-workbook';
import { ImportWizard } from './import-wizard';

vi.mock('@/lib/import/template', () => ({ downloadTemplate: vi.fn() }));
import { downloadTemplate } from '@/lib/import/template';

const row = (o: Partial<ImportRowResult> & Pick<ImportRowResult, 'line' | 'status' | 'label'>): ImportRowResult => ({
  changes: [],
  errors: [],
  similar: [],
  ...o,
});

function resultOf(rows: ImportRowResult[], extra: Partial<ImportResult> = {}): ImportResult {
  return {
    dryRun: true,
    applied: false,
    counts: {
      added: rows.filter((r) => r.status === 'new').length,
      updated: rows.filter((r) => r.status === 'update').length,
      unchanged: rows.filter((r) => r.status === 'unchanged').length,
      errors: rows.filter((r) => r.status === 'error').length,
    },
    rows,
    needsSimilarConfirmation: rows.some((r) => r.status === 'new' && r.similar.length > 0),
    ...extra,
  };
}

const GOOD_SHEET: SheetData[] = [{ name: 'DS', rows: [['Tên phòng', 'Sức chứa'], ['H3.03', '40'], ['H3.04', '']] }];
const GOOD_ROWS = [
  { line: 2, name: 'H3.03', capacity: '40' },
  { line: 3, name: 'H3.04', capacity: '' },
];
const NEW_ROWS = [row({ line: 2, status: 'new', label: 'H3.03' }), row({ line: 3, status: 'new', label: 'H3.04' })];

const pick = (name = 'p.xlsx') => {
  const input = screen.getByLabelText(/file excel/i);
  fireEvent.change(input, { target: { files: [new File(['x'], name)] } });
};

function setup(run: RunImport, sheets: SheetData[] | ((file: File) => Promise<SheetData[]>) = GOOD_SHEET, onImported = vi.fn()) {
  const readSheets = typeof sheets === 'function' ? vi.fn(sheets) : vi.fn(async () => sheets);
  render(<ImportWizard kind={ROOM_KIND} run={run} readSheets={readSheets} onImported={onImported} />);
  return { readSheets, onImported };
}

describe('ImportWizard', () => {
  beforeEach(() => vi.mocked(downloadTemplate).mockReset());

  it('luồng chính: đọc file → xem trước (dryRun) → xác nhận (ghi thật) → báo đã nhập', async () => {
    const run = vi.fn<RunImport>(async ({ dryRun }) =>
      dryRun ? resultOf(NEW_ROWS) : resultOf(NEW_ROWS, { dryRun: false, applied: true }),
    );
    const { onImported } = setup(run);

    pick();

    expect(await screen.findByText('Thêm 2')).toBeInTheDocument();
    // Xem trước gửi ĐÚNG các dòng đã đọc, với số dòng như Excel hiện ra.
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith({ rows: GOOD_ROWS, dryRun: true });

    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận nhập 2 dòng' }));

    expect(await screen.findByText(/Đã nhập xong: thêm 2, cập nhật 0, giữ nguyên 0/)).toBeInTheDocument();
    expect(run).toHaveBeenLastCalledWith({ rows: GOOD_ROWS, dryRun: false, confirmSimilar: false });
    expect(onImported).toHaveBeenCalledWith(expect.objectContaining({ applied: true }));
  });

  it('còn dòng lỗi: hiện lỗi, KHÔNG có nút xác nhận hoạt động và không bao giờ gọi ghi thật', async () => {
    const run = vi.fn(async () =>
      resultOf([row({ line: 2, status: 'new', label: 'H3.03' }), row({ line: 3, status: 'error', label: 'Dòng 3', errors: ['Sức chứa "x" không hợp lệ.'] })]),
    );
    setup(run);

    pick();

    expect(await screen.findByText('Sức chứa "x" không hợp lệ.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('không có gì để ghi: nút xác nhận tắt', async () => {
    setup(vi.fn(async () => resultOf([row({ line: 2, status: 'unchanged', label: 'H3.03' })])));
    pick();
    expect(await screen.findByText(/khớp hoàn toàn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
  });

  it('Review Focus 5: còn mục gần giống thì nút tắt tới khi tick, và confirmSimilar chỉ được gửi khi đã tick', async () => {
    const withSimilar = [
      row({ line: 2, status: 'new', label: 'H303', similar: [{ id: 'r3', name: 'H3.03', reason: 'normalized', source: 'existing', line: null }] }),
    ];
    const run = vi.fn<RunImport>(async ({ dryRun }) =>
      resultOf(withSimilar, dryRun ? {} : { dryRun: false, applied: true }),
    );
    setup(run);
    pick();

    const confirm = await screen.findByRole('button', { name: /xác nhận nhập/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /đúng là những phòng khác nhau/i }));
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    await screen.findByText(/Đã nhập xong/);
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ dryRun: false, confirmSimilar: true }));
  });

  it('Review Focus 4: đáp ứng dryRun CŨ đến muộn không ghi đè bản xem trước của file mới', async () => {
    let releaseFirst: (value: ImportResult) => void = () => {};
    const slow = new Promise<ImportResult>((resolve) => {
      releaseFirst = resolve;
    });
    const run = vi
      .fn<RunImport>()
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce(resultOf([row({ line: 2, status: 'new', label: 'MỚI' })]));
    setup(run);

    pick('cu.xlsx'); // lần gọi 1: treo
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    pick('moi.xlsx'); // lần gọi 2: trả ngay
    expect(await screen.findByText('Thêm 1')).toBeInTheDocument();

    await act(async () => {
      releaseFirst(resultOf([row({ line: 2, status: 'new', label: 'a' }), row({ line: 3, status: 'new', label: 'b' }), row({ line: 4, status: 'new', label: 'c' })]));
    });

    // Vẫn là bản của file mới: nếu đáp ứng cũ ghi đè thì ở đây là "Thêm 3".
    expect(screen.getByText('Thêm 1')).toBeInTheDocument();
    expect(screen.queryByText('Thêm 3')).not.toBeInTheDocument();
  });

  it('Review Focus 6: file vượt trần dòng bị chặn ở client với câu rõ ràng, không gọi run', async () => {
    const tooMany: SheetData[] = [
      { name: 'DS', rows: [['Tên phòng', 'Sức chứa'], ...Array.from({ length: 501 }, (_, i) => [`P${i}`, ''])] },
    ];
    const run = vi.fn(async () => resultOf([]));
    setup(run, tooMany);

    pick();

    expect(await screen.findByText('File có 501 dòng dữ liệu, tối đa 500 dòng mỗi lần nhập.')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('file không có dòng dữ liệu: nêu vấn đề, không gọi run', async () => {
    const run = vi.fn(async () => resultOf([]));
    setup(run, [{ name: 'DS', rows: [['Tên phòng', 'Sức chứa']] }]);
    pick();
    expect(await screen.findByText('Không có dòng dữ liệu nào sau phần tiêu đề.')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('không nhận diện được tên cột: nói rõ và mở sẵn bước chỉnh cột; nhận diện được thì chỉ có nút "Chỉnh cột"', async () => {
    const run = vi.fn(async () => resultOf(NEW_ROWS));
    setup(run, [{ name: 'DS', rows: [['Cái này', 'Cái kia'], ['H3.03', '40']] }]);
    pick();

    expect(await screen.findByText(/chưa nhận diện được tên cột/i)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Tên phòng' })).toBeInTheDocument();
  });

  it('nhận diện được: hiện lời xác nhận cột đã nhận, chưa mở bước chỉnh cột', async () => {
    setup(vi.fn(async () => resultOf(NEW_ROWS)));
    pick();
    expect(await screen.findByText(/đã nhận diện cột theo tên/i)).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Tên phòng' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh cột' }));
    expect(screen.getByRole('combobox', { name: 'Tên phòng' })).toBeInTheDocument();
  });

  it('chỉnh cột bằng tay tính lại và xem trước lại với dòng mới', async () => {
    const run = vi.fn(async () => resultOf(NEW_ROWS));
    setup(run, [{ name: 'DS', rows: [['Cái này', 'Cái kia'], ['40', 'H3.03']] }]);
    pick();
    await screen.findByText(/chưa nhận diện được tên cột/i);
    // Ghép theo thứ tự: tên phòng = cột A ("40"), sức chứa = cột B ("H3.03"). Chọn cột B cho tên phòng: cột B đang thuộc
    // sức chứa nên HAI TRƯỜNG HOÁN ĐỔI (một cột không bao giờ gán cho hai trường) — sức chứa nhận cột A.
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(run).toHaveBeenLastCalledWith({ rows: [{ line: 2, name: '40', capacity: 'H3.03' }], dryRun: true });

    fireEvent.click(screen.getByRole('combobox', { name: 'Tên phòng' }));
    fireEvent.click(screen.getByRole('option', { name: /Cột B/ }));

    await waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    expect(run).toHaveBeenLastCalledWith({ rows: [{ line: 2, name: 'H3.03', capacity: '40' }], dryRun: true });
  });

  it('Review Focus 8: lỗi mạng khi xem trước hiện thành lời báo lỗi, không phải bản xem trước rỗng', async () => {
    setup(vi.fn(async () => { throw new Error('Mất kết nối'); }));
    pick();
    expect(await screen.findByText('Mất kết nối')).toBeInTheDocument();
    expect(screen.queryByText(/^Thêm/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
  });

  it('server từ chối lần ghi thật kèm bản xem trước mới: hiện lại bản mới và lời của server, bỏ tick cũ', async () => {
    const stale = resultOf(NEW_ROWS);
    const fresh = resultOf([row({ line: 2, status: 'error', label: 'Dòng 2', errors: ['Phòng "H3.03" đã tồn tại.'] })]);
    const run = vi.fn<RunImport>(async ({ dryRun }) => {
      if (dryRun) return stale;
      throw new ImportRejectedError('File có 1 dòng lỗi nên không có gì được ghi.', 'IMPORT_HAS_ERRORS', fresh);
    });
    setup(run);
    pick();

    fireEvent.click(await screen.findByRole('button', { name: 'Xác nhận nhập 2 dòng' }));

    expect(await screen.findByText('File có 1 dòng lỗi nên không có gì được ghi.')).toBeInTheDocument();
    expect(screen.getByText('Phòng "H3.03" đã tồn tại.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /xác nhận nhập/i })).toBeDisabled();
  });

  it('không đọc được file: hiện lời báo, không gọi run', async () => {
    const run = vi.fn(async () => resultOf([]));
    setup(run, async () => {
      throw new Error('Không đọc được file.');
    });
    pick();
    expect(await screen.findByText('Không đọc được file.')).toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it('nhiều sheet: chọn sheet nhận diện được thay vì sheet bìa', async () => {
    const sheets: SheetData[] = [{ name: 'Bia', rows: [['Giới thiệu']] }, ...GOOD_SHEET];
    const run = vi.fn(async () => resultOf(NEW_ROWS));
    setup(run, sheets);
    pick();
    await screen.findByText('Thêm 2');
    expect(run).toHaveBeenCalledWith({ rows: GOOD_ROWS, dryRun: true });
  });

  it('nút "Tải file mẫu" tải mẫu của đúng loại', () => {
    setup(vi.fn(async () => resultOf([])));
    fireEvent.click(screen.getByRole('button', { name: /tải file mẫu/i }));
    expect(downloadTemplate).toHaveBeenCalledWith(ROOM_KIND);
  });

  it('liệt kê các cột cần có, đánh dấu cột không bắt buộc', () => {
    setup(vi.fn(async () => resultOf([])));
    expect(screen.getByText(/Tên phòng/)).toBeInTheDocument();
    expect(screen.getByText(/Sức chứa \(không bắt buộc\)/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/components/import/import-wizard.test.tsx`
Expected: FAIL — không import được `./import-wizard`.

- [ ] **Step 3: Viết bước ghép cột**

Create `apps/web/src/components/import/import-column-mapper.tsx`:

```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { columnLabel, type ImportKind, type ImportMapping } from '@/lib/import/columns';

const PREVIEW_ROWS = 6;
/** Radix Select không nhận chuỗi rỗng làm giá trị, nên "không có cột này" cần một khoá riêng. */
const NONE = 'none';

interface ImportColumnMapperProps {
  kind: ImportKind;
  rows: string[][];
  mapping: ImportMapping;
  onChange: (mapping: ImportMapping) => void;
}

/**
 * Chọn cột nào của file là trường nào — điều khiển bởi MÔ TẢ CỘT của loại đang nhập, không gắn cứng "Cột MSSV" như bước ghép
 * cột của roster. Chỉ hiện khi tên cột chưa nhận diện được hoặc người dùng chủ động chỉnh (spec §6.2 nguyên tắc 8): nhận
 * diện theo tên đi trước, bước này là lối thoát cho file có tên cột lạ.
 */
export function ImportColumnMapper({ kind, rows, mapping, onChange }: ImportColumnMapperProps) {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const columns = Array.from({ length: columnCount }, (_, index) => index);
  const headerRow = rows[Math.max(mapping.headerRows - 1, 0)] ?? [];
  const labelByColumn = new Map<number, string>();
  for (const column of kind.columns) {
    const index = mapping.columns[column.key];
    if (index !== null && index !== undefined) labelByColumn.set(index, column.label);
  }

  function setColumn(key: string, value: string) {
    const next = value === NONE ? null : Number(value);
    const columns = { ...mapping.columns };
    if (next !== null) {
      // Một cột của file không bao giờ gán cho hai trường (cùng bất biến với `detectMapping`): chọn một cột đang thuộc về
      // trường khác thì HAI TRƯỜNG HOÁN ĐỔI — trường kia nhận cột cũ của trường này. Hoán đổi thay vì xoá, vì xoá làm một
      // cột bắt buộc đột nhiên "chưa chọn" mà người dùng không hề bấm vào nó.
      const holder = Object.keys(columns).find((other) => other !== key && columns[other] === next);
      if (holder) columns[holder] = columns[key] ?? null;
    }
    columns[key] = next;
    onChange({ ...mapping, columns });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-header-rows">Số dòng tiêu đề</Label>
          <Input
            id="import-header-rows"
            type="number"
            min={0}
            max={20}
            value={mapping.headerRows}
            onChange={(event) =>
              onChange({ ...mapping, headerRows: Math.max(0, Number(event.target.value) || 0) })
            }
          />
          <p className="text-caption text-muted-foreground">Số dòng ở đầu file cần bỏ qua trước khi tới dữ liệu.</p>
        </div>

        {kind.columns.map((column) => {
          const index = mapping.columns[column.key];
          return (
            <div key={column.key} className="flex flex-col gap-2">
              <Label htmlFor={`import-col-${column.key}`}>
                {column.label}
                {column.required ? '' : ' (không bắt buộc)'}
              </Label>
              <Select
                value={index === null || index === undefined ? (column.required ? undefined : NONE) : String(index)}
                onValueChange={(value) => setColumn(column.key, value)}
              >
                <SelectTrigger id={`import-col-${column.key}`}>
                  <SelectValue placeholder="Chọn cột" />
                </SelectTrigger>
                <SelectContent>
                  {!column.required && <SelectItem value={NONE}>Không có cột này</SelectItem>}
                  {columns.map((option) => (
                    <SelectItem key={option} value={String(option)}>
                      Cột {columnLabel(option)}
                      {(headerRow[option] ?? '').trim() !== '' ? ` · ${headerRow[option].trim().slice(0, 24)}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col" className="w-12 text-right">
                #
              </TableHead>
              {columns.map((index) => (
                <TableHead
                  key={index}
                  scope="col"
                  data-selected={labelByColumn.has(index) ? '' : undefined}
                  className="data-[selected]:bg-primary-subtle data-[selected]:text-primary"
                >
                  {columnLabel(index)}
                  {labelByColumn.has(index) && ` · ${labelByColumn.get(index)}`}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
              // Dòng tiêu đề mờ đi để "số dòng tiêu đề" là thứ nhìn thấy được hiệu quả chứ không phải đoán.
              <TableRow key={rowIndex} className={rowIndex < mapping.headerRows ? 'opacity-40' : undefined}>
                <TableCell className="text-right tabular-nums text-muted-foreground">{rowIndex + 1}</TableCell>
                {columns.map((index) => (
                  <TableCell key={index} className="max-w-[16rem] truncate">
                    {row[index] ?? ''}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > PREVIEW_ROWS && (
        <p className="text-caption text-muted-foreground">
          Đang xem {PREVIEW_ROWS} dòng đầu trên tổng số {rows.length} dòng.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Viết `ImportWizard`**

Create `apps/web/src/components/import/import-wizard.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleCheckBig, Download, FileSpreadsheet } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImportColumnMapper } from '@/components/import/import-column-mapper';
import { ImportPreview } from '@/components/import/import-preview';
import {
  detectBestSheet,
  detectMapping,
  extractImportRows,
  type ImportKind,
  type ImportMapping,
} from '@/lib/import/columns';
import {
  ImportRejectedError,
  type ImportResult,
  type RunImport,
} from '@/lib/import/import-types';
import { downloadTemplate } from '@/lib/import/template';
import { readWorkbook, type SheetData } from '@/lib/read-workbook';

interface ImportWizardProps {
  kind: ImportKind;
  /** BẮT BUỘC, không có mặc định: giao diện không biết gì về mạng, và test truyền một hàm giả. */
  run: RunImport;
  readSheets?: (file: File) => Promise<SheetData[]>;
  onImported?: (result: ImportResult) => void;
}

function messageOf(error: unknown): string {
  return error instanceof Error && error.message ? error.message : 'Có lỗi xảy ra, hãy thử lại.';
}

/**
 * Luồng nhập của MỘT loại dữ liệu nền, theo đúng thứ tự các quyết định: chọn file → (chọn sheet) → cột nào là gì → XEM TRƯỚC
 * → xác nhận. Không có gì được ghi cho tới bước cuối.
 *
 * Xem trước luôn là kết quả `run({ dryRun: true })` của server (spec §6.2 nguyên tắc 5): đây là component duy nhất giữ trạng
 * thái, và nó không tự tính gì. Hai điều nó phải giữ đúng:
 *   - nút xác nhận gửi ĐÚNG các dòng đã được xem trước (`extracted.rows`), không đọc lại file;
 *   - đáp ứng `dryRun` đến muộn không ghi đè đáp ứng mới (`requestId`) — nếu không, đổi file nhanh tay sẽ cho xem trước của
 *     file này và xác nhận của file kia.
 */
export function ImportWizard({ kind, run, readSheets = readWorkbook, onImported }: ImportWizardProps) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [detected, setDetected] = useState(false);
  const [mapperOpen, setMapperOpen] = useState(false);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [confirmSimilar, setConfirmSimilar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ImportResult | null>(null);
  // Đổi `key` của ô chọn file để chọn lại CÙNG một file (sau khi sửa nó) vẫn kích hoạt `onChange`.
  const [inputKey, setInputKey] = useState(0);

  const requestId = useRef(0);
  // `run` có thể là hàm mới ở mỗi lần render của cha; giữ nó trong ref để effect xem trước chỉ chạy khi DÒNG đổi, không phải
  // khi cha render lại (nếu không, mỗi lần cha render là một lần gọi `dryRun`).
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);

  const rows = sheets?.[sheetIndex]?.rows ?? null;
  const extracted = useMemo(
    () => (rows && mapping ? extractImportRows(rows, mapping, kind) : null),
    [rows, mapping, kind],
  );

  // Xem trước mỗi khi dòng đã tách đổi (file mới, sheet khác, chỉnh cột).
  useEffect(() => {
    requestId.current += 1;
    const id = requestId.current;
    setPreview(null);
    setRunError(null);
    setConfirmSimilar(false);
    if (!extracted || extracted.problems.length > 0) {
      setChecking(false);
      return;
    }
    setChecking(true);
    runRef
      .current({ rows: extracted.rows, dryRun: true })
      .then((result) => {
        if (id === requestId.current) setPreview(result);
      })
      .catch((error: unknown) => {
        if (id === requestId.current) setRunError(messageOf(error));
      })
      .finally(() => {
        if (id === requestId.current) setChecking(false);
      });
  }, [extracted]);

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setDone(null);
    setFileError(null);
    try {
      const read = await readSheets(file);
      if (read.length === 0) {
        setFileError('File không có sheet nào đọc được.');
        return;
      }
      const index = detectBestSheet(read, kind);
      const result = detectMapping(read[index].rows, kind);
      setSheets(read);
      setSheetIndex(index);
      setMapping(result.mapping);
      setDetected(result.detected);
      setMapperOpen(!result.detected);
      setFileName(file.name);
    } catch (error) {
      // Một file thư viện không mở được là ca thường gặp: .xls cũ hoặc .csv đổi đuôi. Nói thẳng thay vì chữ của parser.
      setSheets(null);
      setMapping(null);
      setFileError(
        error instanceof Error && error.message
          ? error.message
          : 'Không đọc được file. Hãy lưu lại dưới định dạng .xlsx rồi thử lại.',
      );
    }
  }

  function onSheetChange(value: string) {
    if (!sheets) return;
    const index = Number(value);
    const result = detectMapping(sheets[index].rows, kind);
    setSheetIndex(index);
    setMapping(result.mapping);
    setDetected(result.detected);
    setMapperOpen(!result.detected);
  }

  async function onConfirm() {
    if (!extracted || !preview) return;
    setSaving(true);
    setRunError(null);
    try {
      const result = await run({ rows: extracted.rows, dryRun: false, confirmSimilar });
      setDone(result);
      setSheets(null);
      setMapping(null);
      setFileName('');
      setInputKey((key) => key + 1);
      onImported?.(result);
    } catch (error) {
      if (error instanceof ImportRejectedError) {
        // Trạng thái đã đổi từ lúc xem trước: hiện lại bản MỚI NHẤT mà server gửi kèm, và bỏ tick (nó áp cho bản cũ).
        setPreview(error.preview);
        setConfirmSimilar(false);
      }
      setRunError(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  const confirmCount = preview ? preview.counts.added + preview.counts.updated : 0;
  const blocked =
    !extracted ||
    extracted.problems.length > 0 ||
    !preview ||
    checking ||
    saving ||
    preview.counts.errors > 0 ||
    confirmCount === 0 ||
    (preview.needsSimilarConfirmation && !confirmSimilar);

  return (
    <div className="flex flex-col gap-5">
      <p className="text-small text-muted-foreground">
        File được đọc ngay trên trình duyệt và không được tải lên máy chủ. Chỉ các dòng đã đọc được gửi đi để kiểm tra;
        không có gì được ghi cho tới khi bạn xác nhận.
      </p>

      <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-small font-medium">Cột cần có</p>
          <Button variant="outline" size="sm" onClick={() => void downloadTemplate(kind)}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Tải file mẫu
          </Button>
        </div>
        <ul className="flex flex-col gap-0.5 text-small">
          {kind.columns.map((column) => (
            <li key={column.key}>
              <span className="font-medium">
                {column.label}
                {column.required ? '' : ' (không bắt buộc)'}
              </span>
              <span className="text-muted-foreground"> — {column.hint}</span>
            </li>
          ))}
        </ul>
      </div>

      {done && (
        <Alert variant={done.applied ? 'success' : 'info'}>
          {done.applied && <CircleCheckBig />}
          <AlertDescription>
            {done.applied
              ? `Đã nhập xong: thêm ${done.counts.added}, cập nhật ${done.counts.updated}, giữ nguyên ${done.counts.unchanged}.`
              : 'Không có gì thay đổi nên không có gì được ghi.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="import-file">File Excel (.xlsx)</Label>
        <input
          key={inputKey}
          id="import-file"
          type="file"
          accept=".xlsx"
          className="block w-full text-small file:mr-4 file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-primary-foreground hover:file:bg-primary-strong"
          onChange={(event) => void onPickFile(event.target.files?.[0])}
        />
        {fileName && (
          <p className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
            {fileName}
          </p>
        )}
      </div>

      {fileError && (
        <Alert variant="destructive">
          <AlertDescription>{fileError}</AlertDescription>
        </Alert>
      )}

      {sheets && sheets.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="import-sheet">Sheet</Label>
          <Select value={String(sheetIndex)} onValueChange={onSheetChange}>
            <SelectTrigger id="import-sheet" className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sheets.map((sheet, index) => (
                <SelectItem key={sheet.name} value={String(index)}>
                  {sheet.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {rows && mapping && (
        <div className="flex flex-col gap-3">
          {detected ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-small">
              <span className="text-muted-foreground">Đã nhận diện cột theo tên.</span>
              <Button variant="ghost" size="sm" onClick={() => setMapperOpen((open) => !open)}>
                Chỉnh cột
              </Button>
            </div>
          ) : (
            <Alert variant="warning">
              <AlertDescription>
                Chưa nhận diện được tên cột của file này. Hãy chọn cột tương ứng cho từng mục bên dưới.
              </AlertDescription>
            </Alert>
          )}
          {mapperOpen && (
            <ImportColumnMapper
              kind={kind}
              rows={rows}
              mapping={mapping}
              onChange={(next) => {
                setMapping(next);
                setDetected(false);
              }}
            />
          )}
        </div>
      )}

      {extracted && extracted.problems.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {extracted.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {checking && <p className="text-small text-muted-foreground">Đang kiểm tra file…</p>}

      {preview && (
        <ImportPreview
          kind={kind}
          result={preview}
          confirmSimilar={confirmSimilar}
          onConfirmSimilarChange={setConfirmSimilar}
        />
      )}

      {runError && (
        <Alert variant="destructive">
          {/* Chữ của server: một 409/400 nêu đúng mục nào gây lỗi, và đó là cách duy nhất người dùng biết. */}
          <AlertDescription>{runError}</AlertDescription>
        </Alert>
      )}

      {mapping && (
        <div className="flex justify-end">
          <Button onClick={() => void onConfirm()} loading={saving} disabled={blocked}>
            {`Xác nhận nhập ${confirmCount} dòng`}
          </Button>
        </div>
      )}
    </div>
  );
}
```

Ghi chú khi chép: `Alert` có sẵn `variant="warning"` (đã đối chiếu `components/ui/alert.tsx`). Nút xác nhận chỉ hiện khi đã có `mapping` (tức đã chọn file), và dùng **một** chuỗi cho nhãn (`{`…`}`) để `getByRole('button', { name: 'Xác nhận nhập 2 dòng' })` khớp nguyên chuỗi.

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/components/import/import-wizard.test.tsx`
Expected: PASS (~15 ca). Hai ca dễ trượt: ca "đáp ứng cũ đến muộn" cần `runRef.current(...)` gọi lần hai **sau** khi lần một treo (hai lần `pick` khác tên file, `readSheets` giả trả cùng một sheet nên `extracted` mới là một đối tượng mới ⇒ effect chạy lại); và ca "chỉnh cột" bấm `option` ngay sau `combobox` — mẫu đã dùng ở `teacher/exam-sessions/page.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/import
git commit -m "feat(web): bước ghép cột và ImportWizard (xem trước = dryRun của server, chống đáp ứng cũ)"
```

---

### Task 7: Hook chạy import, `ImportDialog`, chạy cả bộ, lint, build

**Files:**
- Create: `apps/web/src/hooks/master-data-keys.ts`, `apps/web/src/hooks/useMasterDataImport.ts`, `apps/web/src/components/import/import-dialog.tsx`
- Test: `apps/web/src/hooks/useMasterDataImport.test.tsx`, `apps/web/src/components/import/import-dialog.test.tsx`

**Interfaces:**
- Consumes: `ImportWizard`, `IMPORT_RUNNERS`, `ImportKind`, `ImportKindId`, `RunImport`.
- Produces:

```ts
// master-data-keys.ts — khoá truy vấn dùng chung giữa hook import và các hook đọc ở plan G1/G2
export const MASTER_DATA_KEYS: { semesters: 'semesters'; rooms: 'rooms'; administrativeClasses: 'administrative-classes'; classes: 'classes' };
// useMasterDataImport.ts
export function useImportRunner(kind: ImportKindId): RunImport;   // tham chiếu ổn định; làm mới truy vấn sau lần ghi thật
```

```tsx
export function ImportDialog(props: {
  kind: ImportKind;
  onImported?: (result: ImportResult) => void;   // tuỳ chọn: danh sách đã tự làm mới qua useImportRunner
  triggerLabel?: string;   // mặc định "Nhập từ file"
}): JSX.Element;
```

Phân lớp gọi API (CLAUDE.md: trang/component gọi **hook**, không gọi `lib/api` trực tiếp): `ImportDialog` lấy bộ chạy từ `useImportRunner`, và hook đó bọc `IMPORT_RUNNERS` — nên việc **làm mới danh sách sau khi ghi** nằm đúng một chỗ thay vì mỗi trang tự nhớ gọi `refetch`.

- [ ] **Step 1: Viết test hook (đỏ)**

Create `apps/web/src/hooks/useMasterDataImport.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ImportResult } from '@/lib/import/import-types';

const room = vi.fn();
const klass = vi.fn();
vi.mock('@/lib/api/master-data-import', () => ({
  IMPORT_RUNNERS: { semester: vi.fn(), room, 'administrative-class': vi.fn(), class: klass },
}));

import { MASTER_DATA_KEYS } from './master-data-keys';
import { useImportRunner } from './useMasterDataImport';

const RESULT = (overrides: Partial<ImportResult> = {}): ImportResult => ({
  dryRun: false,
  applied: true,
  counts: { added: 1, updated: 0, unchanged: 0, errors: 0 },
  rows: [],
  needsSimilarConfirmation: false,
  ...overrides,
});

function setup(kind: Parameters<typeof useImportRunner>[0]) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result, rerender } = renderHook(() => useImportRunner(kind), { wrapper });
  return { result, rerender, invalidate };
}

describe('useImportRunner', () => {
  beforeEach(() => {
    room.mockReset();
    klass.mockReset();
  });

  it('chuyển yêu cầu và trả kết quả của đúng bộ chạy theo loại', async () => {
    room.mockResolvedValue(RESULT());
    const { result } = setup('room');
    const request = { rows: [{ line: 2, name: 'H3.03', capacity: '' }], dryRun: true };

    await expect(result.current(request)).resolves.toEqual(RESULT());

    expect(room).toHaveBeenCalledWith(request);
    expect(klass).not.toHaveBeenCalled();
  });

  it('dryRun KHÔNG làm mới truy vấn nào: chưa có gì đổi', async () => {
    room.mockResolvedValue(RESULT({ dryRun: true, applied: false }));
    const { result, invalidate } = setup('room');

    await result.current({ rows: [], dryRun: true });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('ghi thật đã áp dụng: làm mới danh sách của loại đó', async () => {
    room.mockResolvedValue(RESULT());
    const { result, invalidate } = setup('room');

    await result.current({ rows: [], dryRun: false });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: [MASTER_DATA_KEYS.rooms] });
  });

  it('import lớp làm mới khoá GỐC `classes` — phủ cả trang quản trị lẫn "Lớp của tôi"', async () => {
    klass.mockResolvedValue(RESULT());
    const { result, invalidate } = setup('class');

    await result.current({ rows: [], dryRun: false });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['classes'] });
  });

  it('ghi thật nhưng không có gì để ghi (applied=false): không làm mới', async () => {
    room.mockResolvedValue(RESULT({ applied: false }));
    const { result, invalidate } = setup('room');

    await result.current({ rows: [], dryRun: false });

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('lỗi của server được ném lại nguyên vẹn và không làm mới gì', async () => {
    room.mockRejectedValue(new Error('Máy chủ từ chối'));
    const { result, invalidate } = setup('room');

    await expect(result.current({ rows: [], dryRun: false })).rejects.toThrow('Máy chủ từ chối');

    expect(invalidate).not.toHaveBeenCalled();
  });

  it('tham chiếu ổn định qua các lần render — nếu không, ImportWizard gọi dryRun lại ở mỗi lần cha render', () => {
    const { result, rerender } = setup('room');
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
```

- [ ] **Step 2: Viết test `ImportDialog` (đỏ)**

Create `apps/web/src/components/import/import-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ADMINISTRATIVE_CLASS_KIND, ROOM_KIND } from '@/lib/import/columns';

vi.mock('@/hooks/useMasterDataImport', () => ({ useImportRunner: () => vi.fn() }));
vi.mock('@/lib/import/template', () => ({ downloadTemplate: vi.fn() }));

import { ImportDialog } from './import-dialog';

describe('ImportDialog', () => {
  it('có nút mở; chưa mở thì chưa có hộp thoại', () => {
    render(<ImportDialog kind={ROOM_KIND} />);
    expect(screen.getByRole('button', { name: 'Nhập từ file' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mở ra hộp thoại có tiêu đề theo loại và bước chọn file', () => {
    render(<ImportDialog kind={ROOM_KIND} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ file' }));

    expect(screen.getByRole('dialog', { name: 'Nhập phòng thi từ file' })).toBeInTheDocument();
    expect(screen.getByLabelText(/file excel/i)).toBeInTheDocument();
  });

  it('tiêu đề đổi theo loại', () => {
    render(<ImportDialog kind={ADMINISTRATIVE_CLASS_KIND} triggerLabel="Nhập mã từ file" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập mã từ file' }));
    expect(screen.getByRole('dialog', { name: 'Nhập danh mục lớp danh nghĩa từ file' })).toBeInTheDocument();
  });

  it('đóng hộp thoại gỡ nội dung (trạng thái import không sống sót sau khi đóng)', () => {
    render(<ImportDialog kind={ROOM_KIND} />);
    fireEvent.click(screen.getByRole('button', { name: 'Nhập từ file' }));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/hooks/useMasterDataImport.test.tsx src/components/import/import-dialog.test.tsx`
Expected: FAIL — không import được `./master-data-keys`, `./useMasterDataImport`, `./import-dialog`.

- [ ] **Step 4: Viết khoá truy vấn và hook**

Create `apps/web/src/hooks/master-data-keys.ts`:

```ts
/**
 * Khoá truy vấn của dữ liệu nền — MỘT nơi, dùng chung giữa hook import (làm mới sau khi ghi) và các hook đọc của trang admin
 * (plan G1) và giảng viên (plan G2). Hai bên gõ tay cùng một chuỗi là hai chỗ để lệch nhau, và lệch ở đây thì danh sách không
 * làm mới sau khi nhập xong mà không có lỗi nào báo.
 */
export const MASTER_DATA_KEYS = {
  semesters: 'semesters',
  rooms: 'rooms',
  administrativeClasses: 'administrative-classes',
  /**
   * GỐC của mọi truy vấn lớp: `['classes', 'teaching', …]` ("Lớp của tôi", đã có từ trước) và `['classes', 'admin', …]` (trang
   * quản trị, plan G2). Khoá RỘNG có chủ ý — cùng lý do `useTeaching.ts` đã nêu: sĩ số lớp hiện ở nhiều chỗ, và một chỗ hiện
   * con số cũ là cách người dùng mất niềm tin vào tất cả.
   */
  classes: 'classes',
} as const;
```

Create `apps/web/src/hooks/useMasterDataImport.ts`:

```ts
'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IMPORT_RUNNERS } from '@/lib/api/master-data-import';
import type { ImportKindId } from '@/lib/import/columns';
import type { RunImport } from '@/lib/import/import-types';
import { MASTER_DATA_KEYS } from './master-data-keys';

/** Danh sách nào đổi khi một loại được nhập xong. Khoá `classes` là gốc nên phủ cả trang quản trị lẫn "Lớp của tôi". */
const AFFECTED: Record<ImportKindId, readonly string[]> = {
  semester: [MASTER_DATA_KEYS.semesters],
  room: [MASTER_DATA_KEYS.rooms],
  'administrative-class': [MASTER_DATA_KEYS.administrativeClasses],
  class: [MASTER_DATA_KEYS.classes],
};

/**
 * Bộ chạy import cho một loại, bọc `IMPORT_RUNNERS` để việc LÀM MỚI danh sách sau khi ghi nằm đúng một chỗ: trang thêm nút
 * "Nhập từ file" mà quên làm mới sẽ cho admin thấy danh sách cũ ngay sau khi nhập xong và tưởng không có gì xảy ra.
 *
 * Chỉ làm mới khi lần ghi THẬT đã áp dụng (`applied`): `dryRun` không đổi gì, và lần ghi không có gì để ghi cũng vậy.
 * Trả về tham chiếu ỔN ĐỊNH (`useCallback`) — `ImportWizard` gọi `dryRun` lại mỗi khi dòng đổi, nên một hàm mới ở mỗi lần cha
 * render sẽ là một lần gọi máy chủ thừa mỗi lần.
 */
export function useImportRunner(kind: ImportKindId): RunImport {
  const queryClient = useQueryClient();
  return useCallback<RunImport>(
    async (request) => {
      const result = await IMPORT_RUNNERS[kind](request);
      if (!request.dryRun && result.applied) {
        await Promise.all(
          AFFECTED[kind].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        );
      }
      return result;
    },
    [kind, queryClient],
  );
}
```

- [ ] **Step 5: Viết `ImportDialog`**

Create `apps/web/src/components/import/import-dialog.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ImportWizard } from '@/components/import/import-wizard';
import { useImportRunner } from '@/hooks/useMasterDataImport';
import type { ImportKind } from '@/lib/import/columns';
import type { ImportResult } from '@/lib/import/import-types';

interface ImportDialogProps {
  kind: ImportKind;
  /**
   * Tuỳ chọn. Danh sách đã tự làm mới (qua `useImportRunner`) nên trang KHÔNG cần gọi `refetch`; callback này chỉ cho việc
   * khác, vd đóng một bảng phụ hay hiện thông báo.
   */
  onImported?: (result: ImportResult) => void;
  triggerLabel?: string;
}

/**
 * Nút + hộp thoại "Nhập từ file" cho một loại dữ liệu nền — chỗ DUY NHẤT trang admin chạm vào bộ import (plan G1):
 * `<ImportDialog kind={ROOM_KIND} />`. Keo dán: lấy bộ chạy theo loại từ hook và bọc `ImportWizard`.
 *
 * Radix gỡ nội dung khi đóng, nên đóng hộp thoại là bỏ file, cột đã chọn và bản xem trước — không có trạng thái nào sống
 * sót để lần mở sau hiện nhầm bản xem trước của lần trước.
 */
export function ImportDialog({ kind, onImported, triggerLabel = 'Nhập từ file' }: ImportDialogProps) {
  const [open, setOpen] = useState(false);
  const run = useImportRunner(kind.id);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Upload className="h-4 w-4" aria-hidden="true" />
        {triggerLabel}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{`Nhập ${kind.title.toLowerCase()} từ file`}</DialogTitle>
            <DialogDescription>
              Chỉ thêm và sửa — không bao giờ xoá. Muốn xoá thì làm thủ công.
            </DialogDescription>
          </DialogHeader>
          <ImportWizard kind={kind} run={run} onImported={onImported} />
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 6: Chạy cả bộ web, lint, kiểu, build**

```powershell
cd apps/web
npx vitest run
npx eslint src/lib/import src/lib/api/master-data-import.ts src/lib/api/master-data-import.test.ts src/lib/read-workbook.ts src/components/import src/hooks/master-data-keys.ts src/hooks/useMasterDataImport.ts src/hooks/useMasterDataImport.test.tsx
npx tsc --noEmit
pnpm build
```

Expected: toàn bộ vitest xanh (cùng số suite cũ, cộng các suite mới của plan này); ESLint, `tsc` sạch; `next build` thành công. Ba chỗ hay vỡ ở bước này: (1) `react/no-unescaped-entities` với dấu `"` trong JSX — dùng `{'…'}` hoặc `&quot;`; (2) `react-hooks/exhaustive-deps` ở effect của `ImportWizard` — `runRef` đã được dùng để `run` không nằm trong mảng phụ thuộc, nên không cần `eslint-disable`; nếu quy tắc vẫn kêu về `extracted`, đó là đúng và phụ thuộc đã đủ; (3) `tsc` kêu `Alert variant="warning"` — xem ghi chú ở Task 6 Step 4.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/import apps/web/src/hooks apps/web/src/lib
git commit -m "feat(web): useImportRunner (làm mới danh sách sau khi ghi) và ImportDialog cho dữ liệu nền"
```

---

## Tự kiểm lại plan so với spec

- §6.3 "bộ import dùng chung điều khiển bằng mô tả cột (khoá, bắt buộc, bí danh tên cột, cách hiển thị diff)": `ImportKind`/`ImportColumn` (khoá, bắt buộc, bí danh, ví dụ, hướng dẫn) ở Task 2; "cách hiển thị diff" là `ImportPreview` (Task 5) dùng chung cho cả bốn loại, vì diff đến từ server dưới một hình dạng duy nhất (`changes` từ → đến), không cần mô tả riêng từng loại. Giữ các điểm đúng của roster: exceljs đọc trong trình duyệt, file không lên server, giới hạn 5MB/2.000 dòng/40 cột (không đụng `readWorkbook` ngoài ô ngày), server kiểm lại mọi dòng.
- §6.3 "Ô ngày trong Excel… cách `readWorkbook` trả ô ngày cần kiểm khi viết plan": **đã kiểm bằng thực nghiệm** (exceljs 4.4.0: ô ngày → `Date` UTC nửa đêm, `cell.text` = `Date.toString()`); Task 1 sửa tại nguồn bằng getter UTC và có test .xlsx thật (ô ngày, ô công thức ra ngày, và ba loại ô không phải ngày giữ nguyên). Server từ chối chuỗi `Date.toString()` (E1) nên nếu có đường nào bỏ sót bản sửa này, người dùng thấy lỗi "không hiểu được ngày" thay vì một ngày sai.
- §6.2 nguyên tắc 3 (file có lỗi không ghi gì; lỗi kèm số dòng): nút xác nhận tắt khi `counts.errors > 0`; `line` lấy từ vị trí trong sheet (Task 2, ca dòng trống ở giữa). Nguyên tắc 4 (mục mới gần giống hiện cạnh mục bị so, nút xác nhận chỉ bật khi tick): `ImportPreview` + `ImportWizard` (Task 5, 6), `confirmSimilar` chỉ gửi khi đã tick (test). Nguyên tắc 5 (xem trước = ghi): bản xem trước là kết quả `dryRun` của server, nút xác nhận gửi đúng `extracted.rows` đã xem; chống đáp ứng cũ (Task 6). Nguyên tắc 8 (file mẫu, nhận diện theo tên trước, ghép cột còn lại): Task 2, 3, 6. Nguyên tắc 1, 2, 6, 7 là của server (E1).
- §11: T-IMP-1 (một bộ dùng chung cho bốn loại — một `ImportWizard`, bốn `ImportKind`), T-IMP-4 (ô ngày), T-IMP-5 (nhận diện cột theo tên, cột lạ, tiêu đề bìa), T-IMP-6/T-IMP-8 phần hiển thị ("A → B", "gần giống … (đã có)/(dòng N trong file)").
- Việc plan này **không** làm, để khỏi hiểu nhầm: trang admin Học kỳ/Phòng thi/Lớp và nút "Danh mục lớp danh nghĩa" (plan G, chỉ cần `<ImportDialog kind={…} onImported={…} />`); roster của giảng viên (không đổi); câu tiếng Việt cho các dòng audit `*.import` (plan G); duyệt bằng trình duyệt thật (plan H có lượt browser pass).
- Đã đo (không phải suy đoán), exceljs 4.4.0: ô ngày → `Date` ở nửa đêm UTC (`cell.type = 4`) **kể cả khi ô không có `numFmt` ngày**; ô công thức ra ngày → `{ formula, result: Date }` (`cell.type = 6`); cả hai có `.text` = `Date.toString()` theo múi giờ máy. `Alert variant="warning"` có sẵn. Còn lại một giới hạn có chủ ý: một file lưu từ phần mềm khác ghi ngày ở nửa đêm **giờ địa phương** (không phải UTC) sẽ đọc lệch một ngày — hiếm, và bản xem trước hiện ngày đã hiểu (`dd/mm/yyyy`) trước khi ghi nên admin thấy.
- Placeholder scan: không có "TBD"; mọi bước có mã/lệnh cụ thể. Kiểu nhất quán: `RunImport`/`ImportRequest`/`ImportResult` (Task 2) khớp Task 4 (API), 5 (preview), 6 (wizard), 7 (dialog); khoá cột ở `columns.ts` khớp tên trường DTO của E1 (`academicYear, term, startDate, endDate` / `name, capacity` / `code` / `semester, administrativeClassCode, groupName, teacherEmail`) và trần dòng khớp `IMPORT_ROW_LIMITS` (20/500/500/200); `ImportRejectedError.code` khớp hai mã lỗi của `runImport` (`IMPORT_HAS_ERRORS`, `NEAR_DUPLICATE`); `onImported` nhận `ImportResult` mà plan G dùng để làm mới danh sách.
