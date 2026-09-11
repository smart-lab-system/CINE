'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  searchAccounts,
  createAccount,
  updateAccount,
  deleteAccount,
  deactivateAccount,
  reactivateAccount,
  type SearchAccountsParams,
  type CreateAccountInput,
  type UpdateAccountInput,
} from '@/lib/api/accounts';

const ACCOUNTS_QUERY_KEY = 'accounts';

/**
 * TanStack Query wrappers around lib/api/accounts.ts — pages call these
 * hooks, never `apiClient`/`lib/api/accounts.ts` directly (CLAUDE.md's
 * API-call-layering rule; the previous accounts page violated this by
 * calling `apiClient` inline, fixed here).
 */
export function useAccounts(params: SearchAccountsParams) {
  return useQuery({
    // Every param that changes the result set belongs in the key — search,
    // role, and page all do (pageSize is fixed per call site today, but
    // included for correctness if that ever changes).
    queryKey: [ACCOUNTS_QUERY_KEY, params],
    queryFn: () => searchAccounts(params),
  });
}

export function useCreateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (values: CreateAccountInput) => createAccount(values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ACCOUNTS_QUERY_KEY] }),
  });
}

export function useUpdateAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, values }: { id: string; values: UpdateAccountInput }) =>
      updateAccount(id, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ACCOUNTS_QUERY_KEY] }),
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ACCOUNTS_QUERY_KEY] }),
  });
}

/**
 * Một hook cho cả hai chiều: màn hình chỉ có một nút gạt, và tách thành
 * hai mutation sẽ buộc trang phải tự chọn hook nào theo trạng thái hàng —
 * logic đó thuộc về đây, không thuộc về trang.
 */
export function useToggleAccountActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      isActive ? deactivateAccount(id) : reactivateAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ACCOUNTS_QUERY_KEY] }),
  });
}
