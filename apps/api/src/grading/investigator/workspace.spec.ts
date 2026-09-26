import { CTX } from './testing/context';
import { normalizePath, renderRulesFile, Workspace } from './workspace';

describe('workspace ảo — §2.1 (bảng lỗi là FILE, không nhét vào prompt)', () => {
  it('có đề, bảng lỗi, nhóm test và bài nộp dưới bai-nop/', () => {
    expect(
      Workspace.fromContext(CTX)
        .list()
        .map((f) => f.path),
    ).toEqual(['bai-nop/main.cpp', 'bang-loi.md', 'de-bai.md', 'goi-test.md']);
  });

  it('bài nộp mang nguồn "submission" (sẽ bị bọc), file hệ thống thì không', () => {
    const ws = Workspace.fromContext(CTX);
    expect(ws.read('bai-nop/main.cpp')?.source).toBe('submission');
    expect(ws.read('de-bai.md')?.source).toBe('system');
  });

  it('bảng lỗi ghi mọi rule_key, đánh dấu luật chưa có giá', () => {
    const text = renderRulesFile(CTX.rules);
    expect(text).toContain('sai_ca_co_ban');
    expect(text).toMatch(/chu_thich_sai.*chưa có giá/);
  });

  it('goi-test.md chỉ có tên nhóm và số ca — KHÔNG lộ output mong đợi', () => {
    const text = Workspace.fromContext(CTX).read('goi-test.md')!.content;
    expect(text).toMatch(/co_ban: 2 ca/);
    expect(text).not.toContain('BÍ MẬT_MONG_ĐỢI');
  });

  it('Review Focus 2 — đường dẫn có \\ và ./ đọc được; ../, tuyệt đối, rỗng thì không', () => {
    expect(normalizePath('.\\bai-nop\\main.cpp')).toBe('bai-nop/main.cpp');
    for (const bad of ['../etc/passwd', '/etc/passwd', 'C:/x', 'bai-nop/../../x', '', 'a//b']) {
      expect(normalizePath(bad)).toBeNull();
    }
    expect(Workspace.fromContext(CTX).read('../bang-loi.md')).toBeNull();
  });
});

describe('bang-loi.md — §4.1 luật 2', () => {
  it('luật máy kiểm ở mục riêng "KHÔNG đề xuất"; luật model phán đoán ở mục thường; luật chưa đo được có ghi chú', () => {
    const text = renderRulesFile([
      { ruleKey: 'sai_ca_co_ban', title: 'Sai ca cơ bản', criterionKey: 'tinh_dung', priced: true, checkedBy: 'machine', machineNote: 'nhóm test co_ban' },
      { ruleKey: 'do_phuc_tap', title: 'Độ phức tạp vượt yêu cầu', criterionKey: 'hieu_nang', priced: true, checkedBy: 'model', machineNote: 'máy chưa đo được — bạn phán đoán' },
      { ruleKey: 'chu_thich_sai', title: 'Chú thích sai', criterionKey: 'trinh_bay', priced: false, checkedBy: 'model', machineNote: null },
    ]);
    const [modelPart, machinePart] = text.split('# Luật máy kiểm');
    expect(machinePart).toMatch(/KHÔNG đề xuất/);
    expect(machinePart).toContain('sai_ca_co_ban');
    expect(modelPart).not.toContain('sai_ca_co_ban');
    expect(modelPart).toMatch(/do_phuc_tap .*máy chưa đo được/);
    expect(modelPart).toMatch(/chu_thich_sai .*\[chưa có giá\]/);
  });
});
