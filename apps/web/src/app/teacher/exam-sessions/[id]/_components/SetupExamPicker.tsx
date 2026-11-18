'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCourseExam, useCourseExams } from '@/hooks/useExamBank';
import { useUploadExamMaterial } from '@/hooks/useExamSession';
import {
  COURSE_EXAM_TYPE_OPTIONS,
  fetchCourseExamDocx,
  type CourseExamSummary,
} from '@/lib/api/exam-bank';
import {
  BankPickerFiltersBar,
  EMPTY_BANK_FILTERS,
  matchesBankRow,
  useSemesterRanges,
  type BankPickerFiltersState,
} from './bank-picker-filters';

function typeLabel(examType: string): string {
  return COURSE_EXAM_TYPE_OPTIONS.find((o) => o.value === examType)?.label ?? examType;
}

export function SetupExamPicker({
  sessionId,
  courseId,
  disabled,
}: {
  sessionId: string;
  courseId: string | null;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<BankPickerFiltersState>(EMPTY_BANK_FILTERS);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const exams = useCourseExams(courseId);
  const detail = useCourseExam(pickedId);
  const upload = useUploadExamMaterial(sessionId);
  const ranges = useSemesterRanges(filters.yearId);

  const rows = useMemo(() => {
    const list = exams.data ?? [];
    return list.filter((exam) =>
      matchesBankRow(
        {
          name: exam.title,
          type: exam.examType,
          createdAt: exam.createdAt,
          updatedAt: exam.updatedAt,
        },
        filters,
        ranges,
      ),
    );
  }, [exams.data, filters, ranges]);

  function closeAll() {
    setOpen(false);
    setPickedId(null);
    setFilters(EMPTY_BANK_FILTERS);
  }

  async function confirmAttach(exam: CourseExamSummary) {
    setConfirming(true);
    try {
      const { blob, filename } = await fetchCourseExamDocx(exam.id);
      const file = new File([blob], filename, {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      await upload.mutateAsync(file);
      toast.success(`Đã gắn đề "${exam.title}" vào phiên.`);
      closeAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không gắn được đề thi.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || !courseId}
        onClick={() => setOpen(true)}
      >
        Thiết lập đề thi
      </Button>
      {!courseId ? (
        <p className="text-caption text-muted-foreground">
          Phiên chưa gắn môn catalog - không mở được kho đề.
        </p>
      ) : null}

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeAll())}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chọn đề thi từ kho</DialogTitle>
            <DialogDescription>
              Tìm theo tên, lọc loại / năm học / học kỳ. Bấm một dòng để xem và xác nhận.
            </DialogDescription>
          </DialogHeader>

          <BankPickerFiltersBar
            value={filters}
            onChange={setFilters}
            typeOptions={COURSE_EXAM_TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />

          {exams.isLoading ? (
            <p className="text-small text-muted-foreground">Đang tải kho đề…</p>
          ) : exams.isError ? (
            <p className="text-small text-destructive">Không tải được danh sách đề.</p>
          ) : rows.length === 0 ? (
            <p className="text-small text-muted-foreground">Không có đề khớp bộ lọc.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên đề</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Câu</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((exam) => (
                  <TableRow
                    key={exam.id}
                    className="cursor-pointer"
                    onClick={() => setPickedId(exam.id)}
                  >
                    <TableCell className="font-medium">{exam.title}</TableCell>
                    <TableCell>{typeLabel(exam.examType)}</TableCell>
                    <TableCell>{exam.status === 'ready' ? 'Sẵn sàng' : 'Nháp'}</TableCell>
                    <TableCell className="text-right">{exam.questionCount}</TableCell>
                    <TableCell className="text-right">{exam.totalPoints}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeAll}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pickedId !== null}
        onOpenChange={(next) => {
          if (!next) setPickedId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận gắn đề thi</DialogTitle>
            <DialogDescription>
              Hệ thống sẽ xuất Word từ kho đề và tải lên tài liệu phát của phiên.
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <p className="text-small text-muted-foreground">Đang tải thông tin đề…</p>
          ) : detail.isError || !detail.data ? (
            <p className="text-small text-destructive">Không tải được chi tiết đề.</p>
          ) : (
            <dl className="grid gap-2 text-small sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Tên đề</dt>
                <dd className="font-medium">{detail.data.title}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Loại</dt>
                <dd>{typeLabel(detail.data.examType)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Môn</dt>
                <dd>
                  {detail.data.courseCode} - {detail.data.courseName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Ngôn ngữ</dt>
                <dd>{detail.data.language}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Số câu</dt>
                <dd>{detail.data.questionCount}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Điểm đề</dt>
                <dd>{detail.data.totalPoints}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Mô tả</dt>
                <dd>{detail.data.description?.trim() || '-'}</dd>
              </div>
            </dl>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={confirming}
              onClick={() => setPickedId(null)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              disabled={!detail.data || confirming}
              loading={confirming}
              onClick={() => {
                if (!detail.data) return;
                void confirmAttach(detail.data);
              }}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
