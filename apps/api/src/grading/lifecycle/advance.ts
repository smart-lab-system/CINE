import { EntityManager } from 'typeorm';
import { GradingResultEntity, GradingResultStatus } from '../entities/grading-result.entity';

type AdvanceExtra = Partial<
  Pick<
    GradingResultEntity,
    'finalizedBy' | 'finalizedAt' | 'finalizedComputationId' | 'auditSampled' | 'auditSampledAt' | 'flagForReview'
  >
>;

/**
 * Bước chuyển trạng thái của MỘT kết quả — UPDATE có điều kiện trên trạng thái hiện tại (§14.3).
 * `false` = dòng không ở trạng thái mong đợi, người gọi dừng. Trigger vòng đời là chỗ ÉP bảng
 * chuyển; hàm này không tự kiểm bảng.
 */
export async function advanceStatus(
  m: EntityManager,
  resultId: string,
  from: GradingResultStatus[],
  to: GradingResultStatus,
  extra: AdvanceExtra = {},
): Promise<boolean> {
  const updated = await m
    .createQueryBuilder()
    .update(GradingResultEntity)
    .set({ status: to, ...extra })
    .where('id = :id', { id: resultId })
    .andWhere('status IN (:...from)', { from })
    .execute();
  return (updated.affected ?? 0) > 0;
}
