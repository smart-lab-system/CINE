import { useEffect, useState } from 'react';
import type { CompareResultPayload, MachineComparison, RoomAggregate, TeacherHubState } from '../../../../shared/ipc';
import { AppButton, StatusLine } from '../ui';
import { ProposeRoomDialog } from './ProposeRoomDialog';

export function TeacherHubView({
  teacherEmail,
  onLeave,
}: {
  teacherEmail: string;
  onLeave: () => void;
}) {
  const [hub, setHub] = useState<TeacherHubState | null>(null);
  const [courseId, setCourseId] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [comparisons, setComparisons] = useState<MachineComparison[]>([]);
  const [aggregate, setAggregate] = useState<RoomAggregate | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [proposeOpen, setProposeOpen] = useState(false);

  useEffect(() => {
    const unsub = window.agent.onHubState(setHub);
    void window.agent.mgmtGetHubState().then(setHub);
    return unsub;
  }, []);

  const run = async (label: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const leave = async (): Promise<void> => {
    await window.agent.mgmtStop();
    onLeave();
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-4">
      <div>
        <h1 className="text-h2 font-bold">Teacher Hub</h1>
        <p className="text-caption text-muted-foreground">
          {teacherEmail}
          {hub ? ` · ${hub.hostname} · ${hub.localIp}` : ''}
        </p>
        {hub?.statusMessage && (
          <p className="mt-1 text-caption text-muted-foreground">{hub.statusMessage}</p>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption font-semibold">Course ID (tuỳ chọn — allowlist theo môn)</span>
        <input
          className="rounded-md border border-border bg-surface px-2 py-1.5 text-small"
          value={courseId}
          placeholder="uuid môn catalog"
          onChange={(e) => setCourseId(e.target.value)}
          onBlur={() => void window.agent.mgmtSetCourseId(courseId.trim() || null)}
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <AppButton
          type="button"
          disabled={!!busy}
          onClick={() => void run('refresh', () => window.agent.mgmtRefreshMachines())}
        >
          Làm mới danh sách máy
        </AppButton>
        <AppButton
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('scan', async () => {
              const ids = selected.size > 0 ? [...selected] : undefined;
              await window.agent.mgmtScanExtensions(ids);
              setMessage('Đã gửi lệnh quét extension.');
              const state = await window.agent.mgmtGetHubState();
              setHub(state);
            })
          }
        >
          Quét extension VS Code
        </AppButton>
        <AppButton
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('compare', async () => {
              await window.agent.mgmtSetCourseId(courseId.trim() || null);
              const result: CompareResultPayload = await window.agent.mgmtCompareAllowlist();
              setComparisons(result.comparisons);
              setAggregate(null);
              if (result.warning) setMessage(result.warning);
              else setMessage(`Đã đối chiếu ${result.comparisons.length} máy.`);
            })
          }
        >
          Đối chiếu allowlist
        </AppButton>
        <AppButton
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('agg', async () => {
              const agg = await window.agent.mgmtAggregateRoom();
              setAggregate(agg);
              setMessage(agg ? 'Đã tổng hợp phòng máy.' : 'Chưa có kết quả đối chiếu.');
            })
          }
        >
          Tổng hợp phòng máy
        </AppButton>
        <AppButton
          type="button"
          disabled={!!busy}
          onClick={() =>
            void run('sync', async () => {
              const result = await window.agent.mgmtSyncBackend();
              if (!result.ok) setError(result.error ?? 'Đồng bộ thất bại.');
              else setMessage('Đã đồng bộ lên hệ thống.');
            })
          }
        >
          Đồng bộ lên hệ thống
        </AppButton>
        <AppButton
          type="button"
          disabled={!!busy}
          onClick={() => {
            setError(null);
            setProposeOpen(true);
          }}
        >
          Đề xuất thông tin phòng máy
        </AppButton>
      </div>

      <ProposeRoomDialog
        open={proposeOpen}
        onClose={() => setProposeOpen(false)}
        onSubmitted={(msg) => setMessage(msg)}
      />

      {busy && <p className="text-caption text-muted-foreground">Đang xử lý: {busy}…</p>}
      {message && <StatusLine tone="info">{message}</StatusLine>}
      {error && <StatusLine tone="danger">{error}</StatusLine>}

      <section>
        <h2 className="mb-1 text-small font-bold">Máy sinh viên ({hub?.nodes.length ?? 0})</h2>
        {(hub?.nodes.length ?? 0) === 0 ? (
          <p className="text-caption text-muted-foreground">Chưa có máy nào đăng ký.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {hub!.nodes.map((n) => (
              <li key={n.machineId} className="rounded-md border border-border px-2 py-1.5 text-caption">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(n.machineId)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(n.machineId);
                        else next.delete(n.machineId);
                        return next;
                      });
                    }}
                  />
                  <span>
                    <strong>
                      {n.studentFullName ? `${n.studentFullName} · ` : ''}
                      {n.studentMssv ?? '—'}
                    </strong>{' '}
                    · {n.hostname} · {n.localIp}
                    {n.inventory && (
                      <span className="block text-muted-foreground">
                        Đã quét: {n.inventory.length} extension
                        {n.inventoryAt ? ` (${n.inventoryAt})` : ''}
                      </span>
                    )}
                    {n.inventoryError && (
                      <span className="block text-danger-strong">{n.inventoryError}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {comparisons.length > 0 && (
        <section>
          <h2 className="mb-1 text-small font-bold">Kết quả đối chiếu</h2>
          <ul className="flex flex-col gap-2">
            {comparisons.map((c) => (
              <li key={c.machineId} className="rounded-md border border-border px-2 py-1.5 text-caption">
                <strong>{c.studentMssv || c.hostname}</strong> — {c.status}
                {c.error && <span className="block text-warning-strong">{c.error}</span>}
                {c.violationCount > 0 && (
                  <span className="block">
                    Vi phạm: {c.rows.filter((r) => r.verdict === 'blocked').map((r) => r.extensionId).join(', ')}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {aggregate && (
        <section className="rounded-md bg-surface-2 px-2 py-2 text-caption">
          <p>Máy có dữ liệu: {aggregate.machinesWithInventory}</p>
          <p>Máy có vi phạm: {aggregate.machinesWithViolations}</p>
          <p>Extension bị chặn: {aggregate.blockedExtensionIds.join(', ') || '—'}</p>
        </section>
      )}

      <AppButton type="button" variant="ghost" onClick={() => void leave()}>
        Thoát Hub / Quay lại
      </AppButton>
    </div>
  );
}
