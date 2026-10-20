import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { RulerOutcome, RulerProvider, RulerProviderFailure, RulerRequest } from './ruler-provider';

/**
 * Chạy khi không có model thật (`NODE_ENV=test`, hoặc máy chưa khai `ANTHROPIC_API_KEY`).
 *
 * KHÁC stub soạn đề: stub soạn đề trả một đề mẫu cố định để cả luồng đi thử được. Ở đây một thước mẫu cố định là
 * nguy hiểm — nó trông như một gói test thật cho một đề không liên quan. Nên stub từ chối, nói rõ thiếu gì. Test e2e
 * thay provider này bằng bản giả có kịch bản (`overrideProvider(RULER_PROVIDER)`).
 */
@Injectable()
export class StubRulerProvider implements RulerProvider {
  readonly name = 'stub-ruler';

  async propose(_request: RulerRequest): Promise<RulerOutcome> {
    throw new RulerProviderFailure(
      new ServiceUnavailableException('Chưa cấu hình model sinh gói test trên máy chủ này (thiếu ANTHROPIC_API_KEY).'),
      null,
    );
  }
}
