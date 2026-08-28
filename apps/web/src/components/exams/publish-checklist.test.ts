import { describe, expect, it } from 'vitest';
import { examPublishChecklist } from './publish-checklist';

describe('examPublishChecklist', () => {
  it('is not ready until sections, draft sittings, leads, and a question file exist', () => {
    expect(
      examPublishChecklist({ sections: [], sessions: [], files: [] }).ready,
    ).toBe(false);

    const partial = examPublishChecklist({
      sections: [{ id: 'sec-1' }],
      sessions: [{ id: 'sit-1', status: 'draft', hasLead: false }],
      files: [{ fileRole: 'guide' }],
    });
    expect(partial.ready).toBe(false);
    expect(partial.items.find((i) => i.id === 'leads')?.ok).toBe(false);
    expect(partial.items.find((i) => i.id === 'question')?.ok).toBe(false);
  });

  it('is ready when every publish prerequisite is met', () => {
    const result = examPublishChecklist({
      sections: [{ id: 'sec-1' }],
      sessions: [
        { id: 'sit-1', status: 'draft', hasLead: true },
        { id: 'sit-2', status: 'draft', hasLead: true },
      ],
      files: [{ fileRole: 'question' }],
    });
    expect(result.items.every((item) => item.ok)).toBe(true);
    expect(result.ready).toBe(true);
  });

  it('rejects sittings that have already left draft', () => {
    const result = examPublishChecklist({
      sections: [{ id: 'sec-1' }],
      sessions: [{ id: 'sit-1', status: 'scheduled', hasLead: true }],
      files: [{ fileRole: 'question' }],
    });
    expect(result.items.find((i) => i.id === 'sessions')?.ok).toBe(false);
    expect(result.ready).toBe(false);
  });
});
