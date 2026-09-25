import { BundleCase, InvestigationContext, RuleEntry } from './types';

export interface WorkspaceFile {
  path: string;
  content: string;
  /** `submission` = do sinh viên viết → đi qua wrapSubmission() khi đọc (§3.3 luật 1). */
  source: 'submission' | 'system';
}

/** Chỉ đường dẫn tương đối trong workspace; `\` thành `/`; không `..`, không tuyệt đối. */
export function normalizePath(raw: string): string | null {
  const p = raw.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!p || p.startsWith('/') || /^[A-Za-z]:/.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((s) => s === '' || s === '.' || s === '..')) return null;
  return parts.join('/');
}

/**
 * Bảng lỗi thành FILE (§2.1): tiền tố prompt đứng yên, cache vẫn chạy, bảng lớn bao nhiêu
 * cũng được. Model thấy `rule_key`, không bao giờ thấy uuid (§2.1, bước 3 mới có uuid).
 */
export function renderRulesFile(rules: RuleEntry[]): string {
  return [
    '# Bảng lỗi',
    'Mỗi dòng: rule_key — mô tả (tiêu chí). Luật "chưa có giá" vẫn là lỗi thật; chỉ mức trừ chưa có.',
    '',
    ...rules.map(
      (r) => `- ${r.ruleKey} — ${r.title} (tiêu chí: ${r.criterionKey})${r.priced ? '' : ' [chưa có giá]'}`,
    ),
  ].join('\n');
}

/** Tên nhóm và số ca — không có input hay output mong đợi: model thấy kết quả qua run_tests. */
export function renderTestGroups(bundle: { id: string; cases: BundleCase[] }): string {
  const counts = new Map<string, number>();
  for (const c of bundle.cases) counts.set(c.group, (counts.get(c.group) ?? 0) + 1);
  return ['# Bộ test', `Mã gói: ${bundle.id}`, '', ...[...counts].map(([g, n]) => `- ${g}: ${n} ca`)].join('\n');
}

function renderStatement(ctx: InvestigationContext): string {
  return ['# Đề bài', ctx.problemStatement, '', `Độ phức tạp đề đòi: ${ctx.requiredComplexity ?? 'không nêu'}`].join(
    '\n',
  );
}

export class Workspace {
  private readonly files: Map<string, WorkspaceFile>;

  constructor(files: WorkspaceFile[]) {
    this.files = new Map(files.map((f) => [f.path, f]));
  }

  static fromContext(ctx: InvestigationContext): Workspace {
    return new Workspace([
      { path: 'de-bai.md', content: renderStatement(ctx), source: 'system' },
      { path: 'bang-loi.md', content: renderRulesFile(ctx.rules), source: 'system' },
      { path: 'goi-test.md', content: renderTestGroups(ctx.testBundle), source: 'system' },
      ...ctx.submission.files.map((f) => ({
        path: `bai-nop/${f.path}`,
        content: f.content,
        source: 'submission' as const,
      })),
    ]);
  }

  list(): { path: string; bytes: number }[] {
    return (
      [...this.files.values()]
        .map((f) => ({ path: f.path, bytes: Buffer.byteLength(f.content, 'utf8') }))
        // So theo mã ký tự, không localeCompare: thứ tự không được đổi theo locale của máy.
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    );
  }

  read(raw: string): WorkspaceFile | null {
    const path = normalizePath(raw);
    return path ? (this.files.get(path) ?? null) : null;
  }
}
