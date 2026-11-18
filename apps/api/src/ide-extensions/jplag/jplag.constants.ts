import * as path from 'node:path';

/** JPlag CLI languages supported by the demo endpoint. */
export const JPLAG_DEMO_LANGUAGES = [
  'javascript',
  'typescript',
  'cpp',
  'python3',
  'java',
] as const;

export type JplagDemoLanguage = (typeof JPLAG_DEMO_LANGUAGES)[number];

/**
 * Internal staging/CLI profile.
 * - `text`: no SWC, `-l text` + `-p`
 * - `swc`: JS/TS SWC transform + real `-l`; other langs = native parser (no transform)
 */
export const JPLAG_DEMO_PROFILES = ['swc', 'text'] as const;

export type JplagDemoProfile = (typeof JPLAG_DEMO_PROFILES)[number];

/** Public run label returned to FE. */
export type JplagDemoRunProfile = 'text' | 'language';

export function toRunProfile(profile: JplagDemoProfile): JplagDemoRunProfile {
  return profile === 'text' ? 'text' : 'language';
}

export const JPLAG_DEMO_EXT_BY_LANGUAGE: Record<JplagDemoLanguage, string[]> = {
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  typescript: ['.ts', '.tsx'],
  cpp: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hpp'],
  python3: ['.py'],
  java: ['.java'],
};

export function isJsTsLanguage(language: JplagDemoLanguage): boolean {
  return language === 'javascript' || language === 'typescript';
}

/** Default synthetic extension when writing normalized snippet bodies. */
export function jplagDemoDefaultExt(
  language: JplagDemoLanguage,
  profile: JplagDemoProfile,
): string {
  if (isJsTsLanguage(language) && profile === 'text') {
    return language === 'javascript' ? '.jsx' : '.tsx';
  }
  const map: Record<JplagDemoLanguage, string> = {
    javascript: '.js',
    typescript: '.ts',
    cpp: '.cpp',
    python3: '.py',
    java: '.java',
  };
  return map[language];
}

/** JPlag CLI `-l`: text profile always uses `text`; else real language module. */
export function jplagCliLanguage(
  language: JplagDemoLanguage,
  profile: JplagDemoProfile,
): string {
  if (profile === 'text') return 'text';
  return language;
}

/** `-p` when CLI language is `text`. */
export function jplagCliSuffixes(
  language: JplagDemoLanguage,
  profile: JplagDemoProfile,
): string | null {
  if (profile !== 'text') return null;
  const map: Record<JplagDemoLanguage, string> = {
    javascript: 'js,jsx,mjs,cjs',
    typescript: 'ts,tsx,js,jsx',
    cpp: 'c,cc,cpp,cxx,h,hpp',
    python3: 'py',
    java: 'java',
  };
  return map[language];
}

export const JPLAG_DEMO_MAX_ARCHIVE_BYTES = 20 * 1024 * 1024;
export const JPLAG_DEMO_MAX_FILES = 500;
export const JPLAG_DEMO_MAX_FILE_BYTES = 1 * 1024 * 1024;
export const JPLAG_DEMO_DEFAULT_TIMEOUT_MS = 90_000;
export const JPLAG_DEMO_DEFAULT_MIN_TOKENS = 5;

export function resolveJplagJarPath(): string {
  const raw = process.env.JPLAG_JAR_PATH?.trim() || 'tools/jplag/jplag.jar';
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

export function resolveJplagJavaBin(): string {
  return process.env.JPLAG_JAVA_BIN?.trim() || 'java';
}

export function resolveJplagTimeoutMs(): number {
  const n = Number(process.env.JPLAG_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : JPLAG_DEMO_DEFAULT_TIMEOUT_MS;
}

export function resolveJplagMinTokens(): number {
  const n = Number(process.env.JPLAG_MIN_TOKENS);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : JPLAG_DEMO_DEFAULT_MIN_TOKENS;
}

export function isJplagDemoLanguage(value: string): value is JplagDemoLanguage {
  return (JPLAG_DEMO_LANGUAGES as readonly string[]).includes(value);
}
