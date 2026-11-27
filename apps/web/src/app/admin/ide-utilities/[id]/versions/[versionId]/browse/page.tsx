'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import {
  getCatalog,
  getVersionBrowse,
  getVersionBrowseFile,
  getVersionNormalizedSources,
  postVersionJplagDemo,
  requestVersionExtract,
  type ExtractTreeNode,
  type JplagDemoLanguage,
  type JplagDemoResult,
  type JplagDemoRunProfile,
  type NormalizedSourcesView,
  type VersionBrowseView,
} from '@/lib/api/ide-utilities';
import { JplagComparisonViewer } from '@/components/jplag/jplag-comparison-viewer';

const JPLAG_DEMO_LANGUAGE_OPTIONS: { value: JplagDemoLanguage; label: string }[] = [
  { value: 'javascript', label: 'JavaScript / JSX' },
  { value: 'typescript', label: 'TypeScript / TSX' },
  { value: 'cpp', label: 'C / C++' },
  { value: 'python3', label: 'Python' },
  { value: 'java', label: 'Java' },
];

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
    /\.(json|xml|vsixmanifest|js|cjs|mjs|ts|tsx|jsx|css|html?|md|txt|map|yml|yaml|svg|gitignore|npmrc)$/.test(
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
              className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-sm hover:bg-muted"
              style={{ paddingLeft: 8 + depth * 12 }}
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

export default function IdeExtensionVersionBrowsePage() {
  const params = useParams<{ id: string; versionId: string }>();
  const pathname = usePathname();
  const extensionId = params.id;
  const versionId = params.versionId;
  const catalogHref = pathname.replace(/\/versions\/[^/]+\/browse\/?$/, '');

  const [browse, setBrowse] = useState<VersionBrowseView | null>(null);
  const [extensionLabel, setExtensionLabel] = useState('');
  const [versionLabel, setVersionLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [selectedFile, setSelectedFile] = useState<string[] | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<'files' | 'normalized'>('files');
  const [normalized, setNormalized] = useState<NormalizedSourcesView | null>(null);
  const [normalizedBusy, setNormalizedBusy] = useState(false);
  const [normalizedError, setNormalizedError] = useState<string | null>(null);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(null);
  const [jplagLanguage, setJplagLanguage] = useState<JplagDemoLanguage>('javascript');
  const [jplagZip, setJplagZip] = useState<File | null>(null);
  const [jplagFolderFiles, setJplagFolderFiles] = useState<File[]>([]);
  const [jplagBusy, setJplagBusy] = useState(false);
  const [jplagError, setJplagError] = useState<string | null>(null);
  const [jplagResult, setJplagResult] = useState<JplagDemoResult | null>(null);
  const [jplagViewProfile, setJplagViewProfile] = useState<JplagDemoRunProfile>('text');
  const [preview, setPreview] = useState<{
    path: string;
    text: string | null;
    binary: boolean;
    loading: boolean;
    error: string | null;
  } | null>(null);

  const loadBrowse = useCallback(async () => {
    const view = await getVersionBrowse(versionId);
    setBrowse(view);
    return view;
  }, [versionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [detail, view] = await Promise.all([getCatalog(extensionId), loadBrowse()]);
        if (cancelled) return;
        setExtensionLabel(detail.displayName || detail.identifier);
        const ver = detail.versions.find((v) => v.id === versionId);
        setVersionLabel(ver?.version ?? versionId);
        if (view.status === 'none' && view.artifact.storageKey) {
          await requestVersionExtract(versionId);
          if (!cancelled) await loadBrowse();
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Không tải được.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [extensionId, versionId, loadBrowse]);

  useEffect(() => {
    if (!browse || (browse.status !== 'pending' && browse.status !== 'extracting')) return;
    const t = window.setInterval(() => {
      void loadBrowse().catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(t);
  }, [browse, loadBrowse]);

  // Tải lỗi thì `browse` không bao giờ được gán: không được để chữ "Đang tải…" đứng cạnh thông báo lỗi.
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

  const onSelect = (parts: string[], isDir: boolean) => {
    if (isDir) {
      setFolderPath(parts);
      setSelectedFile(null);
      setPreview(null);
      return;
    }
    setSelectedFile(parts);
    const parent = parts.slice(0, -1);
    setFolderPath(parent);
    void openFile(parts.join('/'));
  };

  const openFile = async (path: string) => {
    setPreview({ path, text: null, binary: false, loading: true, error: null });
    try {
      const meta = await getVersionBrowseFile(versionId, path);
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

  const retryExtract = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestVersionExtract(versionId);
      await loadBrowse();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể giải nén lại.');
    } finally {
      setBusy(false);
    }
  };

  const openNormalized = async () => {
    setViewMode('normalized');
    setNormalizedError(null);
    if (normalized) return;
    setNormalizedBusy(true);
    try {
      const data = await getVersionNormalizedSources(versionId);
      setNormalized(data);
      setSelectedSnippetId(data.items[0]?.id ?? null);
    } catch (e) {
      setNormalizedError(
        e instanceof Error ? e.message : 'Không tải được mã đã chuẩn hóa.',
      );
    } finally {
      setNormalizedBusy(false);
    }
  };

  const selectedSnippet =
    normalized?.items.find((i) => i.id === selectedSnippetId) ?? null;

  const runJplagDemo = async () => {
    setJplagError(null);
    setJplagResult(null);
    if (!jplagZip && jplagFolderFiles.length === 0) {
      setJplagError('Chọn ZIP hoặc thư mục mã nguồn để so sánh.');
      return;
    }
    setJplagBusy(true);
    try {
      const result = await postVersionJplagDemo(versionId, {
        language: jplagLanguage,
        archive: jplagZip,
        files: jplagFolderFiles,
      });
      setJplagResult(result);
      setJplagViewProfile('text');
    } catch (e) {
      setJplagError(e instanceof Error ? e.message : 'So sánh JPlag thất bại.');
    } finally {
      setJplagBusy(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[480px] flex-col gap-3">
      <PageHeader
        title="Xem nội dung VSIX"
        description={`${extensionLabel}${versionLabel ? ` · ${versionLabel}` : ''}`}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href={catalogHref} className="text-primary underline-offset-2 hover:underline">
          ← Quay lại danh mục
        </Link>
        {browse?.status === 'ready' ? (
          viewMode === 'files' ? (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline disabled:opacity-50"
              disabled={normalizedBusy}
              onClick={() => void openNormalized()}
            >
              Xem mã đã chuẩn hóa
            </button>
          ) : (
            <button
              type="button"
              className="text-primary underline-offset-2 hover:underline"
              onClick={() => setViewMode('files')}
            >
              ← Quay lại cây file VSIX
            </button>
          )
        ) : null}
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
        <p className="text-sm text-muted-foreground">Đang giải nén nội dung .vsix…</p>
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
      ) : viewMode === 'normalized' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {normalized && normalized.items.length > 0 ? (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <p className="font-medium">So sánh demo (JPlag)</p>
              <p className="text-xs text-muted-foreground">
                Mỗi lần so luôn chạy hai profile: <code className="font-mono">text</code> và{' '}
                <code className="font-mono">language</code> (JS/TS = SWC + parser). Cần Java + JAR
                trên máy chạy API.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  Ngôn ngữ
                  <select
                    className="h-9 rounded-md border bg-background px-2 text-sm"
                    value={jplagLanguage}
                    onChange={(e) => setJplagLanguage(e.target.value as JplagDemoLanguage)}
                  >
                    {JPLAG_DEMO_LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  ZIP
                  <input
                    type="file"
                    accept=".zip,application/zip"
                    className="max-w-[220px] text-xs"
                    onChange={(e) => setJplagZip(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  Thư mục
                  <input
                    type="file"
                    className="max-w-[220px] text-xs"
                    multiple
                    ref={(el) => {
                      if (!el) return;
                      el.setAttribute('webkitdirectory', '');
                      el.setAttribute('directory', '');
                    }}
                    onChange={(e) => setJplagFolderFiles(Array.from(e.target.files ?? []))}
                  />
                </label>
                <button
                  type="button"
                  disabled={jplagBusy}
                  className="h-9 rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-50"
                  onClick={() => void runJplagDemo()}
                >
                  {jplagBusy ? 'Đang so (text + language)…' : 'So sánh (demo JPlag)'}
                </button>
              </div>
              {jplagFolderFiles.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  Đã chọn thư mục: {jplagFolderFiles.length} file
                </p>
              ) : null}
              {jplagError ? <p className="text-sm text-destructive">{jplagError}</p> : null}
              {jplagResult ? (
                <div className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">{jplagResult.message}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {jplagResult.runs.map((run) => (
                      <div
                        key={run.profile}
                        className={`rounded-md border p-2 ${
                          jplagViewProfile === run.profile ? 'border-primary' : ''
                        }`}
                      >
                        <button
                          type="button"
                          className="w-full text-left"
                          onClick={() => setJplagViewProfile(run.profile)}
                        >
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {run.profile}
                          </p>
                          <p className="text-lg font-semibold">
                            {(run.similarity * 100).toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            <code className="font-mono">-l {run.cliLanguage}</code>
                            {' · '}
                            {run.extensionFileCount}/{run.compareFileCount} files
                          </p>
                        </button>
                        {run.reportUrl ? (
                          <a
                            href={run.reportUrl}
                            className="mt-1 inline-block text-xs text-primary underline-offset-2 hover:underline"
                            download={run.reportFilename ?? 'report.jplag'}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Tải .jplag
                          </a>
                        ) : null}
                      </div>
                    ))}
                  </div>
                  {jplagResult.reportExpiresIn ? (
                    <p className="text-xs text-muted-foreground">
                      Link tải hết hạn sau ~{Math.round(jplagResult.reportExpiresIn / 60)} phút.
                    </p>
                  ) : null}
                  <div className="flex gap-2 text-xs">
                    {(['text', 'language'] as const).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={`rounded px-2 py-1 ${
                          jplagViewProfile === p
                            ? 'bg-primary text-primary-foreground'
                            : 'border bg-background'
                        }`}
                        onClick={() => setJplagViewProfile(p)}
                      >
                        Xem highlight: {p}
                      </button>
                    ))}
                  </div>
                  {(() => {
                    const run =
                      jplagResult.runs.find((r) => r.profile === jplagViewProfile) ??
                      jplagResult.runs[0];
                    return run ? <JplagComparisonViewer run={run} /> : null;
                  })()}
                </div>
              ) : null}
            </div>
          ) : null}
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden rounded-md border md:grid-cols-[280px_1fr]">
          <aside className="min-h-0 overflow-auto border-b bg-muted/20 p-2 md:border-b-0 md:border-r">
            <p className="mb-2 px-1 text-xs text-muted-foreground">
              Mã từ contributes.snippets
              {normalized?.packageName ? ` · ${normalized.packageName}` : ''}
            </p>
            {normalizedBusy ? (
              <p className="px-1 text-sm text-muted-foreground">Đang chuẩn hóa…</p>
            ) : normalizedError ? (
              <p className="px-1 text-sm text-destructive">{normalizedError}</p>
            ) : !normalized || normalized.items.length === 0 ? (
              <p className="px-1 text-sm text-muted-foreground">
                {normalized?.mode === 'none'
                  ? 'Không tìm thấy contributes.snippets trong package.json.'
                  : 'Không có snippet nào.'}
              </p>
            ) : (
              normalized.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-sm hover:bg-muted ${
                    selectedSnippetId === item.id ? 'bg-muted' : ''
                  }`}
                  onClick={() => setSelectedSnippetId(item.id)}
                >
                  <span className="truncate font-mono text-xs">{item.prefix}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.title}</span>
                </button>
              ))
            )}
          </aside>
          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="border-b px-3 py-2 text-xs text-muted-foreground">
              {selectedSnippet ? (
                <>
                  <span className="font-mono text-foreground">{selectedSnippet.prefix}</span>
                  {selectedSnippet.truncated ? ' · đã cắt bớt' : ''}
                  {' · '}
                  <span className="font-mono">{selectedSnippet.path}</span>
                </>
              ) : (
                'Chọn một snippet để xem mã đã bung từ body.'
              )}
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              {selectedSnippet ? (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
                  {selectedSnippet.content}
                </pre>
              ) : null}
            </div>
          </section>
        </div>
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
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Tên</th>
                      <th className="px-3 py-2 font-medium">Loại</th>
                      <th className="px-3 py-2 font-medium">Kích thước</th>
                    </tr>
                  </thead>
                  <tbody>
                    {folderChildren.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-4 text-muted-foreground">
                          Thư mục trống.
                        </td>
                      </tr>
                    ) : (
                      folderChildren.map((node) => {
                        const parts = [...folderPath, node.name];
                        return (
                          <tr key={parts.join('/')} className="border-t">
                            <td className="px-3 py-2 font-mono text-xs">
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
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {node.type === 'dir' ? 'Thư mục' : 'File'}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {node.type === 'file' ? formatSize(node.size) : '-'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
