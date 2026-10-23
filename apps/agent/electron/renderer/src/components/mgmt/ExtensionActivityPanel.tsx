import type { ExtensionActivityEvent } from '../../../../../src/lab-mgmt/vscode-extension-activity';

export interface ExtensionActivityMachine {
  machineId: string;
  hostname: string;
  studentMssv?: string;
  studentFullName?: string;
  activityLog?: ExtensionActivityEvent[];
  activityWarnings?: { path: string; message: string }[];
  activityError?: string;
  activityAt?: string;
}

function actionLabel(action: ExtensionActivityEvent['action']): string {
  return action === 'install' ? 'Cài' : 'Gỡ';
}

function machineLabel(machine: ExtensionActivityMachine): string {
  const who = machine.studentFullName
    ? `${machine.studentFullName} · ${machine.studentMssv ?? machine.hostname}`
    : (machine.studentMssv ?? machine.hostname);
  return who;
}

export function ExtensionActivityPanel({ machines }: { machines: ExtensionActivityMachine[] }) {
  const rows = machines.filter((machine) => machine.activityAt);
  if (rows.length === 0) return null;

  return (
    <section>
      <h2 className="mb-1 text-small font-bold">Log cài / gỡ hôm nay</h2>
      <ul className="flex flex-col gap-2">
        {rows.map((machine) => (
          <li key={machine.machineId} className="rounded-md border border-border px-2 py-1.5 text-caption">
            <strong>{machineLabel(machine)}</strong>
            {machine.activityError && (
              <span className="block text-danger-strong">{machine.activityError}</span>
            )}
            {!machine.activityError && (machine.activityLog?.length ?? 0) === 0 && (
              <span className="block text-muted-foreground">Hôm nay chưa có lần cài hoặc gỡ.</span>
            )}
            {(machine.activityLog ?? []).map((event, index) => (
              <span
                key={`${event.occurredAt}-${event.action}-${event.extensionId}-${index}`}
                className="block"
              >
                {event.occurredAt} · {actionLabel(event.action)} · {event.extensionId}
                {event.version ? ` ${event.version}` : ''}
              </span>
            ))}
            {(machine.activityWarnings ?? []).map((warning) => (
              <span key={warning.path} className="block text-warning-strong">
                {warning.message}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </section>
  );
}
