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
 * Khoá cho token của lượt hỏng mà không biết thuộc model nào: `ModelsExhaustedError.usage` và
 * `DeadlineExceededError.usage` cộng dồn qua nhiều bậc đã thử. Có khoá này thì `costOf` biết
 * rằng tổng chi phí chỉ là cận dưới và trả `null` thay vì một con số thiếu.
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
