import { InternalServerErrorException } from '@nestjs/common';
import { SAFE_KEY_SEGMENT_REGEX } from '../storage/storage.types';

const PREFIX = 'grade-exports';

/** Mọi đoạn khoá là uuid hoặc hằng của ta; ném thay vì âm thầm sửa (như `StorageService.buildMaterialKey`). */
function key(...segments: string[]): string {
  for (const segment of segments) {
    if (!segment || !SAFE_KEY_SEGMENT_REGEX.test(segment)) {
      throw new InternalServerErrorException(`Refusing to build a storage key from an unsafe segment: ${JSON.stringify(segment)}`);
    }
  }
  return [PREFIX, ...segments].join('/');
}

/** File sổ điểm mẫu giảng viên tải lên. Khoá dựng từ phiên + id do SERVER cấp — không bao giờ từ body. */
export const buildTemplateKey = (sessionId: string, templateId: string): string => key(sessionId, 'templates', templateId);

/** File đã ghi điểm do server sinh. */
export const buildOutputKey = (sessionId: string, exportId: string): string => key(sessionId, 'outputs', exportId);
