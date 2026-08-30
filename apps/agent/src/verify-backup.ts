/**
 * Manual end-to-end check of the snapshot backup, against a running API and
 * a real MinIO. Not part of `pnpm test` — that suite must not need infra.
 *
 *   pnpm --filter agent exec ts-node src/verify-backup.ts <SESSION_CODE> <MSSV>
 *
 * It drives the real uploadSnapshot/restoreBackup, not a reimplementation of
 * them, and checks the three outcomes the design's table names: an intact
 * machine keeps its work, a wiped one gets it back, and a machine whose
 * files were emptied gets them back too.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { io, Socket } from 'socket.io-client';
import { restoreBackup, uploadSnapshot } from './backup';

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

const results: { label: string; ok: boolean; detail?: string }[] = [];
function check(label: string, ok: boolean, detail?: string): void {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

function join(
  sessionCode: string,
  studentId: string,
): Promise<{ socket: Socket; ack: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const socket = io(`${BACKEND_URL}/exam-live`, { reconnection: false, forceNew: true });
    socket.on('connect', () => socket.emit('agent:join', { studentId, sessionCode }));
    socket.on('agent:join:ack', (ack: Record<string, unknown>) => resolve({ socket, ack }));
    socket.on('agent:join:error', (e: { code: string }) => reject(new Error(e.code)));
    setTimeout(() => reject(new Error('join timed out')), 8_000);
  });
}

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'examcollect-verify-'));
}

async function main(): Promise<void> {
  const [sessionCode, studentId] = process.argv.slice(2);
  if (!sessionCode || !studentId) {
    console.error('usage: ts-node src/verify-backup.ts <SESSION_CODE> <MSSV>');
    process.exit(2);
  }

  // ---- a student does some work, and it gets snapshotted ----------------
  const original = workspace();
  fs.writeFileSync(path.join(original, 'Cau1.docx'), 'bai lam that cua sinh vien');
  fs.mkdirSync(path.join(original, 'src'), { recursive: true });
  fs.writeFileSync(path.join(original, 'src', 'main.py'), 'print("hello")');
  fs.mkdirSync(path.join(original, 'node_modules', 'junk'), { recursive: true });
  fs.writeFileSync(path.join(original, 'node_modules', 'junk', 'index.js'), 'x'.repeat(5000));

  const first = await join(sessionCode, studentId);
  check('first join reports no backup yet', first.ack.backupAvailable === false,
    `backupAvailable=${String(first.ack.backupAvailable)}`);

  const uploaded = await uploadSnapshot(first.socket, original);
  check('snapshot uploads', uploaded === 'uploaded', uploaded);
  first.socket.disconnect();

  // ---- the machine is wiped and re-imaged -------------------------------
  const wiped = workspace();
  const second = await join(sessionCode, studentId);
  check('rejoin reports a backup is waiting', second.ack.backupAvailable === true,
    `backupAvailable=${String(second.ack.backupAvailable)}`);

  // The agent creates the required files empty as part of joining. Recreated
  // here so the restore faces exactly what it faces in real life.
  fs.writeFileSync(path.join(wiped, 'Cau1.docx'), '');

  const restored = await restoreBackup(second.socket, wiped);
  check('restore runs', restored.status === 'restored', JSON.stringify(restored));
  check(
    'an EMPTY required file is replaced with the real work',
    fs.readFileSync(path.join(wiped, 'Cau1.docx'), 'utf8') === 'bai lam that cua sinh vien',
    JSON.stringify(fs.readFileSync(path.join(wiped, 'Cau1.docx'), 'utf8')),
  );
  check(
    'nested work comes back too',
    fs.existsSync(path.join(wiped, 'src', 'main.py')),
  );
  check(
    'node_modules was never in the archive',
    !fs.existsSync(path.join(wiped, 'node_modules')),
  );
  second.socket.disconnect();

  // ---- an intact machine after a network blip ---------------------------
  const intact = workspace();
  fs.writeFileSync(path.join(intact, 'Cau1.docx'), 'bai lam MOI HON tren may con song');
  const third = await join(sessionCode, studentId);
  const skipped = await restoreBackup(third.socket, intact);
  check(
    'live work is never overwritten by an older snapshot',
    fs.readFileSync(path.join(intact, 'Cau1.docx'), 'utf8') ===
      'bai lam MOI HON tren may con song' && skipped.skipped >= 1,
    JSON.stringify(skipped),
  );
  third.socket.disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('THREW:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
