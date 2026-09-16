'use client';

import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRubrics, useSetSessionRubric } from '@/hooks/useGrading';

/**
 * Rubric của phiên thi này — hiển thị, và đổi được cho tới khi bài đầu tiên
 * được chấm.
 *
 * KHÔNG phải editor. Soạn rubric là việc theo MÔN, làm một lần, và sống ở
 * /teacher/rubrics. Ở đây chỉ có một quyết định: phiên này chấm bằng bản
 * nào — và phiên bản hiện ra là bản ĐÃ GHIM của phiên, không phải bản mới
 * nhất của môn.
 */
export function SessionRubricCard({
  sessionId,
  courseId,
  rubricVersion,
  hasResults,
}: {
  sessionId: string;
  courseId: string | undefined;
  rubricVersion: number | null;
  hasResults: boolean;
}) {
  const rubrics = useRubrics(courseId);
  const setRubric = useSetSessionRubric(sessionId);
  const options = rubrics.data ?? [];

  // Phiên chưa gắn rubric: chặn, nhưng KHÔNG ẩn khỏi danh sách và không im
  // lặng. Bài thi thật của sinh viên đang nằm trong phiên này (spec §5.3).
  if (rubricVersion === null) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 py-6">
          <Alert variant="warning">
            <AlertDescription>
              <span className="font-semibold">
                Phiên thi này chưa gắn rubric — chưa chấm được.
              </span>{' '}
              Bài đã thu vẫn còn nguyên; chọn rubric bên dưới là chấm được ngay.
            </AlertDescription>
          </Alert>

          {options.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Select
                onValueChange={(value) => setRubric.mutate(value)}
                disabled={setRubric.isPending}
              >
                <SelectTrigger id="attach-rubric" className="max-w-md">
                  <SelectValue placeholder="Chọn rubric cho phiên thi này" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((rubric) => (
                    <SelectItem key={rubric.id} value={rubric.id}>
                      Phiên bản {rubric.version} — {rubric.totalPoints} điểm
                      {rubric.isActive ? ' (mới nhất)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Link
                href="/teacher/rubrics"
                className="text-small font-semibold underline underline-offset-2"
              >
                Quản lý rubric
              </Link>
            </div>
          ) : (
            <p className="text-small text-muted-foreground">
              Môn này chưa có rubric nào.{' '}
              <Link
                href="/teacher/rubrics"
                className="font-semibold underline underline-offset-2"
              >
                Soạn rubric
              </Link>{' '}
              rồi quay lại đây.
            </p>
          )}

          {setRubric.isError && (
            <Alert variant="destructive">
              <AlertDescription>{setRubric.error.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
        <p className="text-small">
          Phiên thi này chấm theo{' '}
          <span className="font-semibold">rubric phiên bản {rubricVersion}</span>.{' '}
          <Link
            href="/teacher/rubrics"
            className="underline underline-offset-2 text-muted-foreground"
          >
            Quản lý rubric
          </Link>
        </p>

        {hasResults ? (
          // Không phải nút tắt câm: nói luôn vì sao. Đổi rubric sau khi đã
          // chấm là viết lại thứ mà kết quả đã trỏ tới — Security rule 7.
          <p className="text-caption text-muted-foreground">
            Đã có kết quả chấm nên không đổi được rubric nữa.
          </p>
        ) : (
          <Select
            onValueChange={(value) => setRubric.mutate(value)}
            disabled={setRubric.isPending || options.length === 0}
          >
            <SelectTrigger id="change-rubric" className="max-w-xs">
              <SelectValue placeholder="Đổi rubric" />
            </SelectTrigger>
            <SelectContent>
              {options.map((rubric) => (
                <SelectItem key={rubric.id} value={rubric.id}>
                  Phiên bản {rubric.version} — {rubric.totalPoints} điểm
                  {rubric.isActive ? ' (mới nhất)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}
