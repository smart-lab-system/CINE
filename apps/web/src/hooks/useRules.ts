'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createRule,
  listMissingRules,
  listRules,
  listWaivers,
  previewPrice,
  previewRule,
  reviseRule,
  revokeWaiver,
  setPrice,
  setRuleState,
  setWaiver,
  type PricePreview,
  type RuleInput,
} from '@/lib/api/rules';

const RULES_KEY = ['rules'] as const;
const MISSING_KEY = ['rules', 'missing'] as const;

export function useRules() {
  return useQuery({ queryKey: RULES_KEY, queryFn: listRules });
}

/** Luật agent báo còn thiếu (§2.1) — chặn tự quyết cho tới khi giảng viên xử lý (spec UI 3.1). */
export function useMissingRules() {
  return useQuery({ queryKey: MISSING_KEY, queryFn: listMissingRules });
}

function invalidateRules(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: RULES_KEY });
  void queryClient.invalidateQueries({ queryKey: MISSING_KEY });
}

export function useCreateRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RuleInput) => createRule(input),
    onSuccess: () => invalidateRules(queryClient),
  });
}

/** Duyệt một luật `proposed` thành luật thật: revise (gắn tiêu chí/predicate) rồi active. */
export function useReviseRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, changes }: { ruleId: string; changes: RuleInput }) => reviseRule(ruleId, changes),
    onSuccess: () => invalidateRules(queryClient),
  });
}

export function useSetRuleState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, state }: { ruleId: string; state: 'active' | 'dismissed' | 'retired' }) =>
      setRuleState(ruleId, state),
    onSuccess: () => invalidateRules(queryClient),
  });
}

/** "Lưu thì áp vào đâu" — không cache, gõ tới đâu xem trước tới đó. */
export function usePreviewRule() {
  return useMutation({ mutationFn: previewRule });
}

/** "Lưu thì ảnh hưởng bao nhiêu bài" (spec UI 3.1, T-POL-5) — PHẢI gọi trước useSetPrice. */
export function usePreviewPrice() {
  return useMutation<PricePreview, Error, { ruleId: string; deduction: string | null }>({
    mutationFn: ({ ruleId, deduction }) => previewPrice(ruleId, deduction),
  });
}

export function useSetPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ ruleId, deduction }: { ruleId: string; deduction: string | null }) => setPrice(ruleId, deduction),
    onSuccess: () => invalidateRules(queryClient),
  });
}

export function useWaivers(rubricId: string | undefined) {
  return useQuery({
    queryKey: ['rubrics', rubricId, 'criterion-waivers'],
    queryFn: () => listWaivers(rubricId!),
    enabled: Boolean(rubricId),
  });
}

export function useSetWaiver(rubricId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (criterionKey: string) => setWaiver(rubricId!, criterionKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['rubrics', rubricId, 'criterion-waivers'] }),
  });
}

export function useRevokeWaiver(rubricId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (waiverId: string) => revokeWaiver(waiverId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['rubrics', rubricId, 'criterion-waivers'] }),
  });
}
