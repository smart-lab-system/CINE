import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsString,
  Length,
  Matches,
  MaxLength,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

// Path-traversal defense (Task 1 review ruling, carried into this DTO):
// only letters/digits/`_`/`-`/`.` are allowed, AND the literal substring
// ".." is rejected outright — the character class alone would already
// reject "/"+"\" (neither is in the allowed set), but ".." alone is built
// entirely from allowed characters, so it needs its own negative lookahead
// to be caught (e.g. a lone ".." with no path separator at all).
export const SAFE_FILENAME_REGEX = /^(?!.*\.\.)[A-Za-z0-9_.-]+$/;

@ValidatorConstraint({ name: 'IsAfterStartTime', async: false })
class IsAfterStartTimeConstraint implements ValidatorConstraintInterface {
  validate(endTime: string, args: ValidationArguments): boolean {
    const { startTime } = args.object as CreateExamSessionDto;
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    return Number.isFinite(start) && Number.isFinite(end) && end > start;
  }

  defaultMessage(): string {
    return 'endTime must be a valid ISO8601 date after startTime';
  }
}

export class CreateExamSessionDto {
  @IsString()
  @Length(1, 200)
  name!: string;

  @IsISO8601()
  startTime!: string;

  @IsISO8601()
  @Validate(IsAfterStartTimeConstraint)
  endTime!: string;

  @IsArray()
  @ArrayMinSize(1)
  // Duplicate filenames pass every other check here (each string is
  // individually valid) but collide on the DB's unique index
  // (uq_required_deliverable_session_filename) at insert time, which
  // surfaces as a 409 the frontend can't explain to the user ("why did
  // creating a session fail?" for what's really "you typed the same
  // filename twice"). Catch it here as a 400 instead, matching Zod's
  // client-side .refine() for the same rule.
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(SAFE_FILENAME_REGEX, { each: true })
  // Matches required_deliverable.required_filename's varchar(255) column —
  // without this, an overlong filename passes DTO validation and hits the
  // DB's own length truncation error, which PostgresExceptionFilter has no
  // mapping for (falls through to a bare 500 instead of 400).
  @MaxLength(255, { each: true })
  requiredFilenames!: string[];
}
