import { IsBoolean, IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';
import { STUDENT_MSSV_REGEX } from './agent-join.dto';

/**
 * Agent -> Server, when `agent:join` came back `NOT_ENROLLED`.
 *
 * This is the one place the agent still asks the student for a name: there
 * is no roster row to take an authoritative one from, which is precisely
 * why they are here.
 */
export class RequestAccessDto {
  @IsString()
  @Length(1, 20)
  sessionCode!: string;

  @IsString()
  @Matches(STUDENT_MSSV_REGEX, {
    message: 'studentId must be 4-20 letters or digits',
  })
  studentId!: string;

  @IsString()
  @Length(1, 100)
  fullName!: string;

  // Free text the invigilator reads before deciding. Bounded so one student
  // cannot push a wall of text into the pending list.
  @IsString()
  @Length(1, 300)
  reason!: string;
}

/**
 * Teacher -> Server. `homeClassId` is required to approve and ignored to
 * reject: approving writes an enrollment, and an enrollment has to name the
 * class a submission will be routed to. The invigilator picks it — nothing
 * infers it.
 */
export class ResolveAccessRequestDto {
  @IsUUID()
  requestId!: string;

  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsUUID()
  homeClassId?: string;
}
