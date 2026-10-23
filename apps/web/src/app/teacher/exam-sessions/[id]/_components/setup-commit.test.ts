import { describe, expect, it } from 'vitest';
import { finishPlan, saveDraftPlan } from './setup-commit';
import type { SetupDraft, SetupServerBaseline } from './setup-draft';

function futureInfo(over: Partial<SetupServerBaseline['info']> = {}) {
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    examType: 'TK',
    roomId: 'room-1',
    startLocal: local(start),
    endLocal: local(end),
    ...over,
  };
}

function server(over: Partial<SetupServerBaseline> = {}): SetupServerBaseline {
  return {
    info: futureInfo(),
    folder: { requiredFilenames: [{ value: 'Bai.docx', deliverableType: 'document' }] },
    rubricId: 'rubric-1',
    ...over,
  };
}

function draft(partial: Partial<SetupDraft>): SetupDraft {
  return { sessionId: 's1', updatedAt: '2026-10-22T00:00:00.000Z', ...partial };
}

describe('saveDraftPlan', () => {
  it('giờ kết thúc trước giờ bắt đầu không ném — info nằm trong nháp', () => {
    const base = server();
    const plan = saveDraftPlan(
      draft({
        info: futureInfo({
          startLocal: base.info.endLocal,
          endLocal: base.info.startLocal,
        }),
      }),
      base,
    );
    expect(plan.actions).toEqual([]);
    expect(plan.kept?.info).toBeDefined();
  });

  it('thư mục sai schema được giữ, thông tin chung hợp lệ vẫn được ghi', () => {
    const plan = saveDraftPlan(
      draft({
        info: futureInfo({ examType: 'GK' }),
        folder: { requiredFilenames: [{ value: '', deliverableType: 'document' }] },
      }),
      server(),
    );
    expect(plan.actions.map((action) => action.kind)).toEqual(['info']);
    expect(plan.kept?.folder?.requiredFilenames[0]?.value).toBe('');
  });
});

describe('finishPlan', () => {
  it('thiếu file nộp thì chặn ở Đề & thư mục và không có PUT', () => {
    const result = finishPlan(
      null,
      server({ folder: { requiredFilenames: [{ value: '', deliverableType: 'document' }] } }),
      { status: 'scheduled', studentCount: 2, materialCount: 0 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.step).toBe('materials');
      expect(result.blockReason).toMatch(/thư mục/i);
    }
  });

  it('chỉ thiếu rubric thì vẫn cho ghi', () => {
    const result = finishPlan(null, server({ rubricId: null }), {
      status: 'scheduled',
      studentCount: 2,
      materialCount: 0,
    });
    expect(result.ok).toBe(true);
  });

  it('giờ không hợp lệ thì chặn ở Thông tin chung', () => {
    const base = server();
    const result = finishPlan(
      draft({
        info: futureInfo({
          startLocal: base.info.endLocal,
          endLocal: base.info.startLocal,
        }),
      }),
      base,
      { status: 'scheduled', studentCount: 1, materialCount: 1 },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.step).toBe('info');
  });
});
