'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Play, Square, Upload } from 'lucide-react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import {
  createPlaygroundRun,
  createSampleExpressRun,
  createSampleSpringBootRun,
  createSampleStaticRun,
  createSampleViteReactRun,
  executePlaygroundRun,
  getPlaygroundRun,
  stopPlaygroundRun,
  uploadPlaygroundRun,
  type PlaygroundLanguage,
  type PlaygroundRun,
} from '@/lib/api/playground';

const LANGUAGES: { value: PlaygroundLanguage; label: string }[] = [
  { value: 'static', label: 'Web tĩnh (HTML/CSS/JS)' },
  { value: 'vite-react', label: 'Vite + React' },
  { value: 'express', label: 'Express + EJS (AWS)' },
  { value: 'spring-boot', label: 'Spring Boot + MariaDB' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java (javac)' },
  { value: 'python', label: 'Python' },
];

const SAMPLES: Partial<Record<PlaygroundLanguage, string>> = {
  c: '#include <stdio.h>\nint main(void) {\n  printf("Hello, C\\n");\n  return 0;\n}\n',
  cpp: '#include <iostream>\nint main() {\n  std::cout << "Hello, C++\\n";\n  return 0;\n}\n',
  java: 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, Java");\n  }\n}\n',
  python: 'print("Hello, Python")\n',
};

function isDone(status: PlaygroundRun['status']) {
  return status === 'finished' || status === 'failed';
}

export default function TeacherPlaygroundPage() {
  const [language, setLanguage] = useState<PlaygroundLanguage>('static');
  const [source, setSource] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [run, setRun] = useState<PlaygroundRun | null>(null);
  const [entryChoice, setEntryChoice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStatic = language === 'static';
  const isSpring = language === 'spring-boot';
  const isVite = language === 'vite-react';
  const isExpress = language === 'express';
  const isPreviewLang = isStatic || isSpring || isVite || isExpress;

  useEffect(() => {
    setSource(SAMPLES[language] ?? '');
    setFiles(null);
    setRun(null);
    setError(null);
  }, [language]);

  useEffect(() => {
    if (!run) return;
    if (isDone(run.status) || run.status === 'needs_entry' || run.status === 'created') return;

    const previewLive =
      run.status === 'running' &&
      (run.language === 'static' ||
        run.language === 'spring-boot' ||
        run.language === 'vite-react' ||
        run.language === 'express') &&
      !!run.previewUrl;
    // Đang chờ build: poll nhanh. Đã có preview: poll chậm để nhận hết hạn / dừng.
    const intervalMs = previewLive ? 10_000 : 800;

    let cancelled = false;
    const tick = async () => {
      try {
        const next = await getPlaygroundRun(run.id);
        if (!cancelled) setRun(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    const id = window.setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [run]);

  const startExecute = async (created: PlaygroundRun) => {
    setRun(created);
    if (created.status === 'needs_entry') {
      setEntryChoice(created.candidates?.[0] ?? '');
      return;
    }
    if (created.status === 'failed') return;
    const started = await executePlaygroundRun(created.id);
    setRun(started);
  };

  const onRun = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let created: PlaygroundRun;
      if (files && files.length > 0) {
        created = await uploadPlaygroundRun(language, Array.from(files));
      } else if (isStatic) {
        setError('Web tĩnh: upload zip/thư mục, hoặc bấm «Nạp sample web tĩnh»');
        return;
      } else if (isSpring) {
        setError('Spring Boot: upload project (pom.xml + src), hoặc bấm «Nạp sample Shopping»');
        return;
      } else if (isVite) {
        setError('Vite/React: upload project (package.json + src), hoặc bấm «Nạp sample PTUD»');
        return;
      } else if (isExpress) {
        setError('Express: upload project (app.js + package.json), hoặc bấm «Nạp sample CNM»');
        return;
      } else {
        created = await createPlaygroundRun(language, source);
      }
      await startExecute(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [files, isExpress, isSpring, isStatic, isVite, language, source]);

  const onSample = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const created = isSpring
        ? await createSampleSpringBootRun()
        : isVite
          ? await createSampleViteReactRun()
          : isExpress
            ? await createSampleExpressRun()
            : await createSampleStaticRun();
      await startExecute(created);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [isExpress, isSpring, isVite]);

  const onConfirmEntry = useCallback(async () => {
    if (!run || !entryChoice) return;
    setBusy(true);
    setError(null);
    try {
      const started = await executePlaygroundRun(run.id, entryChoice);
      setRun(started);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [entryChoice, run]);

  const onStop = useCallback(async () => {
    if (!run) return;
    setBusy(true);
    try {
      const stopped = await stopPlaygroundRun(run.id);
      setRun(stopped);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [run]);

  const terminalText = [
    run?.console.compileLog ? `$ compile\n${run.console.compileLog}` : null,
    run?.console.stdout != null && run.console.stdout !== '' ? run.console.stdout : null,
    run?.console.stderr ? `stderr:\n${run.console.stderr}` : null,
    run?.error ? `error: ${run.error}` : null,
    run?.console.exitCode != null ? `\n[exit ${run.console.exitCode}]` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Playground"
        description="Console, web tĩnh, Vite+React (npm build → nginx), hoặc Spring Boot + MariaDB. Lần đầu build image có thể vài phút."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-3">
          <label className="text-sm font-medium">
            Loại
            <select
              className="mt-1 flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
              value={language}
              onChange={(e) => setLanguage(e.target.value as PlaygroundLanguage)}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          {!isPreviewLang ? (
            <label className="text-sm font-medium">
              Dán source
              <textarea
                className="mt-1 min-h-[200px] w-full rounded-md border border-border bg-surface p-3 font-mono text-sm"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                spellCheck={false}
              />
            </label>
          ) : (
            <p className="text-sm text-muted-foreground">
              {isSpring ? (
                <>
                  Upload zip/thư mục có <code className="font-mono">pom.xml</code> +{' '}
                  <code className="font-mono">src/</code>. Sample:{' '}
                  <code className="font-mono">sample project/22681861_NguyenGiaBao_Shopping</code>.
                  Compose sẽ tạo MariaDB riêng (user/pass trùng mẫu vẫn OK).
                </>
              ) : isVite ? (
                <>
                  Upload zip/thư mục có <code className="font-mono">package.json</code>,{' '}
                  <code className="font-mono">src/</code>, <code className="font-mono">index.html</code>.
                  Sample: <code className="font-mono">sample project/PTUD</code>. Build{' '}
                  <code className="font-mono">npm run build</code> rồi nginx SPA.
                </>
              ) : isExpress ? (
                <>
                  Upload zip/thư mục có <code className="font-mono">app.js</code> +{' '}
                  <code className="font-mono">package.json</code> + views. Sample:{' '}
                  <code className="font-mono">sample project/CNM</code>. Cần env AWS
                  (DynamoDB/S3) trên API host.
                </>
              ) : (
                <>
                  Upload zip hoặc thư mục (giữ path{' '}
                  <code className="font-mono">html/css/js/img</code>). Sample:{' '}
                  <code className="font-mono">sample project/M18_NguyenThanhHuy_22699781</code>.
                </>
              )}
            </p>
          )}

          <label className="text-sm font-medium">
            Upload file / zip {isPreviewLang ? '/ thư mục' : ''}
            <input
              type="file"
              multiple
              {...(isPreviewLang ? ({ webkitdirectory: '', directory: '' } as object) : {})}
              className="mt-1 block w-full text-sm"
              onChange={(e) => setFiles(e.target.files)}
            />
          </label>
          {isPreviewLang ? (
            <label className="text-sm font-medium">
              Hoặc chọn zip
              <input
                type="file"
                accept=".zip,application/zip"
                className="mt-1 block w-full text-sm"
                onChange={(e) => setFiles(e.target.files)}
              />
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => void onRun()} disabled={busy}>
              {busy ? (
                'Đang xử lý…'
              ) : (
                <>
                  <Play className="h-4 w-4" aria-hidden />
                  Chạy
                </>
              )}
            </Button>
            {isPreviewLang ? (
              <Button type="button" variant="outline" onClick={() => void onSample()} disabled={busy}>
                {isSpring
                  ? 'Nạp sample Shopping'
                  : isVite
                    ? 'Nạp sample PTUD'
                    : isExpress
                      ? 'Nạp sample CNM'
                      : 'Nạp sample web tĩnh'}
              </Button>
            ) : null}
            {run?.status === 'running' && run.previewUrl ? (
              <Button type="button" variant="outline" onClick={() => void onStop()} disabled={busy}>
                <Square className="h-4 w-4" aria-hidden />
                Dừng preview
              </Button>
            ) : null}
            {files && files.length > 0 ? (
              <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" aria-hidden />
                {files.length} file
              </span>
            ) : null}
          </div>

          {run?.status === 'needs_entry' ? (
            <div className="rounded-md border border-border p-3">
              <p className="text-sm font-medium">Chọn file entry</p>
              <select
                className="mt-2 flex h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
                value={entryChoice}
                onChange={(e) => setEntryChoice(e.target.value)}
              >
                {(run.candidates ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                className="mt-2"
                onClick={() => void onConfirmEntry()}
                disabled={busy || !entryChoice}
              >
                Chạy với entry này
              </Button>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          {run ? (
            <p className="text-xs text-muted-foreground">
              status={run.status}
              {run.entryPath ? ` · entry=${run.entryPath}` : ''}
              {run.expiresAt ? ` · hết hạn ${run.expiresAt}` : ''}
            </p>
          ) : null}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            {isPreviewLang ||
            run?.language === 'static' ||
            run?.language === 'spring-boot' ||
            run?.language === 'vite-react' ||
            run?.language === 'express'
              ? 'Preview web'
              : 'Terminal'}
          </h2>

          {run?.previewUrl ? (
            <div className="flex flex-col gap-3 rounded-md border border-border p-4">
              <p className="text-sm">
                Preview đang chạy
                {run.language === 'spring-boot'
                  ? ' (Spring + MariaDB - lần đầu build Maven có thể chậm).'
                  : run.language === 'vite-react'
                    ? ' (Vite + React - lần đầu npm install có thể chậm).'
                    : run.language === 'express'
                      ? ' (Express - cần AWS env; list trống nếu chưa cấu hình bảng/bucket).'
                      : ' - mở tab mới để tương tác.'}
              </p>
              <Button asChild>
                <a href={run.previewUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Mở giao diện
                </a>
              </Button>
              <iframe
                title="static-preview"
                src={run.previewUrl}
                className="min-h-[360px] w-full rounded-md border border-border bg-white"
              />
            </div>
          ) : (
            <pre className="min-h-[360px] flex-1 overflow-auto rounded-md border border-border bg-foreground p-4 font-mono text-sm text-background whitespace-pre-wrap">
              {run?.status === 'queued' || (run?.status === 'running' && !run.previewUrl)
                ? 'Đang khởi động…'
                : terminalText ||
                  (isPreviewLang
                    ? isSpring
                      ? 'Nạp sample Shopping rồi Chạy (đợi Maven build…).'
                      : isVite
                        ? 'Nạp sample PTUD rồi Chạy (đợi npm build…).'
                        : isExpress
                          ? 'Nạp sample CNM rồi Chạy (cần AWS credentials trên API).'
                          : 'Nạp sample hoặc upload rồi Chạy.'
                    : 'Kết quả console hiện ở đây.')}
            </pre>
          )}
        </section>
      </div>
    </div>
  );
}
