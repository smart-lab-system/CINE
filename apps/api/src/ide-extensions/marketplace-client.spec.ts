import { fetchMarketplaceMeta } from './marketplace-client';

describe('fetchMarketplaceMeta', () => {
  it('maps marketplace payload to meta', async () => {
    const fetchImpl = jest.fn(async () =>
      Response.json({
        results: [
          {
            extensions: [
              {
                extensionName: 'python',
                displayName: 'Python',
                publishedDate: '2018-01-01T00:00:00.000Z',
                lastUpdated: '2024-06-01T00:00:00.000Z',
                publisher: {
                  publisherName: 'ms-python',
                  displayName: 'Microsoft',
                },
              },
            ],
          },
        ],
      }),
    ) as unknown as typeof fetch;

    const meta = await fetchMarketplaceMeta('ms-python.python', { fetchImpl });
    expect(meta).toMatchObject({
      displayName: 'Python',
      publisher: 'Microsoft',
    });
    expect(meta?.publishedAt?.toISOString()).toBe('2018-01-01T00:00:00.000Z');
    expect(meta?.lastReleasedAt?.toISOString()).toBe('2024-06-01T00:00:00.000Z');
  });

  it('returns null on http error', async () => {
    const fetchImpl = jest.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    await expect(fetchMarketplaceMeta('ms-python.python', { fetchImpl })).resolves.toBeNull();
  });
});
