/** Giá trị với khoá của mọi đối tượng được sắp — đệ quy, giữ nguyên thứ tự mảng. */
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, canonical(obj[k])]),
    );
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonical(value));
}
