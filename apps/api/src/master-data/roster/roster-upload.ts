import { extname } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import {
  parseCourseRoster,
  RosterParseError,
} from './parse-course-roster';

export const MAX_ROSTER_FILE_BYTES = 5 * 1024 * 1024;

export const ROSTER_CONTENT_TYPES: Record<string, string> = {
  '.xls': 'application/vnd.ms-excel',
  '.xlsx':
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

export function parseRosterOrThrow(buffer: Buffer) {
  try {
    return parseCourseRoster(buffer);
  } catch (error) {
    if (error instanceof RosterParseError) {
      throw new BadRequestException(error.message);
    }
    throw error;
  }
}

export function assertRosterUploadFile(file?: {
  originalname: string;
  buffer: Buffer;
}): { body: Buffer; originalFilename: string } {
  if (!file?.buffer?.length) {
    throw new BadRequestException('A roster Excel file is required.');
  }
  if (file.buffer.length > MAX_ROSTER_FILE_BYTES) {
    throw new BadRequestException('Roster file must be 5 MB or smaller.');
  }
  const originalFilename = decodeFilename(file.originalname);
  const extension = extname(originalFilename).toLowerCase();
  if (extension !== '.xls' && extension !== '.xlsx') {
    throw new BadRequestException('Roster file must be .xls or .xlsx.');
  }
  return { body: file.buffer, originalFilename };
}

export function decodeFilename(name: string): string {
  try {
    return Buffer.from(name, 'latin1').toString('utf8') || name;
  } catch {
    return name;
  }
}

export function safeFilename(name: string): string {
  const trimmed = name.replace(/[/\\]/g, '-').trim();
  return trimmed.slice(0, 180) || 'roster.xls';
}

export function codesEqual(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
