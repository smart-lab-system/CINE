import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  decodeFilename,
  safeFilename,
} from '../../master-data/roster/roster-upload';

export const EXAM_PACKAGES_BUCKET = 'exam-packages';

export const MAX_EXAM_FILE_BYTES = 50 * 1024 * 1024;

export const EXAM_FILE_CONTENT_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx':
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const ALLOWED_EXTENSIONS = Object.keys(EXAM_FILE_CONTENT_TYPES);

export function examPackagesBucket(): string {
  return process.env.MINIO_EXAM_PACKAGES_BUCKET ?? EXAM_PACKAGES_BUCKET;
}

export function assertExamFileUpload(file?: {
  originalname: string;
  buffer: Buffer;
}): { body: Buffer; originalFilename: string; extension: string } {
  if (!file?.buffer?.length) {
    throw new BadRequestException('An exam file is required.');
  }
  if (file.buffer.length > MAX_EXAM_FILE_BYTES) {
    throw new BadRequestException('Exam file must be 50 MB or smaller.');
  }
  const originalFilename = decodeFilename(file.originalname);
  const extension = extname(originalFilename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    throw new BadRequestException(
      'Exam file must be .pdf, .zip, .doc, .docx, .xls, or .xlsx.',
    );
  }
  return { body: file.buffer, originalFilename, extension };
}

export function examObjectKey(
  eventId: string,
  originalFilename: string,
): string {
  return `${eventId}/${randomUUID()}/${safeFilename(originalFilename)}`;
}
