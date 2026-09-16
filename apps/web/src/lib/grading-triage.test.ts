import { describe, expect, it } from 'vitest';
import {
  advocateScore,
  deltaGroupOf,
  bucketOf,
  countBuckets,
  findAnomalies,
  pointsForVerdict,
} from './grading-triage';
import type { AdvocateOpinion, GradingResult } from '@/lib/api/grading';

type Criterion = GradingResult['criterionResults'][number];

function criterion(over: Partial<Criterion> = {}): Criterion {
  return {
    criterionId: 'c1',
    verdict: 'met',
    points: 4,
    evidence: 'một đoạn dẫn chứng đủ dài',
    check: 'ok',
    ...over,
  };
}

function result(over: Partial<GradingResult> = {}): GradingResult {
  return {
    id: 'r1',
    submissionId: 's1',
    studentMssv: '2151010023',
    studentName: 'Nguyễn Minh Anh',
    status: 'auto_approved',
    modelUsed: 'keyword-match@1',
    aiTotalScore: 4,
    confidence: 0.9,
    flagForReview: false,
    criterionResults: [criterion()],
    advocateOpinion: null,
    contextUsedQuestion: null,
    contextUsedModelAnswer: null,
    finalScore: null,
    reviewedAt: null,
    reviewedByName: null,
    editedCriteria: null,
    ...over,
  };
}

function opinion(over: Partial<AdvocateOpinion> = {}): AdvocateOpinion {
  return {
    isCorrect: 'yes',
    reasoning: 'Em ấy mô tả đúng cơ chế, chỉ thiếu tên gọi.',
    evidence: [],
    suggestedVerdicts: [],
    unverifiedEvidence: [],
    ...over,
  };
}

describe('pointsForVerdict', () => {
  it('khớp pointsFor() của server — nửa thang cho đạt một phần', () => {
    expect(pointsForVerdict('met', 4)).toBe(4);
    expect(pointsForVerdict('partially_met', 4)).toBe(2);
    expect(pointsForVerdict('partially_met', 3)).toBe(1.5);
    expect(pointsForVerdict('not_met', 4)).toBe(0);
  });
});

describe('bucketOf', () => {
  it('"treo" chỉ khi hàng đợi KHÔNG còn job nào chạy', () => {
    // GRADE_JOB_TIMEOUT_MS là biến của server; màn hình không biết nó và
    // không được đoán bằng đồng hồ của mình.
    const grading = result({ status: 'ai_grading' });
    expect(bucketOf(grading, 3)).not.toBe('stuck');
    expect(bucketOf(grading, 0)).toBe('stuck');
  });

  it('tin cậy cao cần CẢ độ tin cậy lẫn mọi trích dẫn khớp', () => {
    expect(bucketOf(result({ confidence: 0.9 }), 0)).toBe('high');
    expect(
      bucketOf(result({ confidence: 0.9, criterionResults: [criterion({ check: 'unverified' })] }), 0),
    ).toBe('low');
    expect(bucketOf(result({ confidence: 0.4 }), 0)).toBe('low');
  });

  it('check null KHÔNG được coi là ok', () => {
    // null = chấm trước khi hệ thống ghi lại phép đối chiếu. Coi nó là 'ok'
    // làm mọi bài cũ trông như đã được kiểm.
    expect(
      bucketOf(result({ confidence: 0.95, criterionResults: [criterion({ check: null })] }), 0),
    ).toBe('low');
  });

  it('flagged thắng mọi phân loại theo độ tin cậy', () => {
    expect(bucketOf(result({ status: 'flagged_for_review', confidence: 0.99 }), 0)).toBe('flagged');
  });

  it('countBuckets cộng đủ, không bỏ sót bài nào', () => {
    const results = [
      result({ confidence: 0.9 }),
      result({ confidence: 0.3 }),
      result({ status: 'flagged_for_review' }),
      result({ status: 'ai_grading' }),
    ];
    const counts = countBuckets(results, 0);
    expect(counts).toEqual({ high: 1, low: 1, flagged: 1, stuck: 1 });
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(results.length);
  });
});

describe('advocateScore', () => {
  const max = new Map([['c1', 4]]);

  it('quy điểm từ mức đánh giá kiến nghị, theo đúng thang rubric', () => {
    const got = advocateScore(
      result({
        criterionResults: [criterion({ verdict: 'not_met', points: 0 })],
        advocateOpinion: opinion({
          suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'partially_met', why: '' }],
        }),
      }),
      max,
    );
    expect(got).toBe(2);
  });

  it('trả null khi lượt phản biện KHÔNG chạy', () => {
    expect(advocateScore(result({ advocateOpinion: null }), max)).toBeNull();
  });

  it('tiêu chí lượt phản biện không nhắc tới thì GIỮ điểm của lượt chấm', () => {
    // Im lặng nghĩa là "không có ý kiến", không phải "đề nghị 0 điểm".
    const got = advocateScore(
      result({
        criterionResults: [
          criterion({ criterionId: 'c1', verdict: 'not_met', points: 0 }),
          criterion({ criterionId: 'c2', verdict: 'met', points: 3 }),
        ],
        advocateOpinion: opinion({
          suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: 'met', why: '' }],
        }),
      }),
      new Map([
        ['c1', 4],
        ['c2', 3],
      ]),
    );
    expect(got).toBe(7);
  });
});

describe('findAnomalies', () => {
  const max = new Map([['c2', 4]]);

  function lost(n: number, of: number): GradingResult[] {
    return Array.from({ length: of }, (_, i) =>
      result({
        criterionResults: [
          criterion({ criterionId: 'c2', verdict: i < n ? 'not_met' : 'met', points: 0 }),
        ],
      }),
    );
  }

  it('bắt tiêu chí bị trừ điểm hàng loạt từ ngưỡng 60%', () => {
    expect(findAnomalies(lost(7, 10), max)).toContainEqual(
      expect.objectContaining({ kind: 'criterion-mass-loss', criterionId: 'c2', count: 7, total: 10 }),
    );
  });

  it('không báo khi dưới ngưỡng', () => {
    expect(
      findAnomalies(lost(5, 10), max).filter((a) => a.kind === 'criterion-mass-loss'),
    ).toEqual([]);
  });

  it('đếm bài có trích dẫn không định vị được', () => {
    const results = [
      result({ criterionResults: [criterion({ check: 'unverified' })] }),
      result({ criterionResults: [criterion({ check: 'ok' })] }),
    ];
    expect(findAnomalies(results, max)).toContainEqual(
      expect.objectContaining({ kind: 'unlocatable-evidence', count: 1, total: 2 }),
    );
  });

  it('đo khoảng cách trung bình giữa hai lập luận, bỏ qua bài đồng thuận', () => {
    const results = [
      // lệch 4: lượt chấm 0, phản biện quy ra 4
      result({
        aiTotalScore: 0,
        criterionResults: [criterion({ criterionId: 'c2', verdict: 'not_met', points: 0 })],
        advocateOpinion: opinion({
          suggestedVerdicts: [{ criterionId: 'c2', suggestedVerdict: 'met', why: '' }],
        }),
      }),
      // đồng thuận: không vào phép trung bình
      result({
        aiTotalScore: 0,
        criterionResults: [criterion({ criterionId: 'c2', verdict: 'not_met', points: 0 })],
        advocateOpinion: opinion({ suggestedVerdicts: [] }),
      }),
    ];
    expect(findAnomalies(results, max)).toContainEqual(
      expect.objectContaining({ kind: 'advocate-dissent', count: 1, averageGap: 4 }),
    );
  });

  it('danh sách rỗng không sinh bất thường nào', () => {
    expect(findAnomalies([], max)).toEqual([]);
  });
});

describe('deltaGroupOf', () => {
  const max = new Map([['c1', 4]]);

  function withAdvocate(aiPoints: number, suggested: 'met' | 'partially_met' | 'not_met') {
    return result({
      aiTotalScore: aiPoints,
      criterionResults: [criterion({ criterionId: 'c1', verdict: 'not_met', points: aiPoints })],
      advocateOpinion: opinion({
        suggestedVerdicts: [{ criterionId: 'c1', suggestedVerdict: suggested, why: '' }],
      }),
    });
  }

  it('không có ý kiến phản biện → nhóm RIÊNG, không gộp vào "không lệch"', () => {
    // Gộp vào "không lệch" là nói dối: hai lượt không hề đồng thuận, chỉ có
    // một lượt lên tiếng.
    expect(deltaGroupOf(result({ advocateOpinion: null }), max)).toBe('no-advocate');
  });

  it('hai lượt cho cùng điểm → zero', () => {
    expect(deltaGroupOf(withAdvocate(0, 'not_met'), max)).toBe('zero');
  });

  it('lệch ĐÚNG 1,5 vẫn thuộc nhóm dưới', () => {
    // AI 0.5, phản biện đề nghị partially_met = 2 ⇒ lệch đúng 1.5.
    // Biên phải nằm ở một phía cố định, không thì một bài lệch đúng ngưỡng
    // rơi vào nhóm nào là tuỳ thứ tự hai câu `if`.
    expect(deltaGroupOf(withAdvocate(0.5, 'partially_met'), max)).toBe('small');
  });

  it('lệch trên 1,5 → large', () => {
    expect(deltaGroupOf(withAdvocate(0, 'met'), max)).toBe('large');
  });
});
