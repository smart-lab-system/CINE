import { BadRequestException } from '@nestjs/common';
import { MSG } from './grade-export.messages';
import { MacroWorkbookError, NotWorkbookError, SheetNotFoundError, SheetTooLargeError, UnsupportedWorkbookError } from './xlsx/workbook-reader';
import { CorruptZipError, EncryptedOrLegacyError, NotZipError, ZipLimitError } from './xlsx/zip-io';

/** Một chỗ duy nhất biến lỗi của lớp `.xlsx` thành câu tiếng Việt. Lỗi lạ được trả NGUYÊN — một bug không được giả làm file xấu. */
export function toHttpError(error: unknown): unknown {
  if (error instanceof EncryptedOrLegacyError) return new BadRequestException(MSG.encryptedOrLegacy);
  if (error instanceof NotZipError || error instanceof NotWorkbookError) return new BadRequestException(MSG.notZip);
  if (error instanceof CorruptZipError) return new BadRequestException(MSG.corrupt);
  if (error instanceof ZipLimitError) return new BadRequestException(MSG.zipLimit(error.message));
  if (error instanceof MacroWorkbookError) return new BadRequestException(MSG.macro);
  if (error instanceof UnsupportedWorkbookError) return new BadRequestException(MSG.unsupported(error.message));
  if (error instanceof SheetTooLargeError) return new BadRequestException(MSG.sheetTooLarge(error.message));
  if (error instanceof SheetNotFoundError) return new BadRequestException(MSG.noSheet(error.message));
  return error;
}
