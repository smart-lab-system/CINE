import { transformSync } from '@swc/core';
import type { JplagDemoLanguage } from './jplag.constants';

export type SwcJplagLanguage = Extract<JplagDemoLanguage, 'javascript' | 'typescript'>;

/**
 * Fixed SWC options for JPlag demo — identical on extension + compare sides.
 * Classic React runtime → React.createElement (stable tokens, no jsx-runtime import).
 */
export function transformSourceForJplag(
  source: string,
  language: SwcJplagLanguage,
  filenameHint?: string,
): string {
  const isTs = language === 'typescript';
  const filename = filenameHint ?? (isTs ? 'snippet.tsx' : 'snippet.jsx');

  const result = transformSync(source, {
    filename,
    sourceMaps: false,
    jsc: {
      target: 'es2022',
      parser: {
        syntax: isTs ? 'typescript' : 'ecmascript',
        tsx: isTs,
        jsx: !isTs,
      },
      transform: {
        react: {
          runtime: 'classic',
          pragma: 'React.createElement',
          pragmaFrag: 'React.Fragment',
          throwIfNamespace: false,
          development: false,
        },
      },
    },
    module: {
      type: 'es6',
    },
  });

  return result.code;
}

export function isSwcJplagLanguage(language: JplagDemoLanguage): language is SwcJplagLanguage {
  return language === 'javascript' || language === 'typescript';
}
