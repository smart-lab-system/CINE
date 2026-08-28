import { IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class UpdateParticipantDto {
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  seatId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  notes?: string | null;
}
