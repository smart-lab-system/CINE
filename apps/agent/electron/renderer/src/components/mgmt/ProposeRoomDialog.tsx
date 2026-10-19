import { useEffect, useState } from 'react';
import type { RoomProposalMachinePayload } from '../../../../shared/ipc';
import { AppButton } from '../ui';

function validateMachines(machines: RoomProposalMachinePayload[]): string | null {
  for (let i = 0; i < machines.length; i++) {
    const m = machines[i]!;
    const label = m.hostname || `máy #${i + 1}`;
    if (!m.hostname.trim()) return `Thiếu Hostname (${label}).`;
    if (!m.cpu.trim()) return `Không lấy được CPU (${label}).`;
    if (!Number.isFinite(m.ramGb) || m.ramGb < 1) return `Không lấy được RAM (${label}).`;
    if (!m.storage.trim()) return `Không lấy được Ổ cứng (${label}).`;
    if (!m.os.trim()) return `Không lấy được Hệ điều hành (${label}).`;
    if (!m.localIp.trim()) return `Không lấy được IP (${label}).`;
    if (!m.macAddress.trim()) return `Không lấy được MAC (${label}).`;
  }
  return null;
}

function statusLabel(status: string) {
  switch (status) {
    case 'active':
      return 'Hoạt động';
    case 'maintenance':
      return 'Bảo trì';
    case 'inactive':
      return 'Ngưng';
    default:
      return status;
  }
}

export function ProposeRoomDialog({
  open,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  onSubmitted: (message: string) => void;
}) {
  const [machines, setMachines] = useState<RoomProposalMachinePayload[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('1');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [loadingHw, setLoadingHw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLoadingHw(true);
    setMachines([]);
    void window.agent
      .mgmtGetRoomProposalPreview()
      .then((preview) => {
        const list = preview?.machines ?? [];
        setMachines(list);
        setCapacity(String(Math.max(1, list.length)));
        const hwError = validateMachines(list);
        if (hwError) setError(hwError);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Không lấy được thông tin máy.');
      })
      .finally(() => setLoadingHw(false));
  }, [open]);

  if (!open) return null;

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const cap = Number(capacity);
      if (!code.trim() || !name.trim() || !Number.isFinite(cap) || cap < 1) {
        setError('Vui lòng nhập mã, tên và sức chứa hợp lệ.');
        return;
      }
      if (machines.length === 0) {
        setError('Không có máy nào để đề xuất.');
        return;
      }
      const machineError = validateMachines(machines);
      if (machineError) {
        setError(machineError);
        return;
      }
      const result = await window.agent.mgmtProposeRoom({
        code: code.trim(),
        name: name.trim(),
        capacity: cap,
        building: building.trim() || null,
        floor: floor.trim() || null,
        machines,
      });
      if (!result.ok) {
        setError(result.error ?? 'Gửi đề xuất thất bại.');
        return;
      }
      onSubmitted(`Đã gửi đề xuất phòng «${code.trim()}» (${machines.length} máy).`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface p-4 shadow-lg">
        <div>
          <h2 className="text-h3 font-bold">Đề xuất thông tin phòng máy</h2>
          <p className="text-caption text-muted-foreground">
            Phần cứng lấy tự động từ máy GV và máy SV (không nhập tay). Chỉ chỉnh metadata phòng.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold">Mã *</span>
            <input
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-small"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="P301"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold">Tên *</span>
            <input
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-small"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Phòng lab 301"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold">Sức chứa *</span>
            <input
              type="number"
              min={1}
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-small"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold">Tòa</span>
            <input
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-small"
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-caption font-semibold">Tầng</span>
            <input
              className="rounded-md border border-border bg-surface px-2 py-1.5 text-small"
              value={floor}
              onChange={(e) => setFloor(e.target.value)}
            />
          </label>
        </div>

        <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
          <p className="sticky top-0 z-10 border-b border-border bg-surface px-2 py-1.5 text-caption font-semibold">
            Máy trong snapshot ({machines.length})
            {loadingHw ? ' — đang thu thập phần cứng…' : ''}
          </p>
          {loadingHw ? (
            <p className="p-3 text-caption text-muted-foreground">
              Đang lấy CPU / RAM / ổ cứng / GPU / MAC từ máy GV và các máy SV…
            </p>
          ) : machines.length === 0 ? (
            <p className="p-2 text-caption text-muted-foreground">Chưa có máy.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-caption">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-1.5 font-medium">Role</th>
                    <th className="px-2 py-1.5 font-medium">Hostname</th>
                    <th className="px-2 py-1.5 font-medium">CPU</th>
                    <th className="px-2 py-1.5 font-medium">RAM</th>
                    <th className="px-2 py-1.5 font-medium">Ổ cứng</th>
                    <th className="px-2 py-1.5 font-medium">GPU</th>
                    <th className="px-2 py-1.5 font-medium">HĐH</th>
                    <th className="px-2 py-1.5 font-medium">IP</th>
                    <th className="px-2 py-1.5 font-medium">MAC</th>
                    <th className="px-2 py-1.5 font-medium">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {machines.map((m) => (
                    <tr key={m.machineId} className="border-b border-border align-top">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {m.role === 'teacher_hub' ? 'Máy GV' : 'Máy SV'}
                        {m.studentMssv ? (
                          <span className="block text-muted-foreground">
                            {m.studentFullName ?? ''} {m.studentMssv}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 font-mono">{m.hostname}</td>
                      <td className="px-2 py-1.5">{m.cpu || '—'}</td>
                      <td className="px-2 py-1.5">{m.ramGb ? `${m.ramGb} GB` : '—'}</td>
                      <td className="px-2 py-1.5">{m.storage || '—'}</td>
                      <td className="px-2 py-1.5">{m.gpu || '—'}</td>
                      <td className="px-2 py-1.5">{m.os || '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{m.localIp || '—'}</td>
                      <td className="px-2 py-1.5 font-mono">{m.macAddress || '—'}</td>
                      <td className="px-2 py-1.5">{statusLabel(m.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {error && <p className="text-caption text-danger-strong">{error}</p>}

        <div className="flex justify-end gap-2">
          <AppButton type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Hủy
          </AppButton>
          <AppButton
            type="button"
            disabled={busy || loadingHw || machines.length === 0}
            onClick={() => void submit()}
          >
            {busy ? 'Đang gửi…' : 'Gửi đề xuất'}
          </AppButton>
        </div>
      </div>
    </div>
  );
}
