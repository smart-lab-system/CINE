'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import {
  addCourseItem,
  approveItem,
  catalogFromScan,
  CATALOG_STATUS_LABEL,
  createCatalog,
  getScan,
  listCatalog,
  listCourseItems,
  listScans,
  rejectItem,
  removeItem,
  type CatalogExtension,
  type CatalogStatus,
  type ExtensionScan,
  type PolicyItem,
} from '@/lib/api/ide-utilities';

type Tab = 'catalog' | 'course' | 'results';

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('vi-VN');
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
  const [courseId, setCourseId] = useState('');
  const [courseItems, setCourseItems] = useState<PolicyItem[]>([]);
  const [scans, setScans] = useState<ExtensionScan[]>([]);
  const [selectedScan, setSelectedScan] = useState<Awaited<ReturnType<typeof getScan>> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [importingKey, setImportingKey] = useState<string | null>(null);

  const [newIdentifier, setNewIdentifier] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newPublisher, setNewPublisher] = useState('');
  const [courseExtensionId, setCourseExtensionId] = useState('');

  const reloadCatalog = useCallback(async () => {
    setCatalog(await listCatalog());
  }, []);

  const reloadCourse = useCallback(async () => {
    if (!courseId.trim()) {
      setCourseItems([]);
      return;
    }
    setCourseItems(await listCourseItems(courseId.trim()));
  }, [courseId]);

  const reloadScans = useCallback(async () => {
    setScans(await listScans());
  }, []);

  useEffect(() => {
    void reloadCatalog().catch((e: Error) => setError(e.message));
  }, [reloadCatalog]);

  useEffect(() => {
    if (tab === 'results') {
      void reloadScans().catch((e: Error) => setError(e.message));
    }
  }, [tab, reloadScans]);

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

  const onAddCourse = async () => {
    if (!courseExtensionId.trim() || !courseId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await addCourseItem({
        courseId: courseId.trim(),
        extensionId: courseExtensionId.trim(),
      });
      setCourseExtensionId('');
      await reloadCourse();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onImportFromScan = async (item: {
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
      await reloadCatalog();
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
          description="Catalog extension VS Code (duyệt theo phiên bản / *), allowlist theo môn, kết quả quét từ Teacher Hub."
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              ['catalog', 'Catalog extension'],
              ['course', 'Theo môn'],
              ['results', 'Kết quả quét'],
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

        {tab === 'course' && (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="Course UUID"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
              />
              <button
                type="button"
                className="rounded-md border px-3 py-1.5 text-sm"
                onClick={() => void reloadCourse().catch((e: Error) => setError(e.message))}
              >
                Tải danh sách
              </button>
              <input
                className="rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
                placeholder="publisher.name"
                value={courseExtensionId}
                onChange={(e) => setCourseExtensionId(e.target.value)}
              />
              <button
                type="button"
                disabled={busy}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                onClick={() => void onAddCourse()}
              >
                Đề xuất (pending)
              </button>
            </div>
            <CourseItemTable
              items={courseItems}
              onApprove={(id) => void approveItem(id).then(reloadCourse)}
              onReject={(id) => void rejectItem(id).then(reloadCourse)}
              onRemove={(id) => void removeItem(id).then(reloadCourse)}
            />
          </section>
        )}

        {tab === 'results' && (
          <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden lg:flex-row">
            <div className="min-h-0 flex-1 overflow-auto rounded-md border lg:max-w-sm">
              {scans.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">Chưa có bản quét nào được đồng bộ.</p>
              ) : (
                <ul>
                  {scans.map((s) => (
                    <li key={s.id} className="border-b last:border-b-0">
                      <button
                        type="button"
                        className={`w-full px-3 py-2.5 text-left text-sm hover:bg-muted ${
                          selectedScan?.id === s.id ? 'bg-muted' : ''
                        }`}
                        onClick={() =>
                          void getScan(s.id)
                            .then(setSelectedScan)
                            .catch((e: Error) => setError(e.message))
                        }
                      >
                        <strong>{s.studentMssv}</strong>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {s.machineName ?? s.machineId} · {s.status} · vi phạm{' '}
                          {s.violationCount}/{s.extensionCount}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="min-h-0 flex-[2] overflow-auto rounded-md border">
              {!selectedScan ? (
                <p className="p-3 text-sm text-muted-foreground">Chọn một bản quét để xem chi tiết.</p>
              ) : (
                <div className="p-3">
                  <p className="mb-3 font-semibold">
                    Chi tiết {selectedScan.studentMssv}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({selectedScan.machineName ?? selectedScan.machineId})
                    </span>
                  </p>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Extension</th>
                        <th className="py-2 pr-2 font-medium">Version</th>
                        <th className="py-2 pr-2 font-medium">Verdict</th>
                        <th className="py-2 font-medium text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedScan.items.map((it) => {
                        const key = `${it.extensionId}@${it.version ?? ''}`;
                        return (
                          <tr key={key} className="border-b">
                            <td className="py-2 pr-2 font-mono text-xs">{it.extensionId}</td>
                            <td className="py-2 pr-2 font-mono">{it.version ?? '—'}</td>
                            <td className="py-2 pr-2">
                              {it.verdict}
                              {it.matchedScope ? ` (${it.matchedScope})` : ''}
                            </td>
                            <td className="py-2 text-right">
                              <button
                                type="button"
                                disabled={importingKey === key}
                                className="text-primary disabled:opacity-50"
                                onClick={() => void onImportFromScan(it)}
                              >
                                {importingKey === key ? 'Đang thêm…' : 'Thêm vào catalog'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function CourseItemTable({
  items,
  onApprove,
  onReject,
  onRemove,
}: {
  items: PolicyItem[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onRemove?: (id: string) => void;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Chưa có extension nào.</p>;
  }
  return (
    <div className="overflow-auto rounded-md border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="px-3 py-2">Extension</th>
            <th className="px-3 py-2">Trạng thái</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b">
              <td className="px-3 py-2 font-mono">{it.extensionId}</td>
              <td className="px-3 py-2">{it.approvalStatus}</td>
              <td className="space-x-2 px-3 py-2 text-right">
                {it.approvalStatus === 'pending' && (
                  <>
                    <button type="button" className="text-primary" onClick={() => onApprove?.(it.id)}>
                      Duyệt
                    </button>
                    <button
                      type="button"
                      className="text-destructive"
                      onClick={() => onReject?.(it.id)}
                    >
                      Từ chối
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="text-muted-foreground"
                  onClick={() => onRemove?.(it.id)}
                >
                  Xóa
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
