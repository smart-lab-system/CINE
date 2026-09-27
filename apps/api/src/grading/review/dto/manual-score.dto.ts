import { Allow } from 'class-validator';

/** Điểm cả bài: chuỗi thập phân tối đa hai chữ số lẻ — `ErrorExceptionService` kiểm, từ chối `number`. */
export class ManualScoreDto {
  @Allow()
  score!: unknown;
}
