import {
  FILENAME_TEMPLATE_REGEX,
  isTemplatedFilename,
  renderFilename,
  resolveSeatLabel,
} from './filename-template';

/**
 * Turning one declared pattern into one filename per student.
 *
 * This is not the system guessing what a file should be called — it is the
 * server COMPUTING it from data it already owns and then telling the agent.
 * Submission identity is still decided before the exam, which is the rule
 * that matters; what changes is that the decision can now depend on who is
 * sitting the exam.
 */

const CONTEXT = {
  studentMssv: 'SV20120001',
  studentName: 'Nguyễn Văn An',
  seatLabel: 'P01',
  roomLabel: 'A1',
};

describe('isTemplatedFilename', () => {
  it('is a template only when it carries a token', () => {
    expect(isTemplatedFilename('Cau1.docx')).toBe(false);
    expect(isTemplatedFilename('{MSSV}_Cau1.docx')).toBe(true);
  });
});

describe('FILENAME_TEMPLATE_REGEX', () => {
  it('accepts a plain filename and the three known tokens', () => {
    expect(FILENAME_TEMPLATE_REGEX.test('Cau1.docx')).toBe(true);
    expect(FILENAME_TEMPLATE_REGEX.test('{MSSV}_{HOTEN}_{SOMAY}.docx')).toBe(true);
  });

  it('rejects retired TEN and PHONG on new declarations', () => {
    expect(FILENAME_TEMPLATE_REGEX.test('{TEN}_Cau1.docx')).toBe(false);
    expect(FILENAME_TEMPLATE_REGEX.test('{PHONG}_{MSSV}.docx')).toBe(false);
  });

  it('rejects a token nobody defined', () => {
    expect(FILENAME_TEMPLATE_REGEX.test('{LOP}_Cau1.docx')).toBe(false);
  });

  it('rejects the same path traversal a literal filename would', () => {
    expect(FILENAME_TEMPLATE_REGEX.test('../{MSSV}.docx')).toBe(false);
    expect(FILENAME_TEMPLATE_REGEX.test('a/{MSSV}.docx')).toBe(false);
    expect(FILENAME_TEMPLATE_REGEX.test('{MSSV}..docx')).toBe(false);
  });

  it('rejects an unclosed or empty brace', () => {
    expect(FILENAME_TEMPLATE_REGEX.test('{MSSV_Cau1.docx')).toBe(false);
    expect(FILENAME_TEMPLATE_REGEX.test('{}_Cau1.docx')).toBe(false);
  });
});

describe('resolveSeatLabel', () => {
  it('prefers location when set', () => {
    expect(
      resolveSeatLabel({ location: 'P01', roomCode: 'A1', hostname: 'MAY07' }),
    ).toBe('P01');
  });

  it('falls back to roomCode_hostname when location empty', () => {
    expect(
      resolveSeatLabel({ location: '  ', roomCode: 'A1', hostname: 'MAY07' }),
    ).toBe('A1_MAY07');
  });

  it('uses room only or host only when the other is missing', () => {
    expect(resolveSeatLabel({ location: '', roomCode: 'A1', hostname: null })).toBe('A1');
    expect(resolveSeatLabel({ location: null, roomCode: '', hostname: 'MAY07' })).toBe(
      'MAY07',
    );
  });

  it('returns empty when nothing available', () => {
    expect(resolveSeatLabel({ location: '', roomCode: '', hostname: null })).toBe('');
  });
});

describe('renderFilename', () => {
  it('leaves a plain filename exactly as declared', () => {
    expect(renderFilename('Cau1.docx', CONTEXT)).toBe('Cau1.docx');
  });

  it('fills every current token', () => {
    expect(renderFilename('{MSSV}_{HOTEN}_{SOMAY}.docx', CONTEXT)).toBe(
      'SV20120001_NguyenVanAn_P01.docx',
    );
  });

  it('still fills legacy TEN and PHONG for in-flight patterns', () => {
    expect(renderFilename('{PHONG}_{MSSV}_{TEN}_{SOMAY}.docx', CONTEXT)).toBe(
      'A1_SV20120001_NguyenVanAn_P01.docx',
    );
  });

  it('strips diacritics rather than shipping them in a filename', () => {
    expect(renderFilename('{HOTEN}.docx', { ...CONTEXT, studentName: 'Đỗ Thị Hà' })).toBe(
      'DoThiHa.docx',
    );
  });

  it('collapses punctuation and spacing inside a name', () => {
    expect(
      renderFilename('{HOTEN}.docx', { ...CONTEXT, studentName: 'Trần  Lê-Anh (B)' }),
    ).toBe('TranLeAnhB.docx');
  });

  it('says UNKNOWN rather than producing a hole', () => {
    expect(renderFilename('{SOMAY}_{MSSV}.docx', { ...CONTEXT, seatLabel: '' })).toBe(
      'UNKNOWN_SV20120001.docx',
    );
    expect(renderFilename('{HOTEN}.docx', { ...CONTEXT, studentName: '???' })).toBe(
      'UNKNOWN.docx',
    );
  });

  it('refuses to return a name that is not a safe filename', () => {
    expect(() => renderFilename('{HOTEN}', { ...CONTEXT, studentName: '..' })).not.toThrow();
    expect(renderFilename('{HOTEN}', { ...CONTEXT, studentName: '..' })).toBe('UNKNOWN');
  });

  it('is stable — the same student always gets the same name', () => {
    const first = renderFilename('{MSSV}_{HOTEN}.docx', CONTEXT);
    const second = renderFilename('{MSSV}_{HOTEN}.docx', CONTEXT);
    expect(first).toBe(second);
  });
});
