import { buildMssvIndex, matchMssv, normalizeMssv, type MssvCell } from './mssv-match';

const students = [
  { mssv: '20120001', name: 'An' },
  { mssv: 'SV000002', name: 'Bình' },
  { mssv: '0012345', name: 'Cường' },
];
const index = buildMssvIndex(students);
const text = (t: string): MssvCell => ({ text: t, kind: 'text' });
const number = (t: string): MssvCell => ({ text: t, kind: 'number' });

describe('normalizeMssv', () => {
  it('trims, drops zero-width characters and folds full-width digits', () => {
    expect(normalizeMssv('  20120001 ')).toBe('20120001');
    expect(normalizeMssv('2012​0001')).toBe('20120001');
    expect(normalizeMssv(' 20120001 ')).toBe('20120001');
    expect(normalizeMssv('２０１２０００１')).toBe('20120001');
  });
});

describe('matchMssv (spec D10)', () => {
  it('matches exactly, ignoring case (citext) and surrounding blanks', () => {
    expect(matchMssv(text(' 20120001 '), index)).toMatchObject({ kind: 'matched', student: { name: 'An' }, note: null });
    expect(matchMssv(text('sv000002'), index)).toMatchObject({ kind: 'matched', student: { name: 'Bình' }, note: null });
  });
  it('a numeric cell matches when the digits are the same', () => {
    expect(matchMssv(number('20120001'), index)).toMatchObject({ kind: 'matched', note: null });
  });
  it('a NUMERIC cell that lost its leading zeros matches the one session MSSV that fits — and says so', () => {
    expect(matchMssv(number('12345'), index)).toMatchObject({ kind: 'matched', student: { name: 'Cường' }, note: 'Khớp sau khi bỏ số 0 đầu (ô số).' });
  });
  it('a TEXT cell never gets the leading-zero treatment', () => {
    expect(matchMssv(text('12345'), index)).toMatchObject({ kind: 'unmatched', reason: 'not_found' });
  });
  it('is ambiguous — and refuses — when two session MSSVs fit after stripping zeros', () => {
    const two = buildMssvIndex([{ mssv: '012345', name: 'A' }, { mssv: '0012345', name: 'B' }]);
    expect(matchMssv(number('12345'), two)).toMatchObject({ kind: 'unmatched', reason: 'ambiguous' });
  });
  it('an exact match beats the leading-zero rule', () => {
    const both = buildMssvIndex([{ mssv: '12345', name: 'Exact' }, { mssv: '012345', name: 'Padded' }]);
    expect(matchMssv(number('12345'), both)).toMatchObject({ kind: 'matched', student: { name: 'Exact' }, note: null });
  });
  it('something that does not look like an MSSV is "not_mssv", not "not found"', () => {
    for (const bad of ['Họ tên', '2012 0001', 'A-1', '123', 'x'.repeat(21)]) {
      expect(matchMssv(text(bad), index)).toMatchObject({ kind: 'unmatched', reason: 'not_mssv' });
    }
  });
  it('the header word "MSSV" has a legal MSSV shape (4 letters, like ck_session_roster_mssv) — so it is "not_found", not "not_mssv"', () => {
    expect(matchMssv(text('MSSV'), index)).toMatchObject({ kind: 'unmatched', reason: 'not_found' });
  });
  it('a well-formed MSSV that is not in the session is "not_found"', () => {
    expect(matchMssv(text('99999999'), index)).toMatchObject({ kind: 'unmatched', reason: 'not_found', note: 'Không có trong danh sách sinh viên của phiên.' });
  });
  it('a numeric cell in scientific notation cannot match anything', () => {
    expect(matchMssv(number('2.0120001E7'), index)).toMatchObject({ kind: 'unmatched' });
  });
});
