'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDeclareDeliverableLanguage } from '@/hooks/useExamSession';
import type { DeclaredLanguage, RequiredDeliverableResponse } from '@/lib/api/exam-session';

const LANGUAGES: { value: DeclaredLanguage; label: string }[] = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'node', label: 'Node.js' },
];

/** Đường chấm của một yêu cầu nộp code, nói bằng lời. `pipeline` do backend tính — không suy ra từ `language`. */
function routeText(d: RequiredDeliverableResponse): string {
  if (d.pipeline === 'investigator') return 'Chấm trong môi trường chạy bài — cần gói test đã ghim.';
  if (d.language === null) {
    return 'Chưa khai — chấm bằng đọc mã, không chạy mã. Hệ thống không đoán ngôn ngữ từ đuôi file.';
  }
  return 'Chấm bằng đọc mã, không chạy mã (môi trường chạy bài chỉ chạy Python và C++).';
}

/**
 * Khai ngôn ngữ cho từng yêu cầu nộp code (G1 §3.5, spec UI §3.7). Ngôn ngữ quyết đường chấm của cả bài và khoá cùng
 * tài liệu chấm, nên khi phiên đã có kết quả thì ô bị khoá — lý do là dữ liệu thật (bài đã có dòng kết quả), và câu
 * từ chối của server vẫn hiện nguyên văn nếu vẫn bị từ chối.
 */
export function DeliverableLanguages({
  sessionId,
  deliverables,
  hasResults,
}: {
  sessionId: string;
  deliverables: RequiredDeliverableResponse[];
  /** Phiên đã có ít nhất một kết quả — đường chấm của các bài đã cố định. */
  hasResults: boolean;
}) {
  const declare = useDeclareDeliverableLanguage(sessionId);
  const code = deliverables.filter((d) => d.deliverableType === 'code_project');
  if (code.length === 0) return null;

  return (
    <section aria-label="Ngôn ngữ bài code" className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <h2 className="text-small font-semibold">Ngôn ngữ bài code</h2>
      <ul className="flex flex-col gap-3">
        {code.map((d) => (
          <li key={d.id} className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-small">{d.requiredFilename}</span>
              <label className="sr-only" htmlFor={`language-${d.id}`}>
                Ngôn ngữ của {d.requiredFilename}
              </label>
              <select
                id={`language-${d.id}`}
                value={d.language ?? ''}
                disabled={hasResults || declare.isPending}
                onChange={(e) => declare.mutate({ deliverableId: d.id, language: e.target.value as DeclaredLanguage })}
                className="h-9 rounded-md border border-border bg-surface px-2 text-small disabled:opacity-60"
              >
                {d.language === null && (
                  <option value="" disabled>
                    Chưa khai
                  </option>
                )}
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-caption text-muted-foreground">
              {hasResults ? 'Bài này đã có kết quả chấm nên đường chấm đã cố định.' : routeText(d)}
            </p>
          </li>
        ))}
      </ul>
      {declare.isError && (
        <Alert variant="destructive">
          <AlertDescription>{declare.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
