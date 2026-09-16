import type { AdvocateOpinion, GradingResult, Rubric } from '@/lib/api/grading';

/** Rubric hai tiêu chí, dùng chung cho mọi test của màn Ma trận. */
export const rubric = {
  id: 'rub-1',
  courseId: 'course-1',
  version: 3,
  isActive: true,
  criteria: [
    { id: 'c1', description: 'Mô tả cơ chế bù trừ', maxPoints: 4 },
    { id: 'c2', description: 'Dẫn ví dụ cụ thể', maxPoints: 3 },
  ],
} as unknown as Rubric;

export function opinion(over: Partial<AdvocateOpinion> = {}): AdvocateOpinion {
  return {
    isCorrect: 'yes',
    reasoning: 'Em ấy mô tả đúng cơ chế bù trừ, chỉ thiếu tên gọi của mẫu thiết kế.',
    evidence: [],
    suggestedVerdicts: [],
    unverifiedEvidence: [],
    ...over,
  } as AdvocateOpinion;
}

export function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    status: 'flagged_for_review',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 1.5,
    confidence: 0.2,
    flagForReview: true,
    criterionResults: [
      { criterionId: 'c1', verdict: 'not_met', points: 0, evidence: 'a', check: 'ok' },
      { criterionId: 'c2', verdict: 'partially_met', points: 1.5, evidence: 'b', check: 'ok' },
    ],
    advocateOpinion: null,
    contextUsedQuestion: null,
    contextUsedModelAnswer: null,
    finalScore: null,
    reviewedAt: null,
    reviewedByName: null,
    editedCriteria: null,
    ...over,
  } as GradingResult;
}

/** Có phản biện, kiến nghị nâng c1 lên met ⇒ lệch 4 điểm (nhóm `large`). */
export const withAdvocate = result({
  advocateOpinion: opinion({
    suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'met', why: 'Đúng nguyên lý.' }],
  }),
});

/** Không có phản biện ⇒ nhóm `no-advocate`. */
export const noAdvocate = result({ id: 'r2', studentName: 'Trần Gia Bảo', studentMssv: '2151010024' });

/** Hai lượt đồng thuận ⇒ nhóm `zero`. */
export const agreed = result({
  id: 'r3',
  studentName: 'Lê Thanh Hà',
  studentMssv: '2151010025',
  advocateOpinion: opinion({
    suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'not_met', why: 'Chưa đạt.' }],
  }),
});

/** Đang được chấm — bài này bị bỏ qua khi áp luật. */
export const stillGrading = result({
  id: 'r4',
  studentName: 'Võ Hoàng Nam',
  studentMssv: '2151010026',
  status: 'ai_grading',
  aiTotalScore: null,
  criterionResults: [],
});

export const maxByCriterion = new Map([
  ['c1', 4],
  ['c2', 3],
]);
