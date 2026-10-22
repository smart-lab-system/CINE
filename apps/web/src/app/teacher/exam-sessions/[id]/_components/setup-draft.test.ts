import { afterEach, describe, expect, it } from 'vitest';
import {
  clearSetupDraft,
  draftIsDirty,
  readSetupDraft,
  stripClean,
  writeSetupDraft,
  type SetupDraft,
  type SetupServerBaseline,
} from './setup-draft';

const server: SetupServerBaseline = {
  info: {
    examType: 'TK',
    roomId: 'room-1',
    startLocal: '2026-11-01T08:00',
    endLocal: '2026-11-01T10:00',
  },
  folder: { requiredFilenames: [{ value: 'Bai.docx', deliverableType: 'document' }] },
  rubricId: null,
};

function draft(partial: Partial<SetupDraft> & { sessionId: string }): SetupDraft {
  return { updatedAt: '2026-10-22T00:00:00.000Z', ...partial };
}

afterEach(() => {
  sessionStorage.clear();
});

describe('setup draft storage', () => {
  it('ghi rồi đọc lại đúng phiên', () => {
    const value = draft({
      sessionId: 's1',
      info: { ...server.info, examType: 'GK' },
    });
    writeSetupDraft(value);
    expect(readSetupDraft('s1')?.info?.examType).toBe('GK');
  });

  it('hai phiên không đè nhau', () => {
    writeSetupDraft(draft({ sessionId: 's1', rubricChoice: 'r1' }));
    writeSetupDraft(draft({ sessionId: 's2', rubricChoice: 'r2' }));
    expect(readSetupDraft('s1')?.rubricChoice).toBe('r1');
    expect(readSetupDraft('s2')?.rubricChoice).toBe('r2');
  });

  it('bỏ nháp xoá key', () => {
    writeSetupDraft(draft({ sessionId: 's1', rubricChoice: 'r1' }));
    clearSetupDraft('s1');
    expect(readSetupDraft('s1')).toBeNull();
  });

  it('bản giống server thì stripClean xoá và không còn key', () => {
    const cleaned = stripClean(
      draft({
        sessionId: 's1',
        info: server.info,
        folder: server.folder,
      }),
      server,
    );
    writeSetupDraft(cleaned);
    expect(readSetupDraft('s1')).toBeNull();
  });
});

describe('stripClean', () => {
  it('giữ info khác server và bỏ rubric trùng', () => {
    const cleaned = stripClean(
      draft({
        sessionId: 's1',
        info: { ...server.info, examType: 'CK' },
        rubricChoice: 'already',
      }),
      { ...server, rubricId: 'already' },
    );
    expect(cleaned?.info?.examType).toBe('CK');
    expect(cleaned?.rubricChoice).toBeUndefined();
    expect(draftIsDirty(cleaned)).toBe(true);
  });

  it('thư mục chỉ khác id form hoặc entries rỗng thì không bẩn', () => {
    const cleaned = stripClean(
      draft({
        sessionId: 's1',
        folder: {
          requiredFilenames: [
            {
              value: 'Bai.docx',
              deliverableType: 'document',
              entries: [],
              id: 'rhf-1',
            } as never,
          ],
        },
      }),
      server,
    );
    expect(cleaned).toBeNull();
  });

  it('dialog thêm tay rỗng không tính là bẩn', () => {
    const cleaned = stripClean(
      draft({ sessionId: 's1', rosterDialog: { mode: 'add', fields: { mssv: '  ', name: '' } } }),
      server,
    );
    expect(cleaned).toBeNull();
  });
});
