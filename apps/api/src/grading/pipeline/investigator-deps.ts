import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createSandboxClient } from '../../sandbox/sandbox.client';
import { buildInvestigatorTiers, ModelTier } from '../investigator/model-pool';
import type { SandboxPort } from '../investigator/tools';

export const INVESTIGATOR_DEPS = Symbol('INVESTIGATOR_DEPS');

export interface InvestigatorDeps {
  models: ModelTier[];
  /** null = máy chạy API chưa khai hàng đợi sandbox — bài ra không chấm được lớp system. */
  sandbox: SandboxPort | null;
  /** Trần tin cậy của bậc model đã trả lời (§4.2) — chỉ kéo được `llm_only` xuống. */
  ceilingOf(model: string): number;
  close(): Promise<void>;
}

/** Trần mặc định cho model không khớp bậc nào — cùng số với runner eval. */
const UNKNOWN_MODEL_CEILING = 0.5;

/**
 * Bậc model + cổng sandbox của đường điều tra, dựng từ env. Chỉ đọc `SANDBOX_REDIS_URL` (một user
 * ACL riêng của hàng đợi sandbox), KHÔNG rơi về `REDIS_URL` của API: nhầm hai cái là đưa quyền
 * admin Redis của API cho đúng hàng đợi mà máy chạy bài của sinh viên đọc. Không khai thì
 * `sandbox: null` — bài ra không chấm được, chấm lại được khi khai xong.
 */
export function buildInvestigatorDeps(
  env: NodeJS.ProcessEnv,
  factories: {
    tiers: () => ModelTier[];
    sandbox: typeof createSandboxClient;
  } = { tiers: buildInvestigatorTiers, sandbox: createSandboxClient },
  log: (line: string) => void = (line) => new Logger('InvestigatorDeps').warn(line),
): InvestigatorDeps {
  const models = factories.tiers();
  const ceilings = new Map(models.map((m) => [m.model, m.ceiling]));
  const url = env.SANDBOX_REDIS_URL?.trim();
  const built = url ? factories.sandbox({ redisUrl: url, prefix: env.SANDBOX_PREFIX?.trim() || undefined, log }) : null;
  return {
    models,
    sandbox: built?.client ?? null,
    ceilingOf: (model) => ceilings.get(model) ?? UNKNOWN_MODEL_CEILING,
    close: async () => {
      await built?.close();
    },
  };
}

/** Đóng kết nối hàng đợi sandbox khi app tắt — không thì `app.close()` treo trên socket Redis. */
@Injectable()
export class InvestigatorDepsLifecycle implements OnModuleDestroy {
  constructor(@Inject(INVESTIGATOR_DEPS) private readonly deps: InvestigatorDeps) {}

  async onModuleDestroy(): Promise<void> {
    await this.deps.close();
  }
}
