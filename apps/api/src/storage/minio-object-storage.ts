import { Client } from 'minio';
import {
  ObjectNotFoundError,
  ObjectStorage,
  PutObjectInput,
} from './object-storage';

export type MinioObjectStorageOptions = {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
};

export class MinioObjectStorage implements ObjectStorage {
  private readonly client: Client;
  private readonly ensuredBuckets = new Set<string>();

  constructor(options: MinioObjectStorageOptions, client?: Client) {
    this.client =
      client ??
      new Client({
        endPoint: options.endPoint,
        port: options.port,
        useSSL: options.useSSL,
        accessKey: options.accessKey,
        secretKey: options.secretKey,
      });
  }

  async putObject(input: PutObjectInput): Promise<{ etag: string }> {
    await this.ensureBucket(input.bucket);
    const etag = await this.client.putObject(
      input.bucket,
      input.key,
      input.body,
      input.body.length,
      input.contentType ? { 'Content-Type': input.contentType } : undefined,
    );
    return { etag: String(etag).replaceAll('"', '') };
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
    } catch (error) {
      if (isMinioNotFound(error)) {
        throw new ObjectNotFoundError(bucket, key);
      }
      throw error;
    }
  }

  private async ensureBucket(bucket: string): Promise<void> {
    if (this.ensuredBuckets.has(bucket)) {
      return;
    }
    const exists = await this.client.bucketExists(bucket);
    if (!exists) {
      await this.client.makeBucket(bucket);
    }
    this.ensuredBuckets.add(bucket);
  }
}

function isMinioNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: string }).code;
  return code === 'NoSuchKey' || code === 'NotFound';
}
