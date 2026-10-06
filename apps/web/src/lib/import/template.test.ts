import { File } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { readWorkbook } from '@/lib/read-workbook';
import { IMPORT_KINDS, detectBestSheet, detectMapping, extractImportRows } from './columns';
import { buildTemplateBytes } from './template';

/**
 * Vòng khứ hồi THẬT: file mẫu → exceljs đọc lại → bộ nhận diện → bộ tách dòng. Nếu mẫu và bộ nhận diện lệch nhau (đổi tên
 * cột ở một bên), mẫu tải về sẽ không tự nhận diện được — đúng cái người dùng gặp ngay lần đầu dùng (Review Focus 7).
 */
const PARSE_TIMEOUT_MS = 30_000;

describe('buildTemplateBytes', () => {
  it.each(Object.values(IMPORT_KINDS))(
    'mẫu của "$id" tự nhận diện được cột và cho đúng một dòng ví dụ không có vấn đề cấu trúc',
    { timeout: PARSE_TIMEOUT_MS },
    async (kind) => {
      const bytes = await buildTemplateBytes(kind);
      const sheets = await readWorkbook(new File([bytes], kind.fileName) as unknown as globalThis.File);

      // Sheet hướng dẫn đi sau và không được nhận nhầm là sheet dữ liệu.
      expect(sheets.map((s) => s.name)).toEqual([kind.sheetName, 'Huong dan']);
      const index = detectBestSheet(sheets, kind);
      expect(index).toBe(0);

      const { mapping, detected } = detectMapping(sheets[index].rows, kind);
      expect(detected).toBe(true);
      expect(mapping.headerRows).toBe(1);

      const extracted = extractImportRows(sheets[index].rows, mapping, kind);
      expect(extracted.problems).toEqual([]);
      expect(extracted.rows).toEqual([
        { line: 2, ...Object.fromEntries(kind.columns.map((c) => [c.key, c.example])) },
      ]);
    },
  );

  it('dòng tiêu đề là tên chính thức, và ô ví dụ là CHỮ nguyên văn (không bị Excel đổi thành ngày/số)', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const kind = IMPORT_KINDS.semester;
    const sheets = await readWorkbook(new File([await buildTemplateBytes(kind)], 'x.xlsx') as unknown as globalThis.File);
    expect(sheets[0].rows[0]).toEqual(kind.columns.map((c) => c.label));
    expect(sheets[0].rows[1]).toEqual(['2026', '1', '2026-09-01', '2027-01-31']);
  });

  it('sheet hướng dẫn liệt kê từng cột kèm bắt buộc hay không', { timeout: PARSE_TIMEOUT_MS }, async () => {
    const kind = IMPORT_KINDS.room;
    const sheets = await readWorkbook(new File([await buildTemplateBytes(kind)], 'x.xlsx') as unknown as globalThis.File);
    expect(sheets[1].rows).toEqual([
      ['Cột', 'Bắt buộc', 'Giải thích'],
      ['Tên phòng', 'Có', kind.columns[0].hint],
      ['Sức chứa', 'Không', kind.columns[1].hint],
    ]);
  });
});
