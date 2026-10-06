import { apiClient } from '@/lib/api-client';
import type { ImportKindId } from '@/lib/import/columns';
import {
  ImportRejectedError,
  type ImportResult,
  type RunImport,
} from '@/lib/import/import-types';

/**
 * Gọi bốn route import của admin (plan E1). Mỗi hàm là một `RunImport`, nên giao diện không biết gì về đường dẫn hay mã lỗi.
 *
 * Bốn hàm viết riêng (không một hàm nhận `path`) vì `openapi-fetch` gõ kiểu thân yêu cầu theo từng đường dẫn; một hàm
 * chung với `path` là hợp của bốn kiểu thân và không còn gì được kiểm tra. `body: request as never` là chỗ DUY NHẤT hai
 * hệ kiểu gặp nhau: dòng gửi lên là `Record` chữ do bộ mô tả cột dựng, còn DTO của server có tên trường cố định — khoá cột
 * trong `columns.ts` khớp DTO được ghim bằng test, không bằng kiểu.
 */
function unwrap(result: { data?: unknown; error?: unknown; response: { ok: boolean; status: number } }): ImportResult {
  if (!result.error && result.response.ok) {
    return result.data as ImportResult;
  }
  const body = (result.error ?? {}) as {
    error?: string;
    message?: string | string[];
    preview?: ImportResult;
  };
  const message = Array.isArray(body.message) ? body.message.join('; ') : body.message;
  // Chỉ HAI mã lỗi này mang bản xem trước; một 409 khác (va chạm DB lọt qua planner) là lỗi thường.
  if ((body.error === 'IMPORT_HAS_ERRORS' || body.error === 'NEAR_DUPLICATE') && body.preview) {
    throw new ImportRejectedError(message ?? 'Máy chủ từ chối lần nhập này.', body.error, body.preview);
  }
  throw new Error(message ?? `Yêu cầu thất bại (HTTP ${result.response.status})`);
}

export const importSemesters: RunImport = async (request) =>
  unwrap(await apiClient.POST('/semesters/import', { body: request as never }));

export const importRooms: RunImport = async (request) =>
  unwrap(await apiClient.POST('/rooms/import', { body: request as never }));

export const importAdministrativeClasses: RunImport = async (request) =>
  unwrap(await apiClient.POST('/administrative-classes/import', { body: request as never }));

export const importClasses: RunImport = async (request) =>
  unwrap(await apiClient.POST('/classes/import', { body: request as never }));

export const IMPORT_RUNNERS: Record<ImportKindId, RunImport> = {
  semester: importSemesters,
  room: importRooms,
  'administrative-class': importAdministrativeClasses,
  class: importClasses,
};
