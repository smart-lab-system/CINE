import { regradeRefusal, REGRADE_MESSAGES } from './regrade.service';

const row = (over: Partial<Parameters<typeof regradeRefusal>[0]> = {}) => ({
  status: 'flagged_for_review' as const,
  aiTotalScore: null as string | null,
  ungradableClass: 'system' as 'system' | 'submission' | null,
  ...over,
});

describe('regradeRefusal (G3 §4.1) — nothing here needs a database', () => {
  it('a system-class result with no score is allowed', () => {
    expect(regradeRefusal(row())).toBeNull();
  });

  // Review Focus #2: pressing the button twice. The second time the row is already back in
  // `ai_grading` and its class is NULL — checking the class first would say the submission
  // was unreadable, which is a lie. The status check must come first.
  it('a result already being graded is in_progress (409) even though its class is now NULL', () => {
    expect(regradeRefusal(row({ status: 'ai_grading', ungradableClass: null }))).toEqual({
      code: 'in_progress',
      status: 409,
      message: REGRADE_MESSAGES.in_progress,
    });
  });

  it('ai_graded counts as being graded', () => {
    expect(regradeRefusal(row({ status: 'ai_graded', ungradableClass: null }))?.code).toBe('in_progress');
  });

  it('a flagged result that carries a score has_score (400)', () => {
    expect(regradeRefusal(row({ aiTotalScore: '7.00' }))).toEqual({
      code: 'has_score',
      status: 400,
      message: REGRADE_MESSAGES.has_score,
    });
  });

  it.each(['auto_approved', 'audit_pending', 'teacher_reviewed', 'finalized', 'exported'] as const)(
    'a %s result already has a result (400)',
    (status) => {
      expect(regradeRefusal(row({ status, ungradableClass: null }))?.code).toBe('has_score');
    },
  );

  it('a submission-class result says the only way is grading by hand (400)', () => {
    const refusal = regradeRefusal(row({ ungradableClass: 'submission' }));
    expect(refusal).toMatchObject({ code: 'submission_class', status: 400 });
    expect(refusal?.message).toContain('lối duy nhất là chấm tay');
  });

  it('flagged, no score and no class is not an ungradable result (400)', () => {
    expect(regradeRefusal(row({ ungradableClass: null }))?.code).toBe('not_ungradable');
  });

  it('the messages are the ones the spec fixes, word for word', () => {
    expect(REGRADE_MESSAGES).toEqual({
      in_progress: 'Bài này đang được chấm — chưa cần chấm lại.',
      has_score:
        'Bài này đã có kết quả — chấm lại là đổi thước sau khi đã đo. Nếu điểm chưa đúng, hãy chấm tay: thao tác đó có ghi nhật ký.',
      submission_class:
        'Bài này không chấm được vì bài làm không đọc được — chấm lại sẽ ra đúng kết quả cũ, nên lối duy nhất là chấm tay.',
      not_ungradable: 'Bài này không ở trạng thái không chấm được.',
    });
  });
});
