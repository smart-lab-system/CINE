'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Pencil, Power } from 'lucide-react';
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
import {
  useCourseHubExamMutations,
  useCourseHubRubricMutations,
} from '@/hooks/useMasterData';
import type { CourseHubExam, CourseHubRubric } from '@/lib/api/master-data';
import { RowActions } from '../../../_components/catalog-table';

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-small">
        {value}
      </p>
    </div>
  );
}

export function ExamRowActions({
  courseId,
  exam,
}: {
  courseId: string;
  exam: CourseHubExam;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <>
      <RowActions className="justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Xem thông tin"
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

      <ExamInfoDialog
        courseId={courseId}
        exam={exam}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ExamStatusDialog
        courseId={courseId}
        exam={exam}
        open={statusOpen}
        onOpenChange={setStatusOpen}
      />
    </>
  );
}

function ExamInfoDialog({
  courseId,
  exam,
  open,
  onOpenChange,
}: {
  courseId: string;
  exam: CourseHubExam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Thông tin đề thi</DialogTitle>
          <DialogDescription>
            Chỉ xem từ hub admin — sửa nội dung ở ngân hàng đề của giảng viên.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <MetaRow label="Tiêu đề" value={exam.title} />
          <MetaRow label="Loại" value={exam.examType} />
          <MetaRow
            label="Trạng thái soạn"
            value={exam.status === 'ready' ? 'Sẵn sàng' : 'Nháp'}
          />
          <MetaRow
            label="Hoạt động"
            value={exam.isActive !== false ? 'Đang hoạt động' : 'Đã vô hiệu hoá'}
          />
          <MetaRow label="Người tạo" value={exam.createdByName ?? '—'} />
          <MetaRow
            label="Học kỳ (suy diễn)"
            value={exam.resolvedSemesterName ?? '—'}
          />
          <MetaRow
            label="Số câu / tổng điểm"
            value={`${exam.questionCount} câu · ${exam.totalPoints} điểm`}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" asChild>
            <Link href={`/admin/master-data/courses/${courseId}/exams/${exam.id}`}>
              Mở chi tiết
            </Link>
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExamStatusDialog({
  courseId,
  exam,
  open,
  onOpenChange,
}: {
  courseId: string;
  exam: CourseHubExam;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { deactivate, reactivate, remove } = useCourseHubExamMutations(courseId);
  const busy = deactivate.isPending || reactivate.isPending || remove.isPending;
  const active = exam.isActive !== false;

  async function onDeactivate() {
    try {
      await deactivate.mutateAsync(exam.id);
      toast.success('Đã vô hiệu hoá đề thi');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Vô hiệu hoá thất bại');
    }
  }

  async function onReactivate() {
    try {
      await reactivate.mutateAsync(exam.id);
      toast.success('Đã kích hoạt lại đề thi');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kích hoạt thất bại');
    }
  }

  async function onHardDelete() {
    if (!confirm(`Xoá cứng đề «${exam.title}»? Không hoàn tác.`)) return;
    try {
      await remove.mutateAsync(exam.id);
      toast.success('Đã xoá đề thi');
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
          <DialogTitle>Cập nhật trạng thái — đề thi</DialogTitle>
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
            Vô hiệu hoá: ẩn khỏi picker gắn mới. Xoá cứng: được phép cho tới khi
            có liên kết phiên↔đề thật.
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

export function RubricRowActions({
  courseId,
  rubric,
}: {
  courseId: string;
  rubric: CourseHubRubric;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  return (
    <>
      <RowActions className="justify-center">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          title="Xem thông tin"
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

      <RubricInfoDialog
        courseId={courseId}
        rubric={rubric}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <RubricStatusDialog
        courseId={courseId}
        rubric={rubric}
        open={statusOpen}
        onOpenChange={setStatusOpen}
      />
    </>
  );
}

function RubricInfoDialog({
  courseId,
  rubric,
  open,
  onOpenChange,
}: {
  courseId: string;
  rubric: CourseHubRubric;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Thông tin rubric</DialogTitle>
          <DialogDescription>
            Chỉ xem từ hub admin — sửa nội dung ở portal giảng viên.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-1">
          <MetaRow label="Tên" value={rubric.name} />
          <MetaRow label="Loại" value={(rubric.kind ?? 'qa').toUpperCase()} />
          <MetaRow label="Version" value={`v${rubric.version}`} />
          <MetaRow
            label="Bản hiện hành"
            value={rubric.isActive ? 'Có (mới nhất)' : 'Không (bản cũ)'}
          />
          <MetaRow
            label="Hoạt động (admin)"
            value={rubric.isArchived ? 'Đã vô hiệu hoá' : 'Đang hoạt động'}
          />
          <MetaRow label="Người tạo" value={rubric.teacherName ?? '—'} />
          <MetaRow
            label="Học kỳ (suy diễn)"
            value={rubric.resolvedSemesterName ?? '—'}
          />
          <MetaRow label="Tổng điểm" value={`${rubric.totalPoints} điểm`} />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" asChild>
            <Link
              href={`/admin/master-data/courses/${courseId}/rubrics/${rubric.id}`}
            >
              Mở chi tiết
            </Link>
          </Button>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RubricStatusDialog({
  courseId,
  rubric,
  open,
  onOpenChange,
}: {
  courseId: string;
  rubric: CourseHubRubric;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { deactivate, reactivate, remove } = useCourseHubRubricMutations(courseId);
  const busy = deactivate.isPending || reactivate.isPending || remove.isPending;
  const archived = rubric.isArchived === true;

  async function onDeactivate() {
    try {
      await deactivate.mutateAsync(rubric.id);
      toast.success('Đã vô hiệu hoá rubric');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Vô hiệu hoá thất bại');
    }
  }

  async function onReactivate() {
    try {
      await reactivate.mutateAsync(rubric.id);
      toast.success('Đã kích hoạt lại rubric');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Kích hoạt thất bại');
    }
  }

  async function onHardDelete() {
    if (
      !confirm(
        `Xoá cứng rubric «${rubric.name}» v${rubric.version}? Chỉ khi không còn tham chiếu. Không hoàn tác.`,
      )
    ) {
      return;
    }
    try {
      await remove.mutateAsync(rubric.id);
      toast.success('Đã xoá rubric');
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
          <DialogTitle>Cập nhật trạng thái — rubric</DialogTitle>
          <DialogDescription>
            Hiện tại:{' '}
            <span className="font-medium text-foreground">
              {archived ? 'Đã vô hiệu hoá' : 'Đang hoạt động'}
            </span>
            {!rubric.isActive ? ' · bản cũ (versioning)' : null}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          {!archived ? (
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
            Vô hiệu hoá dùng cờ riêng (không đụng versioning). Xoá cứng khi không
            còn gắn đề / phiên / bài chấm.
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
