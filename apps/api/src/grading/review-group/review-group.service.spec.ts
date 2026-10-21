import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import type { ExamSessionService } from '../../exam-session/exam-session.service';
import { MULTI_GROUP_LABEL, NONE_GROUP_LABEL } from './review-group';
import { ReviewGroupService } from './review-group.service';

const R1 = '11111111-1111-4111-8111-111111111111';
const R2 = '22222222-2222-4222-8222-222222222222';

describe('ReviewGroupService.listGroups', () => {
  let query: jest.Mock;
  let findEntityForOwner: jest.Mock;
  let service: ReviewGroupService;

  const isResultQuery = (sql: string) => sql.includes('FROM examcollect.grading_result g');
  const isRuleQuery = (sql: string) => sql.includes('FROM examcollect.error_rule r');

  function given(
    results: { resultId: string; errors: { ruleId: string; ruleKey: string; source: string }[] }[],
    rules: { id: string; name: string; description: string }[] = [],
  ) {
    query.mockImplementation(async (sql: string) => (isResultQuery(sql) ? results : isRuleQuery(sql) ? rules : []));
  }

  beforeEach(() => {
    query = jest.fn();
    findEntityForOwner = jest.fn().mockResolvedValue({ id: 'phien-1' });
    service = new ReviewGroupService(
      { query } as unknown as DataSource,
      { findEntityForOwner } as unknown as ExamSessionService,
    );
  });

  it('kiểm sở hữu TRƯỚC mọi câu đọc; không sở hữu thì không đọc gì', async () => {
    findEntityForOwner.mockRejectedValue(new ForbiddenException('You do not own this exam session'));
    await expect(service.listGroups('phien-1', 'gv-khac')).rejects.toBeInstanceOf(ForbiddenException);
    expect(findEntityForOwner).toHaveBeenCalledWith('phien-1', 'gv-khac');
    expect(query).not.toHaveBeenCalled();
  });

  it('chỉ đọc bài flagged_for_review, investigator, có lượt tính mới nhất mang điểm, của đúng phiên', async () => {
    given([]);
    await service.listGroups('phien-1', 'gv-1');
    const [sql, params] = query.mock.calls.find(([s]) => isResultQuery(s as string))!;
    expect(params).toEqual(['phien-1']);
    expect(sql).toContain("g.status = 'flagged_for_review'");
    expect(sql).toContain("g.pipeline = 'investigator'");
    expect(sql).toContain('g.ungradable_class IS NULL');
    expect(sql).toContain('last.score IS NOT NULL');
    expect(sql).toContain('ORDER BY c.created_at DESC, c.id DESC');
  });

  it('điền tên và mô tả luật từ bản sửa hiện hành cho nhóm đơn; multi/none giữ nhãn của hàm thuần', async () => {
    given(
      [
        { resultId: 'a', errors: [{ ruleId: R1, ruleKey: 'ro_ri_bo_nho', source: 'deterministic' }] },
        {
          resultId: 'b',
          errors: [
            { ruleId: R1, ruleKey: 'ro_ri_bo_nho', source: 'deterministic' },
            { ruleId: R2, ruleKey: 'sai_ca_co_ban', source: 'llm_with_tools' },
          ],
        },
        { resultId: 'c', errors: [] },
      ],
      [{ id: R1, name: 'Rò rỉ bộ nhớ', description: 'Cấp phát mà không giải phóng.' }],
    );
    const groups = await service.listGroups('phien-1', 'gv-1');
    expect(groups.map((g) => [g.key, g.label, g.description])).toEqual([
      [R1, 'Rò rỉ bộ nhớ', 'Cấp phát mà không giải phóng.'],
      ['multi', MULTI_GROUP_LABEL, null],
      ['none', NONE_GROUP_LABEL, null],
    ]);
    const [, ruleParams] = query.mock.calls.find(([s]) => isRuleQuery(s as string))!;
    expect(ruleParams).toEqual([[R1]]);
  });

  it('luật không còn dòng bản sửa → nhãn rơi về ruleKey đã lưu, mô tả null', async () => {
    given([{ resultId: 'a', errors: [{ ruleId: R2, ruleKey: 'sai_ca_co_ban', source: 'llm_only' }] }], []);
    const [group] = await service.listGroups('phien-1', 'gv-1');
    expect(group).toMatchObject({ key: R2, label: 'sai_ca_co_ban', description: null });
  });

  it('không có nhóm đơn nào → không đọc bảng luật', async () => {
    given([{ resultId: 'a', errors: [] }]);
    const groups = await service.listGroups('phien-1', 'gv-1');
    expect(groups).toHaveLength(1);
    expect(query.mock.calls.some(([s]) => isRuleQuery(s as string))).toBe(false);
  });
});
