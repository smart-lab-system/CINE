'use client';

import { useState } from 'react';
import { ClipboardCheck, Plus, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRubrics, useSaveRubric } from '@/hooks/useGrading';
/**
 * Rubric của MỘT môn học. Lưu luôn tạo một phiên bản MỚI — không có
 * đường update ở API, vì sửa tiêu chí mà kết quả đã trỏ tới là đúng thứ
 * Security rule 7 cấm. Thẻ này nói rõ điều đó, để số phiên bản tăng dần
 * lúc soạn đọc ra là có chủ đích chứ không phải lỗi.
 */
export function RubricEditor({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const rubrics = useRubrics(courseId);
  const save = useSaveRubric(courseId);
  const active = rubrics.data?.find((rubric) => rubric.isActive);
  const [draft, setDraft] = useState<{ description: string; maxPoints: string }[] | null>(
    null,
  );

  const rows =
    draft ??
    active?.criteria.map((c) => ({
      description: c.description,
      maxPoints: String(c.maxPoints),
    })) ??
    [{ description: '', maxPoints: '5' }];

  function update(next: typeof rows) {
    setDraft(next);
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
        <CardTitle className="text-h3">
          {courseName}
          {active && (
            <span className="ml-2 font-normal text-muted-foreground">
              phiên bản {active.version} · {active.totalPoints} điểm
            </span>
          )}
        </CardTitle>
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              rows
                .filter((row) => row.description.trim() !== '')
                .map((row) => ({
                  description: row.description.trim(),
                  maxPoints: Number(row.maxPoints) || 0,
                })),
              { onSuccess: () => setDraft(null) },
            )
          }
        >
          Lưu thành phiên bản mới
        </Button>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <p className="text-small text-muted-foreground">
          Mỗi lần lưu tạo một phiên bản mới. Bài đã chấm vẫn giữ nguyên phiên bản cũ — sửa
          rubric không được phép làm thay đổi những kết quả đã có.
        </p>


        {save.isError && (
          <Alert variant="destructive">
            <AlertDescription>{save.error.message}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-3">
          {rows.map((row, index) => (
            <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor={`criterion-${index}`}>Tiêu chí {index + 1}</Label>
                <Input
                  id={`criterion-${index}`}
                  value={row.description}
                  placeholder="vd: Trình bày thuật toán rõ ràng, có độ phức tạp"
                  onChange={(event) =>
                    update(
                      rows.map((r, i) =>
                        i === index ? { ...r, description: event.target.value } : r,
                      ),
                    )
                  }
                />
              </div>
              <div className="flex w-28 flex-col gap-1.5">
                <Label htmlFor={`criterion-points-${index}`}>Điểm tối đa</Label>
                <Input
                  id={`criterion-points-${index}`}
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={row.maxPoints}
                  onChange={(event) =>
                    update(
                      rows.map((r, i) =>
                        i === index ? { ...r, maxPoints: event.target.value } : r,
                      ),
                    )
                  }
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={rows.length === 1}
                aria-label={`Xoá tiêu chí ${index + 1}`}
                onClick={() => update(rows.filter((_, i) => i !== index))}
                className="shrink-0 hover:bg-danger-subtle hover:text-danger-strong"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => update([...rows, { description: '', maxPoints: '5' }])}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Thêm tiêu chí
        </Button>

        {rubrics.data && rubrics.data.length > 1 && (
          <p className="flex items-center gap-2 text-caption text-muted-foreground">
            <ClipboardCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Đã có {rubrics.data.length} phiên bản. Các phiên bản cũ được giữ lại để đối chiếu
            với những bài đã chấm theo chúng.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
