import { Repository } from 'typeorm';
import { RubricEntity } from '../../grading/entities/rubric.entity';
import { RubricCriterionEntity } from '../../grading/entities/rubric-criterion.entity';
import { KnowledgeSource, RubricKnowledgeSource, collectKnowledge } from './knowledge-source';

function fakeSource(kind: KnowledgeSource['kind'], text: string): KnowledgeSource {
  return { kind, render: async () => text };
}

function repos(rubrics: unknown[], criteria: unknown[]) {
  return {
    rubricRepo: { find: jest.fn().mockResolvedValue(rubrics) } as unknown as Repository<RubricEntity>,
    criterionRepo: {
      find: jest.fn().mockResolvedValue(criteria),
    } as unknown as Repository<RubricCriterionEntity>,
  };
}

describe('collectKnowledge', () => {
  it('bỏ nguồn trả về rỗng — nguồn CHƯA TỒN TẠI không phải lỗi', async () => {
    // Bảng lỗi sẽ cắm vào đây khi spec chấm §2.1 có nó. Tới lúc đó nó trả
    // rỗng, và đó là trạng thái hợp lệ chứ không phải hỏng.
    await expect(
      collectKnowledge([fakeSource('rubric', 'A'), fakeSource('error_table', '   ')], 't1'),
    ).resolves.toEqual(['A']);
  });

  it('giữ nguyên thứ tự nguồn', async () => {
    const out = await collectKnowledge(
      [fakeSource('prompt', 'P'), fakeSource('rubric', 'R')],
      't1',
    );
    expect(out).toEqual(['P', 'R']);
  });

  it('một nguồn ném KHÔNG làm hỏng cả lượt soạn đề', async () => {
    const boom: KnowledgeSource = {
      kind: 'rubric',
      render: async () => {
        throw new Error('DB sập');
      },
    };
    await expect(collectKnowledge([boom, fakeSource('prompt', 'P')], 't1')).resolves.toEqual([
      'P',
    ]);
  });
});

describe('RubricKnowledgeSource', () => {
  it('chỉ đọc rubric của CHÍNH giảng viên đó', async () => {
    const { rubricRepo, criterionRepo } = repos([], []);
    await new RubricKnowledgeSource(rubricRepo, criterionRepo).render('teacher-1');
    expect(rubricRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { teacherId: 'teacher-1', isActive: true } }),
    );
  });

  it('không có rubric nào thì trả chuỗi rỗng, không ném', async () => {
    const { rubricRepo, criterionRepo } = repos([], []);
    await expect(
      new RubricKnowledgeSource(rubricRepo, criterionRepo).render('t1'),
    ).resolves.toBe('');
  });

  it('rubric có nhưng KHÔNG tiêu chí nào thì cũng trả rỗng', async () => {
    // Một rubric trống không nói gì về cách giảng viên chấm, nên nhét tên nó
    // vào prompt chỉ làm loãng.
    const { rubricRepo, criterionRepo } = repos([{ id: 'r1', name: 'Rỗng' }], []);
    await expect(
      new RubricKnowledgeSource(rubricRepo, criterionRepo).render('t1'),
    ).resolves.toBe('');
  });

  it('render tên rubric và tiêu chí thành văn bản model đọc được', async () => {
    const { rubricRepo, criterionRepo } = repos(
      [{ id: 'r1', name: 'Giữa kỳ CTDL' }],
      [{ rubricId: 'r1', description: 'Dùng đệ quy', maxPoints: '3' }],
    );
    const text = await new RubricKnowledgeSource(rubricRepo, criterionRepo).render('t1');
    expect(text).toContain('Giữa kỳ CTDL');
    expect(text).toContain('Dùng đệ quy');
    expect(text).toContain('3');
  });

  it('tiêu chí được gom đúng về rubric của nó, không lẫn sang rubric khác', async () => {
    const { rubricRepo, criterionRepo } = repos(
      [
        { id: 'r1', name: 'Rubric A' },
        { id: 'r2', name: 'Rubric B' },
      ],
      [
        { rubricId: 'r1', description: 'Của A', maxPoints: '2' },
        { rubricId: 'r2', description: 'Của B', maxPoints: '5' },
      ],
    );
    const text = await new RubricKnowledgeSource(rubricRepo, criterionRepo).render('t1');
    const posA = text.indexOf('Của A');
    const posB = text.indexOf('Của B');
    expect(text.indexOf('Rubric A')).toBeLessThan(posA);
    expect(posA).toBeLessThan(text.indexOf('Rubric B'));
    expect(text.indexOf('Rubric B')).toBeLessThan(posB);
  });
});
