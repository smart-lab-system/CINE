import { AUDIT_VALUE_CAP_BYTES } from '../../admin/audit-log-query';
import { reassignedAuditExtra, type ReassignedEntry } from './reassigned-audit';

const typical = (n: number): ReassignedEntry => ({
  label: `DHKTPM18ATT – Nhóm ${n} · HK1 2026-2027`,
  from: 'Nguyễn Văn Anh Tuấn',
  to: 'Trần Thị Bảo Ngọc',
});
const many = (count: number, make: (n: number) => ReassignedEntry = typical) =>
  Array.from({ length: count }, (_, i) => make(i + 1));
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), 'utf8');

describe('reassignedAuditExtra (review B+G1 I4)', () => {
  it('không ai bị đổi giảng viên thì không thêm gì vào audit', () => {
    expect(reassignedAuditExtra([])).toEqual({});
  });

  it('ít mục: giữ hết, nêu đúng tổng', () => {
    const entries = many(3);
    expect(reassignedAuditExtra(entries)).toEqual({ reassigned: entries, reassignedTotal: 3 });
  });

  it('lô lớn: danh sách bị cắt THEO BYTE để cả dòng audit còn dưới trần 4 KB của trang audit; tổng số luôn đủ', () => {
    // Đo ở Postgres cho thấy 35 mục như `typical` đã làm `new_value` vượt 4096 B — reader khi đó trả null, và câu mô tả hiện
    // "thêm —, cập nhật —". Cắt theo số mục (50) không bảo vệ được cái trần đó.
    const extra = reassignedAuditExtra(many(100));

    expect(extra.reassignedTotal).toBe(100);
    const kept = extra.reassigned as ReassignedEntry[];
    expect(kept.length).toBeGreaterThanOrEqual(20); // vẫn còn đủ chi tiết để điều tra
    expect(kept.length).toBeLessThan(100);
    expect(bytes(kept)).toBeLessThanOrEqual(Math.floor(AUDIT_VALUE_CAP_BYTES * 0.7));
    expect(bytes({ targetLabel: 'Lớp (nhập từ file)', added: 99999, updated: 99999, unchanged: 99999, ...extra })).toBeLessThan(
      AUDIT_VALUE_CAP_BYTES - 800, // chừa chỗ cho khoảng trắng mà Postgres thêm khi in jsonb
    );
  });

  it('giữ NHỮNG MỤC ĐẦU theo đúng thứ tự (không xáo, không bỏ giữa chừng)', () => {
    const entries = many(100);
    const kept = reassignedAuditExtra(entries).reassigned as ReassignedEntry[];
    expect(kept).toEqual(entries.slice(0, kept.length));
  });

  it('nhãn và tên rất dài, nhiều byte (tiếng Việt có dấu): vẫn dưới trần', () => {
    const long = (n: number): ReassignedEntry => ({
      label: `Ệ${'Ế'.repeat(78)} ${n}`,
      from: 'Ợ'.repeat(60),
      to: 'Ử'.repeat(60),
    });
    const extra = reassignedAuditExtra(many(100, long));
    expect(extra.reassignedTotal).toBe(100);
    expect(bytes(extra.reassigned)).toBeLessThanOrEqual(Math.floor(AUDIT_VALUE_CAP_BYTES * 0.7));
  });

  it('một mục đơn lẻ đã vượt ngân sách: danh sách rỗng nhưng tổng vẫn đúng, không ném', () => {
    const huge: ReassignedEntry = { label: 'X'.repeat(5000), from: 'a', to: 'b' };
    expect(reassignedAuditExtra([huge, typical(1)])).toEqual({ reassigned: [], reassignedTotal: 2 });
  });

  it('vẫn không vượt 50 mục dù mục nhỏ đến đâu', () => {
    const tiny = (n: number): ReassignedEntry => ({ label: `L${n}`, from: 'a', to: 'b' });
    const extra = reassignedAuditExtra(many(80, tiny));
    expect((extra.reassigned as ReassignedEntry[]).length).toBe(50);
    expect(extra.reassignedTotal).toBe(80);
  });
});
