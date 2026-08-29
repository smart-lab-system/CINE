import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  BACKUP_KEY_PREFIX,
  BACKUP_OBJECT_NAME,
  MATERIAL_KEY_PREFIX,
  DOWNLOAD_URL_TTL_SECONDS,
  SAFE_KEY_SEGMENT_REGEX,
  SUBMISSION_KEY_PREFIX,
  UPLOAD_URL_TTL_SECONDS,
} from './storage.types';

/**
 * Thin wrapper over the S3 API — MinIO in dev, real S3 later. Nothing else
 * in the codebase touches the SDK.
 *
 * CLAUDE.md Security rule 5: submission files NEVER pass through this
 * server. Everything here mints a scoped, expiring URL or asks storage a
 * yes/no question about an object — no method reads or writes bytes, and
 * none should ever be added. `generateDownloadUrl` is not an exception to
 * that rule: the signature lets the AGENT fetch the object directly, which
 * is the rule being obeyed rather than bent.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const endpoint = requireEnv('STORAGE_ENDPOINT');
    this.bucket = requireEnv('STORAGE_BUCKET');
    this.client = new S3Client({
      endpoint,
      // MinIO has no notion of regions but the SDK requires one; any
      // non-empty value works and real S3 will override this from config
      // when we get there.
      region: process.env.STORAGE_REGION ?? 'us-east-1',
      // Path-style (host/bucket/key) rather than virtual-host style
      // (bucket.host/key): MinIO on a bare host:port has no wildcard DNS,
      // so virtual-host addressing simply does not resolve against it.
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireEnv('STORAGE_ACCESS_KEY'),
        secretAccessKey: requireEnv('STORAGE_SECRET_KEY'),
      },
    });
  }

  /**
   * The one place a submission's storage key is produced. Callers pass
   * identifiers, never a path — so nothing a client sends can ever become
   * part of a key without going through here first.
   *
   * Throws rather than sanitizing on a bad segment: silently rewriting a
   * key would put the object somewhere neither the DB row nor a later
   * objectExists() lookup expects to find it.
   */
  buildSubmissionKey(
    examSessionId: string,
    studentMssv: string,
    requiredDeliverableId: string,
  ): string {
    const segments = [examSessionId, studentMssv, requiredDeliverableId];
    for (const segment of segments) {
      if (!segment || !SAFE_KEY_SEGMENT_REGEX.test(segment)) {
        throw new InternalServerErrorException(
          `Refusing to build a storage key from an unsafe segment: ${JSON.stringify(segment)}`,
        );
      }
    }
    return [SUBMISSION_KEY_PREFIX, ...segments].join('/');
  }

  /**
   * Where one exam material lives.
   *
   * Keyed by the material's id, never by the filename the teacher typed:
   * two materials may share a name, and a key built from user input is a
   * key that can be steered.
   */
  buildMaterialKey(examSessionId: string, examMaterialId: string): string {
    const segments = [examSessionId, examMaterialId];
    for (const segment of segments) {
      if (!segment || !SAFE_KEY_SEGMENT_REGEX.test(segment)) {
        throw new InternalServerErrorException(
          `Refusing to build a storage key from an unsafe segment: ${JSON.stringify(segment)}`,
        );
      }
    }
    return [MATERIAL_KEY_PREFIX, ...segments].join('/');
  }

  /**
   * Reads an object's bytes into memory.
   *
   * This is NOT a hole in Security rule 5. That rule is about UPLOADS: a
   * file must never travel through this process on its way in, because an
   * exam's worth of concurrent uploads would make the API the bottleneck,
   * and there is a presigned URL for exactly that. Grading is the opposite
   * shape — the server has to read the words to grade them, one submission
   * at a time, after the exam is over. There is no version of that which
   * does not read the file.
   *
   * When grading moves to a worker, this call moves with it and the API
   * process stops reading submissions again.
   */
  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = response.Body;
    if (!body) {
      throw new InternalServerErrorException(`Object ${key} has no body`);
    }
    return Buffer.from(await body.transformToByteArray());
  }

  /**
   * Removes one object. Used when a teacher deletes a material they
   * uploaded by mistake — dropping only the row would leave the file in
   * storage forever, still readable by anyone holding an old signed URL.
   *
   * A missing object is success, not an error: the caller's intent is "this
   * should not exist", and it already does not.
   */
  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) {
        return;
      }
      this.logger.error(
        `DeleteObject failed for key ${key}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Where a student's periodic snapshot lives. Same segment validation as
   * a submission key, and for the same reason: a caller must not be able to
   * build a key that walks out of its own prefix.
   */
  buildBackupKey(examSessionId: string, studentMssv: string): string {
    const segments = [examSessionId, studentMssv];
    for (const segment of segments) {
      if (!segment || !SAFE_KEY_SEGMENT_REGEX.test(segment)) {
        throw new InternalServerErrorException(
          `Refusing to build a storage key from an unsafe segment: ${JSON.stringify(segment)}`,
        );
      }
    }
    return [BACKUP_KEY_PREFIX, ...segments, BACKUP_OBJECT_NAME].join('/');
  }

  /**
   * Presigned GET for exactly this key — used to hand a student's own
   * snapshot back to them after their machine was wiped.
   *
   * Reading through this server instead would mean an exam's worth of
   * archives streaming through the API process, which is the bottleneck
   * Security rule 5 exists to prevent. The signature covers the key, so the
   * URL cannot be pointed at anyone else's backup.
   */
  async generateDownloadUrl(
    key: string,
    expiresInSeconds: number = DOWNLOAD_URL_TTL_SECONDS,
  ): Promise<{ downloadUrl: string; expiresIn: number }> {
    const expiresIn = Math.min(
      Math.max(1, Math.floor(expiresInSeconds)),
      DOWNLOAD_URL_TTL_SECONDS,
    );
    const downloadUrl = await getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
    return { downloadUrl, expiresIn };
  }

  /**
   * Presigned PUT for exactly this key. The signature covers the key, so
   * the URL cannot be replayed against a different object — an agent that
   * somehow learned another student's URL still could not overwrite a third
   * student's submission with it, and could not write anywhere outside
   * `submissions/` at all.
   *
   * Expiry is bounded by UPLOAD_URL_TTL_SECONDS: this is a write grant, and
   * an unbounded one would outlive the exam.
   */
  async generateUploadUrl(
    key: string,
    expiresInSeconds: number = UPLOAD_URL_TTL_SECONDS,
  ): Promise<{ uploadUrl: string; expiresIn: number }> {
    const expiresIn = Math.min(Math.max(1, Math.floor(expiresInSeconds)), UPLOAD_URL_TTL_SECONDS);
    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
    return { uploadUrl, expiresIn };
  }

  /**
   * Whether the object is really there. This is what stops an agent from
   * calling `submission:confirm` without ever having uploaded anything —
   * the server asks storage instead of taking the agent's word for it.
   *
   * A 404/NotFound is the answer "no", not a failure. Anything else is
   * rethrown: a storage outage must surface as an error the caller can
   * report, never as a quiet "not uploaded" that would mark a real
   * submission invalid.
   */
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return true;
    } catch (error) {
      if (isNotFound(error)) {
        return false;
      }
      this.logger.error(
        `HeadObject failed for key ${key}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    // Fail at construction, i.e. at boot. A missing storage credential
    // discovered at the end of an exam — the first moment anything would
    // touch storage — is the worst possible time to find out.
    throw new Error(`${name} is not set (see apps/api/.env.example)`);
  }
  return value;
}

/**
 * HeadObject reports a missing key as a 404 whose `name` differs between
 * S3 and MinIO ('NotFound' vs 'NoSuchKey'), so match on the status code
 * first and treat the names as a fallback.
 */
function isNotFound(error: unknown): boolean {
  if (error instanceof S3ServiceException) {
    if (error.$metadata?.httpStatusCode === 404) {
      return true;
    }
    return error.name === 'NotFound' || error.name === 'NoSuchKey';
  }
  return false;
}
