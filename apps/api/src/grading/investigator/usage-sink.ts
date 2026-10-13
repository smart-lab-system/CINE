/**
 * Token đã tiêu, tách theo model (P0 đo nền). Một lượt chấm xoay giữa nhiều bậc model, và bốn
 * lăng kính chạy thêm trên chính các bậc đó — nên chi phí chỉ tính đúng được khi biết MODEL NÀO
 * đã tiêu bao nhiêu. Thuần: không DB, không model (nằm trong `grading/investigator/`, nơi
 * `no-db.import-scan.spec.ts` cấm mọi đường tới DB).
 */
export interface ModelUsage {
  inputTokens: number;
  outputTokens: number;
}

export type UsageByModel = Record<string, ModelUsage>;

/**
 * Khoá cho token đã tiêu mà không biết thuộc model nào. `ModelPool` tách token theo bậc nên đường
 * thường không dùng khoá này; nó chỉ còn cho lỗi dựng tay không mang `usageByModel` (`addSpend`) và
 * cho test. Có khoá này thì `costOf` biết tổng chi phí chỉ là cận dưới và trả `null` thay vì một
 * con số thiếu.
 */
export const UNATTRIBUTED = '(không rõ model)';

/**
 * MỘT sink cho MỘT lượt chấm. Các lăng kính là singleton dùng chung cho mọi job đang chạy, nên
 * sink phải đi theo lời gọi (tham số), KHÔNG được là trạng thái của lăng kính — không thì token
 * của hai bài chấm đồng thời lẫn vào nhau.
 */
export class UsageSink {
  private readonly by: UsageByModel = {};

  add(model: string, usage: ModelUsage): void {
    const current = this.by[model] ?? { inputTokens: 0, outputTokens: 0 };
    this.by[model] = {
      inputTokens: current.inputTokens + usage.inputTokens,
      outputTokens: current.outputTokens + usage.outputTokens,
    };
  }

  /**
   * Cộng khoản chi của MỘT lần hỏi pool. `perModel` (từ `ModelPool`) tách theo từng bậc đã tiêu — kể cả
   * bậc hỏng rồi bị loại, vì `usage` của lần hỏi là TỔNG mọi bậc đã thử còn `model` chỉ là bậc trả lời
   * cuối: ghi tổng vào bậc cuối là gán token của bậc A cho giá của bậc B. Thiếu `perModel` (lỗi dựng
   * tay) thì cả khoản vào `UNATTRIBUTED`, để `costOf` biết tổng chỉ là cận dưới.
   */
  addSpend(perModel: UsageByModel | undefined, total: ModelUsage): void {
    if (perModel) {
      for (const [model, usage] of Object.entries(perModel)) this.add(model, usage);
      return;
    }
    this.add(UNATTRIBUTED, total);
  }

  snapshot(): UsageByModel {
    return JSON.parse(JSON.stringify(this.by)) as UsageByModel;
  }
}

export function mergeUsage(...parts: UsageByModel[]): UsageByModel {
  const sink = new UsageSink();
  for (const part of parts) for (const [model, usage] of Object.entries(part)) sink.add(model, usage);
  return sink.snapshot();
}

export function totalOf(usage: UsageByModel): ModelUsage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const u of Object.values(usage)) {
    inputTokens += u.inputTokens;
    outputTokens += u.outputTokens;
  }
  return { inputTokens, outputTokens };
}
