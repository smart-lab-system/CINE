import JSZip from 'jszip';

/** Chuẩn hoá lựa chọn File / Thư mục / Zip thành một File để PUT lên answer-key. */
export async function normalizeModelAnswerPackage(
  files: FileList | File[],
  mode: 'file' | 'folder' | 'zip',
): Promise<File> {
  const list = Array.from(files);
  if (list.length === 0) throw new Error('Chưa chọn file đáp án mẫu.');

  if (mode === 'file' || mode === 'zip') {
    const file = list[0];
    if (!file) throw new Error('Chưa chọn file đáp án mẫu.');
    if (mode === 'zip' && !file.name.toLowerCase().endsWith('.zip')) {
      throw new Error('Hãy chọn một file .zip.');
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

  const root = list[0]?.webkitRelativePath?.split('/')[0]?.trim() || 'dap-an-mau';
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], `${root}.zip`, { type: 'application/zip' });
}
