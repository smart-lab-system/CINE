/**
 * Hằng số giải nén VSIX — spec
 * `docs/superpowers/specs/2026-11-02-ide-extension-vsix-code-browser-design.md` §2 #10.
 *
 * concurrency × MAX_ARCHIVE_BYTES phải vừa RAM container (cùng tinh thần archive-check).
 */

export const IDE_EXTENSION_EXTRACT_MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const IDE_EXTENSION_EXTRACT_MAX_ENTRIES = 10_000;
export const IDE_EXTENSION_EXTRACT_MAX_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
export const IDE_EXTENSION_EXTRACT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const IDE_EXTENSION_EXTRACT_CONCURRENCY = 1;

export const IDE_EXTENSION_EXTRACT_QUEUE = 'ide-extension-extract';
