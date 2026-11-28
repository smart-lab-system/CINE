'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { JplagComparisonViewer } from '@/components/jplag/jplag-comparison-viewer';
import {
  getJplagRunComparison,
  listViolations,
  type IdeExtensionJplagRunStatus,
  type JplagDemoRunProfile,
  type JplagRunView,
  type ViolationExtension,
  type ViolationIncident,
} from '@/lib/api/ide-utilities';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  try {
    return new Date(value).toLocaleDateString('vi-VN');
  } catch {
    return value;
  }
}

function formatDateTime(value: string): string {
  try {
    return new Date(value).toLocaleString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '-';
  return `${(n * 100).toFixed(1)}%`;
}

function jplagStatusLabel(status: IdeExtensionJplagRunStatus | null | undefined): string {
  switch (status) {
    case 'pending':
      return 'Chờ chạy';
    case 'running':
      return 'Đang chạy';
    case 'completed':
      return 'Xong';
    case 'failed':
      return 'Lỗi';
    default:
      return '-';
  }
}

function flattenIncidents(ext: ViolationExtension): ViolationIncident[] {
  return ext.versions
    .flatMap((v) => v.incidents)
    .slice()
    .sort((a, b) => (a.scannedAt < b.scannedAt ? 1 : a.scannedAt > b.scannedAt ? -1 : 0));
}

export function SessionViolationsPanel({ examSessionId }: { examSessionId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [jplagView, setJplagView] = useState<{
    runId: string;
    profile: JplagDemoRunProfile;
  } | null>(null);

  const violationsQuery = useQuery({
    queryKey: ['session-violations', examSessionId],
    queryFn: () => listViolations(examSessionId),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      const waiting = data.some(
        (ext) =>
          ext.extractStatus === 'pending' ||
          ext.extractStatus === 'extracting' ||
          ext.jplagStatus === 'pending' ||
          ext.jplagStatus === 'running',
      );
      return waiting ? 4000 : false;
    },
  });

  const comparisonQuery = useQuery({
    queryKey: ['session-violation-jplag', jplagView?.runId, jplagView?.profile],
    queryFn: () => getJplagRunComparison(jplagView!.runId, jplagView!.profile),
    enabled: !!jplagView,
  });

  const viewerRun: JplagRunView | null = useMemo(() => {
    const payload = comparisonQuery.data;
    if (!payload || !jplagView) return null;
    return {
      profile: payload.profile,
      cliLanguage: payload.cliLanguage,
      similarity: payload.similarity,
      firstSubmission: payload.firstSubmission,
      secondSubmission: payload.secondSubmission,
      extensionFileCount: 0,
      compareFileCount: 0,
      reportUrl: payload.reportUrl,
      reportFilename: null,
      viewCommandHint: null,
      comparison: payload.comparison
        ? {
            files: payload.comparison.files,
            matches: payload.comparison.matches,
          }
        : null,
    };
  }, [comparisonQuery.data, jplagView]);

  const rows = violationsQuery.data ?? [];

  if (violationsQuery.isLoading && !violationsQuery.data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-h3">Extension vi phạm</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-small text-muted-foreground">Đang tải danh sách vi phạm…</p>
        </CardContent>
      </Card>
    );
  }

  if (violationsQuery.isError) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-h3">Extension vi phạm</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-small text-danger-strong">
            Không tải được -{' '}
            {violationsQuery.error instanceof Error
              ? violationsQuery.error.message
              : 'lỗi không xác định'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-h3">Extension vi phạm</CardTitle>
        <p className="text-small text-muted-foreground">
          Tiện ích còn blocked và chưa được duyệt global trong phiên này.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <p className="text-small text-muted-foreground">
            Chưa có extension vi phạm chưa được duyệt trong phiên này.
          </p>
        ) : (
          <Table container={{ className: 'rounded-md border' }} className="w-full text-sm">
            <TableHeader>
              <TableRow className="text-left text-muted-foreground">
                <TableHead className="px-3 py-2.5 font-medium">Tên tiện ích</TableHead>
                <TableHead className="px-3 py-2.5 font-medium">Nhà phát hành</TableHead>
                <TableHead className="px-3 py-2.5 font-medium">Phát hành gần nhất</TableHead>
                <TableHead className="px-3 py-2.5 font-medium">JPlag text</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((ext) => {
                const expanded = expandedId === ext.extensionId;
                return (
                  <ViolationRows
                    key={ext.extensionId}
                    ext={ext}
                    expanded={expanded}
                    onToggle={() => {
                      setExpandedId(expanded ? null : ext.extensionId);
                      setJplagView(null);
                    }}
                    onOpenJplag={() => {
                      if (ext.jplagRunId && ext.jplagStatus === 'completed') {
                        setJplagView({ runId: ext.jplagRunId, profile: 'text' });
                      }
                    }}
                    jplagOpen={
                      !!jplagView &&
                      jplagView.runId === ext.jplagRunId &&
                      expanded
                    }
                    viewerRun={
                      jplagView && jplagView.runId === ext.jplagRunId ? viewerRun : null
                    }
                    comparisonLoading={
                      !!jplagView &&
                      jplagView.runId === ext.jplagRunId &&
                      comparisonQuery.isLoading
                    }
                    comparisonError={
                      jplagView && jplagView.runId === ext.jplagRunId
                        ? comparisonQuery.error
                        : null
                    }
                  />
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ViolationRows({
  ext,
  expanded,
  onToggle,
  onOpenJplag,
  jplagOpen,
  viewerRun,
  comparisonLoading,
  comparisonError,
}: {
  ext: ViolationExtension;
  expanded: boolean;
  onToggle: () => void;
  onOpenJplag: () => void;
  jplagOpen: boolean;
  viewerRun: JplagRunView | null;
  comparisonLoading: boolean;
  comparisonError: Error | null | undefined;
}) {
  const incidents = useMemo(() => flattenIncidents(ext), [ext]);
  const canBrowse =
    !!ext.catalogExtensionPk &&
    !!ext.primaryVersionId &&
    ext.extractStatus === 'ready';
  const browseHref =
    canBrowse
      ? `/teacher/ide-utilities/${ext.catalogExtensionPk}/versions/${ext.primaryVersionId}/browse`
      : null;
  const normalizedHref = browseHref ? `${browseHref}?view=normalized` : null;
  const canJplag = ext.jplagStatus === 'completed' && !!ext.jplagRunId;

  return (
    <>
      <TableRow
        className="cursor-pointer hover:bg-muted/60"
        onClick={onToggle}
        data-testid={`violation-row-${ext.extensionId}`}
      >
        <TableCell className="px-3 py-2.5 font-medium">
          {ext.displayName ?? ext.extensionId}
        </TableCell>
        <TableCell className="px-3 py-2.5">{ext.publisher ?? '-'}</TableCell>
        <TableCell className="px-3 py-2.5">{formatDate(ext.publishedAt)}</TableCell>
        <TableCell className="px-3 py-2.5 tabular-nums">
          {ext.jplagStatus === 'completed' ? pct(ext.jplagText) : jplagStatusLabel(ext.jplagStatus)}
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow className="bg-muted/20">
          <TableCell colSpan={4} className="px-3 py-3">
            <div className="flex flex-col gap-4">
              <dl className="grid gap-2 text-small sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Mã định danh</dt>
                  <dd className="font-mono text-xs">{ext.extensionId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Phiên bản</dt>
                  <dd>{ext.primaryVersion ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Giải nén VSIX</dt>
                  <dd>{ext.extractStatus ?? 'none'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">JPlag</dt>
                  <dd>
                    {jplagStatusLabel(ext.jplagStatus)}
                    {ext.jplagStatus === 'completed' ? ` · text ${pct(ext.jplagText)}` : ''}
                  </dd>
                </div>
              </dl>

              <div className="flex flex-wrap gap-2">
                {browseHref ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={browseHref}>Xem nội dung VSIX</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled title="Chờ giải nén VSIX">
                    Xem nội dung VSIX
                  </Button>
                )}
                {normalizedHref ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={normalizedHref}>Xem mã đã chuẩn hóa</Link>
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" disabled title="Chờ giải nén VSIX">
                    Xem mã đã chuẩn hóa
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!canJplag}
                  title={canJplag ? undefined : 'Chờ kết quả JPlag'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenJplag();
                  }}
                >
                  Kết quả JPlag
                </Button>
              </div>

              {jplagOpen && (
                <div className="rounded-md border bg-background p-3">
                  {comparisonLoading ? (
                    <p className="text-small text-muted-foreground">Đang tải so sánh JPlag…</p>
                  ) : comparisonError ? (
                    <p className="text-small text-danger-strong">
                      {comparisonError instanceof Error
                        ? comparisonError.message
                        : 'Không tải được so sánh JPlag.'}
                    </p>
                  ) : viewerRun ? (
                    <JplagComparisonViewer run={viewerRun} />
                  ) : null}
                </div>
              )}

              <div>
                <h3 className="mb-2 text-small font-semibold">Sinh viên liên quan</h3>
                {incidents.length === 0 ? (
                  <p className="text-small text-muted-foreground">Không có bản ghi quét.</p>
                ) : (
                  <Table
                    container={{ className: 'rounded-md border' }}
                    className="w-full min-w-[480px] text-sm"
                  >
                    <TableHeader>
                      <TableRow className="text-left text-muted-foreground">
                        <TableHead className="px-3 py-2 font-medium">MSSV</TableHead>
                        <TableHead className="px-3 py-2 font-medium">Họ tên</TableHead>
                        <TableHead className="px-3 py-2 font-medium">Số máy</TableHead>
                        <TableHead className="px-3 py-2 font-medium">Thời điểm</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {incidents.map((inc) => (
                        <TableRow key={inc.scanItemId}>
                          <TableCell className="px-3 py-2 font-mono text-xs">
                            {inc.studentMssv}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            {inc.studentFullName ?? '-'}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            {inc.machineName ?? inc.machineId}
                          </TableCell>
                          <TableCell className="px-3 py-2">
                            {formatDateTime(inc.scannedAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
