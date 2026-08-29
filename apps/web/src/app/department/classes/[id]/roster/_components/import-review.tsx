'use client';

import { CircleAlert, TriangleAlert, UserMinus, UserPlus, UserPen } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import type { RosterDiff, RosterRowError } from '@/lib/roster-file';

interface ImportReviewProps {
  errors: RosterRowError[];
  diff: RosterDiff | null;
  removeMissing: boolean;
  onRemoveMissingChange: (value: boolean) => void;
}

/**
 * Everything between "a file was read" and "confirm".
 *
 * Errors and the diff are mutually exclusive by construction: a file with
 * any bad row produces no students, so there is nothing to diff. That is the
 * rule, not a UI shortcut — importing 38 of 40 rows yields a headcount that
 * looks healthy and is not.
 */
export function ImportReview({
  errors,
  diff,
  removeMissing,
  onRemoveMissingChange,
}: ImportReviewProps) {
  if (errors.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>
            File có {errors.length} dòng lỗi. Không có dòng nào được nhập — hãy sửa file rồi
            chọn lại.
          </AlertDescription>
        </Alert>
        <ul className="flex flex-col gap-1 rounded-md border border-border bg-surface-2 p-4">
          {errors.map((error, index) => (
            <li key={index} className="text-small">
              {error.row > 0 && (
                <span className="mr-2 font-mono text-muted-foreground">
                  Dòng {error.row}
                </span>
              )}
              {error.reason}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!diff) {
    return null;
  }

  const nothingChanges =
    diff.added.length === 0 && diff.renamed.length === 0 && diff.missing.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Badge variant="success">
          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
          Thêm {diff.added.length}
        </Badge>
        <Badge variant="info">
          <UserPen className="h-3.5 w-3.5" aria-hidden="true" />
          Đổi tên {diff.renamed.length}
        </Badge>
        <Badge>Giữ nguyên {diff.unchanged}</Badge>
        {diff.missing.length > 0 && (
          <Badge variant="warning">
            <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
            Không có trong file {diff.missing.length}
          </Badge>
        )}
      </div>

      {nothingChanges && (
        <Alert variant="info">
          <AlertDescription>
            File này khớp hoàn toàn với danh sách hiện tại — nhập lại sẽ không thay đổi gì.
          </AlertDescription>
        </Alert>
      )}

      {diff.added.length > 0 && (
        <DiffList
          title="Sẽ thêm vào lớp"
          items={diff.added.map((s) => `${s.mssv} — ${s.name}`)}
        />
      )}

      {diff.renamed.length > 0 && (
        <DiffList
          title="Sẽ cập nhật họ tên"
          items={diff.renamed.map((s) => `${s.mssv}: "${s.from}" → "${s.to}"`)}
        />
      )}

      {diff.missing.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-subtle p-4">
          <div className="flex items-start gap-2">
            <TriangleAlert
              className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong"
              aria-hidden="true"
            />
            <div className="flex flex-col gap-1">
              <p className="text-small font-medium">
                {diff.missing.length} sinh viên đang trong lớp nhưng không có trong file
              </p>
              <p className="text-caption text-muted-foreground">
                Mặc định họ được giữ nguyên. Xoá một sinh viên khỏi lớp đồng nghĩa với việc
                họ không vào được phiên thi — và điều đó chỉ lộ ra vào hôm thi.
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-1 pl-6">
            {diff.missing.map((student) => (
              <li key={student.mssv} className="text-small">
                <span className="font-mono">{student.mssv}</span> — {student.name}
              </li>
            ))}
          </ul>

          <label className="flex cursor-pointer items-start gap-2 pl-6 text-small">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-danger"
              checked={removeMissing}
              onChange={(event) => onRemoveMissingChange(event.target.checked)}
            />
            <span>
              Xoá {diff.missing.length} sinh viên này khỏi lớp
            </span>
          </label>
        </div>
      )}
    </div>
  );
}

function DiffList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small font-medium">{title}</p>
      <ul className="max-h-56 overflow-y-auto rounded-md border border-border bg-surface-2 p-4">
        {items.map((item, index) => (
          <li key={index} className="text-small font-mono">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
