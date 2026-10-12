'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getExportDownload,
  inspectTemplate,
  listExports,
  previewExport,
  uploadTemplate,
  writeExport,
  type InspectRequest,
  type PlanRequest,
  type WriteRequest,
} from '@/lib/api/grade-export';

export const gradeExportsKey = (sessionId: string | undefined) => ['exam-sessions', sessionId, 'grade-exports'] as const;

export function useGradeExports(sessionId: string | undefined) {
  return useQuery({
    queryKey: gradeExportsKey(sessionId),
    queryFn: () => listExports(sessionId!),
    enabled: Boolean(sessionId),
  });
}

export function useUploadTemplate(sessionId: string) {
  return useMutation({ mutationFn: (file: File) => uploadTemplate(sessionId, file) });
}

/** Mutation, không phải query: đối số đổi theo từng thao tác (trang tính, trang lưới) và không nên được nhớ. */
export function useInspectTemplate(sessionId: string) {
  return useMutation({ mutationFn: (body: InspectRequest) => inspectTemplate(sessionId, body) });
}

export function usePreviewExport(sessionId: string) {
  return useMutation({ mutationFn: (body: PlanRequest) => previewExport(sessionId, body) });
}

export function useWriteExport(sessionId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: WriteRequest) => writeExport(sessionId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: gradeExportsKey(sessionId) });
    },
  });
}

export function useExportDownload() {
  return useMutation({ mutationFn: (exportId: string) => getExportDownload(exportId) });
}
