import { resolveQuestionMaterial } from './resolve-question-material';

describe('resolveQuestionMaterial', () => {
  it('PDF → giữ bytes, không trích text', async () => {
    const bytes = Buffer.from('%PDF-1.4 fake');
    const out = await resolveQuestionMaterial(bytes, 'De.pdf');
    expect(out).toEqual({ kind: 'pdf', bytes, filename: 'De.pdf' });
  });

  it('TXT → trích text', async () => {
    const out = await resolveQuestionMaterial(Buffer.from('Đề: viết hàm sort', 'utf8'), 'de.txt');
    expect(out).toEqual({
      kind: 'text',
      text: 'Đề: viết hàm sort',
      filename: 'de.txt',
    });
  });

  it('đuôi lạ / không trích được → unreadable (không giả PDF)', async () => {
    const out = await resolveQuestionMaterial(Buffer.from([0xff, 0xd8, 0xff]), 'anh.jpg');
    expect(out).toEqual({ kind: 'unreadable', filename: 'anh.jpg' });
  });
});
