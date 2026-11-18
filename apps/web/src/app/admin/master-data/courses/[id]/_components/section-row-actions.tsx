'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Pencil, Power } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  useAssignCourseSection,
  useDeactivateCourseSection,
  useDeleteCourseSection,
  useReactivateCourseSection,
  useTeacherOptions,
  useUnassignCourseSection,
  useUpdateCourseSection,
} from '@/hooks/useAdminCourseSections';
import { useNominalClasses, useSemesters } from '@/hooks/useMasterData';
import type { CourseSection } from '@/lib/api/admin-course-sections';
import { RowActions } from '../../../_components/catalog-table';

export function SectionRowActions({
  section,
}: {
  section: CourseSection;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <>
      <RowActions>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Sửa"
          onClick={(e) => {
            e.stopPropagation();
            setEditOpen(true);
          }}
        >
          <Pencil className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Cập nhật trạng thái"
          onClick={(e) => {
            e.stopPropagation();
            setStatusOpen(true);
          }}
        >
          <Power className="size-4" />
        </Button>
      </RowActions>

      <SectionEditDialog
        section={section}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <SectionStatusDialog
        section={section}
        open={statusOpen}
        onOpenChange={setStatusOpen}
      />
    </>
  );
}

function SectionEditDialog({
  section,
  open,
  onOpenChange,
}: {
  section: CourseSection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const canEdit = (section.examSessionCount ?? 0) === 0;
  const update = useUpdateCourseSection();
  const assign = useAssignCourseSection();
  const unassign = useUnassignCourseSection();
  const teachers = useTeacherOptions();
  const semesters = useSemesters({ page: 1, pageSize: 100, status: 'active' });
  const nominalClasses = useNominalClasses({
    page: 1,
    pageSize: 100,
    status: 'active',
  });

  const [semesterId, setSemesterId] = useState(section.semesterId ?? '');
  const [nominalClassId, setNominalClassId] = useState(
    section.nominalClassId ?? '',
  );
  const [teacherId, setTeacherId] = useState(section.teacherId ?? '');

  useEffect(() => {
    if (!open) return;
    setSemesterId(section.semesterId ?? '');
    setNominalClassId(section.nominalClassId ?? '');
    setTeacherId(section.teacherId ?? '');
  }, [open, section]);

  const semesterOptions = useMemo(() => {
    const items = (semesters.data?.items ?? []).map((s) => ({
      value: s.id,
      label: s.name,
      keywords: s.name,
    }));
    if (
      section.semesterId &&
      section.semesterName &&
      !items.some((o) => o.value === section.semesterId)
    ) {
      items.unshift({
        value: section.semesterId,
        label: section.semesterName,
        keywords: section.semesterName,
      });
    }
    return items;
  }, [semesters.data?.items, section.semesterId, section.semesterName]);

  const nominalOptions = useMemo(() => {
    const items = (nominalClasses.data?.items ?? []).map((n) => ({
      value: n.id,
      label: n.code,
      keywords: `${n.code} ${n.name ?? ''}`,
    }));
    if (
      section.nominalClassId &&
      section.nominalClassName &&
      !items.some((o) => o.value === section.nominalClassId)
    ) {
      items.unshift({
        value: section.nominalClassId,
        label: section.nominalClassName.split(' — ')[0] ?? section.nominalClassName,
        keywords: section.nominalClassName,
      });
    }
    return [{ value: '', label: 'Không gắn', keywords: 'none' }, ...items];
  }, [nominalClasses.data?.items, section.nominalClassId, section.nominalClassName]);

  const teacherOptions = useMemo(() => {
    const items = (teachers.data ?? []).map((t) => ({
      value: t.id,
      label: t.name,
      keywords: t.name,
    }));
    if (
      section.teacherId &&
      section.teacherName &&
      !items.some((o) => o.value === section.teacherId)
    ) {
      items.unshift({
        value: section.teacherId,
        label: section.teacherName,
        keywords: section.teacherName,
      });
    }
    return [{ value: '', label: 'Chưa phân công', keywords: 'none' }, ...items];
  }, [teachers.data, section.teacherId, section.teacherName]);

  const busy = update.isPending || assign.isPending || unassign.isPending;

  async function onSave() {
    if (!canEdit) {
      onOpenChange(false);
      return;
    }
    try {
      const body: {
        semesterId?: string;
        nominalClassId?: string | null;
      } = {};
      if (semesterId && semesterId !== (section.semesterId ?? '')) {
        body.semesterId = semesterId;
      }
      const nextNominal = nominalClassId || null;
      if (nextNominal !== (section.nominalClassId ?? null)) {
        body.nominalClassId = nextNominal;
      }
      if (Object.keys(body).length > 0) {
        await update.mutateAsync({ id: section.id, body });
      }

      const nextTeacher = teacherId || null;
      if (nextTeacher !== (section.teacherId ?? null)) {
        if (nextTeacher) {
          await assign.mutateAsync({ id: section.id, teacherId: nextTeacher });
        } else {
          await unassign.mutateAsync(section.id);
        }
      }

      toast.success('Đã cập nhật lớp học phần');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cập nhật thất bại');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[min(90dvh,40rem)] overflow-y-auto sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Sửa lớp học phần — {section.name}</DialogTitle>
          <DialogDescription>
            {canEdit
              ? 'Có thể sửa học kỳ, lớp danh nghĩa và giảng viên khi lớp chưa có phiên thi.'
              : 'Lớp đã có phiên thi — chỉ xem, không sửa được.'}
          </DialogDescription>
        </DialogHeader>

        {!canEdit ? (
          <Alert>
            <AlertDescription>
              Đang có{' '}
              <span className="font-medium tabular-nums">
                {section.examSessionCount}
              </span>{' '}
              phiên thi gắn lớp này.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-4 py-1">
          <div className="grid gap-1.5">
            <Label>Môn học</Label>
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-small">
              {section.courseName}
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label>Học kỳ</Label>
            {canEdit ? (
              <SearchableSelect
                value={semesterId}
                onValueChange={setSemesterId}
                options={semesterOptions}
                placeholder="Chọn học kỳ"
                searchPlaceholder="Tìm học kỳ…"
                ariaLabel="Chọn học kỳ"
              />
            ) : (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-small">
                {section.semesterName ?? '—'}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Lớp danh nghĩa</Label>
            {canEdit ? (
              <SearchableSelect
                value={nominalClassId}
                onValueChange={setNominalClassId}
                options={nominalOptions}
                placeholder="Chọn lớp danh nghĩa"
                searchPlaceholder="Tìm mã lớp…"
                ariaLabel="Chọn lớp danh nghĩa"
              />
            ) : (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-small">
                {section.nominalClassName?.split(' — ')[0] ?? '—'}
              </p>
            )}
          </div>

          <div className="grid gap-1.5">
            <Label>Giảng viên</Label>
            {canEdit ? (
              <SearchableSelect
                value={teacherId}
                onValueChange={setTeacherId}
                options={teacherOptions}
                placeholder="Chọn giảng viên"
                searchPlaceholder="Tìm giảng viên…"
                ariaLabel="Chọn giảng viên"
              />
            ) : (
              <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-small">
                {section.teacherName ?? 'Chưa phân công'}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {canEdit ? 'Huỷ' : 'Đóng'}
          </Button>
          {canEdit ? (
            <Button type="button" onClick={() => void onSave()} disabled={busy}>
              Lưu
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionStatusDialog({
  section,
  open,
  onOpenChange,
}: {
  section: CourseSection;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const deactivate = useDeactivateCourseSection();
  const reactivate = useReactivateCourseSection();
  const remove = useDeleteCourseSection();
  const busy = deactivate.isPending || reactivate.isPending || remove.isPending;
  const active = section.isActive !== false;

  async function onDeactivate() {
    try {
      await deactivate.mutateAsync(section.id);
      toast.success('Đã vô hiệu hoá lớp học phần');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Vô hiệu hoá thất bại');
    }
  }

  async function onReactivate() {
    try {
      await reactivate.mutateAsync(section.id);
      toast.success('Đã kích hoạt lại lớp học phần');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kích hoạt thất bại');
    }
  }

  async function onHardDelete() {
    if (
      !confirm(
        `Xoá cứng lớp ${section.name}? Cần roster trống và không còn phiên thi. Không hoàn tác.`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync(section.id);
      toast.success('Đã xoá lớp học phần');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Xoá thất bại');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Cập nhật trạng thái — {section.name}</DialogTitle>
          <DialogDescription>
            Hiện tại:{' '}
            <span className="font-medium text-foreground">
              {active ? 'Đang hoạt động' : 'Đã vô hiệu hoá'}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-1">
          {active ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void onDeactivate()}
            >
              Vô hiệu hoá (xoá mềm)
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void onReactivate()}
            >
              Kích hoạt lại
            </Button>
          )}
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => void onHardDelete()}
          >
            Xoá cứng
          </Button>
          <p className="text-caption text-muted-foreground">
            Vô hiệu hoá: ẩn khỏi「Lớp của tôi」, không mở phiên mới. Xoá cứng: cần
            roster trống và không còn phiên thi.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
