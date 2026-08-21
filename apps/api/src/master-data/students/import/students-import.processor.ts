import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { StudentsService } from '../students.service';
import { CreateStudentDto } from '../dto/create-student.dto';
import { STUDENTS_IMPORT_QUEUE } from './students-import.constants';
import { RawStudentImportRow } from './parse-students-workbook';

export interface StudentsImportJobData {
  rows: RawStudentImportRow[];
}

export interface StudentsImportRowError {
  row: number;
  studentCode: string | null;
  message: string;
}

export interface StudentsImportResult {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  errors: StudentsImportRowError[];
}

@Processor(STUDENTS_IMPORT_QUEUE)
export class StudentsImportProcessor extends WorkerHost {
  constructor(private readonly students: StudentsService) {
    super();
  }

  async process(job: Job<StudentsImportJobData>): Promise<StudentsImportResult> {
    const result: StudentsImportResult = {
      totalRows: job.data.rows.length,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (const row of job.data.rows) {
      const dto = plainToInstance(CreateStudentDto, {
        studentCode: row.studentCode,
        fullName: row.fullName,
        dateOfBirth: row.dateOfBirth,
        classCode: row.classCode,
        cohortYear: row.cohortYear,
      });

      const violations = await validate(dto);
      if (violations.length > 0) {
        result.failed += 1;
        result.errors.push({
          row: row.rowNumber,
          studentCode: row.studentCode ?? null,
          message: summarizeViolations(violations),
        });
        continue;
      }

      const { created } = await this.students.upsertByCode(dto);
      if (created) {
        result.created += 1;
      } else {
        result.updated += 1;
      }
    }

    return result;
  }
}

function summarizeViolations(violations: ValidationError[]): string {
  return violations.flatMap((violation) => Object.values(violation.constraints ?? {})).join('; ');
}
