# Plan G2 — Ba trang admin (Học kỳ, Phòng thi, Lớp), Danh mục lớp danh nghĩa, và menu

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin **quản lý** học kỳ, phòng thi, Danh mục lớp danh nghĩa và lớp bằng giao diện: thêm/sửa/xoá thủ công **và** nhập từ file, với lý do **cụ thể** khi không xoá được, cảnh báo "gần giống" khi gõ tay, và ba mục menu mới. Lớp được tạo **chọn** (học kỳ, lớp danh nghĩa từ Danh mục, nhóm, giảng viên) chứ không gõ.

**Architecture:** Dùng lại khung `ResourceShell` / `ResourceFormDialog` / `ConfirmDeleteDialog` (đang có sẵn và chưa ai dùng) với **bốn mở rộng nhỏ, có test** — ô lọc, nhóm hàng, tô hàng, và cờ `canSubmit` — thay vì viết lại ba bảng. Logic biến một biểu mẫu thành thân yêu cầu nằm ở `lib/master-data-forms.ts` (hàm thuần, test không cần DOM); trang chỉ ghép hook + khung + biểu mẫu. Nhập từ file là `<ImportDialog kind={…} />` của plan E2; làm mới danh sách sau lần ghi do `useImportRunner` lo. Hộp thoại Danh mục lớp danh nghĩa mở **từ trang Lớp** (không có trang riêng, nên giảng viên và các màn hình khác không bao giờ thấy "hai thứ").

**Tech Stack:** Next.js 15, React 19, TanStack Query 5 (qua hook của G1), Radix Select/Dialog (shadcn), vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-04-master-data-restoration-design.md` §5.1 (ba trang, một hộp thoại, một trang thay placeholder — trang audit là plan B), §2.2 (Danh mục lớp danh nghĩa: gõ duy nhất một ô, cảnh báo gần giống, chặn xoá kèm lý do, danh mục trống thì chỉ đường), §2.3 (lớp: ô chọn, không đổi học kỳ khi đã có phiên), §2.4 (phòng: bật/tắt hoạt động, đổi tên không đổi phiên cũ), §2.1 (học kỳ), §7.2 (bảng "màn hình → bộ lọc": Admin: Lớp = Năm học + học kỳ + giảng viên + ô tìm mã lớp; Học kỳ = nhóm theo năm học; Phòng = ô tìm tên), §6 (nhập hai cách), §11: T-WEB-1 … T-WEB-5 (các ca web của spec §11).

**Phụ thuộc:** plan G1 (hook, lớp API, `useSemesterYearFilter`, `SemesterYearFilter`, `NearDuplicateNotice`) và plan E2 (`ImportDialog`, `SEMESTER_KIND`…); API của plan C, D2.

## Global Constraints

- **Ba trang dưới `/admin/…`, mỗi trang một thư mục `page.tsx`:** `/admin/semesters`, `/admin/rooms`, `/admin/classes`. Menu admin thêm **ba mục** (Học kỳ, Phòng thi, Lớp) **cùng commit** với trang — quy tắc đầu `nav-config.ts`: không bao giờ một mục menu trỏ tới trang chưa có. Một test mới khẳng định **mọi** `href` của `ADMIN_NAV` và `TEACHER_NAV` có `page.tsx`.
- **Trang gọi HOOK, không gọi `lib/api`** (G1). Mọi mutation đi qua hook làm mới danh sách; trang **không** gọi `refetch`.
- **Lý do cụ thể khi không xoá được** (spec §5.1): lỗi `409` của server (vd "Phòng H3.03 đã có 4 phiên thi nên không xoá được…") được `ConfirmDeleteDialog` hiện **nguyên văn** và hộp thoại **không đóng** khi thất bại (đã là hành vi của khung). Không dịch, không rút gọn.
- **Gõ gần giống là LỜI NHẮC, không phải lệnh cấm:** `NearDuplicateError` từ phòng và mã lớp danh nghĩa hiện `NearDuplicateNotice` **trong** biểu mẫu kèm nút "Vẫn thêm … này" gửi lại với `confirmSimilar: true`; lỗi trùng **cứng** hiện như mọi lỗi khác. Khung `ResourceFormDialog` **không** vẽ thêm một `Alert` đỏ cho `NearDuplicateError` (nếu không, người dùng thấy cùng một việc hai lần với hai màu).
- **Mở hộp thoại là trạng thái mới:** mỗi lần mở biểu mẫu thêm/sửa gọi `reset()` của các mutation liên quan để lỗi của lần trước không hiện lại.
- **Lớp: chọn, không gõ.** Học kỳ từ `useSemesters`, lớp danh nghĩa từ Danh mục (`useAdministrativeClasses`), giảng viên từ `useTeacherOptions`; chỉ **nhóm** là ô gõ (không bắt buộc). Nút gửi **tắt** cho tới khi đủ ba ô chọn (`canSubmit`). **Danh mục trống** → lời chỉ đường nguyên văn spec "Chưa có mã lớp danh nghĩa nào. Hãy thêm vào Danh mục lớp danh nghĩa trước." kèm nút mở hộp thoại Danh mục; **chưa có học kỳ** → lời tương tự kèm liên kết `/admin/semesters`. Lớp **đã có phiên thi** thì ô Học kỳ **khoá** kèm câu giải thích (DB cũng chặn: spec §2.3) — nhưng nhóm, lớp danh nghĩa và giảng viên vẫn sửa được. Khi sửa chỉ gửi **các trường đã đổi**.
- **Học kỳ: năm/kỳ khoá khi đã có lớp** (spec §2.1, §2.3: nhãn trên phiên đã chụp nhãn cũ); chỉ sửa được ngày. `classCount` hiện ở cột "Số lớp".
- **Phòng: tắt thay vì xoá.** Hàng có nút bật/tắt hoạt động; phòng ngừng hoạt động hiện mờ và nhãn "Ngừng hoạt động". Sửa sức chứa để trống nghĩa là **xoá** sức chứa (`null`), còn khi **thêm** thì bỏ khỏi thân — hai nghĩa khác nhau, hai hàm khác nhau.
- **Bộ lọc dùng đúng các thành phần của G1:** trang Lớp dùng `useSemesterYearFilter('admin-classes')` + `SemesterYearFilter` (mặc định "Tất cả"), cộng giảng viên và ô tìm mã lớp (debounce 300 ms như các trang khác); bộ lọc phía **server** (`useAdminClasses`). Trang Học kỳ **nhóm theo năm học**; trang Phòng có **ô tìm tên** (lọc trong trình duyệt: danh sách phòng nhỏ và đã tải đủ).
- Không đổi hành vi của `ResourceShell`/`ResourceFormDialog` cho người gọi cũ (không còn người gọi nào): mọi prop mới đều **tuỳ chọn** và mặc định giữ nguyên hành vi.

## Review Focus

1. **Nút "Vẫn thêm" bị nhầm với trùng cứng** hoặc cảnh báo hiện hai lần. → test khung: `NearDuplicateError` không vẽ `Alert` đỏ; lỗi thường vẫn vẽ (Task 1).
2. **Lỗi của lần mở trước hiện lại** ở biểu mẫu mới. → `reset()` khi mở; test trên từng trang (Task 3–6).
3. **Form lớp gửi được khi thiếu ô chọn** hoặc **đổi học kỳ của lớp đã có phiên** (server chặn nhưng người dùng đã bấm). → `canSubmit`, ô học kỳ khoá; test (Task 6).
4. **Thân sửa phòng xoá nhầm sức chứa** (ô trống khi thêm vs khi sửa). → hai hàm riêng, test từng ca (Task 2).
5. **Thân sửa lớp gửi lại cả bốn trường** làm audit ghi "đổi" những thứ không đổi hoặc đụng trigger đổi-học-kỳ. → `classUpdateBody` chỉ gửi trường khác bản gốc (Task 2, 6).
6. **Danh mục trống mà form lớp vẫn hiện ô chọn rỗng không lời giải thích** (người dùng tưởng hỏng). → lời chỉ đường + nút mở Danh mục (Task 6).
7. **Mục menu trỏ vào trang chưa có**, hoặc trang có mà quên menu. → test duyệt `ADMIN_NAV`/`TEACHER_NAV` kiểm `page.tsx` (Task 7).
8. **Bảng học kỳ không nhóm theo năm** hoặc nhóm bị tách vì dữ liệu chưa sắp. → trang sắp (năm giảm dần, kỳ tăng dần) trước khi nhóm; test thứ tự (Task 3).

---

## File Structure

| File | Việc |
|---|---|
| `apps/web/src/components/resource/resource-shell.tsx` (+ test) | Thêm `filters`, `groupBy`, `rowClassName`. |
| `apps/web/src/components/resource/resource-form-dialog.tsx` (+ test) | Thêm `canSubmit`; không vẽ lỗi đỏ cho `NearDuplicateError`. |
| `apps/web/src/lib/master-data-forms.ts` (+ test) | **Mới.** Biểu mẫu → thân yêu cầu (hàm thuần). |
| `apps/web/src/app/admin/semesters/page.tsx` (+ test) | **Mới.** |
| `apps/web/src/app/admin/rooms/page.tsx` (+ test) | **Mới.** |
| `apps/web/src/app/admin/classes/_components/administrative-class-catalog-dialog.tsx` (+ test) | **Mới.** |
| `apps/web/src/app/admin/classes/page.tsx` (+ test) | **Mới.** |
| `apps/web/src/lib/nav-config.ts` (+ test) | Thêm ba mục admin; test "mọi mục có trang". |

---

### Task 1: Mở rộng khung `ResourceShell` và `ResourceFormDialog`

**Files:**
- Modify: `apps/web/src/components/resource/resource-shell.tsx`, `apps/web/src/components/resource/resource-form-dialog.tsx`
- Test: `apps/web/src/components/resource/resource-shell.test.tsx`, `apps/web/src/components/resource/resource-form-dialog.test.tsx`

**Interfaces:**
- Consumes: `NearDuplicateError` (G1).
- Produces:

```ts
// ResourceShell — thêm, đều tuỳ chọn
filters?: ReactNode;                                              // giữa tiêu đề và bảng
groupBy?: { key: (row: T) => string; label: (key: string) => string };   // hàng PHẢI đã sắp theo nhóm
rowClassName?: (row: T) => string | undefined;
// ResourceFormDialog — thêm, tuỳ chọn
canSubmit?: boolean;   // mặc định true
```

- [ ] **Step 1: Viết test khung (đỏ)**

Create `apps/web/src/components/resource/resource-shell.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { DoorOpen } from 'lucide-react';
import { ResourceShell } from './resource-shell';

interface Row {
  id: string;
  name: string;
  year: number;
}

const ROWS: Row[] = [
  { id: 'a', name: 'HK1 2026', year: 2026 },
  { id: 'b', name: 'HK2 2026', year: 2026 },
  { id: 'c', name: 'HK1 2025', year: 2025 },
];

function setup(props: Partial<React.ComponentProps<typeof ResourceShell<Row>>> = {}) {
  const handlers = { onAdd: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn() };
  render(
    <ResourceShell<Row>
      title="Học kỳ"
      description="mô tả"
      icon={DoorOpen}
      addLabel="Thêm học kỳ"
      rows={ROWS}
      rowKey={(r) => r.id}
      isLoading={false}
      error={null}
      emptyTitle="Chưa có học kỳ nào"
      emptyDescription="Tạo học kỳ trước."
      columns={[{ label: 'Tên', render: (r) => r.name }]}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ResourceShell', () => {
  it('hàng, nút thêm/sửa/xoá gọi đúng callback với đúng hàng', () => {
    const { onAdd, onEdit, onDelete } = setup();

    fireEvent.click(screen.getByRole('button', { name: /thêm học kỳ/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);

    const row = screen.getByRole('row', { name: /HK2 2026/ });
    fireEvent.click(within(row).getByRole('button', { name: 'Sửa' }));
    expect(onEdit).toHaveBeenCalledWith(ROWS[1]);
    fireEvent.click(within(row).getByRole('button', { name: 'Xoá' }));
    expect(onDelete).toHaveBeenCalledWith(ROWS[1]);
  });

  it('đang tải, rỗng và lỗi có ba trạng thái riêng', () => {
    const { unmount } = render(
      <ResourceShell<Row>
        title="Học kỳ" description="d" icon={DoorOpen} addLabel="Thêm" onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
        rows={[]} rowKey={(r) => r.id} isLoading={false} error={null}
        emptyTitle="Chưa có học kỳ nào" emptyDescription="Tạo học kỳ trước." columns={[]}
      />,
    );
    expect(screen.getByText('Chưa có học kỳ nào')).toBeInTheDocument();
    unmount();

    render(
      <ResourceShell<Row>
        title="Học kỳ" description="d" icon={DoorOpen} addLabel="Thêm" onAdd={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}
        rows={undefined} rowKey={(r) => r.id} isLoading={false} error={new Error('Không tải được')}
        emptyTitle="Chưa có học kỳ nào" emptyDescription="x" columns={[]}
      />,
    );
    expect(screen.getByText('Không tải được')).toBeInTheDocument();
  });

  describe('filters', () => {
    it('vẽ giữa tiêu đề và bảng', () => {
      setup({ filters: <input aria-label="Tìm" /> });
      expect(screen.getByLabelText('Tìm')).toBeInTheDocument();
    });

    it('vẫn vẽ khi danh sách rỗng — ô lọc là thứ để thoát khỏi trạng thái rỗng do lọc', () => {
      setup({ rows: [], filters: <input aria-label="Tìm" /> });
      expect(screen.getByLabelText('Tìm')).toBeInTheDocument();
      expect(screen.getByText('Chưa có học kỳ nào')).toBeInTheDocument();
    });
  });

  describe('groupBy (Review Focus 8)', () => {
    const groupBy = { key: (r: Row) => String(r.year), label: (key: string) => `Năm học ${key}` };

    it('mỗi nhóm một dòng tiêu đề, theo thứ tự hàng', () => {
      setup({ groupBy });
      const headers = screen.getAllByText(/^Năm học /).map((el) => el.textContent);
      expect(headers).toEqual(['Năm học 2026', 'Năm học 2025']);
    });

    it('dòng tiêu đề nhóm đứng NGAY TRƯỚC hàng đầu của nhóm và trải hết các cột', () => {
      setup({ groupBy });
      const rows = screen.getAllByRole('row').map((r) => r.textContent);
      // [header bảng, nhóm 2026, HK1 2026, HK2 2026, nhóm 2025, HK1 2025]
      expect(rows[1]).toContain('Năm học 2026');
      expect(rows[2]).toContain('HK1 2026');
      expect(rows[3]).toContain('HK2 2026');
      expect(rows[4]).toContain('Năm học 2025');
      expect(rows[5]).toContain('HK1 2025');
      const groupCell = screen.getByText('Năm học 2026').closest('td');
      expect(groupCell).toHaveAttribute('colspan', '2'); // một cột dữ liệu + cột hành động
    });

    it('không có groupBy thì không có dòng nhóm', () => {
      setup();
      expect(screen.queryByText(/^Năm học /)).not.toBeInTheDocument();
    });
  });

  it('rowClassName tô riêng từng hàng', () => {
    setup({ rowClassName: (r) => (r.year === 2025 ? 'opacity-50' : undefined) });
    expect(screen.getByRole('row', { name: /HK1 2025/ })).toHaveClass('opacity-50');
    expect(screen.getByRole('row', { name: /HK1 2026/ })).not.toHaveClass('opacity-50');
  });

  it('rowActions đứng trước nút sửa và xoá', () => {
    setup({ rowActions: (r) => <button type="button">Tắt {r.name}</button> });
    const row = screen.getByRole('row', { name: /HK1 2025/ });
    const labels = within(row).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(labels).toEqual(['Tắt HK1 2025', 'Sửa', 'Xoá']);
  });
});
```

Create `apps/web/src/components/resource/resource-form-dialog.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import { ResourceFormDialog } from './resource-form-dialog';

function setup(props: Partial<React.ComponentProps<typeof ResourceFormDialog>> = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  const onOpenChange = vi.fn();
  render(
    <ResourceFormDialog
      open
      onOpenChange={onOpenChange}
      title="Thêm phòng thi"
      submitLabel="Tạo"
      submitting={false}
      error={null}
      onSubmit={onSubmit}
      {...props}
    >
      <input aria-label="Tên phòng" />
    </ResourceFormDialog>,
  );
  return { onSubmit, onOpenChange };
}

describe('ResourceFormDialog', () => {
  it('gửi thành công thì đóng', async () => {
    const { onSubmit, onOpenChange } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('gửi thất bại thì KHÔNG đóng (lý do phải còn đó để đọc)', async () => {
    const { onOpenChange } = setup({ onSubmit: vi.fn().mockRejectedValue(new Error('x')), error: new Error('Phòng đã tồn tại') });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByText('Phòng đã tồn tại')).toBeInTheDocument();
  });

  it('canSubmit=false tắt nút gửi; mặc định là bật', () => {
    setup({ canSubmit: false });
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeDisabled();
  });

  it('canSubmit vắng mặt thì nút bật (mọi người gọi cũ giữ nguyên hành vi)', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Tạo' })).toBeEnabled();
  });

  it('Review Focus 1: NearDuplicateError KHÔNG vẽ Alert đỏ — trang vẽ NearDuplicateNotice trong nội dung', () => {
    setup({ error: new NearDuplicateError('Phòng "H303" gần giống "Phòng H3.03".', []) });
    expect(screen.queryByText('Phòng "H303" gần giống "Phòng H3.03".')).not.toBeInTheDocument();
  });

  it('lỗi thường vẫn vẽ', () => {
    setup({ error: new Error('Phòng "H3.03" đã tồn tại.') });
    expect(screen.getByText('Phòng "H3.03" đã tồn tại.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/components/resource`
Expected: FAIL — `ResourceShell` chưa nhận `filters`/`groupBy`/`rowClassName`, `ResourceFormDialog` chưa nhận `canSubmit` và vẫn vẽ lỗi đỏ cho `NearDuplicateError`.

- [ ] **Step 3: Mở rộng `ResourceShell`**

Trong `apps/web/src/components/resource/resource-shell.tsx`:

1. Đổi dòng import đầu: `import type { ReactNode } from 'react';` thành `import { Fragment, type ReactNode } from 'react';`.

2. Thêm vào `ResourceShellProps<T>` (sau `headerActions`):

```ts
  /**
   * Ô tìm và bộ lọc, giữa tiêu đề và bảng. Luôn vẽ — kể cả khi danh sách rỗng: nếu bộ lọc biến mất cùng các hàng thì một bộ lọc
   * quá chặt là ngõ cụt, chính cái ô để nới nó lại không còn.
   */
  filters?: ReactNode;
  /**
   * Gom các hàng LIỀN NHAU có cùng khoá dưới một dòng tiêu đề nhóm (vd học kỳ theo năm học). Khung KHÔNG sắp xếp: hàng phải đã nằm
   * theo nhóm, nếu không một nhóm bị tách làm hai và tiêu đề của nó hiện hai lần.
   */
  groupBy?: { key: (row: T) => string; label: (key: string) => string };
  /** Tô riêng từng hàng — vd mờ đi một phòng đã ngừng hoạt động. */
  rowClassName?: (row: T) => string | undefined;
```

3. Thêm `filters,`, `groupBy,`, `rowClassName,` vào danh sách destructuring ở đầu hàm `ResourceShell`.

4. Ngay sau khối `{error && (...)}` (trước `<Card className="overflow-hidden">`), thêm:

```tsx
      {filters}
```

5. Thay phần `{rows.map((row) => ( <TableRow …> … </TableRow> ))}` bằng:

```tsx
                  {rows.map((row, index) => {
                    const key = groupBy ? groupBy.key(row) : null;
                    const startsGroup =
                      groupBy !== undefined && (index === 0 || groupBy.key(rows[index - 1]) !== key);
                    return (
                      <Fragment key={rowKey(row)}>
                        {startsGroup && groupBy && key !== null && (
                          <TableRow className="bg-surface-2/60 hover:bg-surface-2/60">
                            <TableCell
                              colSpan={columns.length + 1}
                              className="py-2 text-caption font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                              {groupBy.label(key)}
                            </TableCell>
                          </TableRow>
                        )}
                        <TableRow className={rowClassName?.(row)}>
                          {columns.map((column) => (
                            <TableCell
                              key={column.label}
                              className={column.tight ? 'whitespace-nowrap' : undefined}
                            >
                              {column.render(row)}
                            </TableCell>
                          ))}
                          <TableCell className="whitespace-nowrap text-right">
                            {rowActions?.(row)}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(row)}
                              aria-label="Sửa"
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onDelete(row)}
                              aria-label="Xoá"
                            >
                              <Trash2 className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    );
                  })}
```

(Giữ nguyên `TableRow key={rowKey(row)}` cũ được thay bằng `Fragment key` — mỗi hàng dữ liệu vẫn một `<tr>`.)

- [ ] **Step 4: Mở rộng `ResourceFormDialog`**

Trong `apps/web/src/components/resource/resource-form-dialog.tsx`:

1. Thêm import: `import { NearDuplicateError } from '@/lib/api/http-error';`.
2. Thêm vào `ResourceFormDialogProps`:

```ts
  /**
   * `false` tắt nút gửi — cho biểu mẫu có ô CHỌN không dùng được thuộc tính `required` của trình duyệt (Radix Select). Mặc định
   * `true`: người gọi cũ giữ nguyên hành vi.
   */
  canSubmit?: boolean;
```

3. Thêm `canSubmit = true,` vào destructuring, và đổi nút gửi thành `disabled={submitting || !canSubmit}`.
4. Thay khối `{error && ( <Alert …>…</Alert> )}` bằng:

```tsx
          {/* `NearDuplicateError` là LỜI NHẮC chứ không phải lỗi: trang vẽ `NearDuplicateNotice` trong nội dung biểu mẫu. Vẽ thêm
              một Alert đỏ ở đây là cho người dùng thấy cùng một việc hai lần với hai mức độ nghiêm trọng khác nhau. */}
          {error && !(error instanceof NearDuplicateError) && (
            <Alert variant="destructive">
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
```

- [ ] **Step 5: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/components/resource`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/resource
git commit -m "feat(web): ResourceShell có ô lọc, nhóm hàng, tô hàng; ResourceFormDialog có canSubmit và nhường lời nhắc gần giống cho trang"
```

---

### Task 2: Biểu mẫu → thân yêu cầu (hàm thuần)

**Files:**
- Create: `apps/web/src/lib/master-data-forms.ts`
- Test: `apps/web/src/lib/master-data-forms.test.ts`

**Interfaces:**
- Consumes: `Semester`, `SemesterInput`, `Room`, `RoomInput`, `RoomUpdate`, `AdminClass`, `AdminClassInput` (G1).
- Produces:

```ts
export interface SemesterForm { academicYearStart: string; term: string; startDate: string; endDate: string }
export const EMPTY_SEMESTER_FORM: SemesterForm;
export function semesterFormOf(semester: Semester): SemesterForm;
export function semesterPayload(form: SemesterForm): SemesterInput;
export function semesterFormComplete(form: SemesterForm): boolean;
export interface RoomForm { name: string; capacity: string }
export const EMPTY_ROOM_FORM: RoomForm;
export function roomFormOf(room: Room): RoomForm;
export function roomCreatePayload(form: RoomForm): RoomInput;
export function roomUpdatePayload(form: RoomForm): RoomUpdate;
export interface ClassForm { semesterId: string; administrativeClassId: string; groupName: string; teacherId: string }
export const EMPTY_CLASS_FORM: ClassForm;
export function classFormOf(klass: AdminClass): ClassForm;
export function classFormComplete(form: ClassForm): boolean;
export function classCreateBody(form: ClassForm): AdminClassInput;
export function classUpdateBody(form: ClassForm, original: AdminClass): Partial<AdminClassInput>;
export function semesterTextOf(row: { academicYear: number | null; term: number | null }): string;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/lib/master-data-forms.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { AdminClass } from '@/lib/api/admin-classes';
import {
  EMPTY_CLASS_FORM,
  EMPTY_ROOM_FORM,
  EMPTY_SEMESTER_FORM,
  classCreateBody,
  classFormComplete,
  classFormOf,
  classUpdateBody,
  roomCreatePayload,
  roomFormOf,
  roomUpdatePayload,
  semesterFormComplete,
  semesterFormOf,
  semesterPayload,
  semesterTextOf,
} from './master-data-forms';

describe('học kỳ', () => {
  it('form rỗng chưa đủ; đủ năm/kỳ/hai ngày thì đủ', () => {
    expect(semesterFormComplete(EMPTY_SEMESTER_FORM)).toBe(false);
    expect(
      semesterFormComplete({ academicYearStart: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' }),
    ).toBe(true);
  });

  it('năm phải đủ 4 chữ số, kỳ phải là 1–3', () => {
    const base = { academicYearStart: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' };
    expect(semesterFormComplete({ ...base, academicYearStart: '26' })).toBe(false);
    expect(semesterFormComplete({ ...base, term: '4' })).toBe(false);
  });

  it('thân là số thật, ngày giữ yyyy-mm-dd', () => {
    expect(
      semesterPayload({ academicYearStart: '2026', term: '2', startDate: '2027-02-01', endDate: '2027-05-31' }),
    ).toEqual({ academicYearStart: 2026, term: 2, startDate: '2027-02-01', endDate: '2027-05-31' });
  });

  it('form từ học kỳ có sẵn: ngày được cắt về yyyy-mm-dd cho ô <input type="date">', () => {
    expect(
      semesterFormOf({
        id: 's1',
        academicYearStart: 2026,
        term: 1,
        label: 'HK1 2026-2027',
        startDate: '2026-09-01T00:00:00.000Z',
        endDate: '2027-01-31',
      }),
    ).toEqual({ academicYearStart: '2026', term: '1', startDate: '2026-09-01', endDate: '2027-01-31' });
  });
});

describe('phòng (Review Focus 4)', () => {
  it('THÊM: sức chứa trống thì bỏ khỏi thân (chưa biết sức chứa không chặn việc ghi nhận phòng)', () => {
    expect(roomCreatePayload({ name: 'H3.03', capacity: '' })).toEqual({ name: 'H3.03' });
    expect(roomCreatePayload({ name: 'H3.03', capacity: '  ' })).toEqual({ name: 'H3.03' });
    expect(roomCreatePayload({ name: 'H3.03', capacity: '40' })).toEqual({ name: 'H3.03', capacity: 40 });
  });

  it('SỬA: sức chứa trống nghĩa là XOÁ sức chứa (null), không phải "đừng đổi"', () => {
    expect(roomUpdatePayload({ name: 'H3.03', capacity: '' })).toEqual({ name: 'H3.03', capacity: null });
    expect(roomUpdatePayload({ name: 'H3.03', capacity: '45' })).toEqual({ name: 'H3.03', capacity: 45 });
  });

  it('form từ phòng có sẵn: sức chứa null thành chuỗi rỗng', () => {
    expect(roomFormOf({ id: 'r', name: 'A1', capacity: null, isActive: true })).toEqual({ name: 'A1', capacity: '' });
    expect(roomFormOf({ id: 'r', name: 'A1', capacity: 40, isActive: true })).toEqual({ name: 'A1', capacity: '40' });
    expect(EMPTY_ROOM_FORM).toEqual({ name: '', capacity: '' });
  });
});

describe('lớp', () => {
  const KLASS: AdminClass = {
    id: 'c1',
    label: 'DHKTPM18A – Nhóm 1',
    labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
    semesterId: 's1',
    academicYear: 2026,
    term: 1,
    administrativeClassId: 'a1',
    administrativeClassCode: 'DHKTPM18A',
    groupName: 'Nhóm 1',
    teacherId: 't1',
    teacherName: 'GV A',
    studentCount: 40,
    sessionCount: 2,
  };

  it('đủ khi có học kỳ, lớp danh nghĩa và giảng viên; nhóm không bắt buộc', () => {
    expect(classFormComplete(EMPTY_CLASS_FORM)).toBe(false);
    expect(classFormComplete({ semesterId: 's1', administrativeClassId: 'a1', groupName: '', teacherId: '' })).toBe(false);
    expect(classFormComplete({ semesterId: 's1', administrativeClassId: 'a1', groupName: '', teacherId: 't1' })).toBe(true);
  });

  it('thân tạo: nhóm đã cắt khoảng trắng; nhóm trống thì bỏ khỏi thân', () => {
    expect(classCreateBody({ semesterId: 's1', administrativeClassId: 'a1', groupName: '  Nhóm 2 ', teacherId: 't1' })).toEqual({
      semesterId: 's1',
      administrativeClassId: 'a1',
      groupName: 'Nhóm 2',
      teacherId: 't1',
    });
    expect(classCreateBody({ semesterId: 's1', administrativeClassId: 'a1', groupName: '   ', teacherId: 't1' })).toEqual({
      semesterId: 's1',
      administrativeClassId: 'a1',
      teacherId: 't1',
    });
  });

  it('Review Focus 5: thân sửa chỉ có các trường ĐÃ ĐỔI', () => {
    expect(classUpdateBody(classFormOf(KLASS), KLASS)).toEqual({});
    expect(classUpdateBody({ ...classFormOf(KLASS), teacherId: 't2' }, KLASS)).toEqual({ teacherId: 't2' });
    expect(classUpdateBody({ ...classFormOf(KLASS), groupName: ' Nhóm 3 ' }, KLASS)).toEqual({ groupName: 'Nhóm 3' });
    expect(
      classUpdateBody({ semesterId: 's2', administrativeClassId: 'a2', groupName: 'Nhóm 1', teacherId: 't1' }, KLASS),
    ).toEqual({ semesterId: 's2', administrativeClassId: 'a2' });
  });

  it('sửa nhóm về rỗng thì gửi chuỗi rỗng (bỏ nhóm), không phải "không đổi"', () => {
    expect(classUpdateBody({ ...classFormOf(KLASS), groupName: '' }, KLASS)).toEqual({ groupName: '' });
  });

  it('lớp cũ chưa có học kỳ/lớp danh nghĩa: form rỗng ở hai ô đó cho tới khi admin chọn', () => {
    const legacy = { ...KLASS, semesterId: null, administrativeClassId: null };
    expect(classFormOf(legacy)).toEqual({ semesterId: '', administrativeClassId: '', groupName: 'Nhóm 1', teacherId: 't1' });
    expect(classFormComplete(classFormOf(legacy))).toBe(false);
  });

  it('chữ học kỳ của một dòng', () => {
    expect(semesterTextOf({ academicYear: 2026, term: 1 })).toBe('HK1 2026-2027');
    expect(semesterTextOf({ academicYear: null, term: null })).toBe('Chưa gán học kỳ');
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/master-data-forms.test.ts`
Expected: FAIL — không import được `./master-data-forms`.

- [ ] **Step 3: Viết hàm**

Create `apps/web/src/lib/master-data-forms.ts`:

```ts
import type { AdminClass, AdminClassInput } from '@/lib/api/admin-classes';
import type { Room, RoomInput, RoomUpdate } from '@/lib/api/rooms';
import type { Semester, SemesterInput } from '@/lib/api/semesters';

/**
 * Biểu mẫu của ba trang admin → thân yêu cầu. HÀM THUẦN tách khỏi trang: logic dễ sai (ô trống nghĩa là gì khi thêm so với khi sửa;
 * gửi trường nào khi sửa) test được không cần DOM, và hai trang không phải mỗi nơi tự nghĩ lại.
 */

// ------------------------------------------------------------------------------------------------ học kỳ

export interface SemesterForm {
  academicYearStart: string;
  term: string;
  startDate: string;
  endDate: string;
}

export const EMPTY_SEMESTER_FORM: SemesterForm = { academicYearStart: '', term: '1', startDate: '', endDate: '' };

export function semesterFormOf(semester: Semester): SemesterForm {
  return {
    academicYearStart: String(semester.academicYearStart),
    term: String(semester.term),
    // <input type="date"> cần yyyy-mm-dd; cột là kiểu ngày nên giá trị trên dây đã bắt đầu bằng đúng chuỗi đó.
    startDate: semester.startDate.slice(0, 10),
    endDate: semester.endDate.slice(0, 10),
  };
}

/** Chỉ kiểm HÌNH DẠNG để bật nút gửi; luật thật (không chồng ngày, ngày kết thúc không trước ngày bắt đầu) là của server. */
export function semesterFormComplete(form: SemesterForm): boolean {
  return (
    /^\d{4}$/.test(form.academicYearStart) &&
    ['1', '2', '3'].includes(form.term) &&
    form.startDate !== '' &&
    form.endDate !== ''
  );
}

export function semesterPayload(form: SemesterForm): SemesterInput {
  return {
    academicYearStart: Number(form.academicYearStart),
    term: Number(form.term),
    startDate: form.startDate,
    endDate: form.endDate,
  };
}

// --------------------------------------------------------------------------------------------------- phòng

export interface RoomForm {
  name: string;
  capacity: string;
}

export const EMPTY_ROOM_FORM: RoomForm = { name: '', capacity: '' };

export function roomFormOf(room: Room): RoomForm {
  return { name: room.name, capacity: room.capacity === null ? '' : String(room.capacity) };
}

/**
 * THÊM: sức chứa trống thì BỎ khỏi thân — chưa biết sức chứa không được chặn việc ghi nhận một phòng, và "không nói gì" là câu trả lời đúng.
 */
export function roomCreatePayload(form: RoomForm): RoomInput {
  const capacity = form.capacity.trim();
  return { name: form.name, ...(capacity === '' ? {} : { capacity: Number(capacity) }) };
}

/**
 * SỬA: sức chứa trống nghĩa là XOÁ sức chứa (`null`). Khác hẳn lúc thêm: ở form sửa ô luôn mang giá trị hiện có, nên một ô trống là một
 * quyết định của người dùng, và bỏ nó khỏi thân sẽ lặng lẽ giữ lại một sức chứa họ vừa xoá.
 */
export function roomUpdatePayload(form: RoomForm): RoomUpdate {
  const capacity = form.capacity.trim();
  return { name: form.name, capacity: capacity === '' ? null : Number(capacity) };
}

// --------------------------------------------------------------------------------------------------- lớp

export interface ClassForm {
  semesterId: string;
  administrativeClassId: string;
  groupName: string;
  teacherId: string;
}

export const EMPTY_CLASS_FORM: ClassForm = { semesterId: '', administrativeClassId: '', groupName: '', teacherId: '' };

export function classFormOf(klass: AdminClass): ClassForm {
  return {
    // Lớp cũ chưa backfill có thể chưa có học kỳ/lớp danh nghĩa: ô rỗng cho tới khi admin chọn.
    semesterId: klass.semesterId ?? '',
    administrativeClassId: klass.administrativeClassId ?? '',
    groupName: klass.groupName,
    teacherId: klass.teacherId,
  };
}

/** Ba ô CHỌN phải có; nhóm không bắt buộc. */
export function classFormComplete(form: ClassForm): boolean {
  return form.semesterId !== '' && form.administrativeClassId !== '' && form.teacherId !== '';
}

export function classCreateBody(form: ClassForm): AdminClassInput {
  const groupName = form.groupName.trim();
  return {
    semesterId: form.semesterId,
    administrativeClassId: form.administrativeClassId,
    teacherId: form.teacherId,
    ...(groupName === '' ? {} : { groupName }),
  };
}

/**
 * Thân sửa chỉ gồm các trường ĐÃ ĐỔI so với bản gốc. Gửi lại cả bốn thì server vẫn đúng (nó tự so), nhưng mỗi lần gửi một `semesterId`
 * không đổi là một lần đi qua đường kiểm "không đổi học kỳ của lớp đã có phiên" — và thân rỗng cho phép trang nói "không có gì để lưu".
 * Nhóm về rỗng là một thay đổi thật (bỏ nhóm), nên gửi `''` chứ không bỏ trường.
 */
export function classUpdateBody(form: ClassForm, original: AdminClass): Partial<AdminClassInput> {
  const body: Partial<AdminClassInput> = {};
  if (form.semesterId !== (original.semesterId ?? '')) body.semesterId = form.semesterId;
  if (form.administrativeClassId !== (original.administrativeClassId ?? '')) {
    body.administrativeClassId = form.administrativeClassId;
  }
  if (form.groupName.trim() !== original.groupName) body.groupName = form.groupName.trim();
  if (form.teacherId !== original.teacherId) body.teacherId = form.teacherId;
  return body;
}

/** Chữ học kỳ của một dòng lớp — dựng từ năm và kỳ, cùng công thức với server (`HK1 2026-2027`). */
export function semesterTextOf(row: { academicYear: number | null; term: number | null }): string {
  return row.academicYear !== null && row.term !== null
    ? `HK${row.term} ${row.academicYear}-${row.academicYear + 1}`
    : 'Chưa gán học kỳ';
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/lib/master-data-forms.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/master-data-forms.ts apps/web/src/lib/master-data-forms.test.ts
git commit -m "feat(web): biểu mẫu dữ liệu nền → thân yêu cầu (ô trống thêm vs sửa, thân sửa chỉ gồm trường đã đổi)"
```

---

### Task 3: Trang Học kỳ

**Files:**
- Create: `apps/web/src/app/admin/semesters/page.tsx`
- Test: `apps/web/src/app/admin/semesters/page.test.tsx`

**Interfaces:**
- Consumes: `useSemesters`, `useCreateSemester`, `useUpdateSemester`, `useDeleteSemester` (G1); `ResourceShell` (Task 1); `master-data-forms` (Task 2); `ImportDialog`, `SEMESTER_KIND` (E2).
- Produces: route `/admin/semesters`.

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/app/admin/semesters/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import SemestersPage from './page';

const useSemestersMock = vi.fn();
const create = { mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() };
const update = { mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() };
const remove = { mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() };

vi.mock('@/hooks/useSemesters', () => ({
  useSemesters: () => useSemestersMock(),
  useCreateSemester: () => create,
  useUpdateSemester: () => update,
  useDeleteSemester: () => remove,
}));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));

const sem = (id: string, year: number, term: number, classCount = 0) => ({
  id,
  academicYearStart: year,
  term,
  label: `HK${term} ${year}-${year + 1}`,
  startDate: `${year}-09-01`,
  endDate: `${year + 1}-01-31`,
  classCount,
});

function load(data: ReturnType<typeof sem>[]) {
  useSemestersMock.mockReturnValue({ data, isLoading: false, error: null });
}

describe('Trang Học kỳ', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
  });

  it('Review Focus 8: nhóm theo năm học — năm mới trước, trong năm kỳ 1 trước — dù dữ liệu đến lộn xộn', () => {
    load([sem('b2', 2026, 2), sem('a1', 2025, 1), sem('b1', 2026, 1), sem('b3', 2026, 3)]);
    render(<SemestersPage />);

    const rows = screen.getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(rows[0]).toContain('Năm học 2026-2027');
    expect(rows[1]).toContain('HK1 2026-2027');
    expect(rows[2]).toContain('HK2 2026-2027');
    expect(rows[3]).toContain('HK3 2026-2027');
    expect(rows[4]).toContain('Năm học 2025-2026');
    expect(rows[5]).toContain('HK1 2025-2026');
    expect(screen.getAllByText(/^Năm học 20/)).toHaveLength(2); // mỗi năm đúng một tiêu đề
  });

  it('hiện ngày dd/mm/yyyy và số lớp; có nút nhập từ file', () => {
    load([sem('b1', 2026, 1, 3)]);
    render(<SemestersPage />);

    const row = screen.getByRole('row', { name: /HK1 2026-2027/ });
    expect(row).toHaveTextContent('01/09/2026');
    expect(row).toHaveTextContent('31/01/2027');
    expect(row).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: 'Nhập từ file (semester)' })).toBeInTheDocument();
  });

  it('chưa có học kỳ: lời chỉ đường', () => {
    load([]);
    render(<SemestersPage />);
    expect(screen.getByText('Chưa có học kỳ nào')).toBeInTheDocument();
  });

  it('thêm học kỳ: gửi số thật và ngày yyyy-mm-dd, rồi đóng hộp thoại', async () => {
    load([]);
    render(<SemestersPage />);

    fireEvent.click(screen.getByRole('button', { name: /thêm học kỳ/i }));
    expect(create.reset).toHaveBeenCalled(); // Review Focus 2
    const dialog = screen.getByRole('dialog', { name: 'Thêm học kỳ' });
    const submit = within(dialog).getByRole('button', { name: 'Tạo' });
    expect(submit).toBeDisabled(); // chưa đủ ô

    fireEvent.change(within(dialog).getByLabelText('Năm học (năm bắt đầu)'), { target: { value: '2026' } });
    fireEvent.change(within(dialog).getByLabelText('Ngày bắt đầu'), { target: { value: '2026-09-01' } });
    fireEvent.change(within(dialog).getByLabelText('Ngày kết thúc'), { target: { value: '2027-01-31' } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(create.mutateAsync).toHaveBeenCalledWith({
        academicYearStart: 2026,
        term: 1,
        startDate: '2026-09-01',
        endDate: '2027-01-31',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thêm học kỳ' })).not.toBeInTheDocument());
  });

  it('sửa học kỳ ĐÃ CÓ LỚP: năm và kỳ khoá kèm lý do, chỉ ngày sửa được', () => {
    load([sem('b1', 2026, 1, 3)]);
    render(<SemestersPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Sửa' }));

    const dialog = screen.getByRole('dialog', { name: 'Sửa học kỳ' });
    expect(within(dialog).getByLabelText('Năm học (năm bắt đầu)')).toBeDisabled();
    expect(within(dialog).getByRole('combobox', { name: 'Kỳ' })).toBeDisabled();
    expect(within(dialog).getByLabelText('Ngày kết thúc')).toBeEnabled();
    expect(within(dialog).getByText(/đã có 3 lớp/i)).toBeInTheDocument();
  });

  it('sửa học kỳ CHƯA có lớp: năm và kỳ sửa được', () => {
    load([sem('b1', 2026, 1, 0)]);
    render(<SemestersPage />);
    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Sửa' }));
    const dialog = screen.getByRole('dialog', { name: 'Sửa học kỳ' });
    expect(within(dialog).getByLabelText('Năm học (năm bắt đầu)')).toBeEnabled();
  });

  it('lưu sửa gửi id và thân đủ bốn trường', async () => {
    load([sem('b1', 2026, 1, 0)]);
    render(<SemestersPage />);
    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Sửa' }));
    const dialog = screen.getByRole('dialog', { name: 'Sửa học kỳ' });

    fireEvent.change(within(dialog).getByLabelText('Ngày kết thúc'), { target: { value: '2027-02-15' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

    await waitFor(() =>
      expect(update.mutateAsync).toHaveBeenCalledWith({
        id: 'b1',
        body: { academicYearStart: 2026, term: 1, startDate: '2026-09-01', endDate: '2027-02-15' },
      }),
    );
  });

  it('xoá: lý do của server hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
    load([sem('b1', 2026, 1, 3)]);
    remove.mutateAsync.mockRejectedValue(new Error('HK1 2026-2027 còn 3 lớp nên không xoá được.'));
    remove.error = new Error('HK1 2026-2027 còn 3 lớp nên không xoá được.');
    render(<SemestersPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /HK1 2026-2027/ })).getByRole('button', { name: 'Xoá' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('HK1 2026-2027 còn 3 lớp nên không xoá được.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('b1'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lỗi tải danh sách hiện lời báo của server', () => {
    useSemestersMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Không tải được học kỳ') });
    render(<SemestersPage />);
    expect(screen.getByText('Không tải được học kỳ')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/admin/semesters/page.test.tsx`
Expected: FAIL — không import được `./page`.

- [ ] **Step 3: Viết trang**

Create `apps/web/src/app/admin/semesters/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ImportDialog } from '@/components/import/import-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateSemester,
  useDeleteSemester,
  useSemesters,
  useUpdateSemester,
} from '@/hooks/useSemesters';
import type { Semester } from '@/lib/api/semesters';
import { SEMESTER_KIND } from '@/lib/import/columns';
import {
  EMPTY_SEMESTER_FORM,
  semesterFormComplete,
  semesterFormOf,
  semesterPayload,
} from '@/lib/master-data-forms';
import { academicYearLabel } from '@/lib/semester-filter';

/** `2026-09-01` → `01/09/2026`. Không đi qua `Date`: một ngày thuần không có múi giờ để lệch. */
function formatDmy(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Học kỳ (spec §2.1, §5.1): admin khai báo, mọi vai trò đọc. Nhóm theo NĂM HỌC, năm mới nhất trước, kỳ 1 trước trong năm.
 *
 * Khoá của một học kỳ là (năm học, kỳ). Khi đã có lớp thuộc về nó thì hai trường này KHOÁ — nhãn `HK1 2026-2027` đã được chụp vào các
 * phiên thi, nên đổi khoá là viết lại quá khứ; DB cũng chặn (trigger). Ngày vẫn sửa được, và server kiểm không chồng ngày.
 */
export default function SemestersPage() {
  const semesters = useSemesters();
  const create = useCreateSemester();
  const update = useUpdateSemester();
  const remove = useDeleteSemester();

  const [form, setForm] = useState(EMPTY_SEMESTER_FORM);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Semester | null>(null);

  // Sắp TRƯỚC khi nhóm: khung chỉ gom các hàng LIỀN NHAU, nên dữ liệu chưa sắp làm một năm hiện hai tiêu đề.
  const rows = useMemo(
    () =>
      [...(semesters.data ?? [])].sort(
        (a, b) => b.academicYearStart - a.academicYearStart || a.term - b.term,
      ),
    [semesters.data],
  );

  const keyLocked = editing !== null && (editing.classCount ?? 0) > 0;

  function openCreate() {
    create.reset();
    update.reset();
    setEditing(null);
    setForm(EMPTY_SEMESTER_FORM);
    setFormOpen(true);
  }

  function openEdit(semester: Semester) {
    create.reset();
    update.reset();
    setEditing(semester);
    setForm(semesterFormOf(semester));
    setFormOpen(true);
  }

  function openDelete(semester: Semester) {
    remove.reset();
    setDeleting(semester);
  }

  return (
    <ResourceShell<Semester>
      title="Học kỳ"
      description="Học kỳ dùng chung toàn trường — mọi vai trò đọc được danh sách này, chỉ quản trị viên khai báo và sửa. Một lớp thuộc đúng một học kỳ."
      icon={CalendarRange}
      addLabel="Thêm học kỳ"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={openDelete}
      headerActions={<ImportDialog kind={SEMESTER_KIND} />}
      rows={rows}
      rowKey={(s) => s.id}
      isLoading={semesters.isLoading}
      error={semesters.error}
      emptyTitle="Chưa có học kỳ nào"
      emptyDescription="Tạo học kỳ trước, vì mỗi lớp phải thuộc về một học kỳ."
      groupBy={{
        key: (s) => String(s.academicYearStart),
        label: (key) => `Năm học ${academicYearLabel(Number(key))}`,
      }}
      columns={[
        { label: 'Học kỳ', render: (s) => <span className="font-medium">{s.label}</span> },
        { label: 'Bắt đầu', tight: true, render: (s) => formatDmy(s.startDate) },
        { label: 'Kết thúc', tight: true, render: (s) => formatDmy(s.endDate) },
        {
          label: 'Số lớp',
          tight: true,
          render: (s) => <span className="tabular-nums">{s.classCount ?? 0}</span>,
        },
      ]}
    >
      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa học kỳ' : 'Thêm học kỳ'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={create.error ?? update.error}
        canSubmit={semesterFormComplete(form)}
        onSubmit={() =>
          editing
            ? update.mutateAsync({ id: editing.id, body: semesterPayload(form) })
            : create.mutateAsync(semesterPayload(form))
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="semester-year">Năm học (năm bắt đầu)</Label>
            <Input
              id="semester-year"
              inputMode="numeric"
              maxLength={4}
              value={form.academicYearStart}
              placeholder="vd: 2026"
              disabled={keyLocked}
              onChange={(e) => setForm({ ...form, academicYearStart: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="semester-term">Kỳ</Label>
            <Select
              value={form.term}
              onValueChange={(value) => setForm({ ...form, term: value })}
              disabled={keyLocked}
            >
              <SelectTrigger id="semester-term" aria-label="Kỳ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Kỳ 1</SelectItem>
                <SelectItem value="2">Kỳ 2</SelectItem>
                <SelectItem value="3">Kỳ 3 (hè)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {keyLocked && (
          <p className="text-caption text-muted-foreground">
            Không đổi được năm học hay kỳ vì đã có {editing?.classCount} lớp thuộc học kỳ này — nhãn học kỳ đã được ghi vào các phiên
            thi. Chỉ sửa được ngày.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="semester-start">Ngày bắt đầu</Label>
            <Input
              id="semester-start"
              type="date"
              required
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="semester-end">Ngày kết thúc</Label>
            <Input
              id="semester-end"
              type="date"
              required
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
            />
          </div>
        </div>
        <p className="text-caption text-muted-foreground">Hai học kỳ không được chồng ngày.</p>
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`học kỳ "${deleting?.label ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </ResourceShell>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/admin/semesters/page.test.tsx`
Expected: PASS. Ca dễ trượt: `getByRole('combobox', { name: 'Kỳ' })` cần `aria-label="Kỳ"` trên `SelectTrigger` (đã có) vì nhãn `htmlFor` của Radix Select không tự nối vào `button`; và ca "chưa đủ ô" đòi nút `Tạo` **tắt** khi `form.term` mặc định `'1'` nhưng năm/ngày còn trống (`semesterFormComplete` sai).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/semesters
git commit -m "feat(web): trang admin Học kỳ (nhóm theo năm học, khoá năm/kỳ khi đã có lớp, nhập từ file)"
```

---

### Task 4: Trang Phòng thi

**Files:**
- Create: `apps/web/src/app/admin/rooms/page.tsx`
- Test: `apps/web/src/app/admin/rooms/page.test.tsx`

**Interfaces:**
- Consumes: `useRooms`, `useCreateRoom`, `useUpdateRoom`, `useDeleteRoom` (G1); `NearDuplicateNotice`, `NearDuplicateError` (G1); `ROOM_KIND`, `ImportDialog` (E2).
- Produces: route `/admin/rooms`.

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/app/admin/rooms/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import RoomsPage from './page';

const useRoomsMock = vi.fn();
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() });
const create = mutation();
const update = mutation();
const remove = mutation();

vi.mock('@/hooks/useRooms', () => ({
  useRooms: (...args: unknown[]) => useRoomsMock(...args),
  useCreateRoom: () => create,
  useUpdateRoom: () => update,
  useDeleteRoom: () => remove,
}));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));

const room = (id: string, name: string, capacity: number | null = 40, isActive = true, sessionCount = 0) => ({
  id,
  name,
  capacity,
  isActive,
  sessionCount,
});

function load(data: ReturnType<typeof room>[]) {
  useRoomsMock.mockReturnValue({ data, isLoading: false, error: null });
}

describe('Trang Phòng thi', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
    useRoomsMock.mockReset();
  });

  it('đọc CẢ phòng đã ngừng hoạt động (trang quản trị), không chỉ phòng đang chạy', () => {
    load([room('r1', 'Phòng H3.03')]);
    render(<RoomsPage />);
    expect(useRoomsMock).toHaveBeenCalledWith(); // không activeOnly
  });

  it('hiện tên, sức chứa, trạng thái, số phiên; phòng ngừng hoạt động hiện nhãn và mờ đi', () => {
    load([room('r1', 'Phòng H3.03', 40, true, 4), room('r2', 'Phòng H3.04', null, false, 0)]);
    render(<RoomsPage />);

    const active = screen.getByRole('row', { name: /Phòng H3\.03/ });
    expect(active).toHaveTextContent('40');
    expect(active).toHaveTextContent('Đang hoạt động');
    expect(active).toHaveTextContent('4');

    const stopped = screen.getByRole('row', { name: /Phòng H3\.04/ });
    expect(stopped).toHaveTextContent('chưa rõ'); // sức chứa null
    expect(stopped).toHaveTextContent('Ngừng hoạt động');
    expect(stopped).toHaveClass('opacity-60');
  });

  it('ô tìm lọc theo tên, không phân biệt hoa-thường và dấu', () => {
    load([room('r1', 'Phòng máy A1'), room('r2', 'Phòng H3.03')]);
    render(<RoomsPage />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm phòng thi' }), { target: { value: 'may a1' } });

    expect(screen.getByText('Phòng máy A1')).toBeInTheDocument();
    expect(screen.queryByText('Phòng H3.03')).not.toBeInTheDocument();
  });

  it('tìm không ra: nói là bộ lọc không khớp và cho xoá bộ lọc (không nói "chưa có phòng nào")', () => {
    load([room('r1', 'Phòng máy A1')]);
    render(<RoomsPage />);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm phòng thi' }), { target: { value: 'zzz' } });

    expect(screen.getByText('Không có phòng nào khớp ô tìm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xoá ô tìm' }));
    expect(screen.getByText('Phòng máy A1')).toBeInTheDocument();
  });

  it('chưa có phòng nào: lời chỉ đường', () => {
    load([]);
    render(<RoomsPage />);
    expect(screen.getByText('Chưa có phòng thi nào')).toBeInTheDocument();
  });

  it('nút bật/tắt hoạt động gọi update với isActive đảo ngược — không có xác nhận, vì đảo lại được ngay', async () => {
    load([room('r1', 'Phòng H3.03', 40, true)]);
    render(<RoomsPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Tắt hoạt động' }));

    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'r1', body: { isActive: false } }));
  });

  it('phòng đang tắt thì nút là "Bật hoạt động"', async () => {
    load([room('r1', 'Phòng H3.03', 40, false)]);
    render(<RoomsPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Bật hoạt động' }));

    await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'r1', body: { isActive: true } }));
  });

  describe('thêm', () => {
    it('gửi tên; sức chứa trống thì bỏ khỏi thân; rồi đóng', async () => {
      load([]);
      render(<RoomsPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm phòng/i }));
      expect(create.reset).toHaveBeenCalled(); // Review Focus 2
      const dialog = screen.getByRole('dialog', { name: 'Thêm phòng thi' });
      fireEvent.change(within(dialog).getByLabelText('Tên phòng'), { target: { value: 'Phòng máy A1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo' }));

      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledWith({ name: 'Phòng máy A1' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Thêm phòng thi' })).not.toBeInTheDocument());
    });

    it('gần giống: hiện lời nhắc nêu mục bị so; "Vẫn thêm" gửi lại với confirmSimilar và đóng', async () => {
      load([room('r1', 'Phòng H3.03')]);
      const nearDuplicate = new NearDuplicateError('Phòng "H303" gần giống "Phòng H3.03".', [{ id: 'r1', name: 'Phòng H3.03' }]);
      create.mutateAsync.mockRejectedValueOnce(nearDuplicate);
      const view = render(<RoomsPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm phòng/i }));
      let dialog = screen.getByRole('dialog', { name: 'Thêm phòng thi' });
      fireEvent.change(within(dialog).getByLabelText('Tên phòng'), { target: { value: 'H303' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Tạo' }));
      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));

      // Mutation giữ lỗi ở `error`; dựng lại trang với lỗi đó để thấy lời nhắc (hook thật làm điều này qua trạng thái).
      create.error = nearDuplicate;
      view.rerender(<RoomsPage />);
      dialog = screen.getByRole('dialog', { name: 'Thêm phòng thi' });
      expect(within(dialog).getByText('Phòng H3.03')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: /vẫn thêm phòng này/i }));

      await waitFor(() =>
        expect(create.mutateAsync).toHaveBeenLastCalledWith({ name: 'H303', confirmSimilar: true }),
      );
    });
  });

  describe('sửa', () => {
    it('form mang giá trị hiện có; sức chứa để trống khi lưu nghĩa là xoá sức chứa (null) — Review Focus 4', async () => {
      load([room('r1', 'Phòng H3.03', 40)]);
      render(<RoomsPage />);

      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Sửa' }));
      const dialog = screen.getByRole('dialog', { name: 'Sửa phòng thi' });
      expect(within(dialog).getByLabelText('Tên phòng')).toHaveValue('Phòng H3.03');
      expect(within(dialog).getByLabelText(/Sức chứa/)).toHaveValue(40);

      fireEvent.change(within(dialog).getByLabelText(/Sức chứa/), { target: { value: '' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'r1', body: { name: 'Phòng H3.03', capacity: null } }),
      );
    });

    it('nói rõ đổi tên không đổi phiên thi đã tạo (bản chụp)', () => {
      load([room('r1', 'Phòng H3.03', 40, true, 4)]);
      render(<RoomsPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Sửa' }));
      expect(within(screen.getByRole('dialog', { name: 'Sửa phòng thi' })).getByText(/phiên thi đã tạo giữ tên cũ/i)).toBeInTheDocument();
    });
  });

  describe('xoá', () => {
    it('lý do của server (phòng đã có phiên) hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
      const message = 'Phòng "Phòng H3.03" đã có 4 phiên thi nên không xoá được. Hãy tắt hoạt động để không ai chọn nó cho phiên mới, lịch sử vẫn giữ nguyên.';
      load([room('r1', 'Phòng H3.03', 40, true, 4)]);
      remove.mutateAsync.mockRejectedValue(new Error(message));
      remove.error = new Error(message);
      render(<RoomsPage />);

      fireEvent.click(within(screen.getByRole('row', { name: /Phòng H3\.03/ })).getByRole('button', { name: 'Xoá' }));
      const dialog = screen.getByRole('dialog');
      expect(within(dialog).getByText(message)).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

      await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('r1'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('có nút nhập từ file cho phòng', () => {
    load([]);
    render(<RoomsPage />);
    expect(screen.getByRole('button', { name: 'Nhập từ file (room)' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/admin/rooms/page.test.tsx`
Expected: FAIL — không import được `./page`.

- [ ] **Step 3: Viết trang**

Create `apps/web/src/app/admin/rooms/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { DoorOpen, Power, PowerOff } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';
import { NearDuplicateNotice } from '@/components/resource/near-duplicate-notice';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ImportDialog } from '@/components/import/import-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRoom, useDeleteRoom, useRooms, useUpdateRoom } from '@/hooks/useRooms';
import { NearDuplicateError } from '@/lib/api/http-error';
import type { Room } from '@/lib/api/rooms';
import { ROOM_KIND, normalizeHeader } from '@/lib/import/columns';
import {
  EMPTY_ROOM_FORM,
  roomCreatePayload,
  roomFormOf,
  roomUpdatePayload,
} from '@/lib/master-data-forms';

/**
 * Phòng thi (spec §2.4, §5.1): admin khai báo; giảng viên CHỌN khi tạo phiên. Không gõ tay trong phiên thi nữa, nên "P.A101" và
 * "P A101" không còn là hai phòng — và nhập tay hay nhập từ file đều cảnh báo khi một tên mới GẦN GIỐNG một tên đã có.
 *
 * Tắt hoạt động thay vì xoá: một phòng đã có phiên thi không xoá được (khoá ngoại RESTRICT), và lịch sử giữ nguyên. Phòng đã tắt không
 * chọn được cho phiên MỚI nhưng phiên cũ vẫn tham chiếu được; đảo lại được ngay nên bật/tắt không cần hộp thoại xác nhận.
 *
 * Ô tìm lọc trong trình duyệt: danh sách phòng nhỏ và đã tải đủ. So sánh bỏ dấu và hoa-thường (cùng `normalizeHeader` của bộ nhập file).
 */
export default function RoomsPage() {
  const rooms = useRooms();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const remove = useDeleteRoom();

  const [form, setForm] = useState(EMPTY_ROOM_FORM);
  const [editing, setEditing] = useState<Room | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<Room | null>(null);
  const [search, setSearch] = useState('');
  const [toggleError, setToggleError] = useState<Error | null>(null);

  const searching = search.trim() !== '';
  const rows = useMemo(() => {
    const all = rooms.data ?? [];
    const query = normalizeHeader(search);
    return query === '' ? all : all.filter((room) => normalizeHeader(room.name).includes(query));
  }, [rooms.data, search]);

  function openCreate() {
    create.reset();
    update.reset();
    setEditing(null);
    setForm(EMPTY_ROOM_FORM);
    setFormOpen(true);
  }

  function openEdit(room: Room) {
    create.reset();
    update.reset();
    setEditing(room);
    setForm(roomFormOf(room));
    setFormOpen(true);
  }

  function openDelete(room: Room) {
    remove.reset();
    setDeleting(room);
  }

  /** `confirmSimilar` chỉ được gửi khi admin đã bấm "Vẫn thêm phòng này" sau khi thấy lời nhắc. */
  function save(confirmSimilar: boolean): Promise<unknown> {
    const similar = confirmSimilar ? { confirmSimilar: true } : {};
    return editing
      ? update.mutateAsync({ id: editing.id, body: { ...roomUpdatePayload(form), ...similar } })
      : create.mutateAsync({ ...roomCreatePayload(form), ...similar });
  }

  function toggleActive(room: Room) {
    setToggleError(null);
    update.mutateAsync({ id: room.id, body: { isActive: !room.isActive } }).catch((error: Error) => {
      setToggleError(error);
    });
  }

  const formError = create.error ?? update.error;
  const nearDuplicate = formError instanceof NearDuplicateError ? formError : null;

  return (
    <ResourceShell<Room>
      title="Phòng thi"
      description="Phòng thi dùng chung toàn trường — chỉ quản trị viên khai báo. Giảng viên chọn phòng khi tạo phiên thi, nên một tên phòng chỉ nên có một cách viết."
      icon={DoorOpen}
      addLabel="Thêm phòng"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={openDelete}
      headerActions={<ImportDialog kind={ROOM_KIND} />}
      rows={rows}
      rowKey={(r) => r.id}
      isLoading={rooms.isLoading}
      error={rooms.error ?? toggleError}
      emptyTitle={searching ? 'Không có phòng nào khớp ô tìm' : 'Chưa có phòng thi nào'}
      emptyDescription={
        searching
          ? 'Thử từ khoá khác, hoặc xoá ô tìm để xem tất cả phòng.'
          : 'Mỗi phiên thi phải chọn một phòng, nên hãy khai báo các phòng trước.'
      }
      rowClassName={(r) => (r.isActive ? undefined : 'opacity-60')}
      filters={
        <div className="flex items-center gap-2">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên phòng..."
            className="sm:max-w-xs"
            aria-label="Tìm phòng thi"
          />
          {searching && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setSearch('')}>
              Xoá ô tìm
            </Button>
          )}
        </div>
      }
      rowActions={(r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleActive(r)}
          aria-label={r.isActive ? 'Tắt hoạt động' : 'Bật hoạt động'}
          title={r.isActive ? 'Tắt hoạt động: không chọn được cho phiên mới' : 'Bật hoạt động'}
        >
          {r.isActive ? (
            <PowerOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Power className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      )}
      columns={[
        { label: 'Tên phòng', render: (r) => <span className="font-medium">{r.name}</span> },
        {
          label: 'Sức chứa',
          tight: true,
          render: (r) =>
            r.capacity === null ? (
              <span className="text-muted-foreground">chưa rõ</span>
            ) : (
              <span className="tabular-nums">{r.capacity}</span>
            ),
        },
        {
          label: 'Trạng thái',
          tight: true,
          render: (r) =>
            r.isActive ? <Badge variant="success">Đang hoạt động</Badge> : <Badge>Ngừng hoạt động</Badge>,
        },
        {
          label: 'Số phiên thi',
          tight: true,
          render: (r) => <span className="tabular-nums">{r.sessionCount ?? 0}</span>,
        },
      ]}
    >
      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa phòng thi' : 'Thêm phòng thi'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={formError}
        canSubmit={form.name.trim() !== ''}
        onSubmit={() => save(false)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="room-name">Tên phòng</Label>
          <Input
            id="room-name"
            required
            value={form.name}
            placeholder="vd: Phòng máy A1"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="room-capacity">Sức chứa (không bắt buộc)</Label>
          <Input
            id="room-capacity"
            type="number"
            min={1}
            max={1000}
            value={form.capacity}
            placeholder="vd: 40"
            onChange={(e) => setForm({ ...form, capacity: e.target.value })}
          />
          {editing && (
            <p className="text-caption text-muted-foreground">
              Để trống nghĩa là bỏ sức chứa. Đổi tên phòng không đổi các phiên thi đã tạo: phiên thi đã tạo giữ tên cũ (tên phòng
              được chụp lúc tạo phiên).
            </p>
          )}
        </div>
        {nearDuplicate && (
          <NearDuplicateNotice
            error={nearDuplicate}
            noun="phòng"
            confirming={create.isPending || update.isPending}
            onConfirm={() => {
              void save(true)
                .then(() => setFormOpen(false))
                .catch(() => {
                  // Lý do đã hiện trong biểu mẫu qua `error`.
                });
            }}
          />
        )}
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`phòng "${deleting?.name ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </ResourceShell>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/admin/rooms/page.test.tsx`
Expected: PASS. Ca dễ trượt: ca "gần giống" dựng lại trang bằng `rerender` sau khi gán `create.error` — hook thật giữ lỗi trong trạng thái mutation nên không cần `rerender`; và `getByRole('searchbox', …)` đòi `type="search"` trên `Input` (đã có).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/rooms
git commit -m "feat(web): trang admin Phòng thi (bật/tắt hoạt động, ô tìm, cảnh báo gần giống, lý do cụ thể khi không xoá được)"
```

---

### Task 5: Hộp thoại Danh mục lớp danh nghĩa

**Files:**
- Create: `apps/web/src/app/admin/classes/_components/administrative-class-catalog-dialog.tsx`
- Test: `apps/web/src/app/admin/classes/_components/administrative-class-catalog-dialog.test.tsx`

**Interfaces:**
- Consumes: `useAdministrativeClasses`, `useCreateAdministrativeClass`, `useUpdateAdministrativeClass`, `useDeleteAdministrativeClass` (G1); `NearDuplicateNotice` (G1); `ADMINISTRATIVE_CLASS_KIND`, `ImportDialog` (E2).
- Produces:

```tsx
export function AdministrativeClassCatalogDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }): JSX.Element;
```

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/app/admin/classes/_components/administrative-class-catalog-dialog.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NearDuplicateError } from '@/lib/api/http-error';
import { AdministrativeClassCatalogDialog } from './administrative-class-catalog-dialog';

const useCatalogMock = vi.fn();
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() });
const create = mutation();
const update = mutation();
const remove = mutation();

vi.mock('@/hooks/useAdministrativeClasses', () => ({
  useAdministrativeClasses: () => useCatalogMock(),
  useCreateAdministrativeClass: () => create,
  useUpdateAdministrativeClass: () => update,
  useDeleteAdministrativeClass: () => remove,
}));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));

const code = (id: string, value: string, classCount = 0) => ({ id, code: value, classCount });
const load = (data: ReturnType<typeof code>[]) => useCatalogMock.mockReturnValue({ data, isLoading: false, error: null });

function setup(open = true) {
  const onOpenChange = vi.fn();
  const view = render(<AdministrativeClassCatalogDialog open={open} onOpenChange={onOpenChange} />);
  return { onOpenChange, ...view };
}

describe('AdministrativeClassCatalogDialog', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
    useCatalogMock.mockReset();
  });

  it('đóng thì không vẽ gì', () => {
    load([code('a1', 'DHKTPM18A')]);
    setup(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('liệt kê mã kèm số lớp đang dùng; có nút nhập từ file', () => {
    load([code('a1', 'DHKTPM18A', 3), code('a2', 'DHKTPM18B', 0)]);
    setup();

    const dialog = screen.getByRole('dialog', { name: 'Danh mục lớp danh nghĩa' });
    expect(within(dialog).getByRole('row', { name: /DHKTPM18A/ })).toHaveTextContent('3');
    expect(within(dialog).getByRole('row', { name: /DHKTPM18B/ })).toHaveTextContent('0');
    expect(within(dialog).getByRole('button', { name: 'Nhập từ file (administrative-class)' })).toBeInTheDocument();
  });

  it('danh mục trống: nói rõ và chỉ cách thêm', () => {
    load([]);
    setup();
    expect(screen.getByText(/chưa có mã lớp danh nghĩa nào/i)).toBeInTheDocument();
  });

  describe('thêm một mã (ô gõ duy nhất còn lại)', () => {
    it('nút Thêm tắt khi ô trống; gửi mã rồi xoá ô', async () => {
      load([]);
      setup();
      const add = screen.getByRole('button', { name: 'Thêm mã' });
      expect(add).toBeDisabled();

      fireEvent.change(screen.getByLabelText('Mã lớp danh nghĩa mới'), { target: { value: 'dhktpm19a' } });
      expect(add).toBeEnabled();
      fireEvent.click(add);

      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledWith({ code: 'dhktpm19a' }));
      await waitFor(() => expect(screen.getByLabelText('Mã lớp danh nghĩa mới')).toHaveValue(''));
    });

    it('gần giống: lời nhắc nêu mã bị so; "Vẫn thêm" gửi lại với confirmSimilar', async () => {
      load([code('a1', 'DHKTPM18ATT')]);
      const nearDuplicate = new NearDuplicateError('Mã lớp danh nghĩa "DHKTPM18ATTT" gần giống "DHKTPM18ATT".', [
        { id: 'a1', name: 'DHKTPM18ATT' },
      ]);
      create.mutateAsync.mockRejectedValueOnce(nearDuplicate);
      const view = setup();

      fireEvent.change(screen.getByLabelText('Mã lớp danh nghĩa mới'), { target: { value: 'DHKTPM18ATTT' } });
      fireEvent.click(screen.getByRole('button', { name: 'Thêm mã' }));
      await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));

      create.error = nearDuplicate;
      view.rerender(<AdministrativeClassCatalogDialog open onOpenChange={vi.fn()} />);
      // Mã bị so hiện trong lời nhắc (và cả trong bảng) — hai nơi, đều đúng.
      expect(screen.getAllByText('DHKTPM18ATT').length).toBeGreaterThanOrEqual(2);
      fireEvent.click(screen.getByRole('button', { name: /vẫn thêm mã lớp danh nghĩa này/i }));

      await waitFor(() =>
        expect(create.mutateAsync).toHaveBeenLastCalledWith({ code: 'DHKTPM18ATTT', confirmSimilar: true }),
      );
    });

    it('trùng CỨNG hiện như lỗi thường, không có nút "Vẫn thêm"', () => {
      load([code('a1', 'DHKTPM18A')]);
      create.error = new Error('Mã DHKTPM18A đã tồn tại trong Danh mục lớp danh nghĩa.');
      setup();
      expect(screen.getByText('Mã DHKTPM18A đã tồn tại trong Danh mục lớp danh nghĩa.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /vẫn thêm/i })).not.toBeInTheDocument();
    });

    it('mở hộp thoại là trạng thái mới: lỗi của lần trước bị xoá (Review Focus 2)', () => {
      load([]);
      setup();
      expect(create.reset).toHaveBeenCalled();
    });
  });

  describe('sửa mã', () => {
    it('form mang mã hiện có, nói rõ nhãn của mọi lớp dùng mã sẽ đổi theo, gửi { id, body: { code } }', async () => {
      load([code('a1', 'DHKTPM18A', 3)]);
      setup();

      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A/ })).getByRole('button', { name: 'Sửa mã DHKTPM18A' }));
      const form = screen.getByRole('dialog', { name: 'Sửa mã lớp danh nghĩa' });
      expect(within(form).getByLabelText('Mã lớp danh nghĩa')).toHaveValue('DHKTPM18A');
      expect(within(form).getByText(/mọi lớp dùng mã này/i)).toBeInTheDocument();

      fireEvent.change(within(form).getByLabelText('Mã lớp danh nghĩa'), { target: { value: 'DHKTPM18B' } });
      fireEvent.click(within(form).getByRole('button', { name: 'Lưu' }));

      await waitFor(() =>
        expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'a1', body: { code: 'DHKTPM18B' } }),
      );
    });
  });

  describe('xoá mã', () => {
    it('mã còn lớp dùng: lý do của server hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
      const message = 'Mã DHKTPM18A còn 3 lớp đang dùng nên không xoá được. Hãy chuyển hoặc xoá các lớp đó trước.';
      load([code('a1', 'DHKTPM18A', 3)]);
      remove.mutateAsync.mockRejectedValue(new Error(message));
      remove.error = new Error(message);
      setup();

      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A/ })).getByRole('button', { name: 'Xoá mã DHKTPM18A' }));
      const confirm = screen.getByRole('dialog', { name: /xoá mã/i });
      expect(within(confirm).getByText(message)).toBeInTheDocument();
      fireEvent.click(within(confirm).getByRole('button', { name: 'Xoá' }));

      await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('a1'));
      expect(screen.getByRole('dialog', { name: /xoá mã/i })).toBeInTheDocument();
    });
  });

  it('lỗi tải danh mục hiện lời báo', () => {
    useCatalogMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Không tải được danh mục') });
    setup();
    expect(screen.getByText('Không tải được danh mục')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/admin/classes/_components/administrative-class-catalog-dialog.test.tsx`
Expected: FAIL — không import được component.

- [ ] **Step 3: Viết hộp thoại**

Create `apps/web/src/app/admin/classes/_components/administrative-class-catalog-dialog.tsx`:

```tsx
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';
import { NearDuplicateNotice } from '@/components/resource/near-duplicate-notice';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ImportDialog } from '@/components/import/import-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useAdministrativeClasses,
  useCreateAdministrativeClass,
  useDeleteAdministrativeClass,
  useUpdateAdministrativeClass,
} from '@/hooks/useAdministrativeClasses';
import type { AdministrativeClass } from '@/lib/api/administrative-classes';
import { NearDuplicateError } from '@/lib/api/http-error';
import { ADMINISTRATIVE_CLASS_KIND } from '@/lib/import/columns';

interface AdministrativeClassCatalogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Danh mục lớp danh nghĩa (spec §2.2, §5.1) — hộp thoại trong trang Lớp, KHÔNG có trang riêng: giảng viên và các màn hình khác chỉ thấy
 * nhãn gộp `DHKTPM18A – Nhóm 1`, nên không bao giờ thấy "hai thứ".
 *
 * Mã CHỈ được tạo ở đây (một ô gõ duy nhất còn lại, hoặc nhập từ file); form tạo lớp chỉ CHỌN. Lỗi gõ vì thế xảy ra MỘT lần cho cả danh
 * mục thay vì mỗi lần tạo lớp. Cảnh báo "gần giống" là lời nhắc có thể xác nhận bỏ qua; xoá một mã còn lớp dùng bị server chặn kèm số lớp.
 */
export function AdministrativeClassCatalogDialog({ open, onOpenChange }: AdministrativeClassCatalogDialogProps) {
  const catalog = useAdministrativeClasses();
  const create = useCreateAdministrativeClass();
  const update = useUpdateAdministrativeClass();
  const remove = useDeleteAdministrativeClass();

  const [newCode, setNewCode] = useState('');
  const [editing, setEditing] = useState<AdministrativeClass | null>(null);
  const [editCode, setEditCode] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdministrativeClass | null>(null);

  // Mở hộp thoại là trạng thái mới: lỗi và ô gõ của lần trước không hiện lại.
  useEffect(() => {
    if (!open) return;
    create.reset();
    setNewCode('');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy khi hộp thoại MỞ; `create` đổi tham chiếu mỗi render.
  }, [open]);

  async function add(confirmSimilar: boolean) {
    try {
      await create.mutateAsync({ code: newCode, ...(confirmSimilar ? { confirmSimilar: true } : {}) });
      setNewCode('');
    } catch {
      // Hiện bên dưới qua `create.error`.
    }
  }

  function onAddSubmit(event: FormEvent) {
    event.preventDefault();
    void add(false);
  }

  function openEdit(entry: AdministrativeClass) {
    update.reset();
    setEditing(entry);
    setEditCode(entry.code);
    setEditOpen(true);
  }

  function saveEdit(confirmSimilar: boolean): Promise<unknown> {
    return update.mutateAsync({
      id: editing!.id,
      body: { code: editCode, ...(confirmSimilar ? { confirmSimilar: true } : {}) },
    });
  }

  const addNearDuplicate = create.error instanceof NearDuplicateError ? create.error : null;
  const addHardError = create.error && !addNearDuplicate ? create.error : null;
  const editNearDuplicate = update.error instanceof NearDuplicateError ? update.error : null;
  const entries = catalog.data ?? [];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Danh mục lớp danh nghĩa</DialogTitle>
            <DialogDescription>
              Các mã lớp danh nghĩa (vd DHKTPM18A) mà lớp được tạo từ đó. Mã chỉ được thêm ở đây; form tạo lớp chỉ chọn.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={onAddSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="catalog-new-code">Mã lớp danh nghĩa mới</Label>
                <Input
                  id="catalog-new-code"
                  value={newCode}
                  placeholder="vd: DHKTPM18A"
                  onChange={(e) => setNewCode(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={create.isPending || newCode.trim() === ''}>
                Thêm mã
              </Button>
              <ImportDialog kind={ADMINISTRATIVE_CLASS_KIND} />
            </div>
            {addHardError && (
              <Alert variant="destructive">
                <AlertDescription>{addHardError.message}</AlertDescription>
              </Alert>
            )}
            {addNearDuplicate && (
              <NearDuplicateNotice
                error={addNearDuplicate}
                noun="mã lớp danh nghĩa"
                confirming={create.isPending}
                onConfirm={() => void add(true)}
              />
            )}
          </form>

          {catalog.error && (
            <Alert variant="destructive">
              <AlertDescription>{catalog.error.message}</AlertDescription>
            </Alert>
          )}

          {catalog.isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ) : entries.length === 0 && !catalog.error ? (
            <p className="rounded-md border border-border bg-surface-2 p-4 text-small text-muted-foreground">
              Chưa có mã lớp danh nghĩa nào. Hãy thêm mã ở ô phía trên, hoặc nhập từ file.
            </p>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead scope="col">Mã</TableHead>
                    <TableHead scope="col" className="text-right">
                      Số lớp đang dùng
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      <span className="sr-only">Hành động</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono font-medium">{entry.code}</TableCell>
                      <TableCell className="text-right tabular-nums">{entry.classCount}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Sửa mã ${entry.code}`}
                          onClick={() => openEdit(entry)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Xoá mã ${entry.code}`}
                          onClick={() => {
                            remove.reset();
                            setDeleting(entry);
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-danger-strong" aria-hidden="true" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ResourceFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Sửa mã lớp danh nghĩa"
        submitLabel="Lưu"
        submitting={update.isPending}
        error={update.error}
        canSubmit={editCode.trim() !== '' && editCode.trim() !== editing?.code}
        onSubmit={() => saveEdit(false)}
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="catalog-edit-code">Mã lớp danh nghĩa</Label>
          <Input id="catalog-edit-code" value={editCode} onChange={(e) => setEditCode(e.target.value)} />
          <p className="text-caption text-muted-foreground">
            Đổi mã làm đổi nhãn của mọi lớp dùng mã này, kể cả lớp của kỳ cũ — đó là mục đích của việc sửa lỗi gõ.
          </p>
        </div>
        {editNearDuplicate && (
          <NearDuplicateNotice
            error={editNearDuplicate}
            noun="mã lớp danh nghĩa"
            confirming={update.isPending}
            onConfirm={() => {
              void saveEdit(true)
                .then(() => setEditOpen(false))
                .catch(() => {
                  // Lý do đã hiện trong biểu mẫu qua `error`.
                });
            }}
          />
        )}
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(next) => !next && setDeleting(null)}
        target={`mã lớp danh nghĩa "${deleting?.code ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/admin/classes/_components/administrative-class-catalog-dialog.test.tsx`
Expected: PASS. Ghi chú: ca "mở hộp thoại là trạng thái mới" kiểm `create.reset` đã được gọi do `useEffect` chạy khi `open` là `true` ngay lần render đầu; ca "gần giống" dựng lại bằng `rerender` sau khi gán `create.error` (hook thật giữ lỗi trong mutation); mã bị so xuất hiện **hai lần** (lời nhắc và bảng) nên khẳng định `≥ 2`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/classes/_components
git commit -m "feat(web): hộp thoại Danh mục lớp danh nghĩa (thêm có cảnh báo gần giống, sửa, xoá kèm lý do, nhập từ file)"
```

---

### Task 6: Trang Lớp

**Files:**
- Create: `apps/web/src/app/admin/classes/page.tsx`
- Test: `apps/web/src/app/admin/classes/page.test.tsx`

**Interfaces:**
- Consumes: `useAdminClasses`, `useCreateAdminClass`, `useUpdateAdminClass`, `useDeleteAdminClass`, `useAdministrativeClasses`, `useTeacherOptions`, `useSemesterYearFilter`, `SemesterYearFilter`, `AdministrativeClassCatalogDialog`, `ImportDialog`, `CLASS_KIND`, `master-data-forms`, `useDebouncedValue`.
- Produces: route `/admin/classes`.

- [ ] **Step 1: Viết test (đỏ)**

Create `apps/web/src/app/admin/classes/page.test.tsx`:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import AdminClassesPage from './page';

const useAdminClassesMock = vi.fn();
const useCatalogMock = vi.fn();
const useTeachersMock = vi.fn();
const useFilterMock = vi.fn();
const mutation = () => ({ mutateAsync: vi.fn(), isPending: false, error: null as Error | null, reset: vi.fn() });
const create = mutation();
const update = mutation();
const remove = mutation();

vi.mock('@/hooks/useAdminClasses', () => ({
  useAdminClasses: (...args: unknown[]) => useAdminClassesMock(...args),
  useCreateAdminClass: () => create,
  useUpdateAdminClass: () => update,
  useDeleteAdminClass: () => remove,
}));
vi.mock('@/hooks/useAdministrativeClasses', () => ({ useAdministrativeClasses: () => useCatalogMock() }));
vi.mock('@/hooks/useTeacherOptions', () => ({ useTeacherOptions: () => useTeachersMock() }));
vi.mock('@/hooks/useSemesterYearFilter', () => ({ useSemesterYearFilter: (...args: unknown[]) => useFilterMock(...args) }));
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: (value: unknown) => value }));
vi.mock('@/components/import/import-dialog', () => ({
  ImportDialog: ({ kind }: { kind: { id: string } }) => <button type="button">Nhập từ file ({kind.id})</button>,
}));
vi.mock('./_components/administrative-class-catalog-dialog', () => ({
  AdministrativeClassCatalogDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog" aria-label="Danh mục lớp danh nghĩa (giả)" /> : null,
}));

const SEMESTERS = [
  { id: 's2', academicYearStart: 2026, term: 2, label: 'HK2 2026-2027' },
  { id: 's1', academicYearStart: 2026, term: 1, label: 'HK1 2026-2027' },
];
const filterState = (overrides: Record<string, unknown> = {}) => ({
  semesters: SEMESTERS,
  isLoading: false,
  selection: { academicYear: null, semesterId: null },
  setYear: vi.fn(),
  setSemester: vi.fn(),
  clear: vi.fn(),
  params: {},
  matches: () => true,
  ...overrides,
});

const klass = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  label: 'DHKTPM18A – Nhóm 1',
  labelWithSemester: 'DHKTPM18A – Nhóm 1 · HK1 2026-2027',
  semesterId: 's1',
  academicYear: 2026,
  term: 1,
  administrativeClassId: 'a1',
  administrativeClassCode: 'DHKTPM18A',
  groupName: 'Nhóm 1',
  teacherId: 't1',
  teacherName: 'GV A',
  studentCount: 40,
  sessionCount: 0,
  ...overrides,
});

function load(rows: ReturnType<typeof klass>[]) {
  useAdminClassesMock.mockReturnValue({ data: rows, isLoading: false, error: null });
}

describe('Trang Lớp (admin)', () => {
  beforeEach(() => {
    [create, update, remove].forEach((m) => {
      m.mutateAsync.mockReset().mockResolvedValue({});
      m.reset.mockReset();
      m.error = null;
    });
    useAdminClassesMock.mockReset();
    useFilterMock.mockReset().mockReturnValue(filterState());
    useCatalogMock.mockReset().mockReturnValue({ data: [{ id: 'a1', code: 'DHKTPM18A', classCount: 1 }, { id: 'a2', code: 'DHKTPM18B', classCount: 0 }], isLoading: false, error: null });
    useTeachersMock.mockReset().mockReturnValue({ data: [{ id: 't1', name: 'GV A' }, { id: 't2', name: 'GV B' }], isLoading: false, error: null });
    load([klass()]);
  });

  it('hiện nhãn lớp, học kỳ, giảng viên, sĩ số, số phiên; "chưa có" cho lớp chưa có sinh viên', () => {
    load([klass(), klass({ id: 'c2', label: 'DHKTPM18B', groupName: '', studentCount: 0, sessionCount: 2, teacherName: 'GV B' })]);
    render(<AdminClassesPage />);

    const first = screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ });
    expect(first).toHaveTextContent('HK1 2026-2027');
    expect(first).toHaveTextContent('GV A');
    expect(first).toHaveTextContent('40');

    const second = screen.getByRole('row', { name: /DHKTPM18B/ });
    expect(second).toHaveTextContent('chưa có');
    expect(second).toHaveTextContent('2');
  });

  it('lớp cũ chưa có học kỳ hiện "Chưa gán học kỳ" thay vì "HK null"', () => {
    load([klass({ semesterId: null, academicYear: null, term: null })]);
    render(<AdminClassesPage />);
    expect(screen.getByText('Chưa gán học kỳ')).toBeInTheDocument();
  });

  it('có hai nút trên đầu trang: nhập từ file và Danh mục lớp danh nghĩa', () => {
    render(<AdminClassesPage />);
    expect(screen.getByRole('button', { name: 'Nhập từ file (class)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Danh mục lớp danh nghĩa' }));
    expect(screen.getByRole('dialog', { name: 'Danh mục lớp danh nghĩa (giả)' })).toBeInTheDocument();
  });

  describe('bộ lọc', () => {
    it('đưa tham số của bộ lọc năm học → học kỳ, giảng viên và ô tìm vào truy vấn phía server', async () => {
      useFilterMock.mockReturnValue(filterState({ params: { semesterId: 's1' } }));
      render(<AdminClassesPage />);
      expect(useAdminClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1' });

      fireEvent.click(screen.getByRole('combobox', { name: 'Lọc theo giảng viên' }));
      fireEvent.click(screen.getByRole('option', { name: 'GV B' }));
      await waitFor(() => expect(useAdminClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1', teacherId: 't2' }));

      fireEvent.change(screen.getByRole('searchbox', { name: 'Tìm mã lớp' }), { target: { value: ' DHKTPM ' } });
      await waitFor(() =>
        expect(useAdminClassesMock).toHaveBeenLastCalledWith({ semesterId: 's1', teacherId: 't2', q: 'DHKTPM' }),
      );
    });

    it('mặc định không lọc gì: truy vấn rỗng (Tất cả)', () => {
      render(<AdminClassesPage />);
      expect(useAdminClassesMock).toHaveBeenLastCalledWith({});
    });

    it('rỗng vì lọc nói khác với rỗng vì chưa có lớp', () => {
      load([]);
      const { unmount } = render(<AdminClassesPage />);
      expect(screen.getByText('Chưa có lớp nào')).toBeInTheDocument();
      unmount();

      useFilterMock.mockReturnValue(filterState({ selection: { academicYear: 2026, semesterId: null }, params: { academicYear: 2026 } }));
      render(<AdminClassesPage />);
      expect(screen.getByText('Không có lớp nào khớp bộ lọc')).toBeInTheDocument();
    });
  });

  describe('thêm lớp (Review Focus 3, 6)', () => {
    it('mở với học kỳ mới nhất chọn sẵn; nút Tạo tắt cho tới khi chọn đủ lớp danh nghĩa và giảng viên', async () => {
      render(<AdminClassesPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      expect(create.reset).toHaveBeenCalled(); // Review Focus 2
      const dialog = screen.getByRole('dialog', { name: 'Thêm lớp' });
      expect(within(dialog).getByRole('combobox', { name: 'Học kỳ' })).toHaveTextContent('HK2 2026-2027');
      const submit = within(dialog).getByRole('button', { name: 'Tạo' });
      expect(submit).toBeDisabled();

      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Lớp danh nghĩa' }));
      fireEvent.click(screen.getByRole('option', { name: /DHKTPM18B/ }));
      expect(submit).toBeDisabled(); // còn thiếu giảng viên
      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Giảng viên phụ trách' }));
      fireEvent.click(screen.getByRole('option', { name: 'GV B' }));
      fireEvent.change(within(dialog).getByLabelText(/Nhóm/), { target: { value: ' Nhóm 2 ' } });
      expect(submit).toBeEnabled();
      fireEvent.click(submit);

      await waitFor(() =>
        expect(create.mutateAsync).toHaveBeenCalledWith({
          semesterId: 's2',
          administrativeClassId: 'a2',
          groupName: 'Nhóm 2',
          teacherId: 't2',
        }),
      );
    });

    it('đang lọc một học kỳ thì form mở với đúng học kỳ đó', () => {
      useFilterMock.mockReturnValue(filterState({ selection: { academicYear: 2026, semesterId: 's1' }, params: { semesterId: 's1' } }));
      render(<AdminClassesPage />);
      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      expect(within(screen.getByRole('dialog', { name: 'Thêm lớp' })).getByRole('combobox', { name: 'Học kỳ' })).toHaveTextContent('HK1 2026-2027');
    });

    it('Review Focus 6: Danh mục TRỐNG — lời chỉ đường nguyên văn spec và nút mở Danh mục', () => {
      useCatalogMock.mockReturnValue({ data: [], isLoading: false, error: null });
      render(<AdminClassesPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      const dialog = screen.getByRole('dialog', { name: 'Thêm lớp' });
      expect(
        within(dialog).getByText('Chưa có mã lớp danh nghĩa nào. Hãy thêm vào Danh mục lớp danh nghĩa trước.'),
      ).toBeInTheDocument();
      expect(within(dialog).getByRole('button', { name: 'Mở Danh mục lớp danh nghĩa' })).toBeInTheDocument();
    });

    it('chưa có học kỳ nào: lời chỉ đường kèm liên kết tới trang Học kỳ', () => {
      useFilterMock.mockReturnValue(filterState({ semesters: [] }));
      render(<AdminClassesPage />);

      fireEvent.click(screen.getByRole('button', { name: /thêm lớp/i }));
      const dialog = screen.getByRole('dialog', { name: 'Thêm lớp' });
      expect(within(dialog).getByText(/chưa có học kỳ nào/i)).toBeInTheDocument();
      expect(within(dialog).getByRole('link', { name: /trang học kỳ/i })).toHaveAttribute('href', '/admin/semesters');
    });
  });

  describe('sửa lớp', () => {
    it('lớp CHƯA có phiên: học kỳ sửa được', () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      expect(within(screen.getByRole('dialog', { name: 'Sửa lớp' })).getByRole('combobox', { name: 'Học kỳ' })).toBeEnabled();
    });

    it('Review Focus 3: lớp ĐÃ có phiên — học kỳ khoá kèm lý do; nhóm, lớp danh nghĩa và giảng viên vẫn sửa được', () => {
      load([klass({ sessionCount: 3 })]);
      render(<AdminClassesPage />);

      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));

      const dialog = screen.getByRole('dialog', { name: 'Sửa lớp' });
      expect(within(dialog).getByRole('combobox', { name: 'Học kỳ' })).toBeDisabled();
      expect(within(dialog).getByText(/đã có 3 phiên thi nên không đổi được học kỳ/i)).toBeInTheDocument();
      expect(within(dialog).getByRole('combobox', { name: 'Giảng viên phụ trách' })).toBeEnabled();
      expect(within(dialog).getByRole('combobox', { name: 'Lớp danh nghĩa' })).toBeEnabled();
    });

    it('Review Focus 5: chưa đổi gì thì không lưu được; đổi giảng viên thì CHỈ gửi teacherId', async () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      const dialog = screen.getByRole('dialog', { name: 'Sửa lớp' });
      const save = within(dialog).getByRole('button', { name: 'Lưu' });
      expect(save).toBeDisabled();

      fireEvent.click(within(dialog).getByRole('combobox', { name: 'Giảng viên phụ trách' }));
      fireEvent.click(screen.getByRole('option', { name: 'GV B' }));
      expect(save).toBeEnabled();
      fireEvent.click(save);

      await waitFor(() => expect(update.mutateAsync).toHaveBeenCalledWith({ id: 'c1', body: { teacherId: 't2' } }));
    });

    it('đổi giảng viên: nói rõ điều gì xảy ra với phiên đã có', () => {
      render(<AdminClassesPage />);
      fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Sửa' }));
      expect(within(screen.getByRole('dialog', { name: 'Sửa lớp' })).getByText(/phiên thi đã có giữ giảng viên cũ/i)).toBeInTheDocument();
    });
  });

  it('xoá: lý do của server hiện nguyên văn và hộp thoại KHÔNG đóng', async () => {
    const message = 'Lớp DHKTPM18A – Nhóm 1 còn 40 sinh viên nên không xoá được.';
    remove.mutateAsync.mockRejectedValue(new Error(message));
    remove.error = new Error(message);
    render(<AdminClassesPage />);

    fireEvent.click(within(screen.getByRole('row', { name: /DHKTPM18A – Nhóm 1/ })).getByRole('button', { name: 'Xoá' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(message)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xoá' }));

    await waitFor(() => expect(remove.mutateAsync).toHaveBeenCalledWith('c1'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('lỗi tải danh sách hiện lời báo của server', () => {
    useAdminClassesMock.mockReturnValue({ data: undefined, isLoading: false, error: new Error('Không tải được lớp') });
    render(<AdminClassesPage />);
    expect(screen.getByText('Không tải được lớp')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/app/admin/classes/page.test.tsx`
Expected: FAIL — không import được `./page`.

- [ ] **Step 3: Viết trang**

Create `apps/web/src/app/admin/classes/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookMarked, GraduationCap } from 'lucide-react';
import { SemesterYearFilter } from '@/components/layout/semester-year-filter';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ImportDialog } from '@/components/import/import-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAdminClasses,
  useCreateAdminClass,
  useDeleteAdminClass,
  useUpdateAdminClass,
} from '@/hooks/useAdminClasses';
import { useAdministrativeClasses } from '@/hooks/useAdministrativeClasses';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSemesterYearFilter } from '@/hooks/useSemesterYearFilter';
import { useTeacherOptions } from '@/hooks/useTeacherOptions';
import type { AdminClass } from '@/lib/api/admin-classes';
import { CLASS_KIND } from '@/lib/import/columns';
import {
  EMPTY_CLASS_FORM,
  classCreateBody,
  classFormComplete,
  classFormOf,
  classUpdateBody,
  semesterTextOf,
} from '@/lib/master-data-forms';
import { isFiltering, termOptions } from '@/lib/semester-filter';
import { AdministrativeClassCatalogDialog } from './_components/administrative-class-catalog-dialog';

/**
 * Lớp (spec §2.3, §5.1): ADMIN tạo, sửa, xoá và giao giảng viên; giảng viên chỉ đọc lớp được giao. Một lớp là (học kỳ, lớp danh nghĩa,
 * nhóm, giảng viên) và hiện bằng MỘT nhãn gộp `DHKTPM18A – Nhóm 1`.
 *
 * Form CHỌN, không gõ: học kỳ từ bảng học kỳ, lớp danh nghĩa từ Danh mục (mã chỉ được thêm ở Danh mục — chặn lỗi gõ một lần cho cả danh
 * mục), giảng viên từ danh sách tài khoản; chỉ nhóm là ô gõ. Admin thành điểm nghẽn là lựa chọn có ý thức của đợt này (spec §12).
 */
export default function AdminClassesPage() {
  const semesterFilter = useSemesterYearFilter('admin-classes');
  const teachers = useTeacherOptions();
  const catalog = useAdministrativeClasses();

  const [teacherFilter, setTeacherFilter] = useState('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const query = debouncedSearch.trim();

  const classes = useAdminClasses({
    ...semesterFilter.params,
    ...(teacherFilter === 'all' ? {} : { teacherId: teacherFilter }),
    ...(query === '' ? {} : { q: query }),
  });
  const create = useCreateAdminClass();
  const update = useUpdateAdminClass();
  const remove = useDeleteAdminClass();

  const [form, setForm] = useState(EMPTY_CLASS_FORM);
  const [editing, setEditing] = useState<AdminClass | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<AdminClass | null>(null);
  const [catalogOpen, setCatalogOpen] = useState(false);

  const semesters = semesterFilter.semesters;
  const catalogEntries = catalog.data ?? [];
  const filtersActive = isFiltering(semesterFilter.selection) || teacherFilter !== 'all' || query !== '';
  const sessionLocked = editing !== null && editing.sessionCount > 0;

  function clearFilters() {
    semesterFilter.clear();
    setTeacherFilter('all');
    setSearch('');
  }

  function openCreate() {
    create.reset();
    update.reset();
    setEditing(null);
    // Học kỳ chọn sẵn: đang lọc một kỳ thì đúng kỳ đó, không thì kỳ MỚI NHẤT — thứ admin gần như luôn muốn khi tạo lớp. Sửa được.
    const preselected = semesterFilter.selection.semesterId ?? termOptions(semesters, null)[0]?.id ?? '';
    setForm({ ...EMPTY_CLASS_FORM, semesterId: preselected });
    setFormOpen(true);
  }

  function openEdit(klass: AdminClass) {
    create.reset();
    update.reset();
    setEditing(klass);
    setForm(classFormOf(klass));
    setFormOpen(true);
  }

  function openDelete(klass: AdminClass) {
    remove.reset();
    setDeleting(klass);
  }

  const changed = editing === null ? true : Object.keys(classUpdateBody(form, editing)).length > 0;

  return (
    <ResourceShell<AdminClass>
      title="Lớp"
      description="Admin tạo lớp và giao giảng viên phụ trách. Giảng viên chỉ thấy và tạo phiên thi cho lớp mình được giao."
      icon={GraduationCap}
      addLabel="Thêm lớp"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={openDelete}
      headerActions={
        <>
          <Button type="button" variant="outline" onClick={() => setCatalogOpen(true)}>
            <BookMarked className="h-4 w-4" aria-hidden="true" />
            Danh mục lớp danh nghĩa
          </Button>
          <ImportDialog kind={CLASS_KIND} />
        </>
      }
      rows={classes.data}
      rowKey={(k) => k.id}
      isLoading={classes.isLoading}
      error={classes.error}
      emptyTitle={filtersActive ? 'Không có lớp nào khớp bộ lọc' : 'Chưa có lớp nào'}
      emptyDescription={
        filtersActive
          ? 'Thử nới bộ lọc năm học, học kỳ hoặc giảng viên, hoặc xoá ô tìm.'
          : 'Tạo lớp rồi giao giảng viên: giảng viên chưa được giao lớp thì không tạo được phiên thi.'
      }
      filters={
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
          <SemesterYearFilter
            semesters={semesters}
            selection={semesterFilter.selection}
            onYearChange={semesterFilter.setYear}
            onSemesterChange={semesterFilter.setSemester}
          />
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="lg:w-56" aria-label="Lọc theo giảng viên">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả giảng viên</SelectItem>
              {(teachers.data ?? []).map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo mã lớp..."
            className="lg:max-w-xs"
            aria-label="Tìm mã lớp"
          />
          {filtersActive && (
            <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
              Xoá bộ lọc
            </Button>
          )}
        </div>
      }
      columns={[
        { label: 'Lớp', render: (k) => <span className="font-medium">{k.label}</span> },
        { label: 'Học kỳ', tight: true, render: (k) => semesterTextOf(k) },
        {
          label: 'Giảng viên',
          render: (k) => <span className="text-muted-foreground">{k.teacherName}</span>,
        },
        {
          label: 'Sĩ số',
          tight: true,
          render: (k) =>
            k.studentCount === 0 ? (
              // Không phải ô trống: lớp chưa có danh sách thì không sinh viên nào vào được phiên thi.
              <span className="text-warning-strong">chưa có</span>
            ) : (
              <span className="tabular-nums">{k.studentCount}</span>
            ),
        },
        {
          label: 'Phiên thi',
          tight: true,
          render: (k) => <span className="tabular-nums">{k.sessionCount}</span>,
        },
      ]}
    >
      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa lớp' : 'Thêm lớp'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={create.error ?? update.error}
        canSubmit={classFormComplete(form) && changed}
        onSubmit={() =>
          editing
            ? update.mutateAsync({ id: editing.id, body: classUpdateBody(form, editing) })
            : create.mutateAsync(classCreateBody(form))
        }
      >
        {semesters.length === 0 && (
          <Alert variant="info">
            <AlertDescription>
              Chưa có học kỳ nào nên chưa tạo được lớp. Hãy tạo học kỳ ở{' '}
              <Link href="/admin/semesters" className="font-medium underline">
                trang Học kỳ
              </Link>{' '}
              trước.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="class-semester">Học kỳ</Label>
          <Select
            value={form.semesterId || undefined}
            onValueChange={(value) => setForm({ ...form, semesterId: value })}
            disabled={sessionLocked}
          >
            <SelectTrigger id="class-semester" aria-label="Học kỳ">
              <SelectValue placeholder="Chọn học kỳ" />
            </SelectTrigger>
            <SelectContent>
              {termOptions(semesters, null).map((semester) => (
                <SelectItem key={semester.id} value={semester.id}>
                  {semester.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {sessionLocked && (
            <p className="text-caption text-muted-foreground">
              Lớp đã có {editing?.sessionCount} phiên thi nên không đổi được học kỳ — các phiên đã ghi nhãn học kỳ này. Muốn chuyển kỳ
              thì tạo lớp mới ở kỳ mới.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="class-administrative">Lớp danh nghĩa</Label>
          {catalogEntries.length === 0 && !catalog.isLoading ? (
            <Alert variant="info">
              <AlertDescription className="flex flex-col items-start gap-3">
                <span>Chưa có mã lớp danh nghĩa nào. Hãy thêm vào Danh mục lớp danh nghĩa trước.</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setCatalogOpen(true)}>
                  Mở Danh mục lớp danh nghĩa
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <Select
              value={form.administrativeClassId || undefined}
              onValueChange={(value) => setForm({ ...form, administrativeClassId: value })}
            >
              <SelectTrigger id="class-administrative" aria-label="Lớp danh nghĩa">
                <SelectValue placeholder="Chọn từ Danh mục" />
              </SelectTrigger>
              <SelectContent>
                {catalogEntries.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.code} · {entry.classCount} lớp
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="class-group">Nhóm (không bắt buộc)</Label>
          <Input
            id="class-group"
            value={form.groupName}
            placeholder="vd: Nhóm 1 — bỏ trống nếu lớp không tách nhóm"
            onChange={(e) => setForm({ ...form, groupName: e.target.value })}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="class-teacher">Giảng viên phụ trách</Label>
          <Select
            value={form.teacherId || undefined}
            onValueChange={(value) => setForm({ ...form, teacherId: value })}
          >
            <SelectTrigger id="class-teacher" aria-label="Giảng viên phụ trách">
              <SelectValue placeholder="Chọn giảng viên" />
            </SelectTrigger>
            <SelectContent>
              {(teachers.data ?? []).map((teacher) => (
                <SelectItem key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {editing && (
            <p className="text-caption text-muted-foreground">
              Đổi giảng viên: danh sách sinh viên của lớp đi theo giảng viên mới, còn phiên thi đã có giữ giảng viên cũ (để không ai
              sửa được điểm của phiên người khác đã chấm).
            </p>
          )}
        </div>
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`lớp "${deleting?.labelWithSemester ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />

      <AdministrativeClassCatalogDialog open={catalogOpen} onOpenChange={setCatalogOpen} />
    </ResourceShell>
  );
}
```

- [ ] **Step 4: Chạy để thấy xanh**

Run: `cd apps/web && npx vitest run src/app/admin/classes`
Expected: PASS cả trang lẫn hộp thoại. Ba ca dễ trượt: (1) ca "mở với học kỳ mới nhất chọn sẵn" đòi `termOptions(semesters, null)[0]` là kỳ **mới nhất** (`s2`, HK2 2026-2027) — sắp giảm dần theo năm rồi kỳ; (2) ca lọc đòi `useAdminClasses` nhận `{ semesterId: 's1' }` **không có khoá thừa** (`teacherId`, `q` chỉ xuất hiện khi có giá trị); (3) ca "đổi giảng viên" mở option của Radix Select **ngoài** dialog (portal) nên dùng `screen.getByRole('option', …)`, không `within(dialog)`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/admin/classes/page.tsx apps/web/src/app/admin/classes/page.test.tsx
git commit -m "feat(web): trang admin Lớp (form chọn, bộ lọc năm học→học kỳ+giảng viên+mã, Danh mục trống thì chỉ đường, khoá học kỳ khi đã có phiên)"
```

---

### Task 7: Mục menu admin, test "không có mục menu chết", và chạy cả bộ

**Files:**
- Modify: `apps/web/src/lib/nav-config.ts`, `apps/web/src/lib/nav-config.test.ts`

**Interfaces:**
- Consumes: ba trang của Task 3, 4, 6.
- Produces: `ADMIN_NAV` có thêm `Học kỳ`, `Phòng thi`, `Lớp`.

- [ ] **Step 1: Viết test (đỏ)**

Trong `apps/web/src/lib/nav-config.test.ts`, đổi dòng import đầu thành `import { ADMIN_NAV, TEACHER_NAV, type NavItem } from './nav-config';`, thêm import `import { existsSync } from 'node:fs';` và `import { join } from 'node:path';` ở đầu file, rồi thêm vào cuối file:

```ts
describe('ADMIN_NAV', () => {
  const labels = ADMIN_NAV.map((item) => item.label);

  it('có ba mục dữ liệu nền (Học kỳ, Phòng thi, Lớp) trỏ đúng trang', () => {
    expect(ADMIN_NAV.find((i) => i.label === 'Học kỳ')?.href).toBe('/admin/semesters');
    expect(ADMIN_NAV.find((i) => i.label === 'Phòng thi')?.href).toBe('/admin/rooms');
    expect(ADMIN_NAV.find((i) => i.label === 'Lớp')?.href).toBe('/admin/classes');
  });

  it('dữ liệu nền đứng ngay sau "Quản lý tài khoản" và trước cấu hình (nhóm "việc của admin" đi liền nhau)', () => {
    expect(labels.indexOf('Học kỳ')).toBe(labels.indexOf('Quản lý tài khoản') + 1);
    expect(labels.indexOf('Học kỳ')).toBeLessThan(labels.indexOf('Cấu hình AI'));
  });

  it('không có "Danh mục lớp danh nghĩa" làm mục menu: nó là hộp thoại trong trang Lớp (giảng viên và màn khác không bao giờ thấy "hai thứ")', () => {
    expect(labels.join('|')).not.toMatch(/danh nghĩa/i);
  });
});

/**
 * "Never a missing/dead nav entry" (chú thích đầu nav-config.ts) thành một bài test: ba trang dữ liệu nền từng bị xoá mà ba mục menu của
 * chúng ở lại (21/09), nên admin bấm vào là ra 404. Nhóm này ghim điều ngược lại cho MỌI mục của cả hai menu (Review Focus 7).
 */
describe('mọi mục menu đều có trang', () => {
  const APP_DIR = join(__dirname, '..', 'app');
  const cases: Array<[string, NavItem]> = [
    ...ADMIN_NAV.map((item): [string, NavItem] => ['ADMIN_NAV', item]),
    ...TEACHER_NAV.map((item): [string, NavItem] => ['TEACHER_NAV', item]),
  ];

  it.each(cases)('%s: %s', (_nav, item) => {
    const page = join(APP_DIR, ...item.href.split('/').filter(Boolean), 'page.tsx');
    expect(existsSync(page), `${item.label} → ${item.href} không có ${page}`).toBe(true);
  });
});
```

(`it.each` dùng `_nav` làm tiền tố và `%s` thứ hai là `[object Object]` — đổi tiêu đề thành `'%s → $label'` nếu muốn dễ đọc; bài test không phụ thuộc vào tiêu đề.)

- [ ] **Step 2: Chạy để thấy đỏ**

Run: `cd apps/web && npx vitest run src/lib/nav-config.test.ts`
Expected: FAIL — `ADMIN_NAV` chưa có ba mục (ca đầu tiên). Nhóm "mọi mục đều có trang" **xanh ngay** cho các mục sẵn có (chứng tỏ phép kiểm đúng) và sẽ phủ ba mục mới sau bước 3.

- [ ] **Step 3: Thêm ba mục menu**

Trong `apps/web/src/lib/nav-config.ts`:

1. Thêm `CalendarRange`, `DoorOpen` vào danh sách import của `lucide-react` (`GraduationCap` đã có).
2. Thay khối chú thích và `ADMIN_NAV` bằng:

```ts
export const ADMIN_NAV: NavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
  { label: 'Quản lý tài khoản', href: '/admin/accounts', icon: Users },
  // Dữ liệu nền do admin quản lý (khôi phục 2026-10, spec master-data-restoration): học kỳ, phòng thi và lớp. Bị xoá ngày 2026-09-21 cùng
  // đợt thu hẹp master data — lần đó ba mục menu ở lại trỏ vào ba trang không còn, và admin bấm vào là ra 404. Lần này mục menu và trang
  // đi CÙNG commit, và một test duyệt mọi `href` kiểm `page.tsx` có thật.
  //
  // "Danh mục lớp danh nghĩa" KHÔNG phải một mục menu: nó là hộp thoại mở từ trang Lớp, để giảng viên và các màn hình khác không bao giờ
  // thấy "hai thứ" (mã danh nghĩa và lớp học phần).
  { label: 'Học kỳ', href: '/admin/semesters', icon: CalendarRange },
  { label: 'Phòng thi', href: '/admin/rooms', icon: DoorOpen },
  { label: 'Lớp', href: '/admin/classes', icon: GraduationCap },
  { label: 'Cấu hình AI', href: '/admin/ai-config', icon: Bot },
  { label: 'Chi phí', href: '/admin/cost', icon: Wallet },
  { label: 'Audit log', href: '/admin/audit-log', icon: ScrollText },
];
```

- [ ] **Step 4: Chạy cả bộ web, lint, kiểu**

```powershell
cd apps/web
npx vitest run
npx eslint src/app/admin src/components/resource src/lib/master-data-forms.ts src/lib/nav-config.ts src/lib/nav-config.test.ts
pnpm exec tsc --noEmit 2>&1 | Select-String -Pattern '^src/' | ForEach-Object { ($_ -split '\(')[0] } | Sort-Object -Unique | Out-File -Encoding utf8 C:/tmp/tsc-red-after-g2.txt
Compare-Object (Get-Content ../../docs/superpowers/plans/md-restore-web-tsc-red.txt) (Get-Content C:/tmp/tsc-red-after-g2.txt)
```

Expected: toàn bộ vitest xanh; ESLint sạch; `Compare-Object` **không có dòng nào** — G2 chỉ thêm file và không sửa file nào trong danh sách đỏ (danh sách này giảm ở G3, G4). Nếu một file MỚI của G2 xuất hiện trong danh sách đỏ, đó là lỗi kiểu của chính plan này: sửa nó (thường là `body as never` thiếu, hoặc một trường của `AdminClass` lệch khỏi schema sinh ra).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/nav-config.ts apps/web/src/lib/nav-config.test.ts
git commit -m "feat(web): ba mục menu admin (Học kỳ, Phòng thi, Lớp) và test mọi mục menu đều có trang"
```

---

## Tự kiểm lại plan so với spec

- §5.1: ba trang (Học kỳ — nhóm theo năm học, thêm/sửa/xoá, nhập từ file; Phòng thi — danh sách có ô tìm, thêm/sửa/bật-tắt hoạt động/xoá, nhập từ file; Lớp — lọc năm học, học kỳ, giảng viên + tìm mã lớp, **form 4 ô: học kỳ, lớp danh nghĩa (ô chọn, không gõ), nhóm, giảng viên**, nhập từ file, nút "Danh mục lớp danh nghĩa"); hộp thoại Danh mục (bảng mã kèm số lớp đang dùng; thêm một mã với cảnh báo gần giống; nhập từ file; sửa mã; xoá chặn kèm lý do); **Danh mục trống → lời chỉ đường nguyên văn spec** kèm nút mở hộp thoại (Task 6, ca "Review Focus 6"). Không có trang riêng cho Danh mục (không có mục menu "danh nghĩa" — test ghim). Trang audit là plan B; "Giao diện lấy lại từ `admin/semesters`, `admin/rooms`, `department/classes` ở `3cf4688`" — đã đọc ba trang cũ và dùng lại **khung** (`ResourceShell` + hai hộp thoại) chứ không chép lại trang vì mô hình dữ liệu đã đổi (lớp danh nghĩa, học kỳ có khoá, `isActive`). Menu: thêm 3 mục (Task 7), mục Audit log đã có.
- §5.1 "Không xoá được dữ liệu đang được dùng… DB chặn, và trang báo **lý do cụ thể** thay vì lỗi thô": mọi hộp thoại xoá hiện `error.message` của server nguyên văn và không đóng khi thất bại; ba trang + hộp thoại Danh mục đều có test với câu thật của server (T-WEB-… ở §11).
- §2.2/§6.2 nguyên tắc 4 (gõ gần giống): `NearDuplicateNotice` trong biểu mẫu phòng và trong hộp thoại Danh mục (thêm **và** sửa), nút "Vẫn thêm … này" gửi `confirmSimilar: true`; trùng cứng hiện thường. §2.3 (không đổi học kỳ của lớp đã có phiên): ô học kỳ khoá kèm lý do (server + DB vẫn là thẩm quyền). §2.1 (học kỳ: khoá năm/kỳ khi đã có lớp). §2.4 (phòng: tắt thay vì xoá; đổi tên không đổi phiên cũ — lời giải thích trong form sửa). §7.2: Admin: Lớp = năm học + học kỳ + giảng viên + ô tìm mã lớp; Học kỳ = nhóm theo năm học; Phòng = ô tìm tên.
- Mở rộng cho phần dùng chung (nêu để user duyệt): `ResourceShell` + `ResourceFormDialog` thêm 4 prop **tuỳ chọn** (không có người gọi cũ nào, nên không có hành vi cũ để phá); `GET /accounts/teachers` có thể liệt kê giảng viên đã bị vô hiệu hoá (nêu ở G1) — server từ chối kèm lý do khi giao lớp cho họ; lọc phòng **trong trình duyệt** (danh sách nhỏ, đã tải đủ) khác lọc lớp **ở server** (danh sách có thể lớn theo năm).
- Không làm ở plan này (thuộc plan sau): màn hình giảng viên (Lớp của tôi chỉ đọc, bộ lọc ở Kỳ thi/Bài thu/Chấm điểm/Dashboard, ô thêm tay gõ MSSV tự hiện tên) — G3; form tạo/sửa phiên, nút Sửa/Huỷ — G4. Test T-WEB cho các phần đó ở G3/G4. Chạy trình duyệt thật (Playwright): plan H.
- Placeholder scan: không có "TBD" hay bước mơ hồ; mỗi bước có mã/lệnh cụ thể. Kiểu nhất quán: `ResourceShell` props mới khớp cách ba trang dùng; `canSubmit` khớp hai hộp thoại; `AdminClass.sessionCount`/`classCount` (G1) khớp các điều kiện khoá; `classUpdateBody`/`classCreateBody` (Task 2) khớp lời gọi `useUpdateAdminClass`/`useCreateAdminClass` (G1); `ImportDialog kind={…}` (E2) và `useImportRunner` làm mới các khoá `semesters`/`rooms`/`administrative-classes`/`classes` mà các hook G1 dùng.
