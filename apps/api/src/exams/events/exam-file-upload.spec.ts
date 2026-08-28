import { BadRequestException } from '@nestjs/common';
import {
  assertExamFileUpload,
  examPackagesBucket,
  MAX_EXAM_FILE_BYTES,
} from './exam-file-upload';

describe('exam-file-upload', () => {
  it('rejects missing file', () => {
    expect(() => assertExamFileUpload(undefined)).toThrow(BadRequestException);
  });

  it('rejects unsupported extensions', () => {
    expect(() =>
      assertExamFileUpload({
        originalname: 'notes.txt',
        buffer: Buffer.from('hello'),
      }),
    ).toThrow(/\.pdf, \.zip/);
  });

  it('rejects files larger than the limit', () => {
    expect(() =>
      assertExamFileUpload({
        originalname: 'de-thi.pdf',
        buffer: Buffer.alloc(MAX_EXAM_FILE_BYTES + 1),
      }),
    ).toThrow(/50 MB/);
  });

  it('accepts supported exam files', () => {
    const result = assertExamFileUpload({
      originalname: 'de-thi.pdf',
      buffer: Buffer.from('%PDF-1.4'),
    });
    expect(result.originalFilename).toBe('de-thi.pdf');
    expect(result.extension).toBe('.pdf');
  });

  it('uses default exam packages bucket', () => {
    const previous = process.env.MINIO_EXAM_PACKAGES_BUCKET;
    delete process.env.MINIO_EXAM_PACKAGES_BUCKET;
    expect(examPackagesBucket()).toBe('exam-packages');
    process.env.MINIO_EXAM_PACKAGES_BUCKET = previous;
  });
});
