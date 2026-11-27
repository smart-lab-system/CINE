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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Tab = 'catalog' | 'violations';

function formatDate(value: string | null) {
  if (!value) return '-';
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
      return 'bg-success-subtle text-success-strong';
    case 'fully_approved':
      return 'bg-success-subtle text-success-strong';
    case 'has_pending':
      return 'bg-warning-subtle text-warning-strong';
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
        setInfo(`${item.extensionId}${item.version ? `@${item.version}` : ''} đã có trong danh mục.`);
      } else if (res.createdExtension) {
        setInfo(`Đã thêm ${item.extensionId} vào danh mục.`);
      } else if (res.createdVersion) {
        setInfo(`Đã thêm phiên bản ${item.version} vào ${item.extensionId}.`);
      } else {
        setInfo('Đã cập nhật danh mục.');
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
          description="Danh mục tiện ích VS Code (duyệt theo phiên bản / *) và danh sách tiện ích vi phạm chưa được duyệt."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['catalog', 'Danh mục tiện ích'],
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
        {info && <p className="mt-3 text-sm text-success-strong">{info}</p>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4 md:px-6">
        {tab === 'catalog' && (
          <section className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="Tên tiện ích"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
              <input
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="Nhà phát hành"
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
                Thêm tiện ích
              </button>
            </div>

            {catalog.length === 0 ? (
              <p className="text-sm text-muted-foreground">Chưa có tiện ích nào trong danh mục.</p>
            ) : (
              <Table container={{ className: 'max-h-[65vh] rounded-md border' }} className="w-full min-w-[960px] text-sm">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                  <TableRow className="text-left text-muted-foreground">
                    <TableHead className="px-3 py-2.5 font-medium">Tên tiện ích</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Nhà phát hành</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Mã định danh</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Ngày xuất bản</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Phát hành gần nhất</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catalog.map((ext) => (
                    <TableRow
                      key={ext.id}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => router.push(`${basePath}/${ext.id}`)}
                    >
                      <TableCell className="px-3 py-2.5 font-medium">{ext.displayName}</TableCell>
                      <TableCell className="px-3 py-2.5">{ext.publisher}</TableCell>
                      <TableCell className="px-3 py-2.5 font-mono text-xs">{ext.identifier}</TableCell>
                      <TableCell className="px-3 py-2.5">{formatDate(ext.publishedAt)}</TableCell>
                      <TableCell className="px-3 py-2.5">{formatDate(ext.lastReleasedAt)}</TableCell>
                      <TableCell className="px-3 py-2.5">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(ext.catalogStatus)}`}
                        >
                          {CATALOG_STATUS_LABEL[ext.catalogStatus]}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        )}

        {tab === 'violations' && (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            {violations.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Chưa có tiện ích vi phạm chưa được duyệt.
              </p>
            ) : (
              <Table container={{ className: 'rounded-md border' }} className="w-full min-w-[960px] text-sm">
                <TableHeader className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                  <TableRow className="text-left text-muted-foreground">
                    <TableHead className="px-3 py-2.5 font-medium">Tên tiện ích</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Nhà phát hành</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Mã định danh</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Số phiên bản</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Số lần</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Số sinh viên</TableHead>
                    <TableHead className="px-3 py-2.5 font-medium">Danh mục</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
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
                </TableBody>
              </Table>
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
      <TableRow className="cursor-pointer hover:bg-muted/60" onClick={onToggle}>
        <TableCell className="px-3 py-2.5 font-medium">{ext.displayName ?? '-'}</TableCell>
        <TableCell className="px-3 py-2.5">{ext.publisher ?? '-'}</TableCell>
        <TableCell className="px-3 py-2.5 font-mono text-xs">{ext.extensionId}</TableCell>
        <TableCell className="px-3 py-2.5">{ext.versionCount}</TableCell>
        <TableCell className="px-3 py-2.5">{ext.incidentCount}</TableCell>
        <TableCell className="px-3 py-2.5">{ext.studentCount}</TableCell>
        <TableCell className="px-3 py-2.5">
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
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={7} className="px-3 py-3">
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
                        {importingKey === importKey ? 'Đang thêm…' : 'Thêm vào danh mục'}
                      </button>
                    </div>
                    {open && (
                      <Table container={{ className: 'border-t' }} className="w-full min-w-[720px] text-sm">
                        <TableHeader>
                          <TableRow className="text-left text-muted-foreground">
                            <TableHead className="px-3 py-2 font-medium">Kỳ thi</TableHead>
                            <TableHead className="px-3 py-2 font-medium">Môn</TableHead>
                            <TableHead className="px-3 py-2 font-medium">MSSV</TableHead>
                            <TableHead className="px-3 py-2 font-medium">Họ tên</TableHead>
                            <TableHead className="px-3 py-2 font-medium">Máy</TableHead>
                            <TableHead className="px-3 py-2 font-medium">Thời điểm</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ver.incidents.map((inc) => (
                            <TableRow key={inc.scanItemId}>
                              <TableCell className="px-3 py-2">{inc.examSessionName ?? '-'}</TableCell>
                              <TableCell className="px-3 py-2">{inc.courseName ?? '-'}</TableCell>
                              <TableCell className="px-3 py-2 font-mono text-xs">{inc.studentMssv}</TableCell>
                              <TableCell className="px-3 py-2">{inc.studentFullName ?? '-'}</TableCell>
                              <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                                {inc.machineName ?? inc.machineId}
                              </TableCell>
                              <TableCell className="px-3 py-2 text-xs text-muted-foreground">
                                {formatDateTime(inc.scannedAt)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
