import { useEffect, useState } from 'react';
import type { StudentNodeState } from '../../../../shared/ipc';
import { AppButton, Spinner, StatusLine } from '../ui';

export function StudentNodeView({
  mssv,
  fullName,
  onLeave,
}: {
  mssv: string;
  fullName: string;
  onLeave: () => void;
}) {
  const [node, setNode] = useState<StudentNodeState | null>(null);

  useEffect(() => {
    const unsub = window.agent.onNodeState(setNode);
    void window.agent.mgmtGetNodeState().then(setNode);
    return unsub;
  }, []);

  const leave = async (): Promise<void> => {
    await window.agent.mgmtStop();
    onLeave();
  };

  const displayName = node?.fullName || fullName;

  return (
    <div className="flex h-full flex-col gap-3 p-5">
      <h1 className="text-h2 font-bold">Student Node</h1>
      <StatusLine tone="success">
        <b>{displayName}</b>
        <br />
        MSSV {mssv}
      </StatusLine>
      {!node?.connected && !node?.lastError && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Spinner />
        </div>
      )}
      {node?.statusMessage && <StatusLine tone="info">{node.statusMessage}</StatusLine>}
      {node?.lastError && <StatusLine tone="danger">{node.lastError}</StatusLine>}
      {node?.connected && (
        <StatusLine tone="success">
          Đã gắn Hub {node.hubHostname}. Chờ lệnh từ giảng viên (quét extension, …).
        </StatusLine>
      )}
      {node && (
        <p className="text-caption text-muted-foreground">
          {node.hostname} · {node.localIp} · {node.machineId.slice(0, 8)}…
        </p>
      )}
      <AppButton type="button" variant="ghost" className="mt-auto" onClick={() => void leave()}>
        Ngắt kết nối / Quay lại
      </AppButton>
    </div>
  );
}
