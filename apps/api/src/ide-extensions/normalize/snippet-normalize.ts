import { UnsafeExtractPathError, sanitizeExtractRelativePath } from '../extract/ide-extension-extract-path';

/** Caps so on-demand normalize cannot blow response size. */
export const NORMALIZE_MAX_SNIPPETS = 200;
export const NORMALIZE_MAX_CONTENT_CHARS = 100_000;
export const NORMALIZE_MAX_SNIPPET_FILE_BYTES = 2 * 1024 * 1024;

export type NormalizedSourceItem = {
  id: string;
  prefix: string;
  title: string;
  language: string | null;
  path: string;
  content: string;
  truncated: boolean;
};

export type NormalizedSourcesResult = {
  mode: 'snippets' | 'none';
  packageName: string | null;
  items: NormalizedSourceItem[];
};

export class SnippetNormalizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnippetNormalizeError';
  }
}

/**
 * VS Code tabstops: `${1:Name}` → `Name`, `${1}` / `$1` → empty.
 * Keeps JSX/JS closer to parsable source for later JPlag.
 */
export function stripSnippetTabstops(text: string): string {
  return text
    .replace(/\$\{(\d+):([^}]*)\}/g, '$2')
    .replace(/\$\{\d+\}/g, '')
    .replace(/\$\d+/g, '');
}

export function safeIdFromPrefix(prefix: string): string {
  const id = prefix
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id || 'snippet';
}

/**
 * Resolve `contributes.snippets[].path` (relative to extension/) to an
 * extract-relative POSIX path under `extension/`.
 */
export function resolveSnippetContributePath(contributePath: string): string {
  if (!contributePath || typeof contributePath !== 'string') {
    throw new SnippetNormalizeError('contributes.snippets.path không hợp lệ.');
  }
  let relative = contributePath.replace(/\\/g, '/').trim();
  if (relative.startsWith('./')) relative = relative.slice(2);
  if (!relative) {
    throw new SnippetNormalizeError('contributes.snippets.path rỗng.');
  }

  let underExtension: string;
  try {
    underExtension = sanitizeExtractRelativePath(`extension/${relative}`);
  } catch (error) {
    if (error instanceof UnsafeExtractPathError) {
      throw new SnippetNormalizeError(error.message);
    }
    throw error;
  }

  if (underExtension !== 'extension' && !underExtension.startsWith('extension/')) {
    throw new SnippetNormalizeError(
      `Đường dẫn snippet phải nằm dưới extension/: ${JSON.stringify(contributePath)}`,
    );
  }
  return underExtension;
}

export type SnippetContributeRef = {
  path: string;
  language: string | null;
};

export function parsePackageSnippetsContributes(packageJson: unknown): {
  packageName: string | null;
  contributes: SnippetContributeRef[];
} {
  if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) {
    throw new SnippetNormalizeError('package.json không phải object.');
  }
  const root = packageJson as Record<string, unknown>;
  const packageName = typeof root.name === 'string' ? root.name : null;

  const contributes = root.contributes;
  if (!contributes || typeof contributes !== 'object' || Array.isArray(contributes)) {
    return { packageName, contributes: [] };
  }
  const snippets = (contributes as Record<string, unknown>).snippets;
  if (!Array.isArray(snippets) || snippets.length === 0) {
    return { packageName, contributes: [] };
  }

  const out: SnippetContributeRef[] = [];
  for (const entry of snippets) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.path !== 'string') continue;
    const language = typeof rec.language === 'string' ? rec.language : null;
    out.push({ path: resolveSnippetContributePath(rec.path), language });
  }
  return { packageName, contributes: out };
}

function bodyToText(body: unknown): string | null {
  if (typeof body === 'string') return body;
  if (Array.isArray(body) && body.every((line) => typeof line === 'string')) {
    return (body as string[]).join('\n');
  }
  return null;
}

/**
 * Parse a `.code-snippets` / snippet JSON object into normalized source items.
 */
export function parseCodeSnippetsDocument(
  doc: unknown,
  opts: {
    path: string;
    language: string | null;
    stripTabstops: boolean;
    maxContentChars?: number;
    maxItems?: number;
    startIndex?: number;
  },
): { items: NormalizedSourceItem[]; hitCap: boolean } {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new SnippetNormalizeError(`File snippet không phải object: ${opts.path}`);
  }

  const maxContent = opts.maxContentChars ?? NORMALIZE_MAX_CONTENT_CHARS;
  const maxItems = opts.maxItems ?? NORMALIZE_MAX_SNIPPETS;
  const items: NormalizedSourceItem[] = [];
  let hitCap = false;
  const usedIds = new Set<string>();

  for (const [title, value] of Object.entries(doc as Record<string, unknown>)) {
    if (title.startsWith('//')) continue; // VS Code allows comment keys
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const rec = value as Record<string, unknown>;
    const rawBody = bodyToText(rec.body);
    if (rawBody === null) continue;

    const prefix =
      typeof rec.prefix === 'string'
        ? rec.prefix
        : Array.isArray(rec.prefix) && typeof rec.prefix[0] === 'string'
          ? rec.prefix[0]
          : title;

    let content = opts.stripTabstops ? stripSnippetTabstops(rawBody) : rawBody;
    let truncated = false;
    if (content.length > maxContent) {
      content = content.slice(0, maxContent);
      truncated = true;
    }

    let id = safeIdFromPrefix(prefix);
    if (usedIds.has(id)) {
      let n = 2;
      while (usedIds.has(`${id}-${n}`)) n += 1;
      id = `${id}-${n}`;
    }
    usedIds.add(id);

    if (items.length >= maxItems) {
      hitCap = true;
      break;
    }

    items.push({
      id,
      prefix,
      title,
      language: opts.language,
      path: opts.path,
      content,
      truncated,
    });
  }

  return { items, hitCap };
}

/**
 * Build the full normalize result from package.json text + a file loader.
 */
export function buildNormalizedSourcesFromPackage(
  packageJsonText: string,
  loadSnippetFile: (relativePath: string) => Buffer,
  opts?: { stripTabstops?: boolean },
): NormalizedSourcesResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJsonText);
  } catch {
    throw new SnippetNormalizeError('Không parse được extension/package.json.');
  }

  const { packageName, contributes } = parsePackageSnippetsContributes(parsed);
  if (contributes.length === 0) {
    return { mode: 'none', packageName, items: [] };
  }

  const stripTabstops = opts?.stripTabstops !== false;
  const items: NormalizedSourceItem[] = [];
  let remaining = NORMALIZE_MAX_SNIPPETS;

  for (const ref of contributes) {
    if (remaining <= 0) break;
    const buf = loadSnippetFile(ref.path);
    if (buf.length > NORMALIZE_MAX_SNIPPET_FILE_BYTES) {
      throw new SnippetNormalizeError(
        `File snippet quá lớn (${buf.length} byte): ${ref.path}`,
      );
    }
    let doc: unknown;
    try {
      doc = JSON.parse(buf.toString('utf8'));
    } catch {
      throw new SnippetNormalizeError(`Không parse được JSON snippet: ${ref.path}`);
    }
    const { items: part } = parseCodeSnippetsDocument(doc, {
      path: ref.path,
      language: ref.language,
      stripTabstops,
      maxItems: remaining,
    });
    items.push(...part);
    remaining = NORMALIZE_MAX_SNIPPETS - items.length;
  }

  return { mode: 'snippets', packageName, items };
}
