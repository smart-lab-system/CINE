/** Stable error codes for seed API (spec §8). */
export const SeedErrorCode = {
  SEED_DISABLED: 'SEED_DISABLED',
  BOOTSTRAP_NOT_AVAILABLE: 'BOOTSTRAP_NOT_AVAILABLE',
  SEMESTER_NOT_FOUND: 'SEMESTER_NOT_FOUND',
  ACCOUNT_NOT_FOUND: 'ACCOUNT_NOT_FOUND',
  ACCOUNT_ROLE_INVALID: 'ACCOUNT_ROLE_INVALID',
  COURSE_NOT_FOUND: 'COURSE_NOT_FOUND',
  COURSE_OWNED_BY_OTHER: 'COURSE_OWNED_BY_OTHER',
  CLASS_NOT_FOUND: 'CLASS_NOT_FOUND',
  CLASS_TEACHER_MISMATCH: 'CLASS_TEACHER_MISMATCH',
  SUPER_ADMIN_NOT_SEEDABLE: 'SUPER_ADMIN_NOT_SEEDABLE',
} as const;

export type SeedErrorCode =
  (typeof SeedErrorCode)[keyof typeof SeedErrorCode];

/** Common ensure response shape (spec §6). */
export type SeedEnsureResult<T extends object = object> = T & {
  id: string;
  created: boolean;
};
