import { parseEvalArgs } from './cli-args';

describe('parseEvalArgs — --challenge và --waive (P0)', () => {
  it('mặc định: không phản biện, không miễn trừ — để các lượt đã commit còn so được', () => {
    const r = parseEvalArgs([]);
    expect(r).toMatchObject({ ok: true, args: { challenge: false, waive: [] } });
  });
  it('--challenge=on bật', () => {
    expect(parseEvalArgs(['--pipeline=investigator', '--challenge=on'])).toMatchObject({ ok: true, args: { challenge: true } });
  });
  it('--challenge sai giá trị → lỗi, không đoán', () => {
    expect(parseEvalArgs(['--challenge=yes'])).toEqual({ ok: false, error: expect.stringContaining('--challenge') });
  });
  it('--waive nhận danh sách tiêu chí, bỏ khoảng trắng và mục rỗng', () => {
    expect(parseEvalArgs(['--pipeline=investigator', '--waive=hieu_nang, trinh_bay,'])).toMatchObject({ ok: true, args: { waive: ['hieu_nang', 'trinh_bay'] } });
  });
  it('--challenge / --waive đi với pipeline baseline → lỗi (không âm thầm bỏ qua)', () => {
    expect(parseEvalArgs(['--challenge=on'])).toMatchObject({ ok: false });
    expect(parseEvalArgs(['--waive=hieu_nang'])).toMatchObject({ ok: false });
    expect(parseEvalArgs(['--pipeline=investigator', '--challenge=on', '--waive=hieu_nang'])).toMatchObject({ ok: true });
  });
  it('dạng thiếu dấu = → lỗi, không thành mặc định', () => {
    expect(parseEvalArgs(['--pipeline=investigator', '--challenge'])).toEqual({ ok: false, error: expect.stringContaining('--challenge=') });
    expect(parseEvalArgs(['--pipeline=investigator', '--waive'])).toEqual({ ok: false, error: expect.stringContaining('--waive=') });
  });
  it('--waive có khoá không hợp lệ → lỗi (khoá tiêu chí là ^[a-z0-9_]{1,64}$)', () => {
    expect(parseEvalArgs(['--waive=Hieu Nang'])).toEqual({ ok: false, error: expect.stringContaining('--waive') });
  });
});
