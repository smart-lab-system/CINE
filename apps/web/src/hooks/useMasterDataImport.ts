'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { IMPORT_RUNNERS } from '@/lib/api/master-data-import';
import type { ImportKindId } from '@/lib/import/columns';
import type { RunImport } from '@/lib/import/import-types';
import { MASTER_DATA_KEYS } from './master-data-keys';

/**
 * Danh sách nào đổi khi một loại được nhập xong. Khoá `classes` là gốc nên phủ cả trang quản trị lẫn "Lớp của tôi". Lớp mới nhập làm
 * đổi `classCount` của mã (Danh mục) và của học kỳ nên làm mới cả hai — cùng lý do với `useClassMutation` (review B+G1 I2).
 */
const AFFECTED: Record<ImportKindId, readonly string[]> = {
  semester: [MASTER_DATA_KEYS.semesters],
  room: [MASTER_DATA_KEYS.rooms],
  'administrative-class': [MASTER_DATA_KEYS.administrativeClasses],
  class: [MASTER_DATA_KEYS.classes, MASTER_DATA_KEYS.administrativeClasses, MASTER_DATA_KEYS.semesters],
};

/**
 * Bộ chạy import cho một loại, bọc `IMPORT_RUNNERS` để việc LÀM MỚI danh sách sau khi ghi nằm đúng một chỗ: trang thêm nút
 * "Nhập từ file" mà quên làm mới sẽ cho admin thấy danh sách cũ ngay sau khi nhập xong và tưởng không có gì xảy ra.
 *
 * Chỉ làm mới khi lần ghi THẬT đã áp dụng (`applied`): `dryRun` không đổi gì, và lần ghi không có gì để ghi cũng vậy.
 * Trả về tham chiếu ỔN ĐỊNH (`useCallback`) — `ImportWizard` gọi `dryRun` lại mỗi khi dòng đổi, nên một hàm mới ở mỗi lần cha
 * render sẽ là một lần gọi máy chủ thừa mỗi lần.
 */
export function useImportRunner(kind: ImportKindId): RunImport {
  const queryClient = useQueryClient();
  return useCallback<RunImport>(
    async (request) => {
      const result = await IMPORT_RUNNERS[kind](request);
      if (!request.dryRun && result.applied) {
        await Promise.all(
          AFFECTED[kind].map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
        );
      }
      return result;
    },
    [kind, queryClient],
  );
}
