/**
 * VS Marketplace extensionquery — server-side only (spec §7.1b).
 * Failures return null; callers must not block catalog writes.
 */

export interface MarketplaceExtensionMeta {
  identifier: string;
  displayName: string;
  publisher: string;
  publishedAt: Date | null;
  lastReleasedAt: Date | null;
}

const MARKETPLACE_URL =
  'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery?api-version=7.2-preview.1';

type MarketplaceJson = {
  results?: Array<{
    extensions?: Array<{
      extensionName?: string;
      displayName?: string;
      publishedDate?: string;
      lastUpdated?: string;
      releaseDate?: string;
      publisher?: { publisherName?: string; displayName?: string };
    }>;
  }>;
};

export async function fetchMarketplaceMeta(
  identifier: string,
  opts?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<MarketplaceExtensionMeta | null> {
  const id = identifier.trim();
  if (!id.includes('.')) return null;

  const fetchImpl = opts?.fetchImpl ?? fetch;
  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetchImpl(MARKETPLACE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json;api-version=7.2-preview.1',
      },
      body: JSON.stringify({
        filters: [
          {
            criteria: [{ filterType: 7, value: id }],
            pageNumber: 1,
            pageSize: 1,
          },
        ],
        // IncludeVersions | IncludeAssetUri | IncludeFiles | IncludeStatistics | …
        flags: 914,
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as MarketplaceJson;
    const ext = json.results?.[0]?.extensions?.[0];
    if (!ext) return null;

    const publisherName =
      ext.publisher?.publisherName?.trim() ||
      id.slice(0, id.indexOf('.')) ||
      id;
    const extensionName = ext.extensionName?.trim() || id.slice(id.indexOf('.') + 1);
    const resolvedId = `${publisherName}.${extensionName}`.toLowerCase();

    return {
      identifier: resolvedId === id.toLowerCase() ? id : `${publisherName}.${extensionName}`,
      displayName: (ext.displayName ?? extensionName).trim() || id,
      publisher: (ext.publisher?.displayName ?? publisherName).trim() || publisherName,
      publishedAt: parseDate(ext.publishedDate),
      lastReleasedAt: parseDate(ext.lastUpdated ?? ext.releaseDate),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}
