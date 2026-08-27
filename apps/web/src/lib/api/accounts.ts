import { apiClient } from '@/lib/api-client';
import type { AccountRoleOption } from '@/lib/account-roles';

// Mirrors AccountsService.AccountView (apps/api/src/accounts/accounts.service.ts).
export interface AccountView {
  id: string;
  name: string;
  email: string;
  role: AccountRoleOption | 'super_admin' | 'department_admin';
  createdAt: string;
}

export interface SearchAccountsParams {
  search?: string;
  role?: AccountRoleOption;
  page: number;
  pageSize: number;
}

export interface CreateAccountInput {
  name: string;
  email: string;
  password: string;
  role: AccountRoleOption;
}

export interface UpdateAccountInput {
  name: string;
  role: AccountRoleOption;
}

/**
 * Throws on any non-2xx response or network failure, same convention as
 * lib/api/exam-session.ts — callers (hooks/useAccounts.ts) never receive a
 * partial/undefined result.
 */
async function throwIfFailed(error: unknown, response: Response) {
  // openapi-fetch only fills `error` from the response *body*, which some
  // failures leave empty — key off the status too so a 401 (an expired
  // access_token that middleware's existence-only check waved through)
  // can't be mistaken for an empty result set.
  if (error || !response.ok) {
    throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
}

export async function searchAccounts(
  params: SearchAccountsParams,
): Promise<{ items: AccountView[]; total: number }> {
  const { data, error, response } = await apiClient.GET('/accounts', {
    params: { query: params },
  });
  await throwIfFailed(error, response);
  // Cast needed: AccountsController.search() has no Swagger-decorated
  // response type yet, so the generated response schema is empty — the
  // JSON body genuinely has this shape (see AccountsService#toView).
  return data as unknown as { items: AccountView[]; total: number };
}

export async function createAccount(body: CreateAccountInput): Promise<void> {
  const { error, response } = await apiClient.POST('/accounts', { body });
  await throwIfFailed(error, response);
}

export async function updateAccount(id: string, body: UpdateAccountInput): Promise<void> {
  const { error, response } = await apiClient.PATCH('/accounts/{id}', {
    params: { path: { id } },
    body,
  });
  await throwIfFailed(error, response);
}

export async function deleteAccount(id: string): Promise<void> {
  const { error, response } = await apiClient.DELETE('/accounts/{id}', {
    params: { path: { id } },
  });
  await throwIfFailed(error, response);
}
