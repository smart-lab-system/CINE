import JSZip from 'jszip';
import { normalizeJplagPath, parseJplagReportBuffer } from './jplag-report-parse';

describe('parseJplagReportBuffer', () => {
  it('normalizes Windows paths', () => {
    expect(normalizeJplagPath('compare\\b.jsx')).toBe('compare/b.jsx');
  });

  it('parses matches and files from a minimal .jplag zip', async () => {
    const zip = new JSZip();
    zip.file(
      'topComparisons.json',
      JSON.stringify([
        {
          firstSubmission: 'compare',
          secondSubmission: 'extension',
          similarities: { AVG: 0.85, MAX: 0.9 },
        },
      ]),
    );
    zip.file(
      'comparisons/compare-extension.json',
      JSON.stringify({
        firstSubmissionId: 'compare',
        secondSubmissionId: 'extension',
        similarities: { AVG: 0.85 },
        matches: [
          {
            firstFileName: 'compare\\b.jsx',
            secondFileName: 'extension\\a.jsx',
            startInFirst: { line: 1, column: 0, tokenListIndex: 0 },
            endInFirst: { line: 5, column: 2, tokenListIndex: 10 },
            startInSecond: { line: 2, column: 0, tokenListIndex: 0 },
            endInSecond: { line: 6, column: 2, tokenListIndex: 10 },
            lengthOfFirst: 11,
            lengthOfSecond: 11,
          },
        ],
      }),
    );
    zip.file('files/compare/b.jsx', 'const x = 1;\n');
    zip.file('files/extension/a.jsx', 'const y = 1;\n');

    const buf = Buffer.from(await zip.generateAsync({ type: 'uint8array' }));
    const parsed = await parseJplagReportBuffer(buf);

    expect(parsed.similarity).toBeCloseTo(0.85);
    expect(parsed.firstSubmission).toBe('compare');
    expect(parsed.secondSubmission).toBe('extension');
    expect(parsed.files).toHaveLength(2);
    expect(parsed.matches).toHaveLength(1);
    expect(parsed.matches[0]!.firstPath).toBe('compare/b.jsx');
    expect(parsed.matches[0]!.secondPath).toBe('extension/a.jsx');
    expect(parsed.matches[0]!.startInFirst.line).toBe(1);
    expect(parsed.matches[0]!.endInSecond.line).toBe(6);
  });
});
