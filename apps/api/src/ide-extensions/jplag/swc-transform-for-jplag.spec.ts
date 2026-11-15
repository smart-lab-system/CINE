import { transformSourceForJplag } from './swc-transform-for-jplag';

describe('transformSourceForJplag', () => {
  it('transforms JSX to React.createElement', () => {
    const src = `
const Footer = () => {
  const title = "Student Information";
  return (
    <footer className="bg-black">
      <h4>{title}</h4>
    </footer>
  );
};
export default Footer;
`;
    const out = transformSourceForJplag(src, 'javascript');
    expect(out).toContain('React.createElement');
    expect(out).toContain('footer');
    expect(out).toContain('title');
    expect(out).not.toMatch(/<footer/);
  });

  it('transforms TSX with type annotations', () => {
    const src = `
const Footer = (): JSX.Element => {
  const title: string = "Hi";
  return <h4>{title}</h4>;
};
`;
    const out = transformSourceForJplag(src, 'typescript');
    expect(out).toContain('React.createElement');
    expect(out).not.toMatch(/: string/);
    expect(out).not.toMatch(/<h4/);
  });

  it('passes plain JS through without inventing JSX', () => {
    const src = `function add(a, b) { return a + b; }`;
    const out = transformSourceForJplag(src, 'javascript', 'add.js');
    expect(out).toContain('return a + b');
  });
});
