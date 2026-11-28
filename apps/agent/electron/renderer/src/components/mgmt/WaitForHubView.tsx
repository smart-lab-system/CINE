import { useEffect, useState, type FormEvent } from 'react';
import type { MgmtIdentifyRequiredPayload, StudentNodeState } from '../../../../shared/ipc';
import { AppButton, BrandMark, Field, Spinner, StatusLine } from '../ui';

const NON_ALPHANUMERIC = /[^A-Za-z0-9]/g;

/**
 * Máy SV catalog: chờ Teacher Hub trên LAN; khi GV gửi PROMPT_IDENTIFY
 * thì ép nhập MSSV rồi auto-join phiên (không gõ mã).
 */
export function WaitForHubView() {
  const [node, setNode] = useState<StudentNodeState | null>(null);
  const [identify, setIdentify] = useState<MgmtIdentifyRequiredPayload | null>(null);
  const [mssv, setMssv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubNode = window.agent.onNodeState(setNode);
    const unsubReq = window.agent.onIdentifyRequired((payload) => {
      setIdentify(payload);
      setError(null);
    });
    const unsubCancel = window.agent.onIdentifyCancelled(() => {
      setIdentify(null);
      setError(null);
    });
    void window.agent.mgmtGetNodeState().then(setNode);
    void window.agent.mgmtGetContext().then((ctx) => {
      if (ctx.pendingIdentify) setIdentify(ctx.pendingIdentify);
    });
    return () => {
      unsubNode();
      unsubReq();
      unsubCancel();
    };
  }, []);

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const cleaned = mssv.replace(NON_ALPHANUMERIC, '').slice(0, 20);
    if (cleaned.length < 4) {
      setError('Nhập MSSV hợp lệ (4–20 ký tự chữ/số).');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await window.agent.mgmtSubmitIdentifyAndJoin({ mssv: cleaned });
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? 'Không vào được phiên thi.');
      return;
    }
    // Giữ spinner - App.tsx chuyển JoinScreen / ConfirmedBadge khi joinPhase đổi.
  };

  if (busy) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-5">
        <Spinner />
        <p className="text-small font-semibold">Đang xác nhận MSSV và vào phiên thi…</p>
      </div>
    );
  }

  if (identify) {
    return (
      <form onSubmit={(e) => void submit(e)} className="flex h-full flex-col gap-4 p-5">
        <BrandMark />
        <h1 className="-mb-1 text-h2 font-bold">Nhập MSSV để vào thi</h1>
        <p className="text-small text-muted-foreground">
          Giảng viên đã mở phiên
          {identify.examLabel ? (
            <>
              {' '}
              <span className="font-semibold text-foreground">{identify.examLabel}</span>
            </>
          ) : null}
          . Nhập MSSV - không cần mã phiên.
        </p>
        <Field
          label="MSSV"
          value={mssv}
          onChange={(e) => setMssv(e.target.value.replace(NON_ALPHANUMERIC, '').slice(0, 20))}
          autoComplete="off"
          required
        />
        {error && <StatusLine tone="danger">{error}</StatusLine>}
        <AppButton type="submit">Vào phiên thi</AppButton>
      </form>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 p-5">
      <BrandMark />
      <h1 className="text-h2 font-bold">Chờ máy giảng viên</h1>
      <p className="text-small text-muted-foreground">
        Máy này đã gắn phòng lab. Chờ giảng viên mở Teacher Hub và gửi lệnh vào phiên thi.
      </p>
      {!node?.connected && !node?.lastError && (
        <div className="flex flex-col items-center gap-2 py-4">
          <Spinner />
          <p className="text-caption text-muted-foreground">Đang tìm Hub trên LAN…</p>
        </div>
      )}
      {node?.statusMessage && <StatusLine tone="info">{node.statusMessage}</StatusLine>}
      {node?.lastError && <StatusLine tone="danger">{node.lastError}</StatusLine>}
      {node?.connected && (
        <StatusLine tone="success">
          Đã gắn Hub {node.hubHostname}. Chờ lệnh nhập MSSV từ giảng viên.
        </StatusLine>
      )}
      {node && (
        <p className="mt-auto text-caption text-muted-foreground">
          {node.hostname} · {node.localIp} · {node.machineId.slice(0, 8)}…
        </p>
      )}
    </div>
  );
}
