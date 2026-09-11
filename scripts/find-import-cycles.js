#!/usr/bin/env node
/**
 * Báo mọi vòng lặp import giữa các file .ts trong một cây nguồn.
 *
 * Dùng: `node scripts/find-import-cycles.js apps/api/src`
 *
 * Vì sao cần: một vòng lặp import chỉ gây lỗi khi có thứ được ĐỌC ngay
 * lúc module nạp, và đối số của decorator là đúng thứ đó. Ngày
 * 2026-09-11, `create-exam-session.dto.ts` và `filename-template.ts`
 * import lẫn nhau; CommonJS gỡ vòng theo file nào được require trước, và
 * khi file kia thua thì `@Matches(FILENAME_TEMPLATE_REGEX)` nhận
 * `undefined`. class-validator ghi nhận nó không một tiếng động rồi cho
 * qua MỌI tên file, `../etc/passwd` gồm trong đó. Thứ đã đổi chỉ là một
 * dòng import mới ở một file khác hẳn, đủ để đảo thứ tự nạp.
 *
 * Không dùng thư viện ngoài: nó phải chạy được ở bất kỳ workspace nào
 * trong monorepo mà không cần cài thêm gì.
 */
const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target) {
  console.error('Dùng: node scripts/find-import-cycles.js <thư-mục-nguồn>');
  process.exit(2);
}

const root = path.resolve(target);
const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(full);
  }
})(root);

/** Chỉ theo import tương đối — gói ngoài không tạo được vòng về mã của ta. */
function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [base + '.ts', path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

const graph = new Map();
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const deps = new Set();
  const pattern = /^\s*(?:import|export)\b[^;]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
  let match;
  while ((match = pattern.exec(src))) {
    // `import type` bị xoá lúc biên dịch, nên nó không tồn tại lúc chạy
    // và không tạo được vòng lặp thật.
    if (/^\s*import\s+type\b/.test(src.slice(match.index, pattern.lastIndex))) continue;
    const resolved = resolveImport(file, match[1] ?? match[2]);
    if (resolved) deps.add(resolved);
  }
  graph.set(file, [...deps]);
}

const VISITING = 1;
const DONE = 2;
const state = new Map();
const stack = [];
const cycles = [];

function visit(node) {
  state.set(node, VISITING);
  stack.push(node);
  for (const next of graph.get(node) ?? []) {
    if (state.get(next) === VISITING) {
      cycles.push([...stack.slice(stack.indexOf(next)), next]);
    } else if (!state.has(next)) {
      visit(next);
    }
  }
  stack.pop();
  state.set(node, DONE);
}
for (const file of files) if (!state.has(file)) visit(file);

const reported = new Set();
for (const cycle of cycles) {
  const key = [...cycle].sort().join('|');
  if (reported.has(key)) continue;
  reported.add(key);
  console.log(cycle.map((f) => path.relative(root, f).replace(/\\/g, '/')).join(' -> '));
}

console.log(`${reported.size} vòng lặp trong ${files.length} file dưới ${target}`);
process.exit(reported.size === 0 ? 0 : 1);
