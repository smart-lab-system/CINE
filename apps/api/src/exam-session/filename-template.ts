/**
 * Per-student filenames, from one pattern declared before the exam.
 *
 * This is NOT the system guessing what a file should be called. Submission
 * identity is still decided in advance — CLAUDE.md's central rule — and
 * still never inferred from what a student happened to save. What changes
 * is that the decision may now depend on WHO is sitting the exam: the
 * server computes each student's filename from data it already owns, and
 * tells the agent what to create. Nothing is matched, nothing is guessed.
 *
 * A deliverable is templated iff its declared name contains a token. There
 * is no separate flag: a flag would be a second fact about the same string
 * that could disagree with it.
 */

/**
 * Path-traversal defense (Task 1 review ruling): only letters/digits/`_`/
 * `-`/`.` are allowed, AND the literal substring ".." is rejected outright
 * — the character class alone would already reject "/" and "\" (neither is
 * in the allowed set), but ".." is built entirely from allowed characters,
 * so it needs its own negative lookahead to be caught (e.g. a lone ".."
 * with no path separator at all).
 *
 * Lives HERE, not in create-exam-session.dto.ts where it was declared
 * until 2026-09-11, and that move is load-bearing rather than tidying.
 * The DTO needs FILENAME_TEMPLATE_REGEX below and this module needed
 * SAFE_FILENAME_REGEX from the DTO, so the two files imported each other.
 * Under CommonJS a cycle resolves to whichever module is required first,
 * and when this one won the race the DTO evaluated `@Matches(undefined)` —
 * which class-validator registers happily and which then accepts every
 * filename, `../etc/passwd` included. Both filename rules now live in one
 * leaf module that imports nothing, so there is no order left to depend
 * on. See create-exam-session.dto.spec.ts, which pins exactly that order.
 */
export const SAFE_FILENAME_REGEX = /^(?!.*\.\.)[A-Za-z0-9_.-]+$/;

/** The only tokens that exist. Anything else is rejected at the DTO. */
export const FILENAME_TOKENS = ['MSSV', 'TEN', 'PHONG', 'SOMAY'] as const;
export type FilenameToken = (typeof FILENAME_TOKENS)[number];

/**
 * A pattern is a safe filename that may additionally contain `{TOKEN}`.
 *
 * Built from SAFE_FILENAME_REGEX's rules rather than beside them: the same
 * `..` lookahead, the same character class, plus the tokens. A pattern that
 * would be an unsafe filename must still be rejected — the tokens are the
 * only thing being added.
 */
export const FILENAME_TEMPLATE_REGEX = new RegExp(
  `^(?!.*\\.\\.)(?:[A-Za-z0-9_.-]|\\{(?:${FILENAME_TOKENS.join('|')})\\})+$`,
);

const TOKEN_PATTERN = /\{([A-Z_]+)\}/g;

export function isTemplatedFilename(declared: string): boolean {
  return /\{[A-Z_]+\}/.test(declared);
}

export interface FilenameContext {
  studentMssv: string;
  /** The roster spelling — the authoritative one, never a typed name. */
  studentName: string;
  roomName: string;
  /**
   * The lab machine's own name, as the agent reports it.
   *
   * `{SOMAY}` means "seat number", and this schema has no seat concept —
   * the design deliberately did not invent one. A lab names its machines
   * after their seats, so the machine's own hostname is the closest true
   * answer available without asking the student to type anything, which
   * CLAUDE.md forbids. If a lab does not name machines that way, the
   * honest move is not to use this token.
   */
  machineName: string | null;
}

/** Shown instead of a hole, so a missing part is visible rather than silent. */
const MISSING = 'UNKNOWN';

/**
 * Vietnamese text into something a filename can hold, everywhere.
 *
 * NFD splits a letter from its diacritic; dropping the combining marks
 * leaves the base letter. `đ`/`Đ` have no decomposition and are mapped by
 * hand. Everything outside the safe set is then removed rather than
 * replaced, because a separator inserted here would collide with the ones
 * the pattern itself uses.
 *
 * Word boundaries are kept as capitals before the removal — "Phòng máy A1"
 * becomes `PhongMayA1`, not `PhongmayA1`. Nothing is ever lower-cased, so
 * an MSSV or a hostname passes through untouched. The gain is only
 * legibility, but these names are read off a projector and picked out of a
 * folder listing, which is most of what they are for.
 */
function normalize(value: string): string {
  const stripped = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9]+(.)?/g, (_match, next: string | undefined) =>
      next ? next.toUpperCase() : '',
    );
  return stripped === '' ? MISSING : stripped;
}

/**
 * The filename this exact student is expected to submit.
 *
 * Total: it always returns something a filename can be. The agent
 * independently re-validates every name the server sends it, and a name
 * that failed there would be silently skipped — leaving the student with
 * nothing to submit and no visible reason why. So if the rendered result is
 * not a safe filename, this returns MISSING rather than handing over
 * something that will be dropped later.
 */
export function renderFilename(declared: string, context: FilenameContext): string {
  if (!isTemplatedFilename(declared)) {
    return declared;
  }

  const rendered = declared.replace(TOKEN_PATTERN, (match, token: string) => {
    switch (token as FilenameToken) {
      case 'MSSV':
        return normalize(context.studentMssv);
      case 'TEN':
        return normalize(context.studentName);
      case 'PHONG':
        return normalize(context.roomName);
      case 'SOMAY':
        return context.machineName ? normalize(context.machineName) : MISSING;
      default:
        // Unreachable: the DTO rejects unknown tokens before a row is
        // written. Left as the token's own name rather than dropped, so a
        // pattern that somehow got past validation is obvious on screen.
        return MISSING;
    }
  });

  return SAFE_FILENAME_REGEX.test(rendered) ? rendered : MISSING;
}
