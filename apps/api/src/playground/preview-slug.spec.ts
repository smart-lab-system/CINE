import {
  buildPreviewSlug,
  buildPublicPreviewUrl,
  playgroundPublicBase,
  slugifyPreviewName,
} from './preview-slug';

describe('preview-slug', () => {
  const prev = process.env.PLAYGROUND_PUBLIC_BASE;

  afterEach(() => {
    if (prev === undefined) delete process.env.PLAYGROUND_PUBLIC_BASE;
    else process.env.PLAYGROUND_PUBLIC_BASE = prev;
  });

  it('slugify bỏ dấu tiếng Việt', () => {
    expect(slugifyPreviewName('Nguyễn Văn A')).toBe('nguyen-van-a');
    expect(slugifyPreviewName('Đỗ Thị Mỹ')).toBe('do-thi-my');
  });

  it('buildPreviewSlug = mssv + tên', () => {
    expect(buildPreviewSlug('22699781', 'Nguyễn Thanh Huy')).toBe('22699781-nguyen-thanh-huy');
  });

  it('buildPublicPreviewUrl dùng PLAYGROUND_PUBLIC_BASE', () => {
    process.env.PLAYGROUND_PUBLIC_BASE = 'https://examcine.site/';
    expect(playgroundPublicBase()).toBe('https://examcine.site');
    expect(buildPublicPreviewUrl('22699781-nguyen-van-a')).toBe(
      'https://examcine.site/pg/22699781-nguyen-van-a/',
    );
    expect(buildPublicPreviewUrl('22699781-nguyen-van-a', 'html/index.html')).toBe(
      'https://examcine.site/pg/22699781-nguyen-van-a/html/index.html',
    );
  });

  it('không có base → null', () => {
    delete process.env.PLAYGROUND_PUBLIC_BASE;
    expect(buildPublicPreviewUrl('x')).toBeNull();
  });
});
