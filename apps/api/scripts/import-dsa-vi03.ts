/**
 * Import dsa_vi_03 → mỗi câu một rubric QS + một đề kho (mặc định thường kỳ).
 *
 *   pnpm import:dsa-vi-03 -- --teacher-email=gv@example.com --course-code=CTDLGT
 *   pnpm import:dsa-vi-03 -- --teacher-email=... --course-code=... --dry-run
 *   pnpm import:dsa-vi-03 -- --teacher-email=... --course-code=... --limit=3
 *
 * Chỉ question.txt + rubric.txt. Không import solution/sub.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { AccountEntity } from '../src/identity/entities/account.entity';
import { CourseEntity } from '../src/master-data/entities/course.entity';
import { ImportDsaVi03Service } from '../src/exam-bank/dsa-import/import-dsa-vi03.service';
import type { CourseExamLanguage, CourseExamType } from '../src/exam-bank/exam-bank.constants';

function parseArgs(argv: string[]) {
  let teacherEmail = '';
  let courseCode = '';
  let examType: CourseExamType = 'TK';
  let language: CourseExamLanguage = 'java';
  let limit: number | undefined;
  let dryRun = false;
  let replace: boolean | undefined;
  let datasetRoot: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf('=');
    const key = eq >= 0 ? a.slice(0, eq) : a;
    const inline = eq >= 0 ? a.slice(eq + 1) : undefined;
    const next = (): string => (inline !== undefined ? inline : argv[++i] ?? '');

    if (key === '--teacher-email') teacherEmail = next();
    else if (key === '--course-code') courseCode = next();
    else if (key === '--exam-type') examType = next() as CourseExamType;
    else if (key === '--language') language = next() as CourseExamLanguage;
    else if (key === '--limit') limit = Number(next());
    else if (key === '--dataset-root') datasetRoot = next();
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--replace') replace = true;
    else if (a === '--no-replace') replace = false;
    else if (a === '--help' || a === '-h') {
      console.log(`Usage:
  pnpm import:dsa-vi-03 -- --teacher-email=EMAIL --course-code=CODE
Options:
  --exam-type TK|GK|CK   (default TK = thường kỳ)
  --language java|cpp|…  (default java)
  --limit N
  --dry-run
  --replace / --no-replace   (mặc định: xóa đề import cũ rồi tạo lại)
  --dataset-root PATH

Mỗi câu → 1 rubric QS + 1 đề kho (1 câu).`);
      process.exit(0);
    }
  }

  if (!teacherEmail || !courseCode) {
    console.error('Bắt buộc: --teacher-email và --course-code');
    process.exit(1);
  }
  return { teacherEmail, courseCode, examType, language, limit, dryRun, replace, datasetRoot };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const ds = app.get(DataSource);
    const account = await ds.getRepository(AccountEntity).findOne({
      where: { email: opts.teacherEmail.toLowerCase() },
    });
    if (!account || account.role !== 'teacher') {
      throw new Error(`Không tìm thấy tài khoản teacher: ${opts.teacherEmail}`);
    }
    const course = await ds.getRepository(CourseEntity).findOne({
      where: { code: opts.courseCode },
    });
    if (!course) {
      throw new Error(`Không tìm thấy môn code=${opts.courseCode}`);
    }

    const importer = app.get(ImportDsaVi03Service);
    const result = await importer.importForTeacher(account.id, {
      courseId: course.id,
      examType: opts.examType,
      language: opts.language,
      limit: opts.limit,
      dryRun: opts.dryRun,
      replace: opts.replace,
      datasetRoot: opts.datasetRoot,
    });

    console.log(JSON.stringify(result, null, 2));
    if (result.exams.length > 0) {
      console.log(
        `\nĐã tạo ${result.exams.length} đề (mỗi câu một đề). Tổng điểm các đề: ${result.totalPoints}.`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
