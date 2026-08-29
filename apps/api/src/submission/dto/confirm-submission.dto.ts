import { IsInt, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';

/**
 * SHA-256, lowercase hex. Mirrors ck_submission_checksum exactly — a
 * mismatch here would otherwise surface as a raw Postgres check violation
 * at write time instead of a contract error the agent can report.
 */
export const SHA256_HEX_REGEX = /^[0-9a-f]{64}$/;

/**
 * Upper bound on a single declared file size. Not a storage quota — the
 * object is already uploaded by the time this arrives, and the real limit
 * belongs on the bucket. This only keeps an absurd value out of the bigint
 * column and out of the teacher-facing UI.
 */
export const MAX_DECLARED_FILE_SIZE = 2 * 1024 * 1024 * 1024;

/**
 * Validated shape of the `submission:confirm` payload. As with
 * RequestUploadUrlDto, examSessionId/studentId are shape-checked here but
 * the socket's own joined identity is what the gateway trusts.
 */
export class ConfirmSubmissionDto {
  @IsUUID()
  examSessionId!: string;

  @IsString()
  @Length(1, 20)
  studentId!: string;

  @IsUUID()
  requiredDeliverableId!: string;

  // Never used to build a path. The server recomputes the expected key from
  // (session, student, deliverable) and rejects anything that does not match
  // it byte for byte, so this field can only ever confirm — never redirect.
  @IsString()
  @Length(1, 1024)
  storageKey!: string;

  @Matches(SHA256_HEX_REGEX, {
    message: 'checksum must be a lowercase hex sha256 digest',
  })
  checksum!: string;

  @IsInt()
  @Min(0)
  @Max(MAX_DECLARED_FILE_SIZE)
  fileSize!: number;
}
