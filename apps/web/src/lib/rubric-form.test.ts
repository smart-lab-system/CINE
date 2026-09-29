import { describe, expect, it } from 'vitest';
import {
  activeCriteria,
  buildSaveInput,
  defaultRubricName,
  newRow,
  parseCap,
  removedKeys,
  rowsFromRubric,
  validateRubric,
  type CriterionRow,
} from './rubric-form';
import type { Rubric } from './api/grading';

const rubric = (over: Partial<Rubric> = {}): Rubric => ({
  id: 'ru-1',
  teacherId: 't',
  name: 'CTDL',
  version: 2,
  isActive: true,
  totalPoints: 10,
  criteria: [
    { id: 'c1', key: 'tinh_dung', description: 'Tính đúng', maxPoints: 6 },
    { id: 'c2', key: 'trinh_bay', description: 'Trình bày', maxPoints: 2.5 },
  ],
  ...over,
});

describe('activeCriteria', () => {
  it('takes criteria of ACTIVE versions only, once per key (first one wins)', () => {
    const list = activeCriteria([
      rubric(),
      rubric({ id: 'ru-2', name: 'Khác', criteria: [{ id: 'x', key: 'tinh_dung', description: 'Trùng khoá', maxPoints: 9 }, { id: 'y', key: 'moi', description: 'Mới', maxPoints: 1 }] }),
      rubric({ id: 'ru-0', isActive: false, criteria: [{ id: 'z', key: 'cu_ky', description: 'Cũ', maxPoints: 5 }] }),
    ]);
    expect(list.map((c) => c.key)).toEqual(['tinh_dung', 'trinh_bay', 'moi']);
    expect(list[0]).toEqual({ key: 'tinh_dung', description: 'Tính đúng', max: 6 });
  });
  it('is empty for undefined', () => {
    expect(activeCriteria(undefined)).toEqual([]);
  });
});

describe('rowsFromRubric', () => {
  it('marks every row as existing and keeps its key and id', () => {
    const rows = rowsFromRubric(rubric());
    expect(rows).toEqual([
      { id: 'c1', key: 'tinh_dung', existing: true, description: 'Tính đúng', maxPoints: '6' },
      { id: 'c2', key: 'trinh_bay', existing: true, description: 'Trình bày', maxPoints: '2.5' },
    ]);
  });
});

describe('parseCap (server: 0,25–100, at most two decimals)', () => {
  it.each([
    ['4', 4],
    ['2,5', 2.5],
    [' 0.25 ', 0.25],
    ['100', 100],
    ['12.75', 12.75],
  ])('accepts %j → %j', (raw, expected) => {
    expect(parseCap(raw)).toBe(expected);
  });
  it.each(['', '0', '0.2', '100.5', '101', '1.234', 'abc', '-1', '1e2', '1,2,3'])('rejects %j', (raw) => {
    expect(parseCap(raw)).toBeNull();
  });
});

describe('validateRubric', () => {
  const rows = (...over: Partial<CriterionRow>[]): CriterionRow[] =>
    over.map((o, i) => ({ id: `n${i}`, key: '', existing: false, description: 'Một tiêu chí hợp lệ', maxPoints: '2', ...o }));
  const ctx = { nameEditable: true, existingNames: ['CTDL'] };

  it('a valid rubric has no errors', () => {
    expect(validateRubric({ name: 'Giữa kỳ', ...ctx }, rows({}))).toEqual({ rows: {} });
  });

  describe('name (only when creating a rubric)', () => {
    it('required, ≤200 chars', () => {
      expect(validateRubric({ name: '  ', ...ctx }, rows({})).name).toBeTruthy();
      expect(validateRubric({ name: 'a'.repeat(201), ...ctx }, rows({})).name).toBeTruthy();
      expect(validateRubric({ name: 'a'.repeat(200), ...ctx }, rows({})).name).toBeUndefined();
    });
    it('an existing name is refused: saving it would silently create a new VERSION with re-derived keys', () => {
      expect(validateRubric({ name: 'CTDL', ...ctx }, rows({})).name).toMatch(/Đã có rubric tên này/);
    });
    it('is not validated when editing an existing rubric', () => {
      expect(validateRubric({ name: '', nameEditable: false, existingNames: ['CTDL'] }, rows({})).name).toBeUndefined();
    });
  });

  describe('criteria', () => {
    it('needs at least one and at most thirty', () => {
      expect(validateRubric({ name: 'X', ...ctx }, []).general).toBeTruthy();
      const thirtyOne = rows(...Array.from({ length: 31 }, () => ({})));
      expect(validateRubric({ name: 'X', ...ctx }, thirtyOne).general).toBeTruthy();
      const thirty = rows(...Array.from({ length: 30 }, () => ({})));
      expect(validateRubric({ name: 'X', ...ctx }, thirty).general).toBeUndefined();
    });
    it('description 3–1000 characters', () => {
      const errs = validateRubric({ name: 'X', ...ctx }, rows({ description: 'ab' }, { description: 'a'.repeat(1001) }, { description: 'abc' }));
      expect(errs.rows.n0.description).toBeTruthy();
      expect(errs.rows.n1.description).toBeTruthy();
      expect(errs.rows.n2).toBeUndefined();
    });
    it('cap must parse', () => {
      const errs = validateRubric({ name: 'X', ...ctx }, rows({ maxPoints: '0' }, { maxPoints: '2,5' }));
      expect(errs.rows.n0.maxPoints).toBe('Trần điểm: từ 0,25 đến 100, tối đa hai chữ số lẻ.');
      expect(errs.rows.n1).toBeUndefined();
    });
    it('a typed key must be lower-case letters/digits/underscore, ≤64; blank is fine', () => {
      const errs = validateRubric({ name: 'X', ...ctx }, rows({ key: 'Có Dấu' }, { key: 'ok_key_2' }, { key: '' }, { key: 'a'.repeat(65) }));
      expect(errs.rows.n0.key).toBeTruthy();
      expect(errs.rows.n1).toBeUndefined();
      expect(errs.rows.n2).toBeUndefined();
      expect(errs.rows.n3.key).toBeTruthy();
    });
    it('an EXISTING row is never key-validated (its key is fixed, whatever it is)', () => {
      const errs = validateRubric({ name: 'X', nameEditable: false, existingNames: [] }, rows({ existing: true, key: 'Cũ_Không-Hợp-Lệ' }));
      expect(errs.rows.n0).toBeUndefined();
    });
    it('two rows must not share a key — typed against typed, or typed against an existing one', () => {
      const errs = validateRubric(
        { name: 'X', nameEditable: false, existingNames: [] },
        rows({ existing: true, key: 'tinh_dung' }, { key: 'tinh_dung' }, { key: 'moi' }, { key: 'moi' }),
      );
      expect(errs.rows.n0).toBeUndefined();
      expect(errs.rows.n1.key).toMatch(/Trùng khoá/);
      expect(errs.rows.n3.key).toMatch(/Trùng khoá/);
      expect(errs.rows.n2).toBeUndefined();
    });
  });
});

describe('buildSaveInput (Review Focus 1: the key of an existing criterion must survive an edit)', () => {
  it('an existing criterion keeps its ORIGINAL key even after its description was rewritten', () => {
    const rows = rowsFromRubric(rubric()).map((r) => (r.id === 'c1' ? { ...r, description: 'Chương trình chạy đúng trên mọi test' } : r));
    const { criteria } = buildSaveInput('CTDL', rows);
    expect(criteria[0]).toEqual({ description: 'Chương trình chạy đúng trên mọi test', maxPoints: 6, key: 'tinh_dung' });
    expect(criteria[1]).toEqual({ description: 'Trình bày', maxPoints: 2.5, key: 'trinh_bay' });
  });

  it('a new criterion sends the key that was typed…', () => {
    const rows = [...rowsFromRubric(rubric()), { ...newRow('n1'), description: 'Xử lý ngoại lệ', maxPoints: '1', key: 'ngoai_le' }];
    expect(buildSaveInput('CTDL', rows).criteria[2]).toEqual({ description: 'Xử lý ngoại lệ', maxPoints: 1, key: 'ngoai_le' });
  });

  it('…and omits `key` entirely when left blank, so the server derives it', () => {
    const rows = [{ ...newRow('n1'), description: '  Xử lý ngoại lệ  ', maxPoints: '1' }];
    const criterion = buildSaveInput('Mới', rows).criteria[0];
    expect(criterion).toEqual({ description: 'Xử lý ngoại lệ', maxPoints: 1 });
    expect('key' in criterion).toBe(false);
  });

  it('caps typed with a comma go out as numbers with a dot', () => {
    const rows = [{ ...newRow('n1'), description: 'Tiêu chí', maxPoints: '2,25' }];
    expect(buildSaveInput('Mới', rows).criteria[0].maxPoints).toBe(2.25);
  });

  it('trims the name', () => {
    expect(buildSaveInput('  Giữa kỳ  ', rowsFromRubric(rubric())).name).toBe('Giữa kỳ');
  });
});

describe('removedKeys (criteria whose rules would start reporting "lệch tiêu chí")', () => {
  it('lists existing keys that are no longer among the rows', () => {
    const rows = rowsFromRubric(rubric()).filter((r) => r.key !== 'trinh_bay');
    expect(removedKeys(rubric(), rows)).toEqual(['trinh_bay']);
  });
  it('is empty when nothing was removed, or when creating from scratch', () => {
    expect(removedKeys(rubric(), rowsFromRubric(rubric()))).toEqual([]);
    expect(removedKeys(undefined, [])).toEqual([]);
  });
});

describe('defaultRubricName', () => {
  it('the first rubric that has an active version', () => {
    expect(defaultRubricName([rubric({ name: 'A', isActive: false }), rubric({ name: 'B' }), rubric({ name: 'C' })])).toBe('B');
  });
  it('null when there is none', () => {
    expect(defaultRubricName([])).toBeNull();
    expect(defaultRubricName(undefined)).toBeNull();
    expect(defaultRubricName([rubric({ isActive: false })])).toBeNull();
  });
});
