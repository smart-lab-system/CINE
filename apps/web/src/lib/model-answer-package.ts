import JSZip from 'jszip';

export type ModelAnswerPickMode = 'file' | 'folder' | 'archive';

function isArchiveFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.zip') || lower.endsWith('.rar');
}

/**
 * Tự nhận diện lựa chọn: một file thường · file nén .zip/.rar · thư mục
 * (webkitRelativePath) hoặc nhiều file (nén thành gói).
 */
export function detectModelAnswerPickMode(
  files: FileList | File[],
): ModelAnswerPickMode {
  const list = Array.from(files);
  if (list.length === 0) {
    throw new Error('Chưa chọn file đáp án mẫu.');
  }

  const hasRelativeFolder = list.some((f) =>
    (f.webkitRelativePath || '').includes('/'),
  );
  if (hasRelativeFolder || list.length > 1) {
    return 'folder';
  }

  const only = list[0];
  if (!only) throw new Error('Chưa chọn file đáp án mẫu.');
  if (isArchiveFilename(only.name)) return 'archive';
  return 'file';
}

/** Chuẩn hoá lựa chọn thành một File để PUT lên answer-key. */
export async function normalizeModelAnswerPackage(
  files: FileList | File[],
  mode?: ModelAnswerPickMode,
): Promise<File> {
  const list = Array.from(files);
  if (list.length === 0) throw new Error('Chưa chọn file đáp án mẫu.');

  const resolved = mode ?? detectModelAnswerPickMode(list);

  if (resolved === 'file' || resolved === 'archive') {
    const file = list[0];
    if (!file) throw new Error('Chưa chọn file đáp án mẫu.');
    if (resolved === 'archive' && !isArchiveFilename(file.name)) {
      throw new Error('Hãy chọn một file .zip hoặc .rar.');
    }
    return file;
  }

  const zip = new JSZip();
  let added = 0;
  for (const file of list) {
    const path = (file.webkitRelativePath || file.name).replace(/^\/+/, '');
    if (!path || path.endsWith('/')) continue;
    zip.file(path, file);
    added += 1;
  }
  if (added === 0) throw new Error('Thư mục không có file để nén.');

  const root =
    list[0]?.webkitRelativePath?.split('/')[0]?.trim() || 'dap-an-mau';
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], `${root}.zip`, { type: 'application/zip' });
}
