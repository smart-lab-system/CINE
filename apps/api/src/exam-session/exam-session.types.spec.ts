import { EXAM_SESSION_CODE_ALPHABET, EXAM_SESSION_CODE_LENGTH } from './exam-session.types';

/**
 * A session code is read aloud by the teacher and hand-typed by the
 * student — exactly where `O`/`0` and `I`/`1` cause real mistypes. See
 * docs/superpowers/specs/2026-09-01-student-agent-electron-design.md §5.1.
 */
describe('EXAM_SESSION_CODE_ALPHABET', () => {
  it('excludes the confusable characters O, 0, I, 1', () => {
    for (const confusable of ['O', '0', 'I', '1']) {
      expect(EXAM_SESSION_CODE_ALPHABET).not.toContain(confusable);
    }
  });

  it('keeps every character unique', () => {
    expect(new Set(EXAM_SESSION_CODE_ALPHABET).size).toBe(EXAM_SESSION_CODE_ALPHABET.length);
  });

  it('is large enough that EXAM_SESSION_CODE_LENGTH characters from it stay effectively unguessable', () => {
    // 32^6 ≈ 1.07 billion — far beyond what §5.2's rate limit lets an
    // attacker search, even after dropping 4 characters from the old
    // 36-character alphabet.
    expect(EXAM_SESSION_CODE_ALPHABET.length ** EXAM_SESSION_CODE_LENGTH).toBeGreaterThan(1_000_000_000);
  });
});
