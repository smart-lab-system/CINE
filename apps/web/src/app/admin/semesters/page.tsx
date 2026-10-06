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
