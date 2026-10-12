import { BadRequestException } from '@nestjs/common';
import { MSG } from './grade-export.messages';
import { toHttpError } from './grade-export.errors';
import { MacroWorkbookError, NotWorkbookError, SheetNotFoundError, SheetTooLargeError, UnsupportedWorkbookError } from './xlsx/workbook-reader';
import { CorruptZipError, EncryptedOrLegacyError, NotZipError, ZipLimitError } from './xlsx/zip-io';

describe('toHttpError — every workbook problem is a Vietnamese 400', () => {
  const cases: [string, Error, string][] = [
    ['CFB', new EncryptedOrLegacyError('x'), MSG.encryptedOrLegacy],
    ['not a zip', new NotZipError('x'), MSG.notZip],
    ['corrupt', new CorruptZipError('x'), MSG.corrupt],
    ['zip limit', new ZipLimitError('20 entry'), MSG.zipLimit('20 entry')],
    ['not a workbook', new NotWorkbookError('x'), MSG.notZip],
    ['macro', new MacroWorkbookError('x'), MSG.macro],
    ['unsupported', new UnsupportedWorkbookError('ô không có địa chỉ (r)'), MSG.unsupported('ô không có địa chỉ (r)')],
    ['too large', new SheetTooLargeError('ô Z9'), MSG.sheetTooLarge('ô Z9')],
    ['no sheet', new SheetNotFoundError('Điểm'), MSG.noSheet('Điểm')],
  ];
  it.each(cases)('%s', (_name, error, message) => {
    const out = toHttpError(error);
    expect(out).toBeInstanceOf(BadRequestException);
    expect((out as BadRequestException).message).toBe(message);
  });
  it('passes an unknown error through untouched — a bug must not be dressed up as a bad file', () => {
    const boom = new Error('boom');
    expect(toHttpError(boom)).toBe(boom);
  });
});
