import { Allow } from 'class-validator';

/**
 * Mức trừ của một luật: chuỗi thập phân tối đa hai chữ số lẻ, hoặc null (chưa có giá). Không
 * `@IsNumber` — điểm không đi qua số thực (§13.2); `parseDeduction` từ chối `number`.
 */
export class PriceBodyDto {
  @Allow()
  deduction!: unknown;
}
