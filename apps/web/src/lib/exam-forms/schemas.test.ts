import { describe, expect, it } from 'vitest';
import { EXAM_FORM_DEFINITIONS, EXAM_FORM_KINDS } from './schemas';
import { EXAM_FORM_SAMPLES } from './samples';
import type { ExamFormKind } from './types';

const EXPECTED_HEADERS: Record<ExamFormKind, readonly string[]> = {
  'lich-thi-tong-hop': [
    'STT',
    'Ma_HocPhan',
    'Ten_HocPhan',
    'Ma_LopHP',
    'HinhThuc_Thi',
    'ThoiLuong_Phut',
    'Ngay_Thi',
    'Ca_Thi',
    'Gio_BatDau',
    'Ma_PhongThi',
    'SoLuong_ThiSinh',
    'Ghi_Chu',
  ],
  'phan-cong-cbct': [
    'STT',
    'Ngay_Thi',
    'Ca_Thi',
    'Gio_Thi',
    'Phong_Thi',
    'Mon_Thi',
    'SL_SV',
    'Ma_CBCT1',
    'Ten_CBCT1',
    'DonVi_CBCT1',
    'Ma_CBCT2',
    'Ten_CBCT2',
    'DonVi_CBCT2',
    'Ghi_Chu',
  ],
  'ds-thisinh-theo-phong': [
    'STT',
    'Ngay_Thi',
    'Ca_Thi',
    'Phong_Thi',
    'Ma_Sinh_Vien',
    'Ho_Dem',
    'Ten',
    'Ghi_Chu',
  ],
};

describe('exam form schemas', () => {
  it('exposes exactly the three approved kinds', () => {
    expect(EXAM_FORM_KINDS.sort()).toEqual(
      ['ds-thisinh-theo-phong', 'lich-thi-tong-hop', 'phan-cong-cbct'].sort(),
    );
  });

  it.each(EXAM_FORM_KINDS)('%s headers match the spec character-for-character', (kind) => {
    expect([...EXAM_FORM_DEFINITIONS[kind].headers]).toEqual([...EXPECTED_HEADERS[kind]]);
  });

  it('does not include MMSV on the student-by-room form', () => {
    expect(EXAM_FORM_DEFINITIONS['ds-thisinh-theo-phong'].headers).not.toContain('MMSV');
  });

  it.each(EXAM_FORM_KINDS)('%s samples align with header width', (kind) => {
    const width = EXAM_FORM_DEFINITIONS[kind].headers.length;
    for (const row of EXAM_FORM_SAMPLES[kind]) {
      expect(row).toHaveLength(width);
    }
  });

  it('uses free-text HinhThuc_Thi in samples (not a snake_case enum)', () => {
    for (const row of EXAM_FORM_SAMPLES['lich-thi-tong-hop']) {
      expect(String(row[4])).not.toMatch(/^[A-Za-z0-9_]+$/); // has spaces / Vietnamese
      expect(row[4]).toBe('Thực hành máy');
    }
  });
});
