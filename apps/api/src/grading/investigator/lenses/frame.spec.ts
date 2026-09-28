import { LENS_PROTOCOL_HELP } from './frame';

describe('LENS_PROTOCOL_HELP', () => {
  it('nói rõ trả JSON NGAY, không viết văn xuôi trước (diễn tập 2026-09-28: cnb/glm-5.3 hay mở đầu bằng một câu kế hoạch thay vì JSON)', () => {
    expect(LENS_PROTOCOL_HELP).toMatch(/không (viết|kèm) (văn xuôi|lời dẫn|giải thích)/i);
  });
});
