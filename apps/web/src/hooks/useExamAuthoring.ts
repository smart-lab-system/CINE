'use client';

import { useMutation } from '@tanstack/react-query';
import {
  generateExam,
  type GeneratedExam,
  type GenerateExamInput,
} from '@/lib/api/exam-authoring';

/**
 * Soạn đề là MUTATION, không phải query.
 *
 * Nó tiêu tiền và không idempotent. Một `useQuery` sẽ tự refetch khi cửa sổ
 * lấy lại focus, và mỗi lần như vậy là một lần trả tiền cho một đề KHÁC HẲN
 * đề đang hiện trên màn hình — giảng viên nhìn xuống thì đề đã đổi.
 */
export function useGenerateExam() {
  return useMutation<GeneratedExam, Error, GenerateExamInput>({
    mutationFn: generateExam,
  });
}
