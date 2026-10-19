'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import {
  addCatalogVersion,
  approveVersion,
  CATALOG_STATUS_LABEL,
  deleteVersion,
  getCatalog,
  refreshMarketplace,
  unapproveVersion,
  type CatalogExtensionDetail,
  type CatalogStatus,
} from '@/lib/api/ide-utilities';

function formatDate(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('vi-VN');
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('vi-VN');
  } catch {
    return value;
  }
}

function versionStatusLabel(status: string) {
  if (status === 'approved') return 'Đã duyệt';
  if (status === 'rejected') return 'Từ chối';
  return 'Chờ duyệt';
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

export default function IdeUtilityDetailPage() {
  const params = useParams<{ id: string }>();
  const pathname = usePathname();
  const basePath = pathname.startsWith('/teacher') ? '/teacher/ide-utilities' : '/admin/ide-utilities';
  const id = params.id;

  const [detail, setDetail] = useState<CatalogExtensionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newVersion, setNewVersion] = useState('');

  const reload = useCallback(async () => {
    setDetail(await getCatalog(id));
  }, [id]);

  useEffect(() => {
    void reload().catch((e: Error) => setError(e.message));
  }, [reload]);

  const wildcard = useMemo(
    () => detail?.versions.find((v) => v.version === '*') ?? null,
    [detail],
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!detail && !error) {
    return <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>;
  }

  if (!detail) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Link href={basePath} className="text-sm text-primary underline-offset-2 hover:underline">
          ← Quay lại danh sách
        </Link>
      </div>
    );
  }

  return (
    <div className="-mx-4 -mb-6 flex min-h-[calc(100dvh-4rem)] flex-col md:-mx-6">
      <div className="border-b px-4 py-4 md:px-6">
        <Link
          href={basePath}
          className="mb-2 inline-block text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          ← Quay lại danh sách
        </Link>
        <PageHeader
          title={detail.displayName}
          description="Chi tiết extension và quản lý phiên bản (exact / duyệt mọi phiên bản *)."
        />
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {info && <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-400">{info}</p>}
        {wildcard?.approvalStatus === 'approved' && (
          <p className="mt-3 rounded-md border border-emerald-600/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
            Đang duyệt mọi phiên bản (*) kể từ {formatDateTime(wildcard.approvedAt)}.
          </p>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-4 py-4 md:px-6">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">Extension name</dt>
            <dd className="font-medium">{detail.displayName}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Publisher</dt>
            <dd>{detail.publisher}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Identifier</dt>
            <dd className="font-mono text-xs">{detail.identifier}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Published</dt>
            <dd>{formatDate(detail.publishedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Last Released</dt>
            <dd>{formatDate(detail.lastReleasedAt)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Trạng thái</dt>
            <dd>
              <span
                className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${statusBadgeClass(detail.catalogStatus)}`}
              >
                {CATALOG_STATUS_LABEL[detail.catalogStatus]}
              </span>
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            onClick={() =>
              void run(async () => {
                const res = await refreshMarketplace(detail.id);
                setInfo(
                  res.refreshed
                    ? 'Đã cập nhật metadata từ Marketplace.'
                    : 'Không lấy được dữ liệu Marketplace — giữ thông tin hiện tại.',
                );
              })
            }
          >
            Làm mới từ Marketplace
          </button>
          <button
            type="button"
            disabled={busy || !!wildcard}
            className="rounded-md border px-3 py-1.5 text-sm disabled:opacity-50"
            title={wildcard ? 'Đã có cấu hình *' : undefined}
            onClick={() => void run(() => addCatalogVersion(detail.id, { version: '*' }))}
          >
            Thêm duyệt mọi phiên bản (*)
          </button>
        </div>

        <section className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-base font-semibold">Phiên bản</h2>
            <div className="flex flex-wrap gap-2">
              <input
                className="rounded-md border bg-background px-2 py-1.5 font-mono text-sm"
                placeholder="1.2.3"
                value={newVersion}
                onChange={(e) => setNewVersion(e.target.value)}
              />
              <button
                type="button"
                disabled={busy || !newVersion.trim() || newVersion.trim() === '*'}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                onClick={() =>
                  void run(async () => {
                    await addCatalogVersion(detail.id, { version: newVersion.trim() });
                    setNewVersion('');
                  })
                }
              >
                Thêm phiên bản
              </button>
            </div>
          </div>

          {detail.versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Chưa có phiên bản nào. Thêm semver hoặc cấu hình *.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 z-10 bg-background shadow-[0_1px_0_0_hsl(var(--border))]">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-3 py-2.5 font-medium">Phiên bản</th>
                    <th className="px-3 py-2.5 font-medium">Ngày thêm phiên bản</th>
                    <th className="px-3 py-2.5 font-medium">Ngày approved</th>
                    <th className="px-3 py-2.5 font-medium">Trạng thái</th>
                    <th className="px-3 py-2.5 text-right font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.versions.map((v) => (
                    <tr key={v.id} className="border-t">
                      <td className="px-3 py-2.5 font-mono">
                        {v.version === '*' ? (
                          <span>
                            *{' '}
                            <span className="text-xs text-muted-foreground">(Mọi phiên bản)</span>
                          </span>
                        ) : (
                          v.version
                        )}
                      </td>
                      <td className="px-3 py-2.5">{formatDateTime(v.addedAt)}</td>
                      <td className="px-3 py-2.5">{formatDateTime(v.approvedAt)}</td>
                      <td className="px-3 py-2.5">{versionStatusLabel(v.approvalStatus)}</td>
                      <td className="space-x-2 px-3 py-2.5 text-right">
                        {v.approvalStatus !== 'approved' ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="text-primary disabled:opacity-50"
                            onClick={() => void run(() => approveVersion(v.id))}
                          >
                            Approve
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            className="text-amber-700 disabled:opacity-50 dark:text-amber-400"
                            onClick={() => {
                              if (
                                v.version === '*' &&
                                !window.confirm(
                                  'Hủy duyệt * sẽ hết quyền «mọi phiên bản». Tiếp tục?',
                                )
                              ) {
                                return;
                              }
                              void run(() => unapproveVersion(v.id));
                            }}
                          >
                            Hủy approved
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          className="text-destructive disabled:opacity-50"
                          onClick={() => {
                            const msg =
                              v.version === '*'
                                ? 'Xóa cấu hình *? Thao tác không hoàn tác.'
                                : `Xóa phiên bản ${v.version}? Thao tác không hoàn tác.`;
                            if (!window.confirm(msg)) return;
                            void run(() => deleteVersion(v.id));
                          }}
                        >
                          Xóa phiên bản
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
