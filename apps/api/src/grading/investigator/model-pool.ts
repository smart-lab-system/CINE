import { ChatTextRequest, ChatUsage, postChatText } from '../ai-provider/openai-chat';
import { classifyProviderFailure } from '../ai-provider/provider-failure';
import { MAX_TIERS, readTier } from '../ai-provider/select-grading-provider';
// Đổi tên: `describe` của tier-chain trùng tên hàm toàn cục của jest.
import { describe as describeError } from '../ai-provider/tier-chain';

export interface ModelTier {
  /** Nhãn đọc được trong log và hồ sơ. */
  label: string;
  /** Id model thật — thứ ghi vào `modelsUsed` (§8.2: phải nói được AI NÀO). */
  model: string;
  call(request: ChatTextRequest): Promise<{ content: string; usage: ChatUsage }>;
}

export class ModelsExhaustedError extends Error {
  constructor(
    readonly reasons: string[],
    /** Token đã tiêu cho các lượt hỏng của lần hỏi này (review M1). */
    readonly usage: ChatUsage,
  ) {
    super(`mọi bậc model đều hỏng: ${reasons.join('; ')}`);
    this.name = 'ModelsExhaustedError';
  }
}

/** Hết thời gian của cuộc điều tra trước khi có một phản hồi dùng được (review I1). */
export class DeadlineExceededError extends Error {
  constructor(readonly usage: ChatUsage) {
    super('hết thời gian của cuộc điều tra trước khi có phản hồi dùng được');
    this.name = 'DeadlineExceededError';
  }
}

/** Dưới mức này không đáng gửi một lời gọi model: nó chỉ có thể hết giờ. */
export const MIN_ATTEMPT_MS = 1_000;
/** Trần mặc định của MỘT lời gọi khi người gọi không đặt — cùng số với `postChat`. */
const DEFAULT_TIMEOUT_MS = 90_000;

/** Usage mà `postChatText` gắn lên lỗi của một lượt đã tiêu token (bad_output). */
function usageOf(error: unknown): ChatUsage | null {
  const u = (error as { usage?: ChatUsage } | null)?.usage;
  return u && typeof u.inputTokens === 'number' ? u : null;
}

export interface PoolReply<T> {
  value: T;
  usage: ChatUsage;
  model: string;
  rotations: { from: string; reason: string }[];
}

const addUsage = (a: ChatUsage, b: ChatUsage): ChatUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheCreationTokens: a.cacheCreationTokens + b.cacheCreationTokens,
});
const ZERO: ChatUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 };

/**
 * Xoay bậc ở tầng VÒNG LẶP (§7.3). Một cuộc điều tra một pool; danh sách loại trừ sống suốt
 * cuộc điều tra đó. Lịch sử `toolCalls` nằm ở vòng lặp, không ở đây — nên đổi bậc không mất
 * gì của những lời gọi đã chạy.
 *
 *   tier_dead   → loại ngay
 *   bad_output  → thử lại cùng bậc MỘT lần, rồi loại (như TierChain)
 *   transient   → thử lại cùng bậc tới `transientRetries` lần, rồi loại
 *
 * Khác TierChain ở `transient`: TierChain ném ra cho BullMQ chạy lại CẢ job. Với vòng điều
 * tra, chạy lại cả job là trả tiền hai lần cho mọi lời gọi đã có. `TierChain` giữ nguyên —
 * đây là một lớp thêm vào bên trên, không thay thế (§7.3).
 */
export class ModelPool {
  private readonly excluded = new Set<string>();

  constructor(
    private readonly tiers: ModelTier[],
    private readonly opts: { transientRetries?: number; sleep?: (ms: number) => Promise<void> } = {},
  ) {}

  /**
   * `deadline` (mốc thời gian tuyệt đối, cùng đồng hồ với `now`) là CỨNG (review I1): mỗi lần
   * thử chỉ được `min(timeoutMs, phần còn lại)`, và khi phần còn lại dưới `MIN_ATTEMPT_MS` thì
   * không thử, không ngủ chờ thử lại, không xoay bậc nữa — ném `DeadlineExceededError`.
   */
  async ask<T>(
    request: ChatTextRequest,
    parse: (content: string) => T | null,
    limit: { deadline?: number; now?: () => number } = {},
  ): Promise<PoolReply<T>> {
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const transientRetries = this.opts.transientRetries ?? 2;
    const now = limit.now ?? Date.now;
    const left = () => (limit.deadline === undefined ? Infinity : limit.deadline - now());
    const rotations: { from: string; reason: string }[] = [];
    const reasons: string[] = [];
    let spent = ZERO;

    for (const tier of this.tiers) {
      if (this.excluded.has(tier.label)) continue;
      let badOutputs = 0;
      let transients = 0;
      for (;;) {
        if (left() < MIN_ATTEMPT_MS) throw new DeadlineExceededError(spent);
        const attempt = { ...request, timeoutMs: Math.min(request.timeoutMs ?? DEFAULT_TIMEOUT_MS, left()) };
        try {
          const { content, usage } = await tier.call(attempt);
          spent = addUsage(spent, usage);
          const value = parse(content);
          if (value !== null) return { value, usage: spent, model: tier.model, rotations };
          if (++badOutputs >= 2) {
            this.exclude(tier, 'bad_output: phản hồi không đọc được', rotations, reasons);
            break;
          }
        } catch (error) {
          const lost = usageOf(error);
          if (lost) spent = addUsage(spent, lost);
          const kind = classifyProviderFailure(error);
          if (kind === 'bad_output' && ++badOutputs < 2) continue;
          if (kind === 'transient' && transients < transientRetries) {
            transients++;
            const wait = 1_000 * transients;
            if (left() - wait < MIN_ATTEMPT_MS) throw new DeadlineExceededError(spent);
            await sleep(wait);
            continue;
          }
          this.exclude(tier, `${kind}: ${describeError(error)}`, rotations, reasons);
          break;
        }
      }
    }
    throw new ModelsExhaustedError(reasons, spent);
  }

  private exclude(
    tier: ModelTier,
    reason: string,
    rotations: { from: string; reason: string }[],
    reasons: string[],
  ): void {
    this.excluded.add(tier.label);
    rotations.push({ from: tier.label, reason });
    reasons.push(`${tier.label}: ${reason}`);
  }
}

/**
 * Các bậc tương thích OpenAI (`GRADING_TIER1…5_`) — Q10 của plan: bậc Claude (SDK Anthropic)
 * chưa vào pool. Mặt ngược của luật chống tốn tiền: dưới `NODE_ENV=test` trả rỗng.
 */
export function buildInvestigatorTiers(): ModelTier[] {
  if (process.env.NODE_ENV === 'test') return [];
  const tiers: ModelTier[] = [];
  for (let index = 1; index <= MAX_TIERS; index++) {
    const config = readTier(index);
    if (!config) continue;
    tiers.push({
      label: config.tier,
      model: config.model,
      call: (request) => postChatText(config, request),
    });
  }
  return tiers;
}
