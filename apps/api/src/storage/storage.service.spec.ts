import { InternalServerErrorException } from '@nestjs/common';

// Mocked before the service is imported: StorageService constructs its
// S3Client in the constructor, so a real client would try to resolve
// credentials during `new StorageService()`.
const sendMock = jest.fn();
const getSignedUrlMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  class FakeS3ServiceException extends Error {
    $metadata: { httpStatusCode?: number } = {};
    constructor(name: string, httpStatusCode?: number) {
      super(name);
      this.name = name;
      this.$metadata = { httpStatusCode };
    }
  }
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: sendMock })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ __type: 'Put', input })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ __type: 'Head', input })),
    S3ServiceException: FakeS3ServiceException,
  };
});

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => getSignedUrlMock(...args),
}));

import { S3ServiceException } from '@aws-sdk/client-s3';
import { StorageService } from './storage.service';
import { UPLOAD_URL_TTL_SECONDS } from './storage.types';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const DELIVERABLE_ID = '22222222-2222-4222-8222-222222222222';
const MSSV = '20120001';

function s3Error(name: string, status: number): Error {
  return new (S3ServiceException as unknown as new (n: string, s?: number) => Error)(
    name,
    status,
  );
}

describe('StorageService', () => {
  let service: StorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.STORAGE_ENDPOINT = 'http://localhost:9010';
    process.env.STORAGE_ACCESS_KEY = 'test-key';
    process.env.STORAGE_SECRET_KEY = 'test-secret';
    process.env.STORAGE_BUCKET = 'test-bucket';
    getSignedUrlMock.mockResolvedValue('http://localhost:9010/signed');
    service = new StorageService();
  });

  describe('buildSubmissionKey', () => {
    it('produces the agreed layout', () => {
      expect(service.buildSubmissionKey(SESSION_ID, MSSV, DELIVERABLE_ID)).toBe(
        `submissions/${SESSION_ID}/${MSSV}/${DELIVERABLE_ID}`,
      );
    });

    it.each([
      ['a path separator', '../../etc'],
      ['a bare traversal', '..'],
      ['a slash', 'a/b'],
      ['an empty segment', ''],
    ])('refuses to build a key from %s', (_label, mssv) => {
      // Throws rather than sanitizing: a rewritten key would put the object
      // somewhere neither the DB row nor a later objectExists() expects.
      expect(() => service.buildSubmissionKey(SESSION_ID, mssv, DELIVERABLE_ID)).toThrow(
        InternalServerErrorException,
      );
    });
  });

  describe('generateUploadUrl', () => {
    it('signs a PUT scoped to exactly the requested bucket and key', async () => {
      const key = service.buildSubmissionKey(SESSION_ID, MSSV, DELIVERABLE_ID);

      const result = await service.generateUploadUrl(key, 300);

      expect(result).toEqual({ uploadUrl: 'http://localhost:9010/signed', expiresIn: 300 });
      const [, command, options] = getSignedUrlMock.mock.calls[0];
      expect(command.input).toEqual({ Bucket: 'test-bucket', Key: key });
      expect(options).toEqual({ expiresIn: 300 });
    });

    it('caps the lifetime of the write grant', async () => {
      // An unbounded presigned PUT would outlive the exam it belongs to.
      await service.generateUploadUrl('submissions/x/y/z', 86_400);

      expect(getSignedUrlMock.mock.calls[0][2]).toEqual({
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      });
    });

    it('defaults to the configured TTL', async () => {
      await service.generateUploadUrl('submissions/x/y/z');

      expect(getSignedUrlMock.mock.calls[0][2]).toEqual({
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      });
    });
  });

  describe('objectExists', () => {
    it('returns true when HeadObject succeeds', async () => {
      sendMock.mockResolvedValue({});

      expect(await service.objectExists('submissions/x/y/z')).toBe(true);
      expect(sendMock.mock.calls[0][0].input).toEqual({
        Bucket: 'test-bucket',
        Key: 'submissions/x/y/z',
      });
    });

    it('returns false on a 404, without throwing', async () => {
      sendMock.mockRejectedValue(s3Error('NotFound', 404));

      expect(await service.objectExists('submissions/x/y/z')).toBe(false);
    });

    it('rethrows a storage outage instead of reporting "not uploaded"', async () => {
      // A 500 answered as `false` would mark a real, uploaded submission
      // invalid — the one failure mode this method must never have.
      sendMock.mockRejectedValue(s3Error('InternalError', 500));

      await expect(service.objectExists('submissions/x/y/z')).rejects.toThrow();
    });
  });

  describe('configuration', () => {
    it('fails at construction when a storage credential is missing', () => {
      delete process.env.STORAGE_BUCKET;

      // Discovering this at the end of an exam — the first moment anything
      // touches storage — is the worst possible time.
      expect(() => new StorageService()).toThrow(/STORAGE_BUCKET/);
    });
  });
});
