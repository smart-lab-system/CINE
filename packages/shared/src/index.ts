import createClient from 'openapi-fetch';
import type { paths } from './api/schema';

export const createApiClient = (baseUrl: string, accessToken?: string) =>
  createClient<paths>({
    baseUrl,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });
