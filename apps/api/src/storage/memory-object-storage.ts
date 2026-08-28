import { createHash } from 'node:crypto';
import {
  ObjectNotFoundError,
  ObjectStorage,
  PutObjectInput,
} from './object-storage';

export class MemoryObjectStorage implements ObjectStorage {
  private readonly objects = new Map<string, Buffer>();

  async putObject(input: PutObjectInput): Promise<{ etag: string }> {
    this.objects.set(this.id(input.bucket, input.key), Buffer.from(input.body));
    return { etag: createHash('sha256').update(input.body).digest('hex') };
  }

  async getObject(bucket: string, key: string): Promise<Buffer> {
    const body = this.objects.get(this.id(bucket, key));
    if (!body) {
      throw new ObjectNotFoundError(bucket, key);
    }
    return Buffer.from(body);
  }

  private id(bucket: string, key: string): string {
    return `${bucket}\0${key}`;
  }
}
