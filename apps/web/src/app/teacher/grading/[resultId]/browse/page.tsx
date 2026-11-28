'use client';

import { Suspense, use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  getSubmissionBrowse,
  getSubmissionBrowseFile,
  requestSubmissionExtract,
  type ExtractTreeNode,
  type SubmissionBrowseView,
} from '@/lib/api/submission-browse';

function formatSize(bytes: number | null | undefined) {
  if (bytes == null || Number.isNaN(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function findNode(nodes: ExtractTreeNode[], parts: string[]): ExtractTreeNode[] | null {
  if (parts.length === 0) return nodes;
  const [head, ...rest] = parts;
  const hit = nodes.find((n) => n.name === head);
  if (!hit) return null;
  if (hit.type === 'file') return rest.length === 0 ? nodes : null;
  return findNode(hit.children, rest);
}

function isProbablyText(path: string, sample: Uint8Array): boolean {
  const lower = path.toLowerCase();
  if (
    /\.(json|xml|js|cjs|mjs|ts|tsx|jsx|css|html?|md|txt|yml|yaml|svg|gitignore|cpp|cc|cxx|c|h|hpp|java|py|cs|go|rs|rb|php|kt|scala)$/.test(
      lower,
    )
  ) {
    return true;
  }
  const check = sample.subarray(0, Math.min(sample.length, 800));
  let suspicious = 0;
  for (const b of check) {
    if (b === 0) return false;
    if (b < 7 || (b > 13 && b < 32)) suspicious += 1;
  }
  return suspicious / Math.max(check.length, 1) < 0.1;
}

function TreeRows({
  nodes,
  depth,
  currentPath,
  expanded,
  onToggle,
  onSelect,
}: {
  nodes: ExtractTreeNode[];
  depth: number;
  currentPath: string[];
  expanded: Set<string>;
  onToggle: (pathKey: string) => void;
  onSelect: (parts: string[], isDir: boolean) => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        const parts = [...currentPath, node.name];
        const pathKey = parts.join('/');
        const isDir = node.type === 'dir';
        const open = expanded.has(pathKey);
        return (
          <div key={pathKey}>
            <button
              type="button"
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left hover:bg-muted"
              style={{ paddingLeft: `${depth * 12 + 4}px` }}
              onClick={() => {
                if (isDir) onToggle(pathKey);
                onSelect(parts, isDir);
              }}
            >
              <span className="w-3 shrink-0 text-muted-foreground">
                {isDir ? (open ? '▾' : '▸') : '·'}
              </span>
              <span className="truncate font-mono text-xs">{node.name}</span>
            </button>
            {isDir && open ? (
              <TreeRows
                nodes={node.children}
                depth={depth + 1}
                currentPath={parts}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            ) : null}
          </div>
        );
      })}
    </>
  );
}

/** `useSearchParams` đòi ranh giới Suspense khi build / prerender. */
export default function SubmissionBrowsePage({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <SubmissionBrowsePageInner params={params} />
    </Suspense>
  );
}

function SubmissionBrowsePageInner({
  params,
}: {
  params: Promise<{ resultId: string }>;
}) {
  const { resultId } = use(params);
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';
  const backHref = sessionId
    ? `/teacher/grading/${resultId}?sessionId=${sessionId}`
    : `/teacher/grading/${resultId}`;

  const [browse, setBrowse] = useState<SubmissionBrowseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [preview, setPreview] = useState<{
    path: string;
    text: string | null;
    binary: boolean;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const loadBrowse = useCallback(async () => {
    const view = await getSubmissionBrowse(resultId);
    setBrowse(view);
    return view;
  }, [resultId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const view = await loadBrowse();
        if (cancelled) return;
        if (view.status === 'none') {
          await requestSubmissionExtract(resultId);
          if (!cancelled) await loadBrowse();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không tải được.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resultId, loadBrowse]);

  useEffect(() => {
    if (!browse || (browse.status !== 'pending' && browse.status !== 'extracting')) return;
    const t = window.setInterval(() => {
      void loadBrowse().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
  }, [browse, loadBrowse]);

  const retryLoad = useCallback(async () => {
    setError(null);
    try {
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được.');
    }
  }, [loadBrowse]);

  const root = browse?.tree?.root ?? [];

  const folderChildren = useMemo(() => {
    const found = findNode(root, folderPath);
    return found ?? [];
  }, [root, folderPath]);

  const breadcrumbParts = selectedFile ?? folderPath;

  const openFile = async (path: string) => {
    setPreview({ path, text: null, binary: false, loading: true, error: null });
    try {
      const meta = await getSubmissionBrowseFile(resultId, path);
      const res = await fetch(meta.downloadUrl);
      if (!res.ok) throw new Error(`Không tải được nội dung (HTTP ${res.status}).`);
      const buf = new Uint8Array(await res.arrayBuffer());
      if (!isProbablyText(path, buf)) {
        setPreview({ path, text: null, binary: true, loading: false, error: null });
        return;
      }
      const text = new TextDecoder('utf-8', { fatal: false }).decode(buf);
      setPreview({ path, text, binary: false, loading: false, error: null });
    } catch (e) {
      setPreview({
        path,
        text: null,
        binary: false,
        loading: false,
        error: e instanceof Error ? e.message : 'Lỗi tải file.',
      });
    }
  };

  const onSelect = (parts: string[], isDir: boolean) => {
    if (isDir) {
      setFolderPath(parts);
      setSelectedFile(null);
      setPreview(null);
      return;
    }
    setSelectedFile(parts);
    setFolderPath(parts.slice(0, -1));
    void openFile(parts.join('/'));
  };

  const retryExtract = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestSubmissionExtract(resultId);
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể giải nén lại.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[480px] flex-col gap-3">
      <PageHeader
        title="Xem bài nộp"
        description={browse?.fileName ? browse.fileName : resultId}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={backHref} className="text-primary underline-offset-2 hover:underline">
          ← Quay lại bàn chấm
        </Link>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!browse ? (
        error ? (
          <button type="button" className="w-fit text-sm text-primary" onClick={() => void retryLoad()}>
            Thử tải lại
          </button>
        ) : (
          <p className="text-sm text-muted-foreground">Đang tải…</p>
        )
      ) : browse.status === 'pending' || browse.status === 'extracting' ? (
        <p className="text-sm text-muted-foreground">Đang chuẩn bị nội dung bài nộp…</p>
      ) : browse.status === 'failed' ? (
        <div className="space-y-2 rounded-md border border-destructive/30 p-4 text-sm">
          <p className="text-destructive">{browse.error || 'Giải nén thất bại.'}</p>
          <button
            type="button"
            disabled={busy}
            className="text-primary disabled:opacity-50"
            onClick={() => void retryExtract()}
          >
            Thử giải nén lại
          </button>
        </div>
      ) : browse.status === 'none' ? (
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Chưa giải nén nội dung.</p>
          <button
            type="button"
            disabled={busy}
            className="text-primary disabled:opacity-50"
            onClick={() => void retryExtract()}
          >
            Bắt đầu giải nén
          </button>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden rounded-md border md:grid-cols-[260px_1fr]">
          <aside className="min-h-0 overflow-auto border-b bg-muted/20 p-2 md:border-b-0 md:border-r">
            <TreeRows
              nodes={root}
              depth={0}
              currentPath={[]}
              expanded={expanded}
              onToggle={(key) => {
                setExpanded((prev) => {
                  const next = new Set(prev);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                });
              }}
              onSelect={onSelect}
            />
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            <nav className="flex flex-wrap items-center gap-1 border-b px-3 py-2 text-xs font-mono">
              <button
                type="button"
                className="text-primary hover:underline"
                onClick={() => {
                  setFolderPath([]);
                  setSelectedFile(null);
                  setPreview(null);
                }}
              >
                /
              </button>
              {breadcrumbParts.map((part, i) => {
                const parts = breadcrumbParts.slice(0, i + 1);
                const isLast = i === breadcrumbParts.length - 1;
                return (
                  <span key={parts.join('/')} className="flex items-center gap-1">
                    <span className="text-muted-foreground">/</span>
                    {isLast ? (
                      <span>{part}</span>
                    ) : (
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => {
                          setFolderPath(parts);
                          setSelectedFile(null);
                          setPreview(null);
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            for (let j = 1; j <= parts.length; j += 1) {
                              next.add(parts.slice(0, j).join('/'));
                            }
                            return next;
                          });
                        }}
                      >
                        {part}
                      </button>
                    )}
                  </span>
                );
              })}
            </nav>

            {selectedFile && preview ? (
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {preview.loading ? (
                  <p className="text-sm text-muted-foreground">Đang tải file…</p>
                ) : preview.error ? (
                  <p className="text-sm text-destructive">{preview.error}</p>
                ) : preview.binary ? (
                  <p className="text-sm text-muted-foreground">
                    Không xem trước được file nhị phân ({preview.path}).
                  </p>
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                    {preview.text}
                  </pre>
                )}
              </div>
            ) : (
              <Table container={{ className: 'max-h-[65vh]' }} className="w-full text-sm">
                <TableHeader className="sticky top-0 bg-background text-left text-muted-foreground">
                  <TableRow>
                    <TableHead className="px-3 py-2 font-medium">Tên</TableHead>
                    <TableHead className="px-3 py-2 font-medium">Loại</TableHead>
                    <TableHead className="px-3 py-2 font-medium">Kích thước</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folderChildren.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="px-3 py-4 text-muted-foreground">
                        Thư mục trống.
                      </TableCell>
                    </TableRow>
                  ) : (
                    folderChildren.map((node) => {
                      const parts = [...folderPath, node.name];
                      return (
                        <TableRow key={parts.join('/')}>
                          <TableCell className="px-3 py-2 font-mono text-xs">
                            <button
                              type="button"
                              className="text-left text-primary hover:underline"
                              onClick={() => {
                                if (node.type === 'dir') {
                                  setExpanded((prev) => new Set(prev).add(parts.join('/')));
                                }
                                onSelect(parts, node.type === 'dir');
                              }}
                            >
                              {node.name}
                            </button>
                          </TableCell>
                          <TableCell className="px-3 py-2 text-muted-foreground">
                            {node.type === 'dir' ? 'Thư mục' : 'File'}
                          </TableCell>
                          <TableCell className="px-3 py-2 text-muted-foreground">
                            {node.type === 'file' ? formatSize(node.size) : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
