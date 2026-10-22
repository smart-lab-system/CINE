'use client';

import {
  isTemplatedFilename,
  previewFilenamePattern,
} from '@/app/teacher/exam-sessions/new/_components/filename-pattern-preview';

const DELIVERABLE_TYPE_LABELS = {
  document: 'Tài liệu',
  code_project: 'Mã nguồn',
  image: 'Ảnh chụp',
} as const;

export type ExamFolderRequiredFile = {
  pattern: string;
  deliverableType: 'document' | 'code_project' | 'image';
  language?: string | null;
  entries: string[];
};

export type ExamFolderPreviewProps = {
  /** Tên file đề / tài liệu đã upload (thứ tự API trả về). */
  materialFilenames: string[];
  /** File SV phải nộp — pattern + type + entries (+ language optional). */
  requiredFiles: ExamFolderRequiredFile[];
};

/**
 * Cây “thư mục bài thi” trên máy SV: đề được phát + file phải nộp.
 * Props thuần — không fetch; parent truyền materials + form/session.
 */
export function ExamFolderPreview({
  materialFilenames,
  requiredFiles,
}: ExamFolderPreviewProps) {
  const submitted = requiredFiles.filter((f) => f.pattern.trim().length > 0);

  return (
    <div
      role="region"
      aria-label="Preview thư mục bài thi"
      className="rounded-lg border border-border bg-surface-2/40 px-4 py-3 font-mono text-base leading-relaxed text-foreground"
    >
      <p className="mb-2 font-sans text-small font-semibold text-foreground">
        Thư mục bài thi (máy sinh viên)
      </p>
      <ul className="list-none space-y-0.5 pl-0">
        <li>
          <span className="text-muted-foreground">├── </span>
          <span className="font-sans font-medium">Được phát</span>
          <ul className="list-none pl-4">
            {materialFilenames.length === 0 ? (
              <li>
                <span className="text-muted-foreground">└── </span>
                <span className="font-sans text-muted-foreground">
                  (trống) — chưa upload đề/tài liệu
                </span>
              </li>
            ) : (
              materialFilenames.map((name, index) => (
                <li key={`${name}-${index}`}>
                  <span className="text-muted-foreground">
                    {index === materialFilenames.length - 1 ? '└── ' : '├── '}
                  </span>
                  <span>{name}</span>
                </li>
              ))
            )}
          </ul>
        </li>
        <li>
          <span className="text-muted-foreground">└── </span>
          <span className="font-sans font-medium">Phải nộp</span>
          <ul className="list-none pl-4">
            {submitted.length === 0 ? (
              <li>
                <span className="text-muted-foreground">└── </span>
                <span className="font-sans text-muted-foreground">
                  (trống) — chưa khai file phải nộp
                </span>
              </li>
            ) : (
              submitted.map((file, index) => {
                const isLast = index === submitted.length - 1;
                const templated = isTemplatedFilename(file.pattern);
                const sample = templated
                  ? previewFilenamePattern(file.pattern)
                  : null;
                return (
                  <li key={`${file.pattern}-${index}`} className="mb-1">
                    <span className="text-muted-foreground">
                      {isLast ? '└── ' : '├── '}
                    </span>
                    <span>{file.pattern}</span>
                    {sample ? (
                      <>
                        <span className="text-muted-foreground"> → </span>
                        <span>{sample}</span>
                      </>
                    ) : null}
                    <ul className="list-none pl-6 font-sans text-muted-foreground">
                      <li>
                        · loại: {DELIVERABLE_TYPE_LABELS[file.deliverableType]}
                      </li>
                      {file.deliverableType === 'code_project' && file.language ? (
                        <li>· ngôn ngữ: {file.language}</li>
                      ) : null}
                      {file.entries.length > 0 ? (
                        <li>· trong nén: {file.entries.join(', ')}</li>
                      ) : null}
                    </ul>
                  </li>
                );
              })
            )}
          </ul>
        </li>
      </ul>
    </div>
  );
}
