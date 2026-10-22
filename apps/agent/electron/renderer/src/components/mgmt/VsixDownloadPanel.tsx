import type { VsixDownloadEntry } from '../../../../../src/lab-mgmt/violation-vsix';

function statusLabel(status: VsixDownloadEntry['status']): string {
  if (status === 'downloaded') return 'Vừa tải';
  if (status === 'already') return 'Đã tải';
  return 'Lỗi';
}

export function VsixDownloadPanel({
  folder,
  entries,
}: {
  folder: string;
  entries: VsixDownloadEntry[];
}) {
  if (entries.length === 0) return null;
  const fresh = entries.filter((entry) => entry.status === 'downloaded').length;
  const had = entries.filter((entry) => entry.status === 'already').length;
  const failed = entries.filter((entry) => entry.status === 'failed').length;

  return (
    <section>
      <h2 className="mb-1 text-small font-bold">VSIX extension vi phạm</h2>
      <p className="text-caption text-muted-foreground">
        Gộp từ mọi máy đã đối chiếu · vừa tải {fresh} · đã tải {had}
        {failed > 0 ? ` · lỗi ${failed}` : ''}
      </p>
      <p className="mb-1 break-all text-caption text-muted-foreground">{folder}</p>
      <ul className="flex flex-col gap-1.5">
        {entries.map((entry) => (
          <li
            key={`${entry.extensionId}@${entry.version}`}
            className="rounded-md border border-border px-2 py-1.5 text-caption"
          >
            <strong>{statusLabel(entry.status)}</strong> · {entry.extensionId} {entry.version}
            <span className="block text-muted-foreground">
              Trên máy: {entry.machines.join(', ') || '—'}
            </span>
            {entry.error && <span className="block text-danger-strong">{entry.error}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
