import { mapDeclaredToJplag, pickJplagLanguage } from './jplag-exam.service';

describe('mapDeclaredToJplag', () => {
  it('maps declared languages', () => {
    expect(mapDeclaredToJplag('python')).toBe('python3');
    expect(mapDeclaredToJplag('cpp')).toBe('cpp');
    expect(mapDeclaredToJplag('java')).toBe('java');
    expect(mapDeclaredToJplag('node')).toBe('javascript');
    expect(mapDeclaredToJplag(null)).toBeNull();
  });
});

describe('pickJplagLanguage', () => {
  const deliv = (id: string, language: string | null, type = 'code_project') => ({
    id,
    deliverableType: type,
    language,
  });

  const problem = (
    ordinal: number,
    language: string | null,
    requiredDeliverableId: string | null = null,
  ) => ({ ordinal, language, requiredDeliverableId });

  it('ưu tiên đề khi deliverable null', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, 'cpp')],
        deliverables: [deliv('d1', null)],
      }),
    ).toBe('cpp');
  });

  it('fallback deliverable khi đề null', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, null)],
        deliverables: [deliv('d1', 'python')],
      }),
    ).toBe('python3');
  });

  it('ưu tiên đề khi lệch với deliverable', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, 'java')],
        deliverables: [deliv('d1', 'python')],
      }),
    ).toBe('java');
  });

  it('cả hai null → null', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, null)],
        deliverables: [deliv('d1', null)],
      }),
    ).toBeNull();
  });

  it('vs_student: lấy câu gắn deliverable', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, 'cpp', 'd1'), problem(2, 'python', 'd2')],
        deliverables: [deliv('d1', null), deliv('d2', null)],
        requiredDeliverableId: 'd2',
      }),
    ).toBe('python3');
  });

  it('vs_student: không có câu gắn → ordinal 1 rồi fallback deliverable', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, null)],
        deliverables: [deliv('d9', 'java')],
        requiredDeliverableId: 'd9',
      }),
    ).toBe('java');
  });

  it('vs_model nhiều câu cùng language → dùng language đó', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, 'cpp'), problem(2, 'cpp')],
        deliverables: [deliv('d1', 'python')],
      }),
    ).toBe('cpp');
  });

  it('vs_model nhiều câu lệch language → fallback deliverable', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, 'cpp'), problem(2, 'python')],
        deliverables: [deliv('d1', 'java')],
      }),
    ).toBe('java');
  });

  it('vs_model nhiều câu một câu thiếu language → fallback deliverable', () => {
    expect(
      pickJplagLanguage({
        problems: [problem(1, 'cpp'), problem(2, null)],
        deliverables: [deliv('d1', 'python')],
      }),
    ).toBe('python3');
  });
});
