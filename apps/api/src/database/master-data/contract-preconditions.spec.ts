import { contractProblems, countContractBlockers, type Queryable } from './contract-preconditions';

const clean = { classesWithoutSemester: 0, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 0, enrollmentsWithoutStudent: 0 };

describe('contractProblems — T-MIG-4: migration thu hẹp dừng khi còn dữ liệu cũ', () => {
  it('sạch → không có vấn đề', () => {
    expect(contractProblems(clean)).toEqual([]);
  });

  it.each([
    ['classesWithoutSemester', /3 lớp.*học kỳ/],
    ['classesWithoutAdministrativeClass', /3 lớp.*lớp danh nghĩa/],
    ['sessionsWithoutRoom', /3 phiên.*phòng/],
    ['enrollmentsWithoutStudent', /3.*enrollment.*sinh viên/],
  ])('%s > 0 → một câu nêu số lượng và việc phải làm (chạy lại backfill)', (field, pattern) => {
    const problems = contractProblems({ ...clean, [field]: 3 });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(pattern);
    expect(problems[0]).toMatch(/backfill/);
  });

  it('nhiều thứ cùng dở → mỗi thứ một câu', () => {
    expect(contractProblems({ ...clean, classesWithoutSemester: 1, sessionsWithoutRoom: 2 })).toHaveLength(2);
  });
});

describe('countContractBlockers', () => {
  it('truyền phạm vi lớp vào câu truy vấn; không phạm vi thì truyền null', async () => {
    const calls: unknown[][] = [];
    const db: Queryable = {
      query: async (_sql, params) => {
        calls.push(params ?? []);
        return [{ classesWithoutSemester: 1, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 2, enrollmentsWithoutStudent: 0 }];
      },
    };
    expect(await countContractBlockers(db, ['c1'])).toEqual({ classesWithoutSemester: 1, classesWithoutAdministrativeClass: 0, sessionsWithoutRoom: 2, enrollmentsWithoutStudent: 0 });
    await countContractBlockers(db);
    expect(calls).toEqual([[['c1']], [null]]);
  });
});
