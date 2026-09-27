import { decideEntry, planExtraction, SOURCE_EXTRACTION_LIMITS, type ArchiveEntry } from './archive-rules';

const MiB = 1024 * 1024;

function entry(over: Partial<ArchiveEntry> = {}): ArchiveEntry {
  return { path: 'a.cpp', uncompressedSize: 10, isDirectory: false, isSymlink: false, ...over };
}

describe('archive-rules — luật giải nén bài code (port plan-1, trần chặt hơn)', () => {
  describe('zip slip', () => {
    it.each(['../../etc/passwd', 'a/../../b.cpp', '/etc/passwd', 'C:\\Windows\\system32\\x.dll', 'a/../../../x'])(
      'từ chối %s',
      (path) => {
        expect(decideEntry(entry({ path }), SOURCE_EXTRACTION_LIMITS).take).toBe(false);
      },
    );

    it('chấp nhận đường dẫn con hợp lệ, chuẩn hoá về dấu /; "a..b" không phải tấn công', () => {
      expect(decideEntry(entry({ path: 'src\\main\\a..b.cpp' }), SOURCE_EXTRACTION_LIMITS)).toEqual({
        take: true,
        safePath: 'src/main/a..b.cpp',
      });
    });
  });

  it('symlink: từ chối bất kể trỏ đi đâu', () => {
    expect(decideEntry(entry({ isSymlink: true }), SOURCE_EXTRACTION_LIMITS)).toEqual({
      take: false,
      reason: expect.stringContaining('liên kết'),
    });
  });

  describe('bom', () => {
    it('một file vượt trần file → bỏ file đó, không huỷ cả archive', () => {
      const out = planExtraction([entry({ path: 'ok.cpp', uncompressedSize: 100 }), entry({ path: 'huge.cpp', uncompressedSize: 2 * MiB })]);
      expect(out.take.map((t) => t.path)).toEqual(['ok.cpp']);
      expect(out.rejected).toHaveLength(1);
      expect(out.refusal).toBeNull();
    });

    it('TỔNG vượt trần → từ chối cả archive trước khi đọc byte nào', () => {
      const entries = Array.from({ length: 10 }, (_, i) => entry({ path: `f${i}.cpp`, uncompressedSize: 0.9 * MiB }));
      const out = planExtraction(entries);
      expect(out.take).toHaveLength(0);
      expect(out.refusal).toContain('tổng dung lượng');
    });

    it('vượt trần số entry → từ chối cả archive', () => {
      const entries = Array.from({ length: SOURCE_EXTRACTION_LIMITS.maxEntries + 1 }, (_, i) => entry({ path: `f${i}.cpp` }));
      expect(planExtraction(entries).refusal).toContain('số lượng file');
    });
  });

  it('bỏ qua entry thư mục, không tính vào trần', () => {
    const out = planExtraction([entry({ path: 'src/', isDirectory: true, uncompressedSize: 0 }), entry({ path: 'src/a.cpp', uncompressedSize: 5 })]);
    expect(out.take.map((t) => t.path)).toEqual(['src/a.cpp']);
  });
});
