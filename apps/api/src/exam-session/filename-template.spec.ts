import {
  FILENAME_TEMPLATE_REGEX,
  isTemplatedFilename,
  renderFilename,
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
  roomName: 'Phòng máy A1',
  machineName: 'MAY07',
};

describe('isTemplatedFilename', () => {
  it('is a template only when it carries a token', () => {
    expect(isTemplatedFilename('Cau1.docx')).toBe(false);
    expect(isTemplatedFilename('{MSSV}_Cau1.docx')).toBe(true);
  });
});

describe('FILENAME_TEMPLATE_REGEX', () => {
  it('accepts a plain filename and the four known tokens', () => {
    expect(FILENAME_TEMPLATE_REGEX.test('Cau1.docx')).toBe(true);
    expect(FILENAME_TEMPLATE_REGEX.test('{PHONG}_{MSSV}_{TEN}_{SOMAY}.docx')).toBe(true);
  });

  it('rejects a token nobody defined', () => {
    // A pattern the server cannot fill would reach the agent as a literal
    // "{LOP}" in a filename, and every student would submit a file the
    // teacher never asked for.
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

describe('renderFilename', () => {
  it('leaves a plain filename exactly as declared', () => {
    expect(renderFilename('Cau1.docx', CONTEXT)).toBe('Cau1.docx');
  });

  it('fills every token', () => {
    expect(renderFilename('{PHONG}_{MSSV}_{TEN}_{SOMAY}.docx', CONTEXT)).toBe(
      'PhongMayA1_SV20120001_NguyenVanAn_MAY07.docx',
    );
  });

  it('strips diacritics rather than shipping them in a filename', () => {
    // A rendered name has to survive the same validation a literal one
    // does — the agent re-checks every filename the server sends it, and
    // "ễ" is not in the allowed set. Stripping is deterministic; escaping
    // would produce something nobody can read on a projector.
    expect(renderFilename('{TEN}.docx', { ...CONTEXT, studentName: 'Đỗ Thị Hà' })).toBe(
      'DoThiHa.docx',
    );
  });

  it('collapses punctuation and spacing inside a name', () => {
    expect(
      renderFilename('{TEN}.docx', { ...CONTEXT, studentName: "Trần  Lê-Anh (B)" }),
    ).toBe('TranLeAnhB.docx');
  });

  it('says UNKNOWN rather than producing a hole', () => {
    // An empty token would give "_SV001_.docx" — a filename that looks
    // like a bug and hides which part is missing.
    expect(renderFilename('{SOMAY}_{MSSV}.docx', { ...CONTEXT, machineName: null })).toBe(
      'UNKNOWN_SV20120001.docx',
    );
    expect(renderFilename('{TEN}.docx', { ...CONTEXT, studentName: '???' })).toBe(
      'UNKNOWN.docx',
    );
  });

  it('refuses to return a name that is not a safe filename', () => {
    // The last line of defence: whatever the inputs were, what leaves here
    // has to pass the same check the agent will apply to it, or the agent
    // silently skips the file and the student has nothing to submit.
    expect(() => renderFilename('{TEN}', { ...CONTEXT, studentName: '..' })).not.toThrow();
    expect(renderFilename('{TEN}', { ...CONTEXT, studentName: '..' })).toBe('UNKNOWN');
  });

  it('is stable — the same student always gets the same name', () => {
    const first = renderFilename('{MSSV}_{TEN}.docx', CONTEXT);
    const second = renderFilename('{MSSV}_{TEN}.docx', CONTEXT);
    expect(first).toBe(second);
  });
});
