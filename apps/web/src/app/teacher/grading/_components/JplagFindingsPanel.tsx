'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { JplagComparisonViewer } from '@/components/jplag/jplag-comparison-viewer';
import {
  getJplagRunComparison,
  listSessionJplagRuns,
  retryJplagVsModel,
  type IdeExtensionJplagRun,
  type JplagDemoRunProfile,
  type JplagRunView,
} from '@/lib/api/ide-utilities';

function pct(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

function statusLabel(status: IdeExtensionJplagRun['status']): string {
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
      return status;
  }
}

export function JplagFindingsPanel({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const runsQuery = useQuery({
    queryKey: ['jplag-exam-runs', sessionId],
    queryFn: () => listSessionJplagRuns(sessionId),
    refetchInterval: (q) => {
      const data = q.state.data;
      if (!data) return false;
      return data.some((r) => r.status === 'pending' || r.status === 'running') ? 4000 : false;
    },
  });

  const [selected, setSelected] = useState<{
    runId: string;
    profile: JplagDemoRunProfile;
  } | null>(null);

  const comparisonQuery = useQuery({
    queryKey: ['jplag-exam-comparison', selected?.runId, selected?.profile],
    queryFn: () => getJplagRunComparison(selected!.runId, selected!.profile),
    enabled: !!selected,
  });

  const retry = useMutation({
    mutationFn: (runId: string) => retryJplagVsModel(sessionId, runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['jplag-exam-runs', sessionId] });
    },
  });

  const runs = runsQuery.data ?? [];
  const vsModel = useMemo(() => runs.filter((r) => r.kind === 'vs_model'), [runs]);
  const vsStudent = useMemo(() => runs.filter((r) => r.kind === 'vs_student'), [runs]);

  const viewerRun: JplagRunView | null = useMemo(() => {
    const payload = comparisonQuery.data;
    if (!payload || !selected) return null;
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
  }, [comparisonQuery.data, selected]);

  if (runsQuery.isLoading && !runsQuery.data) {
    return (
      <section className="rounded-md border p-4 text-sm text-muted-foreground">
        Đang tải phát hiện JPlag…
      </section>
    );
  }

  if (runsQuery.isError) {
    return (
      <section className="rounded-md border border-destructive/40 p-4 text-sm">
        Không tải được JPlag — {runsQuery.error.message}
      </section>
    );
  }

  if (runs.length === 0) return null;

  return (
    <section className="flex flex-col gap-4 rounded-md border p-4">
      <div>
        <h2 className="text-base font-semibold">Extension trái phép — JPlag</h2>
        <p className="text-sm text-muted-foreground">
          So snippet với đáp án mẫu (vs mẫu) và với bài nộp (vs SV). Dual profile: text + language.
        </p>
      </div>

      {vsModel.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Vs đáp án mẫu</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">Extension</th>
                  <th className="py-1.5 pr-2 font-medium">Trạng thái</th>
                  <th className="py-1.5 pr-2 font-medium">Text</th>
                  <th className="py-1.5 pr-2 font-medium">Language</th>
                  <th className="py-1.5 pr-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {vsModel.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-2 font-mono text-xs">
                      {r.extensionIdentifier}
                      {r.extensionVersion ? `@${r.extensionVersion}` : ''}
                    </td>
                    <td className="py-2 pr-2">
                      {statusLabel(r.status)}
                      {r.error ? (
                        <p className="mt-0.5 max-w-xs text-xs text-destructive">{r.error}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{pct(r.similarityText)}</td>
                    <td className="py-2 pr-2 tabular-nums">{pct(r.similarityLanguage)}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-wrap gap-1">
                        {r.status === 'completed' && (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSelected({ runId: r.id, profile: 'text' })}
                            >
                              Xem text
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setSelected({ runId: r.id, profile: 'language' })}
                            >
                              Xem language
                            </Button>
                          </>
                        )}
                        {(r.status === 'failed' || r.status === 'completed') && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={retry.isPending}
                            onClick={() => retry.mutate(r.id)}
                          >
                            Chạy lại
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {vsStudent.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Vs bài nộp</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">MSSV</th>
                  <th className="py-1.5 pr-2 font-medium">Extension</th>
                  <th className="py-1.5 pr-2 font-medium">Trạng thái</th>
                  <th className="py-1.5 pr-2 font-medium">Text</th>
                  <th className="py-1.5 pr-2 font-medium">Language</th>
                  <th className="py-1.5 pr-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {vsStudent.map((r) => (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-2 font-mono text-xs">{r.studentMssv ?? '—'}</td>
                    <td className="py-2 pr-2 font-mono text-xs">
                      {r.extensionIdentifier}
                      {r.extensionVersion ? `@${r.extensionVersion}` : ''}
                    </td>
                    <td className="py-2 pr-2">
                      {statusLabel(r.status)}
                      {r.error ? (
                        <p className="mt-0.5 max-w-xs text-xs text-destructive">{r.error}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 tabular-nums">{pct(r.similarityText)}</td>
                    <td className="py-2 pr-2 tabular-nums">{pct(r.similarityLanguage)}</td>
                    <td className="py-2 pr-2">
                      {r.status === 'completed' && (
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelected({ runId: r.id, profile: 'text' })}
                          >
                            Xem text
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setSelected({ runId: r.id, profile: 'language' })}
                          >
                            Xem language
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="space-y-2 border-t pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              So sánh · {selected.profile}
              {comparisonQuery.data
                ? ` · ${(comparisonQuery.data.similarity * 100).toFixed(1)}%`
                : ''}
            </p>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(null)}>
              Đóng
            </Button>
          </div>
          {comparisonQuery.isLoading && (
            <p className="text-sm text-muted-foreground">Đang tải comparison…</p>
          )}
          {comparisonQuery.isError && (
            <p className="text-sm text-destructive">{comparisonQuery.error.message}</p>
          )}
          {viewerRun && <JplagComparisonViewer run={viewerRun} />}
        </div>
      )}
    </section>
  );
}
