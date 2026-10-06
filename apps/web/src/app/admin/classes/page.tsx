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
    // Học kỳ chọn sẵn CHỈ khi đang lọc đúng một kỳ (ý đồ rõ ràng). Không chọn sẵn "kỳ mới nhất": một năm có ba kỳ thì mới nhất là HK3 hè, và học kỳ
    // của lớp gần như không đổi được sau khi có phiên thi — một mặc định sai bị bỏ qua ở ô bắt buộc là cái bẫy. Chưa lọc thì để trống, buộc chọn.
    setForm({ ...EMPTY_CLASS_FORM, semesterId: semesterFilter.selection.semesterId ?? '' });
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
