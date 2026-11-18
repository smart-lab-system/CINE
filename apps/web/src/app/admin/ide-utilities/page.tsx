'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import {
  CATALOG_STATUS_LABEL,
  catalogFromScan,
  createCatalog,
  listCatalog,
  listViolations,
  type CatalogExtension,
  type CatalogStatus,
  type ViolationExtension,
} from '@/lib/api/ide-utilities';

type Tab = 'catalog' | 'violations';

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('vi-VN');
  } catch {
    return value;
  }
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return value;
  }
}

function statusBadgeClass(status: CatalogStatus) {
  switch (status) {
    case 'wildcard_approved':
      return 'bg-emerald-700/15 text-emerald-800 dark:text-emerald-300';
    case 'fully_approved':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
    case 'has_pending':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-300';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

export default function IdeUtilitiesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const basePath = pathname.startsWith('/teacher') ? '/teacher/ide-utilities' : '/admin/ide-utilities';

  const [tab, setTab] = useState<Tab>('catalog');
  const [catalog, setCatalog] = useState<CatalogExtension[]>([]);
  const [violations, setViolations] = useState<ViolationExtension[]>([]);
  const [expandedExt, setExpandedExt] = useState<string | null>(null);
  const [openVersionKey, setOpenVersionKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  const [newIdentifier, setNewIdentifier] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPublisher, setNewPublisher] = useState('');

  const reloadCatalog = useCallback(async () => {
    setCatalog(await listCatalog());
  }, []);

  const reloadViolations = useCallback(async () => {
    setViolations(await listViolations());
  }, []);

  useEffect(() => {
    void reloadCatalog().catch((e: Error) => setError(e.message));
  }, [reloadCatalog]);

  useEffect(() => {
    if (tab === 'violations') {
      void reloadViolations().catch((e: Error) => setError(e.message));
    }
  }, [tab, reloadViolations]);

  const onAddCatalog = async () => {
    if (!newIdentifier.trim() || !newDisplayName.trim() || !newPublisher.trim()) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await createCatalog({
        identifier: newIdentifier.trim(),
        displayName: newDisplayName.trim(),
        publisher: newPublisher.trim(),
      });
      setNewIdentifier('');
      setNewDisplayName('');
      setNewPublisher('');
      await reloadCatalog();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImportFromViolation = async (item: {
    extensionId: string;
    version: string | null;
    displayName?: string | null;
  }) => {
    const key = `${item.extensionId}@${item.version ?? ''}`;
    setImportingKey(key);
    setError(null);
    setInfo(null);
    try {
      const res = await catalogFromScan({
        extensionId: item.extensionId,
        version: item.version ?? undefined,
        displayName: item.displayName ?? undefined,
      });
      if (res.alreadyExists) {
        setInfo(`${item.extensionId}${item.version ? `@${item.version}` : ''} đã có trong catalog.`);
      } else if (res.createdExtension) {
        setInfo(`Đã thêm ${item.extensionId} vào catalog.`);
      } else if (res.createdVersion) {
        setInfo(`Đã thêm phiên bản ${item.version} vào ${item.extensionId}.`);
      } else {
        setInfo('Đã cập nhật catalog.');
      }
      await Promise.all([reloadCatalog(), reloadViolations()]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportingKey(null);
    }
  };

  return (
    <div className="-mx-4 -mb-6 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-6">
      <div className="border-b px-4 py-4 md:px-6">
        <PageHeader
          title="Quản lý tiện ích IDE"
          description="Catalog extension VS Code (duyệt theo phiên bản / *) và danh sách extension vi phạm chưa được duyệt."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['catalog', 'Catalog extension'],
              ['violations', 'Vi phạm'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                tab === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              }`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {info && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{info}</p>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 md:px-6">
        {tab === 'catalog' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="Extension name"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
              <input
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="Publisher"
                value={newPublisher}
                onChange={(e) => setNewPublisher(e.target.value)}
              />
              <input
                className="rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
                placeholder="publisher.name"
                value={newIdentifier}
                onChange={(e) => setNewIdentifier(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                onClick={() => void onAddCatalog()}
              >
                Thêm extension
              </button>
            </div>

            {catalog.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có extension nào trong catalog.</p>
            ) : (
              <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Extension name</th>
                      <th className="px-3 py-2.5 font-medium">Publisher</th>
                      <th className="px-3 py-2.5 font-medium">Identifier</th>
                      <th className="px-3 py-2.5 font-medium">Published</th>
                      <th className="px-3 py-2.5 font-medium">Last Released</th>
                      <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.map((ext) => (
                      <tr
                        key={ext.id}
                        className="cursor-pointer border-t hover:bg-muted/60"
                        onClick={() => router.push(`${basePath}/${ext.id}`)}
                      >
                        <td className="px-3 py-2.5 font-medium">{ext.displayName}</td>
                        <td className="px-3 py-2.5">{ext.publisher}</td>
                        <td className="px-3 py-2.5 font-mono text-xs">{ext.identifier}</td>
                        <td className="px-3 py-2.5">{formatDate(ext.publishedAt)}</td>
                        <td className="px-3 py-2.5">{formatDate(ext.lastReleasedAt)}</td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ext.catalogStatus)}`}
                          >
                            {CATALOG_STATUS_LABEL[ext.catalogStatus]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {tab === 'violations' && (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            {violations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có extension vi phạm chưa được duyệt.
              </p>
            ) : (
              <div className="overflow-auto rounded-md border">
                <table className="w-full min-w-[960px] text-sm">
                  <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                    <tr className="text-left text-muted-foreground">
                      <th className="px-3 py-2.5 font-medium">Extension name</th>
                      <th className="px-3 py-2.5 font-medium">Publisher</th>
                      <th className="px-3 py-2.5 font-medium">Identifier</th>
                      <th className="px-3 py-2.5 font-medium"># Version</th>
                      <th className="px-3 py-2.5 font-medium"># Lần</th>
                      <th className="px-3 py-2.5 font-medium"># SV</th>
                      <th className="px-3 py-2.5 font-medium">Catalog</th>
                    </tr>
                  </thead>
                  <tbody>
                    {violations.map((ext) => {
                      const expanded = expandedExt === ext.extensionId;
                      return (
                        <ViolationExtensionRows
                          key={ext.extensionId}
                          ext={ext}
                          expanded={expanded}
                          openVersionKey={openVersionKey}
                          importingKey={importingKey}
                          onToggle={() => {
                            setExpandedExt(expanded ? null : ext.extensionId);
                            setOpenVersionKey(null);
                          }}
                          onToggleVersion={(key) =>
                            setOpenVersionKey((cur) => (cur === key ? null : key))
                          }
                          onImport={(version, displayName) =>
                            void onImportFromViolation({
                              extensionId: ext.extensionId,
                              version,
                              displayName,
                            })
                          }
                          onOpenCatalog={() => {
                            if (ext.catalogExtensionPk) {
                              router.push(`${basePath}/${ext.catalogExtensionPk}`);
                            }
                          }}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function ViolationExtensionRows({
  ext,
  expanded,
  openVersionKey,
  importingKey,
  onToggle,
  onToggleVersion,
  onImport,
  onOpenCatalog,
}: {
  ext: ViolationExtension;
  expanded: boolean;
  openVersionKey: string | null;
  importingKey: string | null;
  onToggle: () => void;
  onToggleVersion: (key: string) => void;
  onImport: (version: string | null, displayName: string | null) => void;
  onOpenCatalog: () => void;
}) {
  return (
    <>
      <tr className="cursor-pointer border-t hover:bg-muted/60" onClick={onToggle}>
        <td className="px-3 py-2.5 font-medium">{ext.displayName ?? '—'}</td>
        <td className="px-3 py-2.5">{ext.publisher ?? '—'}</td>
        <td className="px-3 py-2.5 font-mono text-xs">{ext.extensionId}</td>
        <td className="px-3 py-2.5">{ext.versionCount}</td>
        <td className="px-3 py-2.5">{ext.incidentCount}</td>
        <td className="px-3 py-2.5">{ext.studentCount}</td>
        <td className="px-3 py-2.5">
          {ext.inCatalog ? (
            <button
              type="button"
              className="text-primary"
              onClick={(e) => {
                e.stopPropagation();
                onOpenCatalog();
              }}
            >
              Trong catalog
            </button>
          ) : (
            <span className="text-muted-foreground">Chưa có</span>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t bg-muted/20">
          <td colSpan={7} className="px-3 py-3">
            <div className="space-y-2">
              {ext.versions.map((ver) => {
                const vKey = `${ext.extensionId}@${ver.version ?? ''}`;
                const open = openVersionKey === vKey;
                const importKey = vKey;
                return (
                  <div key={vKey} className="rounded-md border bg-background">
                    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
                        onClick={() => onToggleVersion(vKey)}
                        aria-expanded={open}
                      >
                        <span className="text-muted-foreground" aria-hidden>
                          {open ? '▾' : '▸'}
                        </span>
                        <span className="font-mono font-medium">{ver.version ?? '(không có version)'}</span>
                        <span className="text-xs text-muted-foreground">
                          {ver.incidentCount} lần vi phạm
                        </span>
                      </button>
                      <button
                        type="button"
                        disabled={importingKey === importKey}
                        className="rounded-md border px-2 py-1 text-xs text-primary disabled:opacity-50"
                        onClick={() => onImport(ver.version, ext.displayName)}
                      >
                        {importingKey === importKey ? 'Đang thêm…' : 'Thêm vào catalog'}
                      </button>
                    </div>
                    {open && (
                      <div className="overflow-auto border-t">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead>
                            <tr className="text-left text-muted-foreground">
                              <th className="px-3 py-2 font-medium">Kỳ thi</th>
                              <th className="px-3 py-2 font-medium">Môn</th>
                              <th className="px-3 py-2 font-medium">MSSV</th>
                              <th className="px-3 py-2 font-medium">Họ tên</th>
                              <th className="px-3 py-2 font-medium">Máy</th>
                              <th className="px-3 py-2 font-medium">Thời điểm</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ver.incidents.map((inc) => (
                              <tr key={inc.scanItemId} className="border-t">
                                <td className="px-3 py-2">{inc.examSessionName ?? '—'}</td>
                                <td className="px-3 py-2">{inc.courseName ?? '—'}</td>
                                <td className="px-3 py-2 font-mono text-xs">{inc.studentMssv}</td>
                                <td className="px-3 py-2">{inc.studentFullName ?? '—'}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {inc.machineName ?? inc.machineId}
                                </td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                  {formatDateTime(inc.scannedAt)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
