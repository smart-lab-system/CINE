export class ObjectNotFoundError extends Error {
  constructor(bucket: string, key: string) {
    super(`Object not found: ${bucket}/${key}`);
    this.name = 'ObjectNotFoundError';
  }
}

export type PutObjectInput = {
  bucket: string;
  key: string;
  body: Buffer;
  contentType?: string;
};

export interface ObjectStorage {
  putObject(input: PutObjectInput): Promise<{ etag: string }>;
  getObject(bucket: string, key: string): Promise<Buffer>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
