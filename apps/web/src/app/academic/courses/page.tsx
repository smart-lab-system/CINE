'use client';

import { useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SemesterFilter } from '@/components/layout/semester-filter';
import { ResourceShell } from '@/components/resource/resource-shell';
import { ResourceFormDialog } from '@/components/resource/resource-form-dialog';
import { ConfirmDeleteDialog } from '@/components/resource/confirm-delete-dialog';
import { useSemesterFilter } from '@/hooks/useSemesterFilter';
import { useAccounts } from '@/hooks/useAccounts';
import {
  useAssignCourseOwner,
  useCourseCatalog,
  useCreateCatalogCourse,
  useDeleteCatalogCourse,
  useUpdateCatalogCourse,
} from '@/hooks/useDepartment';
import type { CourseCatalogEntry } from '@/lib/api/department';

const EMPTY = { code: '', name: '' };

/**
 * Danh mục môn cấp trường: nơi Phòng Đào tạo công bố môn của một học kỳ rồi
 * phân về từng khoa.
 *
 * Đây là mắt nối từng thiếu. Trước spec ranh-giới-sở-hữu, Phòng Đào tạo mở
 * được học kỳ nhưng không công bố được gì bên trong nó — một quyển lịch rỗng —
 * còn "Môn chưa có chủ" thì nằm ở tier admin, nơi phân công một môn về một
 * khoa bị coi như quản trị hạ tầng thay vì việc học vụ.
 *
 * Môn CHƯA có chủ là của trang này (sửa/xoá được). Môn ĐÃ có chủ thuộc khoa —
 * `findWritableBy` ở API trả 403, nên ở đây cũng không mở dialog.
 */
export default function AcademicCoursesPage() {
  const semesterFilter = useSemesterFilter('academic-courses');
  const [onlyUnowned, setOnlyUnowned] = useState(false);

  const catalog = useCourseCatalog({
    semesterId: semesterFilter.semesterId,
    unowned: onlyUnowned,
  });
  // Chỉ Trưởng khoa là chủ hợp lệ — API cũng kiểm lại (assignOwner trả 400 nếu
  // người nhận không phải `department_admin`), nên đây là tiện lợi, không phải
  // hàng rào.
  const heads = useAccounts({ page: 1, pageSize: 100, role: 'department_admin' });
  const assign = useAssignCourseOwner();

  const create = useCreateCatalogCourse();
  const update = useUpdateCatalogCourse();
  const remove = useDeleteCatalogCourse();

  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<CourseCatalogEntry | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleting, setDeleting] = useState<CourseCatalogEntry | null>(null);
  const [chosen, setChosen] = useState<Record<string, string>>({});

  const headOptions = heads.data?.items ?? [];
  const noSemester = semesterFilter.semesterId === null;

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setFormOpen(true);
  }

  // Môn đã có chủ thuộc khoa: API trả 403, nên đừng mở dialog rồi để người
  // dùng ăn lỗi sau khi bấm Lưu.
  function openEdit(course: CourseCatalogEntry) {
    if (course.departmentHeadId !== null) {
      return;
    }
    setEditing(course);
    setForm({ code: course.code, name: course.name });
    setFormOpen(true);
  }

  function openDelete(course: CourseCatalogEntry) {
    if (course.departmentHeadId !== null) {
      return;
    }
    setDeleting(course);
  }

  return (
    <ResourceShell<CourseCatalogEntry>
      title="Danh mục môn học"
      description="Môn học của toàn trường theo từng học kỳ. Phòng Đào tạo công bố môn rồi phân về khoa; một khi môn đã có chủ, việc sửa nó thuộc về Trưởng khoa phụ trách."
      icon={BookOpen}
      addLabel="Thêm môn học"
      onAdd={openCreate}
      onEdit={openEdit}
      onDelete={openDelete}
      rows={catalog.data}
      rowKey={(c) => c.id}
      isLoading={catalog.isLoading}
      error={catalog.error}
      emptyTitle="Chưa có môn học nào"
      emptyDescription="Công bố môn cho học kỳ này, rồi phân từng môn về khoa phụ trách."
      filter={
        <div className="flex flex-wrap items-end gap-4">
          <SemesterFilter
            value={semesterFilter.semesterId}
            onChange={semesterFilter.setSemesterId}
            semesters={semesterFilter.semesters}
            current={semesterFilter.current}
            isStale={semesterFilter.isStale}
            staleDays={semesterFilter.staleDays}
          />
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-small">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={onlyUnowned}
              onChange={(event) => setOnlyUnowned(event.target.checked)}
            />
            <span>Chỉ môn chưa có chủ</span>
          </label>
        </div>
      }
      columns={[
        {
          label: 'Mã môn',
          tight: true,
          render: (c) => <span className="font-mono font-medium">{c.code}</span>,
        },
        { label: 'Tên môn', render: (c) => c.name },
        {
          label: 'Sĩ số',
          tight: true,
          render: (c) => <span className="tabular-nums">{c.enrollmentCount}</span>,
        },
        {
          label: 'Chủ',
          render: (c) =>
            c.departmentHeadId === null ? (
              // "Chưa có chủ" phải đọc ra được như một TRẠNG THÁI, không phải
              // một ô trống: môn chưa có chủ không hiện trong màn hình của bất
              // kỳ Trưởng khoa nào, nên nó là việc cần làm, không phải thiếu
              // dữ liệu.
              <span className="text-muted-foreground">Chưa có chủ</span>
            ) : (
              <span>{c.departmentHeadName}</span>
            ),
        },
      ]}
      rowActions={(course) =>
        course.departmentHeadId === null ? (
          <div className="flex items-center gap-2">
            <Select
              value={chosen[course.id] ?? ''}
              onValueChange={(value) => setChosen((prev) => ({ ...prev, [course.id]: value }))}
            >
              <SelectTrigger
                className="w-44"
                aria-label={`Chọn trưởng khoa cho ${course.code}`}
              >
                <SelectValue placeholder="Chọn trưởng khoa" />
              </SelectTrigger>
              <SelectContent>
                {headOptions.map((head) => (
                  <SelectItem key={head.id} value={head.id}>
                    {head.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!chosen[course.id] || assign.isPending}
              onClick={() =>
                assign.mutate({ id: course.id, departmentHeadId: chosen[course.id] })
              }
            >
              {assign.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              )}
              Gán
            </Button>
          </div>
        ) : null
      }
    >
      {assign.error && (
        <Alert variant="destructive">
          <AlertDescription>{assign.error.message}</AlertDescription>
        </Alert>
      )}

      {!heads.isLoading && headOptions.length === 0 && (
        <Alert variant="info">
          <AlertDescription>
            Chưa có tài khoản Trưởng khoa nào, nên chưa phân công được môn. Nhờ Quản trị tạo
            một tài khoản với vai trò Trưởng khoa trước.
          </AlertDescription>
        </Alert>
      )}

      <ResourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Sửa môn học' : 'Thêm môn học'}
        submitLabel={editing ? 'Lưu' : 'Tạo'}
        submitting={create.isPending || update.isPending}
        error={create.error ?? update.error}
        onSubmit={() =>
          editing
            ? update.mutateAsync({ id: editing.id, body: form })
            : create.mutateAsync({ ...form, semesterId: semesterFilter.semesterId! })
        }
      >
        {noSemester && (
          <Alert variant="info">
            <AlertDescription>
              Chọn một học kỳ cụ thể ở bộ lọc trước — mỗi môn phải thuộc về đúng một kỳ.
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="course-code">Mã môn</Label>
          <Input
            id="course-code"
            required
            value={form.code}
            placeholder="vd: CS101"
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="course-name">Tên môn</Label>
          <Input
            id="course-name"
            required
            value={form.name}
            placeholder="vd: Nhập môn lập trình"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
      </ResourceFormDialog>

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        target={`môn "${deleting?.code ?? ''}"`}
        submitting={remove.isPending}
        error={remove.error}
        onConfirm={() => remove.mutateAsync(deleting!.id)}
      />
    </ResourceShell>
  );
}
