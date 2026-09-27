import type { DeliverableType } from '../exam-session/entities/required-deliverable.entity';
import type { DeclaredLanguage } from '../exam-session/declared-language';
import type { GradingPipeline } from './grading-model.types';

/** Ngôn ngữ sandbox chạy được (§3.5). */
export const INVESTIGATOR_LANGUAGES: ReadonlySet<DeclaredLanguage> = new Set<DeclaredLanguage>(['cpp', 'python']);

/**
 * Đường chấm của một bài, gán MỘT lần lúc `startGrading` tạo dòng (§14.1): `investigator` khi bài
 * là `code_project` và khai `cpp`/`python`; mọi trường hợp khác là `one_shot`. Chấm lại giữ nguyên
 * đường (§2.3 luật 8) — trigger vòng đời chặn đổi cột.
 */
export function pipelineFor(d: { deliverableType: DeliverableType; language: DeclaredLanguage | null }): GradingPipeline {
  return d.deliverableType === 'code_project' && d.language !== null && INVESTIGATOR_LANGUAGES.has(d.language)
    ? 'investigator'
    : 'one_shot';
}
