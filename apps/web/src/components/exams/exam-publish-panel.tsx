'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ExamPublishChecklist } from './publish-checklist';

export function ExamPublishPanel({
  checklist,
  onPublish,
  pending = false,
  error,
}: {
  checklist: ExamPublishChecklist;
  onPublish: () => void;
  pending?: boolean;
  error?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Công bố lịch</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-1.5 text-sm">
          {checklist.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <span aria-hidden="true">{item.ok ? '✓' : '○'}</span>
              <span className={item.ok ? undefined : 'text-muted-foreground'}>
                {item.label}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Nút công bố khóa cho đến khi đủ lớp, ca phòng, giám thị trưởng và
          file đề. API vẫn là nguồn sự thật nếu máy chủ từ chối.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="button"
          onClick={onPublish}
          disabled={!checklist.ready || pending}
        >
          Công bố lịch
        </Button>
      </CardContent>
    </Card>
  );
}
