/**
 * The snapshot loop and the restore, over the WebSocket contract in
 * apps/api/src/submission/backup.gateway.ts.
 *
 * A backup is NOT a submission and never becomes one: nothing here touches
 * `submission:confirm`, and no Submission row is written. Restoring hands
 * the work back to the student, who then submits it the ordinary way at
 * finalize. Letting a four-minute-old snapshot stand in for what they
 * actually finished with would be a different, worse feature.
 *
 * The bytes go straight to object storage through a presigned URL, never
 * through the API server — CLAUDE.md Security rule 5, the same path
 * submissions take.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';
import type { Socket } from 'socket.io-client';
import {
  collectSnapshotFiles,
  resolveWithinWorkspace,
  shouldRestoreOver,
  SNAPSHOT_INTERVAL_MS,
} from './snapshot';

export type BackupErrorCode = 'NOT_JOINED' | 'NO_BACKUP' | 'STORAGE_UNAVAILABLE';

interface BackupAckError {
  ok: false;
  code: BackupErrorCode;
  message: string;
}

interface BackupAckSuccess {
  ok: true;
  storageKey: string;
  expiresIn: number;
  uploadUrl?: string;
  downloadUrl?: string;
}

type BackupAck = BackupAckSuccess | BackupAckError;

/** How long to wait for the server's acknowledgement before giving up. */
const ACK_TIMEOUT_MS = 15_000;

function ask(socket: Socket, event: string): Promise<BackupAck> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ack: BackupAck) => {
      if (!settled) {
        settled = true;
        resolve(ack);
      }
    };
    socket.emit(event, {}, (ack: BackupAck) => done(ack));
    setTimeout(
      () => done({ ok: false, code: 'STORAGE_UNAVAILABLE', message: `${event} timed out` }),
      ACK_TIMEOUT_MS,
    );
  });
}

/**
 * Zips the workspace and PUTs it, overwriting the previous snapshot.
 *
 * Returns quietly on every failure rather than throwing. This runs on a
 * timer beside a student writing an exam: a storage blip must not produce a
 * crash, an unhandled rejection, or a wall of noise on their screen — the
 * next snapshot is four minutes away and will simply try again.
 */
export async function uploadSnapshot(
  socket: Socket,
  workspaceDir: string,
): Promise<'uploaded' | 'empty' | 'failed'> {
  const files = collectSnapshotFiles(workspaceDir);
  if (files.length === 0) {
    // Nothing written yet. Uploading an empty archive would overwrite a
    // real earlier snapshot with nothing, which is worse than skipping.
    return 'empty';
  }

  let body: Buffer;
  try {
    const zip = new JSZip();
    for (const file of files) {
      zip.file(file.relativePath, await fs.promises.readFile(file.absolutePath));
    }
    body = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  } catch {
    return 'failed';
  }

  const ack = await ask(socket, 'backup:request-upload-url');
  if (!ack.ok || !ack.uploadUrl) {
    return 'failed';
  }

  try {
    const response = await fetch(ack.uploadUrl, {
      method: 'PUT',
      body: new Uint8Array(body),
      headers: { 'Content-Type': 'application/zip' },
    });
    return response.ok ? 'uploaded' : 'failed';
  } catch {
    return 'failed';
  }
}

export interface RestoreOutcome {
  restored: number;
  skipped: number;
  status: 'restored' | 'nothing-to-restore' | 'failed';
}

/**
 * Fetches this student's snapshot and writes back only what is safe to
 * write back.
 *
 * Ordered on purpose: this runs BEFORE the required files are created. If
 * it ran after, every required file would already exist as an empty file
 * and the restore would be deciding against its own agent's handiwork.
 *
 * Never overwrites a file with content in it. On an intact machine after a
 * network blip that means nothing happens, which is correct: handing back a
 * four-minute-old snapshot over live work would be the backup destroying
 * what it exists to protect.
 */
export async function restoreBackup(
  socket: Socket,
  workspaceDir: string,
): Promise<RestoreOutcome> {
  const ack = await ask(socket, 'backup:request-download-url');
  if (!ack.ok) {
    // NO_BACKUP is the normal first-join answer, not a problem.
    return {
      restored: 0,
      skipped: 0,
      status: ack.code === 'NO_BACKUP' ? 'nothing-to-restore' : 'failed',
    };
  }
  if (!ack.downloadUrl) {
    return { restored: 0, skipped: 0, status: 'failed' };
  }

  let zip: JSZip;
  try {
    const response = await fetch(ack.downloadUrl);
    if (!response.ok) {
      return { restored: 0, skipped: 0, status: 'failed' };
    }
    zip = await JSZip.loadAsync(await response.arrayBuffer());
  } catch {
    return { restored: 0, skipped: 0, status: 'failed' };
  }

  let restored = 0;
  let skipped = 0;

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) {
      continue;
    }

    const target = resolveWithinWorkspace(workspaceDir, entry.name);
    if (!target) {
      // The archive came back through storage. An entry that climbs out of
      // the workspace is refused rather than sanitised — rewriting it would
      // put the file somewhere nobody asked for.
      console.warn(`[CẢNH BÁO BẢO MẬT] Bỏ qua mục sao lưu có đường dẫn không an toàn: ${entry.name}`);
      continue;
    }

    if (!shouldRestoreOver(target)) {
      skipped++;
      continue;
    }

    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, await entry.async('nodebuffer'));
      restored++;
    } catch (error) {
      console.warn(
        `[CẢNH BÁO] Không khôi phục được "${entry.name}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { restored, skipped, status: 'restored' };
}

/**
 * Starts the four-minute snapshot loop. Returns a stop function.
 *
 * `unref()` so a still-pending timer never keeps the process alive after
 * finalize — the agent's job is done at that point, and a lingering handle
 * would leave the student's window open for another four minutes.
 *
 * `onResult`, if given, is called after every attempt (not just failures)
 * — `cli.ts` doesn't need it (its own `console.warn` below already covers
 * the one outcome a student watching a terminal cares about), but
 * `session-controller.ts` does: the detail window's "last backed up at"
 * line has no other way to learn a snapshot just happened.
 */
export function startSnapshotLoop(
  socket: Socket,
  workspaceDir: string,
  onResult?: (result: 'uploaded' | 'empty' | 'failed') => void,
): () => void {
  const timer = setInterval(() => {
    void uploadSnapshot(socket, workspaceDir).then((result) => {
      if (result === 'failed') {
        // Worth saying once, quietly: the student's safety net is not there,
        // and a lab technician looking at the screen should be able to see
        // that. Not an error the student can act on, so not an error.
        console.warn('[CẢNH BÁO] Không sao lưu được lần này — sẽ thử lại sau vài phút.');
      }
      onResult?.(result);
    });
  }, SNAPSHOT_INTERVAL_MS);

  timer.unref?.();
  return () => clearInterval(timer);
}
