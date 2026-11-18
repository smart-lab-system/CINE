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
import { useRubric, useRubrics } from '@/hooks/useGrading';
import { formatVnPoints } from '@/lib/format';
import type { Rubric } from '@/lib/api/grading';
import {
  BankPickerFiltersBar,
  EMPTY_BANK_FILTERS,
  matchesBankRow,
  useSemesterRanges,
  type BankPickerFiltersState,
} from './bank-picker-filters';

const KIND_OPTIONS = [
  { value: 'qa', label: 'QA - tiêu chí' },
  { value: 'qs', label: 'QS - cách giải' },
];

function kindLabel(kind: string | undefined): string {
  return kind === 'qs' ? 'QS' : 'QA';
}

export function SetupRubricPicker({
  courseId,
  disabled,
  persist,
  currentRubricId,
  onConfirmDraft,
  onConfirmImmediate,
}: {
  courseId: string | null;
  disabled?: boolean;
  persist: 'draft' | 'immediate';
  currentRubricId: string | null;
  onConfirmDraft?: (rubricId: string) => void;
  onConfirmImmediate?: (rubricId: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<BankPickerFiltersState>(EMPTY_BANK_FILTERS);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const rubrics = useRubrics();
  const detail = useRubric(pickedId ?? undefined);
  const ranges = useSemesterRanges(filters.yearId);

  const rows = useMemo(() => {
    const list = (rubrics.data ?? []).filter((r) => r.isActive && !r.isArchived);
    const scoped = courseId
      ? list.filter((r) => !r.courseId || r.courseId === courseId)
      : list;
    return scoped.filter((r) =>
      matchesBankRow(
        {
          name: r.name,
          type: r.kind ?? 'qa',
          createdAt: r.createdAt ?? r.updatedAt ?? new Date(0).toISOString(),
          updatedAt: r.updatedAt,
        },
        filters,
        ranges,
      ),
    );
  }, [rubrics.data, courseId, filters, ranges]);

  function closeAll() {
    setOpen(false);
    setPickedId(null);
    setFilters(EMPTY_BANK_FILTERS);
  }

  async function confirmPick(rubric: Rubric) {
    setConfirming(true);
    try {
      if (persist === 'draft') {
        onConfirmDraft?.(rubric.id);
        toast.success(`Đã chọn rubric "${rubric.name}" (lưu khi Lưu nháp / Hoàn tất).`);
      } else {
        await onConfirmImmediate?.(rubric.id);
        toast.success(`Đã gắn rubric "${rubric.name}".`);
      }
      closeAll();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không gắn được rubric.');
    } finally {
      setConfirming(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        Thiết lập rubric
      </Button>

      <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : closeAll())}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chọn rubric</DialogTitle>
            <DialogDescription>
              Tìm theo tên, lọc loại / năm học / học kỳ. Bấm một dòng để xem và xác nhận.
            </DialogDescription>
          </DialogHeader>

          <BankPickerFiltersBar
            value={filters}
            onChange={setFilters}
            typeLabel="Loại"
            typeOptions={KIND_OPTIONS}
          />

          {rubrics.isLoading ? (
            <p className="text-small text-muted-foreground">Đang tải rubric…</p>
          ) : rubrics.isError ? (
            <p className="text-small text-destructive">Không tải được danh sách rubric.</p>
          ) : rows.length === 0 ? (
            <p className="text-small text-muted-foreground">Không có rubric khớp bộ lọc.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên</TableHead>
                  <TableHead>Loại</TableHead>
                  <TableHead>Bản</TableHead>
                  <TableHead className="text-right">Điểm</TableHead>
                  <TableHead className="text-right">Tiêu chí</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.id}
                    className="cursor-pointer"
                    onClick={() => setPickedId(r.id)}
                  >
                    <TableCell className="font-medium">
                      {r.name}
                      {r.id === currentRubricId ? (
                        <span className="ml-2 text-caption text-muted-foreground">(đang gắn)</span>
                      ) : null}
                    </TableCell>
                    <TableCell>{kindLabel(r.kind)}</TableCell>
                    <TableCell>{r.version}</TableCell>
                    <TableCell className="text-right">{formatVnPoints(r.totalPoints)}</TableCell>
                    <TableCell className="text-right">{r.criteria.length}</TableCell>
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
            <DialogTitle>Xác nhận gắn rubric</DialogTitle>
            <DialogDescription>
              Rubric sẽ được dùng để chấm phiên thi này.
            </DialogDescription>
          </DialogHeader>
          {detail.isLoading ? (
            <p className="text-small text-muted-foreground">Đang tải thông tin rubric…</p>
          ) : detail.isError || !detail.data ? (
            <p className="text-small text-destructive">Không tải được chi tiết rubric.</p>
          ) : (
            <dl className="grid gap-2 text-small sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Tên</dt>
                <dd className="font-medium">{detail.data.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Loại</dt>
                <dd>{kindLabel(detail.data.kind)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Phiên bản</dt>
                <dd>{detail.data.version}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tổng điểm</dt>
                <dd>{formatVnPoints(detail.data.totalPoints)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Số tiêu chí / bước</dt>
                <dd>{detail.data.criteria.length}</dd>
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
                void confirmPick(detail.data);
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
