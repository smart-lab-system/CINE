import 'dotenv/config';
import { DataSource, DataSourceOptions } from 'typeorm';
import { RoleEntity } from '../identity/entities/role.entity';
import { UserEntity } from '../identity/entities/user.entity';
import { UserRoleEntity } from '../identity/entities/user-role.entity';
import { SubjectEntity } from '../master-data/subjects/subject.entity';
import { AcademicTermEntity } from '../master-data/academic-terms/academic-term.entity';
import { LecturerEntity } from '../master-data/lecturers/lecturer.entity';
import { StudentEntity } from '../master-data/students/student.entity';
import { CourseSectionEntity } from '../master-data/course-sections/course-section.entity';

// Entities are added here as they're created — starting with Task 3's
// identity entities. Migrations always run as raw SQL against the
// already-authored DDL; TypeORM never generates or alters schema here.
export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  url: process.env.DATABASE_URL,
  schema: process.env.DATABASE_SCHEMA ?? 'lab_management',
  entities: [
    RoleEntity,
    UserEntity,
    UserRoleEntity,
    SubjectEntity,
    AcademicTermEntity,
    LecturerEntity,
    StudentEntity,
    CourseSectionEntity,
  ],
  migrations: [__dirname + '/migrations/*.{js,ts}'],
  // The initial migration's SQL file already wraps itself in BEGIN/COMMIT
  // (it's the DBA-authored DDL, copied verbatim). Running TypeORM's own
  // transaction wrapper on top would nest a COMMIT inside TypeORM's
  // transaction and commit it early, so per-migration files own their
  // own transaction boundaries instead.
  migrationsTransactionMode: 'none',
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
};

export default new DataSource(dataSourceOptions);
