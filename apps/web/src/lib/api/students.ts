import { apiClient } from '@/lib/api-client';
import { throwIfFailed } from './http-error';

export interface StudentLookup {
  mssv: string;
  fullName: string;
}

/**
 * Tra tên theo ĐÚNG một MSSV (spec §2.6): có thì ô tên được điền sẵn và khoá, KHÔNG có (404) thì là MSSV mới và giảng viên nhập
 * tên. 404 vì thế trả `null` chứ không ném — nó là câu trả lời bình thường của một MSSV chưa có. Mọi lỗi KHÁC (429 giới hạn
 * tốc độ 30 lần/phút, 5xx) là lỗi thật: nuốt chúng thành "MSSV mới" sẽ cho giảng viên gõ một cái tên rồi bị server bác vì
 * MSSV đó đã có.
 */
export async function lookupStudent(mssv: string): Promise<StudentLookup | null> {
  const { data, error, response } = await apiClient.GET('/students/{mssv}', {
    params: { path: { mssv } },
  });
  if (response.status === 404) return null;
  await throwIfFailed(error, response);
  return data as unknown as StudentLookup;
}
