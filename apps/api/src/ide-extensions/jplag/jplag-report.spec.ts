import { similarityFromOverviewJson } from './jplag-report';

describe('similarityFromOverviewJson', () => {
  it('prefers extension vs compare pair', () => {
    const overview = {
      top_comparisons: [
        {
          first_submission: 'other',
          second_submission: 'x',
          similarities: { AVG: 0.99 },
        },
        {
          first_submission: 'extension',
          second_submission: 'compare',
          similarities: { AVG: 0.42, MAX: 0.5 },
        },
      ],
    };
    const r = similarityFromOverviewJson(overview);
    expect(r.similarity).toBe(0.42);
    expect(r.firstSubmission).toBe('extension');
    expect(r.secondSubmission).toBe('compare');
  });

  it('reads JPlag 6 topComparisons.json array shape', () => {
    const top = [
      {
        firstSubmission: 'compare',
        secondSubmission: 'extension',
        similarities: { AVG: 1.0, MAX: 1.0 },
      },
    ];
    expect(similarityFromOverviewJson(top).similarity).toBe(1);
  });

  it('falls back to best any pair', () => {
    const overview = {
      top_comparisons: [
        {
          first_submission: 'a',
          second_submission: 'b',
          similarities: { AVG: 0.7 },
        },
      ],
    };
    expect(similarityFromOverviewJson(overview).similarity).toBe(0.7);
  });
});
