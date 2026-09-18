import type { ExamFormDefinition, ExamFormKind } from './types';

/**
 * Header contracts — copy character-for-character from the approved spec.
 * Do not rename columns for cosmetics; external forms depend on these names.
 */

const LICH_THI_HEADERS = [
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
] as const;

const PHAN_CONG_HEADERS = [
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
] as const;

const DS_THISINH_HEADERS = [
  'STT',
  'Ngay_Thi',
  'Ca_Thi',
  'Phong_Thi',
  'Ma_Sinh_Vien',
  'Ho_Dem',
  'Ten',
  'Ghi_Chu',
] as const;

export const EXAM_FORM_DEFINITIONS: Record<ExamFormKind, ExamFormDefinition> = {
  'lich-thi-tong-hop': {
    kind: 'lich-thi-tong-hop',
    label: 'Lịch thi tổng hợp',
    description: 'Một dòng cho mỗi lớp học phần × ca × phòng.',
    sheetName: 'Lich_Thi_Tong_Hop',
    headers: LICH_THI_HEADERS,
  },
  'phan-cong-cbct': {
    kind: 'phan-cong-cbct',
    label: 'Phân công cán bộ coi thi theo phòng',
    description: 'Một dòng cho mỗi phòng trong một ca, tối đa hai CBCT.',
    sheetName: 'Phan_Cong_CBCT',
    headers: PHAN_CONG_HEADERS,
  },
  'ds-thisinh-theo-phong': {
    kind: 'ds-thisinh-theo-phong',
    label: 'Danh sách thí sinh dự thi theo phòng',
    description: 'Một dòng cho mỗi thí sinh, kèm ngày / ca / phòng trên lưới.',
    sheetName: 'DS_ThiSinh_Phong',
    headers: DS_THISINH_HEADERS,
  },
};

export const EXAM_FORM_KINDS = Object.keys(EXAM_FORM_DEFINITIONS) as ExamFormKind[];

export function getExamFormDefinition(kind: ExamFormKind): ExamFormDefinition {
  return EXAM_FORM_DEFINITIONS[kind];
}
