import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

/** Một mã trong Danh mục lớp danh nghĩa (chỉ admin thấy). `classCount` là số lớp học phần đang dùng mã này. */
export interface AdministrativeClass {
  id: string;
  code: string;
  classCount: number;
}

export interface AdministrativeClassInput {
  /** Chưa chuẩn hoá: server viết hoa, cắt khoảng trắng rồi kiểm 3–30 ký tự chữ/số. */
  code: string;
  confirmSimilar?: boolean;
}

export async function listAdministrativeClasses(): Promise<AdministrativeClass[]> {
  const { data, error, response } = await apiClient.GET('/administrative-classes');
  await throwIfFailed(error, response);
  return data as unknown as AdministrativeClass[];
}

export async function createAdministrativeClass(body: AdministrativeClassInput): Promise<AdministrativeClass> {
  const { data, error, response } = await apiClient.POST('/administrative-classes', { body: body as never });
  await throwIfFailed(error, response);
  return data as unknown as AdministrativeClass;
}

/** Đổi mã lan tới nhãn của MỌI lớp dùng nó, kể cả lớp của kỳ cũ — đó là mục đích của việc sửa lỗi gõ. */
export async function updateAdministrativeClass(
  id: string,
  body: Partial<AdministrativeClassInput>,
): Promise<AdministrativeClass> {
  const { data, error, response } = await apiClient.PATCH('/administrative-classes/{id}', {
    params: { path: { id } },
    body: body as never,
  });
  await throwIfFailed(error, response);
  return data as unknown as AdministrativeClass;
}

/** Mã còn lớp dùng thì server từ chối và nêu số lớp. */
export async function deleteAdministrativeClass(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/administrative-classes/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}
