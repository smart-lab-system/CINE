import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { STUDENT_MSSV_REGEX } from '../../common/student-mssv';

/**
 * One row of the imported file, after the browser has parsed it.
 *
 * The .xlsx never reaches this server (Security rule 5: no file upload goes
 * through NestJS). The browser parses it, the user says which column is the
 * MSSV and which is the name — nothing is inferred from a header, per the
 * same rule GradeExport follows — and what arrives here is ordinary JSON
 * that class-validator checks like any other DTO.
 */
export class RosterStudentDto {
  @IsString()
  @Matches(STUDENT_MSSV_REGEX, {
    message: 'MSSV phải gồm 4-20 chữ cái hoặc chữ số, không có dấu cách',
  })
  mssv!: string;

  @IsString()
  @Length(1, 150)
  name!: string;
}

export class ImportRosterDto {
  /**
   * Validation here is what implements "a bad row blocks the whole file":
   * ValidationPipe rejects the request before the service opens a
   * transaction, so a file with one bad row writes nothing at all. Importing
   * the good rows and reporting the rest was rejected deliberately — a class
   * imported at 38/40 gives a headcount that looks healthy and isn't, and
   * this whole phase exists to make that number trustworthy.
   */
  @IsArray()
  @ArrayMinSize(1)
  // A lab has tens of machines, not thousands of students. The bound is
  // generous for any real class and still stops a pathological payload from
  // becoming one enormous transaction.
  @ArrayMaxSize(500)
  // student_mssv is citext, so `SV01` and `sv01` are one student in the
  // database — two such rows in one file would collide on
  // uq_enrollment_course_student mid-transaction. Caught here as a 400 that
  // names the rule instead of a 409 that names an index.
  @ArrayUnique((student: RosterStudentDto) => student.mssv?.toLowerCase(), {
    message: 'File có MSSV bị lặp lại',
  })
  @ValidateNested({ each: true })
  @Type(() => RosterStudentDto)
  students!: RosterStudentDto[];

  /**
   * Off by default, and that default is the point. A student in the system
   * but not in the file is *reported* on every import; deleting them locks
   * them out of the exam and the mistake surfaces on exam day, when nothing
   * can be undone. Removal takes someone ticking a box having read the list.
   */
  @IsOptional()
  @IsBoolean()
  removeMissing?: boolean;
}
