import { IsUUID, IsString, Length } from 'class-validator';

/**
 * Validated shape of the `submission:request-upload-url` payload.
 *
 * examSessionId/studentId are part of the contract and are checked here for
 * shape, but they are NOT the source of truth for identity — the gateway
 * compares them against what this socket actually joined as and rejects any
 * disagreement (see AgentSocketIdentity).
 */
export class RequestUploadUrlDto {
  @IsUUID()
  examSessionId!: string;

  @IsString()
  @Length(1, 20)
  studentId!: string;

  @IsUUID()
  requiredDeliverableId!: string;
}
