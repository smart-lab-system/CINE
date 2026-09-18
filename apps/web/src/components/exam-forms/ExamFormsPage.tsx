'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  EXAM_FORM_KINDS,
  EXAM_FORM_DEFINITIONS,
  buildExamFormWorkbook,
  downloadExamFormWorkbook,
  type ExamFormKind,
} from '@/lib/exam-forms';

/**
 * Shared Biểu mẫu screen — mounted under /admin|department|teacher/forms
 * so every mapped role can download the same Excel templates.
 */
export function ExamFormsPage() {
  const [includeSamples, setIncludeSamples] = useState(true);
  const [busyKind, setBusyKind] = useState<ExamFormKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload(kind: ExamFormKind) {
    setError(null);
    setBusyKind(kind);
    try {
      const built = await buildExamFormWorkbook({ kind, includeSamples });
      downloadExamFormWorkbook(built);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được file Excel.');
    } finally {
      setBusyKind(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <PageHeader
        title="Biểu mẫu"
        description="Tải mẫu Excel hành chính kỳ thi (header cố định theo quy định). Điền tay hoặc đối chiếu với sổ ngoài hệ thống — chưa đổ dữ liệu từ phiên thi."
      />

      <div className="flex items-center gap-3" data-animate>
        <input
          id="include-samples"
          type="checkbox"
          className="size-4 accent-[hsl(var(--accent-strong))]"
          checked={includeSamples}
          onChange={(e) => setIncludeSamples(e.target.checked)}
        />
        <Label htmlFor="include-samples" className="cursor-pointer font-normal">
          Kèm dòng mẫu
        </Label>
      </div>

      {error && (
        <Alert variant="destructive" data-animate>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col gap-4">
        {EXAM_FORM_KINDS.map((kind) => {
          const def = EXAM_FORM_DEFINITIONS[kind];
          const busy = busyKind === kind;
          return (
            <li key={kind}>
              <Card data-animate>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="flex gap-3">
                    <FileSpreadsheet className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
                    <div className="flex flex-col gap-1.5">
                      <CardTitle>{def.label}</CardTitle>
                      <CardDescription>{def.description}</CardDescription>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={busyKind !== null}
                    loading={busy}
                    onClick={() => void handleDownload(kind)}
                  >
                    <Download className="size-4" />
                    Tải mẫu
                  </Button>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-caption text-muted-foreground">
                    Sheet <code className="text-foreground">{def.sheetName}</code>
                    {' · '}
                    {def.headers.length} cột
                  </p>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
