import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { readAgentIdentity } from '../common/exam-live-socket';
import { StorageService } from '../storage/storage.service';

/**
 * Snapshot backup and restore — the half of reconnect that is not free.
 *
 * A network blip is already handled: `cli.ts` creates its files with the
 * `wx` flag, so existing work is never truncated and an agent that comes
 * back finds everything where it left it. The case that needed building is
 * the other one — a machine wiped or swapped mid-exam, where the work is
 * simply gone and no amount of careful file handling brings it back.
 *
 * A backup is NOT a submission and never becomes one. Nothing here writes a
 * Submission row: restoring hands the work back to the student, who then
 * submits it through the ordinary path. Conflating the two would let a
 * snapshot taken four minutes before the end silently stand in for what the
 * student actually finished with.
 *
 * Neither handler takes a payload. The submission handlers accept one and
 * check it against `client.data`, because their contract defines those
 * fields; here there is nothing to check because there is nothing to claim.
 * Identity comes only from the socket, which `agent:join` wrote after
 * resolving the session itself.
 */
@WebSocketGateway({
  namespace: '/exam-live',
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class BackupGateway {
  private readonly logger = new Logger(BackupGateway.name);

  constructor(private readonly storage: StorageService) {}

  /**
   * Agent -> Server, every few minutes. One presigned PUT at this student's
   * own backup key, which the snapshot overwrites.
   */
  @SubscribeMessage('backup:request-upload-url')
  async handleUploadUrl(@ConnectedSocket() client: Socket): Promise<BackupAck> {
    const identity = readAgentIdentity(client);
    if (!identity) {
      return fail('NOT_JOINED', 'This connection has not joined an exam session.');
    }

    try {
      const storageKey = this.storage.buildBackupKey(
        identity.examSessionId,
        identity.studentId,
      );
      const { uploadUrl, expiresIn } = await this.storage.generateUploadUrl(storageKey);
      return { ok: true, uploadUrl, storageKey, expiresIn };
    } catch (error) {
      this.logger.error(
        `backup:request-upload-url failed for ${identity.studentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return fail('STORAGE_UNAVAILABLE', 'Could not issue a backup URL. Please retry.');
    }
  }

  /**
   * Agent -> Server, on rejoin. A presigned GET, or NO_BACKUP.
   *
   * NO_BACKUP is an answer, not a failure: on a first join there is nothing
   * to restore, and that is the normal case. The agent must be able to tell
   * it apart from a storage outage, because "no backup" means carry on and
   * "storage is down" means the student's safety net is missing.
   */
  @SubscribeMessage('backup:request-download-url')
  async handleDownloadUrl(@ConnectedSocket() client: Socket): Promise<BackupAck> {
    const identity = readAgentIdentity(client);
    if (!identity) {
      return fail('NOT_JOINED', 'This connection has not joined an exam session.');
    }

    try {
      const storageKey = this.storage.buildBackupKey(
        identity.examSessionId,
        identity.studentId,
      );
      if (!(await this.storage.objectExists(storageKey))) {
        return fail('NO_BACKUP', 'No snapshot has been taken for this student yet.');
      }
      const { downloadUrl, expiresIn } = await this.storage.generateDownloadUrl(storageKey);
      return { ok: true, downloadUrl, storageKey, expiresIn };
    } catch (error) {
      this.logger.error(
        `backup:request-download-url failed for ${identity.studentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      return fail('STORAGE_UNAVAILABLE', 'Could not reach the backup store. Please retry.');
    }
  }
}

export type BackupErrorCode = 'NOT_JOINED' | 'NO_BACKUP' | 'STORAGE_UNAVAILABLE';

export interface BackupAckError {
  ok: false;
  code: BackupErrorCode;
  message: string;
}

export interface BackupAckSuccess {
  ok: true;
  storageKey: string;
  expiresIn: number;
  uploadUrl?: string;
  downloadUrl?: string;
}

export type BackupAck = BackupAckSuccess | BackupAckError;

function fail(code: BackupErrorCode, message: string): BackupAckError {
  return { ok: false, code, message };
}
