import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { MSG } from './grade-export.messages';

/**
 * Đưa file kết quả (do SERVER sinh) lên storage bằng `PUT` tới URL ký sẵn mà chính `generateUploadUrl` cấp — như
 * helper `putObject` của test (spec D3). Rule 5 cấm byte của CLIENT đi qua NestJS; byte này do ta dựng. Không thêm
 * `StorageService.putObject`: G2 đang khôi phục chính hàm đó trong file ấy.
 */
@Injectable()
export class GradeExportFileStore {
  constructor(private readonly storage: StorageService) {}

  async put(key: string, bytes: Buffer): Promise<void> {
    const { uploadUrl } = await this.storage.generateUploadUrl(key);
    const res = await fetch(uploadUrl, { method: 'PUT', body: new Uint8Array(bytes) });
    if (!res.ok) throw new InternalServerErrorException(MSG.outputWriteFailed(res.status));
  }
}
