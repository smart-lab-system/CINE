# Master Data Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full CRUD (create/search/edit/delete) for students, lecturers, subjects, academic terms, and course sections — end-to-end through both the Nest API and the Next.js admin UI — plus course-section enrollment management and a BullMQ-backed Excel import for students (`WEB-MD-01..24`).

**Architecture:** One Nest sub-module per entity under `apps/api/src/master-data/`, each following `AccountsModule`'s exact shape (transactional writes, `IsNull()` soft-delete filters, `admin`-only `RolesGuard`). A shared frontend CRUD scaffold (built once, in Task 8) is reused by every entity page instead of repeating Accounts' bespoke wiring five times. The Excel import is this module's one new piece of infrastructure: the first real use of the Redis container the Foundation plan provisioned but never consumed.

**Tech Stack:** NestJS 10 + TypeORM (unchanged from Foundation), `@nestjs/bullmq` + `bullmq` + `ioredis` (new — background jobs), `exceljs` (new — parsing the import file), Next.js 15 + TanStack Query/Table + React Hook Form + Zod (unchanged from Foundation).

**Spec:** `docs/superpowers/specs/2026-08-21-master-data-module-design.md`

## Global Constraints

- `synchronize` stays `false` — no schema changes in this plan; all six tables already exist from the Foundation migration.
- Soft-delete filters use `IsNull()` from `typeorm`, never `deletedAt: undefined`.
- Entities (`students`, `lecturers`, `subjects`, `academic_terms`, `course_sections`, `course_section_enrollments`) are plain-column TypeORM classes with no relation decorators — joins happen in the service's `QueryBuilder`, matching the schema-first convention.
- Multi-statement writes (a create/update touching more than one row) run inside `dataSource.transaction(...)`.
- Every new list/search endpoint gets an explicit, `@ApiProperty()`-decorated response class as its controller method's declared return type — no `as unknown as` bridges in this module's frontend code. This is the gap the Foundation plan's Task 7 left open; this plan closes it from the start.
- Every entity is `@Roles('admin')`-gated behind the existing `JwtAuthGuard`/`RolesGuard`, same as Accounts.
- The DB's `guard_master_soft_delete` trigger already blocks deleting a row with active children for every table this plan touches (verified directly against the DDL) — no new database-error-handling code; the existing `PostgresExceptionFilter` (`23503` → `409`) already covers it.
- The Excel import file is never persisted to MinIO or disk — it exists only as the BullMQ job's payload for the duration of that one job.

---

### Task 1: Subjects module (`WEB-MD-11..14`)

Establishes the "simple reference data" pattern — entity, DTOs including a decorated response class, transactional service, `admin`-gated controller — that Tasks 2–4 repeat for Academic Terms, Lecturers, and Students. Also creates the `MasterDataModule` aggregator that later tasks add their own sub-module to.

**Files:**
- Create: `apps/api/src/master-data/subjects/subject.entity.ts`
- Create: `apps/api/src/master-data/subjects/dto/create-subject.dto.ts`
- Create: `apps/api/src/master-data/subjects/dto/update-subject.dto.ts`
- Create: `apps/api/src/master-data/subjects/dto/search-subjects.dto.ts`
- Create: `apps/api/src/master-data/subjects/dto/subject-list-item.dto.ts`
- Create: `apps/api/src/master-data/subjects/subjects.service.ts`
- Create: `apps/api/src/master-data/subjects/subjects.controller.ts`
- Create: `apps/api/src/master-data/subjects/subjects.module.ts`
- Create: `apps/api/src/master-data/master-data.module.ts`
- Modify: `apps/api/src/app.module.ts` (import `MasterDataModule`)
- Modify: `apps/api/src/database/data-source.ts` (register `SubjectEntity`)
- Test: `apps/api/test/subjects.e2e-spec.ts`

**Interfaces:**
- Consumes: `JwtAuthGuard`, `RolesGuard`, `@Roles()` (Foundation Task 4); `PostgresExceptionFilter` (already registered globally in `main.ts`, Foundation Task 4).
- Produces: `SubjectEntity`; `SubjectListItemDto { id, code, name, credits: number | null, description: string | null }`; `PaginatedSubjectsDto { items: SubjectListItemDto[], total }`; `SubjectsService.create/search/update/remove`; `MasterDataModule` (Tasks 2–8 each add one more sub-module import to it).

- [ ] **Step 1: Write the `SubjectEntity`**

`apps/api/src/master-data/subjects/subject.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'subjects' })
export class SubjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext' })
  code!: string;

  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'smallint', nullable: true })
  credits!: number | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

- [ ] **Step 2: Register the entity on the DataSource**

Modify `apps/api/src/database/data-source.ts` — add the import and append `SubjectEntity` to the `entities` array (currently `[RoleEntity, UserEntity, UserRoleEntity]`):
```ts
import { SubjectEntity } from '../master-data/subjects/subject.entity';
// ...
  entities: [RoleEntity, UserEntity, UserRoleEntity, SubjectEntity],
```

- [ ] **Step 3: Write the DTOs**

`apps/api/src/master-data/subjects/dto/create-subject.dto.ts`:
```ts
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class CreateSubjectDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  code!: string;

  @IsString()
  @Length(1, 200)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  credits?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
```

`apps/api/src/master-data/subjects/dto/update-subject.dto.ts` — `code` is deliberately not editable (same immutable-identifier precedent as `AccountsController` never allowing a username edit):
```ts
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateSubjectDto {
  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(30)
  credits?: number;

  @IsOptional()
  @IsString()
  description?: string;
}
```

`apps/api/src/master-data/subjects/dto/search-subjects.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchSubjectsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

`apps/api/src/master-data/subjects/dto/subject-list-item.dto.ts` — the decorated response classes that close the Foundation plan's `as unknown as` gap:
```ts
import { ApiProperty } from '@nestjs/swagger';

export class SubjectListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true, type: Number })
  credits!: number | null;

  @ApiProperty({ nullable: true, type: String })
  description!: string | null;
}

export class PaginatedSubjectsDto {
  @ApiProperty({ type: [SubjectListItemDto] })
  items!: SubjectListItemDto[];

  @ApiProperty()
  total!: number;
}
```

- [ ] **Step 4: Write the failing e2e test**

`apps/api/test/subjects.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Subjects (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `subjects_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Subjects Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdSubjectId: string;

  it('rejects creating a subject without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/subjects')
      .send({ code: `nope_${Date.now()}`, name: 'No Auth' });

    expect(response.status).toBe(401);
  });

  it('creates a subject as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `SUBJ_${Date.now()}`, name: 'Data Structures', credits: 4 });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdSubjectId = response.body.id;
  });

  it('searches subjects', async () => {
    const response = await request(app.getHttpServer())
      .get('/subjects?search=Data+Structures&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBeGreaterThanOrEqual(1);
    expect(
      response.body.items.some((item: any) => item.id === createdSubjectId),
    ).toBe(true);
  });

  it('updates a subject', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/subjects/${createdSubjectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Data Structures & Algorithms', credits: 5 });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Data Structures & Algorithms');
    expect(response.body.credits).toBe(5);
  });

  it('rejects soft-deleting a subject that still has an active course section', async () => {
    const [{ id: termId }] = await dataSource.query(
      `INSERT INTO lab_management.academic_terms (code, name, starts_on, ends_on)
       VALUES ($1, 'Guard Test Term', now(), now() + interval '1 day')
       RETURNING id`,
      [`GUARDTERM_${Date.now()}`],
    );
    await dataSource.query(
      `INSERT INTO lab_management.course_sections
         (subject_id, academic_term_id, section_code)
       VALUES ($1, $2, $3)`,
      [createdSubjectId, termId, `GUARDSEC_${Date.now()}`],
    );

    const response = await request(app.getHttpServer())
      .delete(`/subjects/${createdSubjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(409);

    const [{ deleted_at }] = await dataSource.query(
      `SELECT deleted_at FROM lab_management.subjects WHERE id = $1`,
      [createdSubjectId],
    );
    expect(deleted_at).toBeNull();
  });
});
```

This is the one Master Data test file that exercises the soft-delete-guard `23503` path — per the design spec, "at least one entity" needs to prove it end-to-end; the other four entities' tests (Tasks 2–5) cover normal CRUD + RBAC only, not re-proving the same DB mechanism.

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `/subjects` routes don't exist yet.

- [ ] **Step 6: Implement `SubjectsService`**

`apps/api/src/master-data/subjects/subjects.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { SubjectEntity } from './subject.entity';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SearchSubjectsDto } from './dto/search-subjects.dto';
import { PaginatedSubjectsDto, SubjectListItemDto } from './dto/subject-list-item.dto';

@Injectable()
export class SubjectsService {
  constructor(
    @InjectRepository(SubjectEntity)
    private readonly subjects: Repository<SubjectEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateSubjectDto): Promise<{ id: string }> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SubjectEntity);
      return repo.save(
        repo.create({
          code: dto.code,
          name: dto.name,
          credits: dto.credits ?? null,
          description: dto.description ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchSubjectsDto): Promise<PaginatedSubjectsDto> {
    const qb = this.subjects.createQueryBuilder('s').where('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(s.code ILIKE :term OR s.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('s.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((s) => this.toView(s)), total };
  }

  async update(id: string, dto: UpdateSubjectDto): Promise<SubjectListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SubjectEntity);
      const subject = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        name: dto.name ?? subject.name,
        credits: dto.credits ?? subject.credits,
        description: dto.description ?? subject.description,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.subjects, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(SubjectEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  private async findActiveOrThrow(
    repo: Repository<SubjectEntity>,
    id: string,
  ): Promise<SubjectEntity> {
    const subject = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!subject) {
      throw new NotFoundException('Subject not found');
    }
    return subject;
  }

  private toView(subject: SubjectEntity): SubjectListItemDto {
    return {
      id: subject.id,
      code: subject.code,
      name: subject.name,
      credits: subject.credits,
      description: subject.description,
    };
  }
}
```

`findActiveOrThrow` filters `deletedAt: IsNull()` directly in the `findOne` call rather than fetching unconditionally and checking the field afterward (`AccountsService`'s pattern) — both are correct; this is the tighter idiom, used here and in every other Master Data entity in this plan since there's no `AccountsService`-style precedent constraining the choice.

- [ ] **Step 7: Implement `SubjectsController`, `SubjectsModule`, and `MasterDataModule`**

`apps/api/src/master-data/subjects/subjects.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { SubjectsService } from './subjects.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SearchSubjectsDto } from './dto/search-subjects.dto';
import { PaginatedSubjectsDto, SubjectListItemDto } from './dto/subject-list-item.dto';

@ApiTags('subjects')
@Controller('subjects')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Post()
  create(@Body() dto: CreateSubjectDto): Promise<{ id: string }> {
    return this.subjects.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedSubjectsDto })
  search(@Query() query: SearchSubjectsDto): Promise<PaginatedSubjectsDto> {
    return this.subjects.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: SubjectListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSubjectDto,
  ): Promise<SubjectListItemDto> {
    return this.subjects.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.subjects.remove(id);
  }
}
```

`apps/api/src/master-data/subjects/subjects.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubjectEntity } from './subject.entity';
import { SubjectsService } from './subjects.service';
import { SubjectsController } from './subjects.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubjectEntity])],
  controllers: [SubjectsController],
  providers: [SubjectsService],
})
export class SubjectsModule {}
```

`apps/api/src/master-data/master-data.module.ts` — Tasks 2–8 each add one more entry to this `imports` array:
```ts
import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';

@Module({
  imports: [SubjectsModule],
})
export class MasterDataModule {}
```

Modify `apps/api/src/app.module.ts` — add `MasterDataModule` to the existing `imports` array (alongside `HealthModule`, `AuthModule`, `AccountsModule`):
```ts
import { MasterDataModule } from './master-data/master-data.module';
// ...
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    HealthModule,
    AuthModule,
    AccountsModule,
    MasterDataModule,
  ],
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all 5 `Subjects (e2e)` tests green, plus every pre-existing suite still green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/master-data apps/api/src/app.module.ts apps/api/src/database/data-source.ts apps/api/test/subjects.e2e-spec.ts
git commit -m "feat(api): add Subjects module (WEB-MD-11..14)"
```

---

### Task 2: Academic Terms module (`WEB-MD-15..18`)

Same pattern as Task 1, with one new wrinkle: `startsOn`/`endsOn` date-range validation (`endsOn >= startsOn`), enforced in the service with a clear `400` message rather than relying only on the DB's `ck_academic_terms_dates` CHECK constraint as a backstop.

**Files:**
- Create: `apps/api/src/master-data/academic-terms/academic-term.entity.ts`
- Create: `apps/api/src/master-data/academic-terms/dto/create-academic-term.dto.ts`
- Create: `apps/api/src/master-data/academic-terms/dto/update-academic-term.dto.ts`
- Create: `apps/api/src/master-data/academic-terms/dto/search-academic-terms.dto.ts`
- Create: `apps/api/src/master-data/academic-terms/dto/academic-term-list-item.dto.ts`
- Create: `apps/api/src/master-data/academic-terms/academic-terms.service.ts`
- Create: `apps/api/src/master-data/academic-terms/academic-terms.controller.ts`
- Create: `apps/api/src/master-data/academic-terms/academic-terms.module.ts`
- Modify: `apps/api/src/master-data/master-data.module.ts` (add `AcademicTermsModule` to `imports`)
- Modify: `apps/api/src/database/data-source.ts` (register `AcademicTermEntity`)
- Test: `apps/api/test/academic-terms.e2e-spec.ts`

**Interfaces:**
- Consumes: same guards as Task 1.
- Produces: `AcademicTermEntity`; `AcademicTermListItemDto { id, code, name, startsOn: string, endsOn: string, isActive: boolean }`; `PaginatedAcademicTermsDto`; `AcademicTermsService.create/search/update/remove`. Task 5 (Course Sections) references `academic_term_id` as a plain FK column — it does not import anything from this task.

- [ ] **Step 1: Write the `AcademicTermEntity`**

`apps/api/src/master-data/academic-terms/academic-term.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'academic_terms' })
export class AcademicTermEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext' })
  code!: string;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'starts_on', type: 'date' })
  startsOn!: string;

  @Column({ name: 'ends_on', type: 'date' })
  endsOn!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

`starts_on`/`ends_on` are Postgres `date` columns — TypeORM maps `type: 'date'` to a plain JS string (`'YYYY-MM-DD'`), not a `Date` object, which is also the exact shape the JSON API should serialize; no date-formatting logic needed anywhere in this task.

- [ ] **Step 2: Register the entity on the DataSource**

Modify `apps/api/src/database/data-source.ts`:
```ts
import { AcademicTermEntity } from '../master-data/academic-terms/academic-term.entity';
// ...
  entities: [RoleEntity, UserEntity, UserRoleEntity, SubjectEntity, AcademicTermEntity],
```

- [ ] **Step 3: Write the DTOs**

`apps/api/src/master-data/academic-terms/dto/create-academic-term.dto.ts`:
```ts
import { IsDateString, IsString, Length, Matches } from 'class-validator';

export class CreateAcademicTermDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  code!: string;

  @IsString()
  @Length(1, 150)
  name!: string;

  @IsDateString()
  startsOn!: string;

  @IsDateString()
  endsOn!: string;
}
```

`apps/api/src/master-data/academic-terms/dto/update-academic-term.dto.ts`:
```ts
import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';

export class UpdateAcademicTermDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  name?: string;

  @IsOptional()
  @IsDateString()
  startsOn?: string;

  @IsOptional()
  @IsDateString()
  endsOn?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```

`apps/api/src/master-data/academic-terms/dto/search-academic-terms.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchAcademicTermsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

`apps/api/src/master-data/academic-terms/dto/academic-term-list-item.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';

export class AcademicTermListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  startsOn!: string;

  @ApiProperty()
  endsOn!: string;

  @ApiProperty()
  isActive!: boolean;
}

export class PaginatedAcademicTermsDto {
  @ApiProperty({ type: [AcademicTermListItemDto] })
  items!: AcademicTermListItemDto[];

  @ApiProperty()
  total!: number;
}
```

- [ ] **Step 4: Write the failing e2e test**

`apps/api/test/academic-terms.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('AcademicTerms (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    const dataSource = app.get(DataSource);
    const adminUsername = `terms_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Terms Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdTermId: string;

  it('rejects a term with endsOn before startsOn', async () => {
    const response = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `BADTERM_${Date.now()}`,
        name: 'Bad Term',
        startsOn: '2026-09-01',
        endsOn: '2026-08-01',
      });

    expect(response.status).toBe(400);
  });

  it('creates an academic term as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `TERM_${Date.now()}`,
        name: 'HK1 2026-2027',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdTermId = response.body.id;
  });

  it('searches academic terms', async () => {
    const response = await request(app.getHttpServer())
      .get('/academic-terms?search=HK1&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item: any) => item.id === createdTermId),
    ).toBe(true);
  });

  it('updates an academic term', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/academic-terms/${createdTermId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'HK1 2026-2027 (Updated)', isActive: false });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('HK1 2026-2027 (Updated)');
    expect(response.body.isActive).toBe(false);
  });

  it('deletes an academic term with no active course sections', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/academic-terms/${createdTermId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `/academic-terms` routes don't exist yet.

- [ ] **Step 6: Implement `AcademicTermsService`**

`apps/api/src/master-data/academic-terms/academic-terms.service.ts`:
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { AcademicTermEntity } from './academic-term.entity';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';
import { SearchAcademicTermsDto } from './dto/search-academic-terms.dto';
import {
  AcademicTermListItemDto,
  PaginatedAcademicTermsDto,
} from './dto/academic-term-list-item.dto';

@Injectable()
export class AcademicTermsService {
  constructor(
    @InjectRepository(AcademicTermEntity)
    private readonly terms: Repository<AcademicTermEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateAcademicTermDto): Promise<{ id: string }> {
    this.assertDateOrder(dto.startsOn, dto.endsOn);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicTermEntity);
      return repo.save(
        repo.create({
          code: dto.code,
          name: dto.name,
          startsOn: dto.startsOn,
          endsOn: dto.endsOn,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchAcademicTermsDto): Promise<PaginatedAcademicTermsDto> {
    const qb = this.terms.createQueryBuilder('t').where('t.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(t.code ILIKE :term OR t.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('t.starts_on', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((t) => this.toView(t)), total };
  }

  async update(
    id: string,
    dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicTermEntity);
      const term = await this.findActiveOrThrow(repo, id);
      const startsOn = dto.startsOn ?? term.startsOn;
      const endsOn = dto.endsOn ?? term.endsOn;
      this.assertDateOrder(startsOn, endsOn);

      await repo.update(id, {
        name: dto.name ?? term.name,
        startsOn,
        endsOn,
        isActive: dto.isActive ?? term.isActive,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.terms, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(AcademicTermEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  private assertDateOrder(startsOn: string, endsOn: string): void {
    if (new Date(endsOn) < new Date(startsOn)) {
      throw new BadRequestException('endsOn must not be before startsOn');
    }
  }

  private async findActiveOrThrow(
    repo: Repository<AcademicTermEntity>,
    id: string,
  ): Promise<AcademicTermEntity> {
    const term = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!term) {
      throw new NotFoundException('Academic term not found');
    }
    return term;
  }

  private toView(term: AcademicTermEntity): AcademicTermListItemDto {
    return {
      id: term.id,
      code: term.code,
      name: term.name,
      startsOn: term.startsOn,
      endsOn: term.endsOn,
      isActive: term.isActive,
    };
  }
}
```

- [ ] **Step 7: Implement `AcademicTermsController`, `AcademicTermsModule`, and wire into `MasterDataModule`**

`apps/api/src/master-data/academic-terms/academic-terms.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { AcademicTermsService } from './academic-terms.service';
import { CreateAcademicTermDto } from './dto/create-academic-term.dto';
import { UpdateAcademicTermDto } from './dto/update-academic-term.dto';
import { SearchAcademicTermsDto } from './dto/search-academic-terms.dto';
import {
  AcademicTermListItemDto,
  PaginatedAcademicTermsDto,
} from './dto/academic-term-list-item.dto';

@ApiTags('academic-terms')
@Controller('academic-terms')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AcademicTermsController {
  constructor(private readonly terms: AcademicTermsService) {}

  @Post()
  create(@Body() dto: CreateAcademicTermDto): Promise<{ id: string }> {
    return this.terms.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedAcademicTermsDto })
  search(@Query() query: SearchAcademicTermsDto): Promise<PaginatedAcademicTermsDto> {
    return this.terms.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: AcademicTermListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAcademicTermDto,
  ): Promise<AcademicTermListItemDto> {
    return this.terms.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.terms.remove(id);
  }
}
```

`apps/api/src/master-data/academic-terms/academic-terms.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AcademicTermEntity } from './academic-term.entity';
import { AcademicTermsService } from './academic-terms.service';
import { AcademicTermsController } from './academic-terms.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AcademicTermEntity])],
  controllers: [AcademicTermsController],
  providers: [AcademicTermsService],
})
export class AcademicTermsModule {}
```

Modify `apps/api/src/master-data/master-data.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';

@Module({
  imports: [SubjectsModule, AcademicTermsModule],
})
export class MasterDataModule {}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all 5 `AcademicTerms (e2e)` tests green, plus every pre-existing suite still green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/master-data apps/api/src/database/data-source.ts apps/api/test/academic-terms.e2e-spec.ts
git commit -m "feat(api): add Academic Terms module (WEB-MD-15..18)"
```

---

### Task 3: Lecturers module (`WEB-MD-06..09`)

Same pattern as Task 1, no new wrinkles. `lecturers.user_id` (nullable FK to an eventual login account) is deliberately **not** exposed in this module's DTOs — per the DDL's own comment, it stays `null` until an account is separately granted, matching the same "import before account" intent that already applies to students.

**Files:**
- Create: `apps/api/src/master-data/lecturers/lecturer.entity.ts`
- Create: `apps/api/src/master-data/lecturers/dto/create-lecturer.dto.ts`
- Create: `apps/api/src/master-data/lecturers/dto/update-lecturer.dto.ts`
- Create: `apps/api/src/master-data/lecturers/dto/search-lecturers.dto.ts`
- Create: `apps/api/src/master-data/lecturers/dto/lecturer-list-item.dto.ts`
- Create: `apps/api/src/master-data/lecturers/lecturers.service.ts`
- Create: `apps/api/src/master-data/lecturers/lecturers.controller.ts`
- Create: `apps/api/src/master-data/lecturers/lecturers.module.ts`
- Modify: `apps/api/src/master-data/master-data.module.ts` (add `LecturersModule`)
- Modify: `apps/api/src/database/data-source.ts` (register `LecturerEntity`)
- Test: `apps/api/test/lecturers.e2e-spec.ts`

**Interfaces:**
- Consumes: same guards as Task 1.
- Produces: `LecturerEntity`; `LecturerListItemDto { id, employeeCode, fullName, department: string | null, academicTitle: string | null }`; `PaginatedLecturersDto`; `LecturersService.create/search/update/remove`.

- [ ] **Step 1: Write the `LecturerEntity`**

`apps/api/src/master-data/lecturers/lecturer.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'lecturers' })
export class LecturerEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'employee_code', type: 'citext' })
  employeeCode!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  department!: string | null;

  @Column({ name: 'academic_title', type: 'varchar', length: 100, nullable: true })
  academicTitle!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

- [ ] **Step 2: Register the entity on the DataSource**

Modify `apps/api/src/database/data-source.ts`:
```ts
import { LecturerEntity } from '../master-data/lecturers/lecturer.entity';
// ...
  entities: [
    RoleEntity,
    UserEntity,
    UserRoleEntity,
    SubjectEntity,
    AcademicTermEntity,
    LecturerEntity,
  ],
```

- [ ] **Step 3: Write the DTOs**

`apps/api/src/master-data/lecturers/dto/create-lecturer.dto.ts`:
```ts
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateLecturerDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{2,32}$/)
  employeeCode!: string;

  @IsString()
  @Length(1, 150)
  fullName!: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  department?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  academicTitle?: string;
}
```

`apps/api/src/master-data/lecturers/dto/update-lecturer.dto.ts` — `employeeCode` is not editable, same precedent as `Subject.code`:
```ts
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateLecturerDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 150)
  department?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  academicTitle?: string;
}
```

`apps/api/src/master-data/lecturers/dto/search-lecturers.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchLecturersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

`apps/api/src/master-data/lecturers/dto/lecturer-list-item.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';

export class LecturerListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  employeeCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true, type: String })
  department!: string | null;

  @ApiProperty({ nullable: true, type: String })
  academicTitle!: string | null;
}

export class PaginatedLecturersDto {
  @ApiProperty({ type: [LecturerListItemDto] })
  items!: LecturerListItemDto[];

  @ApiProperty()
  total!: number;
}
```

- [ ] **Step 4: Write the failing e2e test**

`apps/api/test/lecturers.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Lecturers (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    const dataSource = app.get(DataSource);
    const adminUsername = `lecturers_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Lecturers Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdLecturerId: string;

  it('rejects creating a lecturer without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/lecturers')
      .send({ employeeCode: `nope_${Date.now()}`, fullName: 'No Auth' });

    expect(response.status).toBe(401);
  });

  it('creates a lecturer as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/lecturers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeCode: `GV_${Date.now()}`,
        fullName: 'Nguyen Van A',
        department: 'Khoa CNTT',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdLecturerId = response.body.id;
  });

  it('searches lecturers', async () => {
    const response = await request(app.getHttpServer())
      .get('/lecturers?search=Nguyen+Van+A&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item: any) => item.id === createdLecturerId),
    ).toBe(true);
  });

  it('updates a lecturer', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/lecturers/${createdLecturerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ academicTitle: 'Thac si' });

    expect(response.status).toBe(200);
    expect(response.body.academicTitle).toBe('Thac si');
  });

  it('deletes a lecturer with no active proctor assignments', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/lecturers/${createdLecturerId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `/lecturers` routes don't exist yet.

- [ ] **Step 6: Implement `LecturersService`**

`apps/api/src/master-data/lecturers/lecturers.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { LecturerEntity } from './lecturer.entity';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import { SearchLecturersDto } from './dto/search-lecturers.dto';
import { LecturerListItemDto, PaginatedLecturersDto } from './dto/lecturer-list-item.dto';

@Injectable()
export class LecturersService {
  constructor(
    @InjectRepository(LecturerEntity)
    private readonly lecturers: Repository<LecturerEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateLecturerDto): Promise<{ id: string }> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LecturerEntity);
      return repo.save(
        repo.create({
          employeeCode: dto.employeeCode,
          fullName: dto.fullName,
          department: dto.department ?? null,
          academicTitle: dto.academicTitle ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchLecturersDto): Promise<PaginatedLecturersDto> {
    const qb = this.lecturers.createQueryBuilder('l').where('l.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(l.employee_code ILIKE :term OR l.full_name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }

    qb.orderBy('l.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((l) => this.toView(l)), total };
  }

  async update(id: string, dto: UpdateLecturerDto): Promise<LecturerListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LecturerEntity);
      const lecturer = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        fullName: dto.fullName ?? lecturer.fullName,
        department: dto.department ?? lecturer.department,
        academicTitle: dto.academicTitle ?? lecturer.academicTitle,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.lecturers, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LecturerEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  private async findActiveOrThrow(
    repo: Repository<LecturerEntity>,
    id: string,
  ): Promise<LecturerEntity> {
    const lecturer = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!lecturer) {
      throw new NotFoundException('Lecturer not found');
    }
    return lecturer;
  }

  private toView(lecturer: LecturerEntity): LecturerListItemDto {
    return {
      id: lecturer.id,
      employeeCode: lecturer.employeeCode,
      fullName: lecturer.fullName,
      department: lecturer.department,
      academicTitle: lecturer.academicTitle,
    };
  }
}
```

- [ ] **Step 7: Implement `LecturersController`, `LecturersModule`, and wire into `MasterDataModule`**

`apps/api/src/master-data/lecturers/lecturers.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { LecturersService } from './lecturers.service';
import { CreateLecturerDto } from './dto/create-lecturer.dto';
import { UpdateLecturerDto } from './dto/update-lecturer.dto';
import { SearchLecturersDto } from './dto/search-lecturers.dto';
import { LecturerListItemDto, PaginatedLecturersDto } from './dto/lecturer-list-item.dto';

@ApiTags('lecturers')
@Controller('lecturers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LecturersController {
  constructor(private readonly lecturers: LecturersService) {}

  @Post()
  create(@Body() dto: CreateLecturerDto): Promise<{ id: string }> {
    return this.lecturers.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedLecturersDto })
  search(@Query() query: SearchLecturersDto): Promise<PaginatedLecturersDto> {
    return this.lecturers.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: LecturerListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLecturerDto,
  ): Promise<LecturerListItemDto> {
    return this.lecturers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.lecturers.remove(id);
  }
}
```

`apps/api/src/master-data/lecturers/lecturers.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LecturerEntity } from './lecturer.entity';
import { LecturersService } from './lecturers.service';
import { LecturersController } from './lecturers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([LecturerEntity])],
  controllers: [LecturersController],
  providers: [LecturersService],
})
export class LecturersModule {}
```

Modify `apps/api/src/master-data/master-data.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';
import { LecturersModule } from './lecturers/lecturers.module';

@Module({
  imports: [SubjectsModule, AcademicTermsModule, LecturersModule],
})
export class MasterDataModule {}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all 5 `Lecturers (e2e)` tests green, plus every pre-existing suite still green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/master-data apps/api/src/database/data-source.ts apps/api/test/lecturers.e2e-spec.ts
git commit -m "feat(api): add Lecturers module (WEB-MD-06..09)"
```

---

### Task 4: Students module — CRUD (`WEB-MD-01..04`)

Same pattern again. `WEB-MD-05` (Excel import) is Task 7, built on top of this task's `CreateStudentDto` — Task 7's per-row validation reuses this exact DTO's `class-validator` constraints, so don't change the validation rules here without checking Task 7. `students.user_id` is excluded from the DTOs for the same "import before account" reason as `lecturers.user_id` in Task 3.

**Files:**
- Create: `apps/api/src/master-data/students/student.entity.ts`
- Create: `apps/api/src/master-data/students/dto/create-student.dto.ts`
- Create: `apps/api/src/master-data/students/dto/update-student.dto.ts`
- Create: `apps/api/src/master-data/students/dto/search-students.dto.ts`
- Create: `apps/api/src/master-data/students/dto/student-list-item.dto.ts`
- Create: `apps/api/src/master-data/students/students.service.ts`
- Create: `apps/api/src/master-data/students/students.controller.ts`
- Create: `apps/api/src/master-data/students/students.module.ts`
- Modify: `apps/api/src/master-data/master-data.module.ts` (add `StudentsModule`)
- Modify: `apps/api/src/database/data-source.ts` (register `StudentEntity`)
- Test: `apps/api/test/students.e2e-spec.ts`

**Interfaces:**
- Consumes: same guards as Task 1.
- Produces: `StudentEntity`; `CreateStudentDto` (Task 7's import worker validates each spreadsheet row against this exact class — its `studentCode` regex is `^[A-Za-z0-9._-]{3,32}$`, matching the DB's `ck_students_code` CHECK, and `cohortYear` is `1900`–`2200` inclusive, matching `ck_students_cohort`); `StudentListItemDto { id, studentCode, fullName, dateOfBirth: string | null, classCode: string | null, cohortYear: number | null }`; `PaginatedStudentsDto`; `StudentsService.create/search/update/remove` (Task 7 also calls `StudentsService` directly for its upsert-by-`studentCode` logic — see Task 7).

- [ ] **Step 1: Write the `StudentEntity`**

`apps/api/src/master-data/students/student.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'students' })
export class StudentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'student_code', type: 'citext' })
  studentCode!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 150 })
  fullName!: string;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: string | null;

  @Column({ name: 'class_code', type: 'varchar', length: 50, nullable: true })
  classCode!: string | null;

  @Column({ name: 'cohort_year', type: 'smallint', nullable: true })
  cohortYear!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

- [ ] **Step 2: Register the entity on the DataSource**

Modify `apps/api/src/database/data-source.ts`:
```ts
import { StudentEntity } from '../master-data/students/student.entity';
// ...
  entities: [
    RoleEntity,
    UserEntity,
    UserRoleEntity,
    SubjectEntity,
    AcademicTermEntity,
    LecturerEntity,
    StudentEntity,
  ],
```

- [ ] **Step 3: Write the DTOs**

`apps/api/src/master-data/students/dto/create-student.dto.ts`:
```ts
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateStudentDto {
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{3,32}$/)
  studentCode!: string;

  @IsString()
  @Length(1, 150)
  fullName!: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  classCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2200)
  cohortYear?: number;
}
```

`apps/api/src/master-data/students/dto/update-student.dto.ts` — `studentCode` is not editable, same precedent as `Subject.code`:
```ts
import { IsDateString, IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class UpdateStudentDto {
  @IsOptional()
  @IsString()
  @Length(1, 150)
  fullName?: string;

  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  classCode?: string;

  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2200)
  cohortYear?: number;
}
```

`apps/api/src/master-data/students/dto/search-students.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class SearchStudentsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

`apps/api/src/master-data/students/dto/student-list-item.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';

export class StudentListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty({ nullable: true, type: String })
  dateOfBirth!: string | null;

  @ApiProperty({ nullable: true, type: String })
  classCode!: string | null;

  @ApiProperty({ nullable: true, type: Number })
  cohortYear!: number | null;
}

export class PaginatedStudentsDto {
  @ApiProperty({ type: [StudentListItemDto] })
  items!: StudentListItemDto[];

  @ApiProperty()
  total!: number;
}
```

- [ ] **Step 4: Write the failing e2e test**

`apps/api/test/students.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('Students (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    const dataSource = app.get(DataSource);
    const adminUsername = `students_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Students Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdStudentId: string;

  it('rejects creating a student without a token', async () => {
    const response = await request(app.getHttpServer())
      .post('/students')
      .send({ studentCode: `nope_${Date.now()}`, fullName: 'No Auth' });

    expect(response.status).toBe(401);
  });

  it('creates a student as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        studentCode: `SV_${Date.now()}`,
        fullName: 'Tran Thi B',
        classCode: 'D20CQCE01',
        cohortYear: 2020,
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdStudentId = response.body.id;
  });

  it('searches students', async () => {
    const response = await request(app.getHttpServer())
      .get('/students?search=Tran+Thi+B&page=1&pageSize=20')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(
      response.body.items.some((item: any) => item.id === createdStudentId),
    ).toBe(true);
  });

  it('updates a student', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ classCode: 'D20CQCE02' });

    expect(response.status).toBe(200);
    expect(response.body.classCode).toBe('D20CQCE02');
  });

  it('deletes a student with no active enrollments', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/students/${createdStudentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `/students` routes don't exist yet.

- [ ] **Step 6: Implement `StudentsService`**

`apps/api/src/master-data/students/students.service.ts`:
```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { StudentEntity } from './student.entity';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { SearchStudentsDto } from './dto/search-students.dto';
import { PaginatedStudentsDto, StudentListItemDto } from './dto/student-list-item.dto';

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateStudentDto): Promise<{ id: string }> {
    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      return repo.save(
        repo.create({
          studentCode: dto.studentCode,
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ?? null,
          classCode: dto.classCode ?? null,
          cohortYear: dto.cohortYear ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchStudentsDto): Promise<PaginatedStudentsDto> {
    const qb = this.students.createQueryBuilder('s').where('s.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere(
        '(s.student_code ILIKE :term OR s.full_name ILIKE :term OR s.class_code ILIKE :term)',
        { term: `%${query.search}%` },
      );
    }

    qb.orderBy('s.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map((s) => this.toView(s)), total };
  }

  async update(id: string, dto: UpdateStudentDto): Promise<StudentListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      const student = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        fullName: dto.fullName ?? student.fullName,
        dateOfBirth: dto.dateOfBirth ?? student.dateOfBirth,
        classCode: dto.classCode ?? student.classCode,
        cohortYear: dto.cohortYear ?? student.cohortYear,
      });
    });
    return this.toView(await this.findActiveOrThrow(this.students, id));
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  /** Reused by the Excel import worker (Task 7) for its per-row
   * upsert-by-studentCode logic. `studentCode` is CITEXT in the DB, so this
   * match is already case-insensitive with no extra handling needed. */
  async upsertByCode(dto: CreateStudentDto): Promise<{ id: string; created: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(StudentEntity);
      const existing = await repo.findOne({
        where: { studentCode: dto.studentCode, deletedAt: IsNull() },
      });

      if (existing) {
        await repo.update(existing.id, {
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ?? existing.dateOfBirth,
          classCode: dto.classCode ?? existing.classCode,
          cohortYear: dto.cohortYear ?? existing.cohortYear,
        });
        return { id: existing.id, created: false };
      }

      const saved = await repo.save(
        repo.create({
          studentCode: dto.studentCode,
          fullName: dto.fullName,
          dateOfBirth: dto.dateOfBirth ?? null,
          classCode: dto.classCode ?? null,
          cohortYear: dto.cohortYear ?? null,
        }),
      );
      return { id: saved.id, created: true };
    });
  }

  private async findActiveOrThrow(
    repo: Repository<StudentEntity>,
    id: string,
  ): Promise<StudentEntity> {
    const student = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!student) {
      throw new NotFoundException('Student not found');
    }
    return student;
  }

  private toView(student: StudentEntity): StudentListItemDto {
    return {
      id: student.id,
      studentCode: student.studentCode,
      fullName: student.fullName,
      dateOfBirth: student.dateOfBirth,
      classCode: student.classCode,
      cohortYear: student.cohortYear,
    };
  }
}
```

- [ ] **Step 7: Implement `StudentsController`, `StudentsModule`, and wire into `MasterDataModule`**

`apps/api/src/master-data/students/students.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { SearchStudentsDto } from './dto/search-students.dto';
import { PaginatedStudentsDto, StudentListItemDto } from './dto/student-list-item.dto';

@ApiTags('students')
@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  create(@Body() dto: CreateStudentDto): Promise<{ id: string }> {
    return this.students.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedStudentsDto })
  search(@Query() query: SearchStudentsDto): Promise<PaginatedStudentsDto> {
    return this.students.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: StudentListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStudentDto,
  ): Promise<StudentListItemDto> {
    return this.students.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.students.remove(id);
  }
}
```

`apps/api/src/master-data/students/students.module.ts` — `exports: [StudentsService]` because Task 7's `StudentsImportModule` needs to inject it:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StudentEntity } from './student.entity';
import { StudentsService } from './students.service';
import { StudentsController } from './students.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StudentEntity])],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService],
})
export class StudentsModule {}
```

Modify `apps/api/src/master-data/master-data.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';
import { LecturersModule } from './lecturers/lecturers.module';
import { StudentsModule } from './students/students.module';

@Module({
  imports: [SubjectsModule, AcademicTermsModule, LecturersModule, StudentsModule],
})
export class MasterDataModule {}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all 5 `Students (e2e)` tests green, plus every pre-existing suite still green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/master-data apps/api/src/database/data-source.ts apps/api/test/students.e2e-spec.ts
git commit -m "feat(api): add Students module CRUD (WEB-MD-01..04)"
```

---

### Task 5: Course Sections module — CRUD (`WEB-MD-19..22`)

The one entity with real relationships: `subject_id`/`academic_term_id` are plain FK columns (no relation decorators, per convention), but `create()` must reject a reference to a soft-deleted subject/term — Postgres's FK constraint only checks the row physically exists, not whether it's soft-deleted, so without an explicit check a section could be created against a "deleted" subject. Search results need the referenced subject's and term's code/name for display; rather than a raw SQL join, this resolves them with batched follow-up queries stitched into a `Map` — the same idiom `AccountsService` already uses to resolve role codes, just applied to two lookups instead of one. `sectionCode`/`subjectId`/`academicTermId` are immutable after creation (changing which subject/term a section belongs to is a bigger operation than an edit); only `nominalClassCode`/`name` are editable. Enrollment management (`WEB-MD-23..24`) is Task 6, built on top of this task's entity.

**Files:**
- Create: `apps/api/src/master-data/course-sections/course-section.entity.ts`
- Create: `apps/api/src/master-data/course-sections/dto/create-course-section.dto.ts`
- Create: `apps/api/src/master-data/course-sections/dto/update-course-section.dto.ts`
- Create: `apps/api/src/master-data/course-sections/dto/search-course-sections.dto.ts`
- Create: `apps/api/src/master-data/course-sections/dto/course-section-list-item.dto.ts`
- Create: `apps/api/src/master-data/course-sections/course-sections.service.ts`
- Create: `apps/api/src/master-data/course-sections/course-sections.controller.ts`
- Create: `apps/api/src/master-data/course-sections/course-sections.module.ts`
- Modify: `apps/api/src/master-data/master-data.module.ts` (add `CourseSectionsModule`)
- Modify: `apps/api/src/database/data-source.ts` (register `CourseSectionEntity`)
- Test: `apps/api/test/course-sections.e2e-spec.ts`

**Interfaces:**
- Consumes: same guards as Task 1; `SubjectEntity` (Task 1), `AcademicTermEntity` (Task 2) — registered again via this module's own `TypeOrmModule.forFeature` call (Nest/TypeORM support the same entity being registered in multiple modules; this doesn't import `SubjectsModule`/`AcademicTermsModule`, avoiding any module coupling).
- Produces: `CourseSectionEntity`; `CourseSectionListItemDto { id, sectionCode, nominalClassCode: string | null, name: string | null, subject: { id, code, name }, academicTerm: { id, code, name } }`; `PaginatedCourseSectionsDto`; `CourseSectionsService.create/search/update/remove`. Task 6 (enrollments) injects `CourseSectionsService` to reuse its `findActiveOrThrow`-style existence check before adding an enrollment.

- [ ] **Step 1: Write the `CourseSectionEntity`**

`apps/api/src/master-data/course-sections/course-section.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'course_sections' })
export class CourseSectionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'subject_id', type: 'uuid' })
  subjectId!: string;

  @Column({ name: 'academic_term_id', type: 'uuid' })
  academicTermId!: string;

  @Column({ name: 'section_code', type: 'citext' })
  sectionCode!: string;

  @Column({ name: 'nominal_class_code', type: 'varchar', length: 50, nullable: true })
  nominalClassCode!: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

- [ ] **Step 2: Register the entity on the DataSource**

Modify `apps/api/src/database/data-source.ts`:
```ts
import { CourseSectionEntity } from '../master-data/course-sections/course-section.entity';
// ...
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
```

- [ ] **Step 3: Write the DTOs**

`apps/api/src/master-data/course-sections/dto/create-course-section.dto.ts`:
```ts
import { IsOptional, IsString, IsUUID, Length, Matches } from 'class-validator';

export class CreateCourseSectionDto {
  @IsUUID()
  subjectId!: string;

  @IsUUID()
  academicTermId!: string;

  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,64}$/)
  sectionCode!: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  nominalClassCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
}
```

`apps/api/src/master-data/course-sections/dto/update-course-section.dto.ts`:
```ts
import { IsOptional, IsString, Length } from 'class-validator';

export class UpdateCourseSectionDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  nominalClassCode?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  name?: string;
}
```

`apps/api/src/master-data/course-sections/dto/search-course-sections.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class SearchCourseSectionsDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @IsOptional()
  @IsUUID()
  academicTermId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

`apps/api/src/master-data/course-sections/dto/course-section-list-item.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';

export class CourseSectionSubjectRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class CourseSectionTermRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;
}

export class CourseSectionListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sectionCode!: string;

  @ApiProperty({ nullable: true, type: String })
  nominalClassCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  name!: string | null;

  @ApiProperty({ type: CourseSectionSubjectRefDto })
  subject!: CourseSectionSubjectRefDto;

  @ApiProperty({ type: CourseSectionTermRefDto })
  academicTerm!: CourseSectionTermRefDto;
}

export class PaginatedCourseSectionsDto {
  @ApiProperty({ type: [CourseSectionListItemDto] })
  items!: CourseSectionListItemDto[];

  @ApiProperty()
  total!: number;
}
```

- [ ] **Step 4: Write the failing e2e test**

`apps/api/test/course-sections.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('CourseSections (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let subjectId: string;
  let termId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `sections_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Sections Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;

    const subjectResponse = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `CSSUBJ_${Date.now()}`, name: 'Course Sections Test Subject' });
    subjectId = subjectResponse.body.id;

    const termResponse = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `CSTERM_${Date.now()}`,
        name: 'Course Sections Test Term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });
    termId = termResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  let createdSectionId: string;

  it('rejects a course section referencing a non-existent subject', async () => {
    const response = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: '00000000-0000-0000-0000-000000000000',
        academicTermId: termId,
        sectionCode: `NOPE_${Date.now()}`,
      });

    expect(response.status).toBe(400);
  });

  it('creates a course section as admin', async () => {
    const response = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId,
        academicTermId: termId,
        sectionCode: `SEC_${Date.now()}`,
        nominalClassCode: 'D20CQCE01',
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
    createdSectionId = response.body.id;
  });

  it('searches course sections with joined subject/term display fields', async () => {
    const response = await request(app.getHttpServer())
      .get(`/course-sections?academicTermId=${termId}&page=1&pageSize=20`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    const found = response.body.items.find(
      (item: any) => item.id === createdSectionId,
    );
    expect(found).toBeDefined();
    expect(found.subject.id).toBe(subjectId);
    expect(found.academicTerm.id).toBe(termId);
  });

  it('updates a course section', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/course-sections/${createdSectionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Section Name' });

    expect(response.status).toBe(200);
    expect(response.body.name).toBe('Updated Section Name');
  });

  it('deletes a course section with no active enrollments', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/course-sections/${createdSectionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — `/course-sections` routes don't exist yet.

- [ ] **Step 6: Implement `CourseSectionsService`**

`apps/api/src/master-data/course-sections/course-sections.service.ts`:
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CourseSectionEntity } from './course-section.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { AcademicTermEntity } from '../academic-terms/academic-term.entity';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import { SearchCourseSectionsDto } from './dto/search-course-sections.dto';
import {
  CourseSectionListItemDto,
  PaginatedCourseSectionsDto,
} from './dto/course-section-list-item.dto';

@Injectable()
export class CourseSectionsService {
  constructor(
    @InjectRepository(CourseSectionEntity)
    private readonly sections: Repository<CourseSectionEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjects: Repository<SubjectEntity>,
    @InjectRepository(AcademicTermEntity)
    private readonly terms: Repository<AcademicTermEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async create(dto: CreateCourseSectionDto): Promise<{ id: string }> {
    await this.assertSubjectAndTermActive(dto.subjectId, dto.academicTermId);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEntity);
      return repo.save(
        repo.create({
          subjectId: dto.subjectId,
          academicTermId: dto.academicTermId,
          sectionCode: dto.sectionCode,
          nominalClassCode: dto.nominalClassCode ?? null,
          name: dto.name ?? null,
        }),
      );
    });
    return { id: saved.id };
  }

  async search(query: SearchCourseSectionsDto): Promise<PaginatedCourseSectionsDto> {
    const qb = this.sections.createQueryBuilder('cs').where('cs.deleted_at IS NULL');

    if (query.search) {
      qb.andWhere('(cs.section_code ILIKE :term OR cs.name ILIKE :term)', {
        term: `%${query.search}%`,
      });
    }
    if (query.subjectId) {
      qb.andWhere('cs.subject_id = :subjectId', { subjectId: query.subjectId });
    }
    if (query.academicTermId) {
      qb.andWhere('cs.academic_term_id = :academicTermId', {
        academicTermId: query.academicTermId,
      });
    }

    qb.orderBy('cs.created_at', 'DESC')
      .skip((query.page - 1) * query.pageSize)
      .take(query.pageSize);

    const [rows, total] = await qb.getManyAndCount();
    if (rows.length === 0) {
      return { items: [], total };
    }

    // Resolve the referenced subject/term display fields with two batched
    // lookups rather than a raw SQL join — same map-stitching idiom
    // AccountsService already uses for resolving role codes, just applied
    // to two lookups instead of one.
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const termIds = [...new Set(rows.map((r) => r.academicTermId))];
    const [subjects, terms] = await Promise.all([
      this.subjects.find({ where: { id: In(subjectIds) } }),
      this.terms.find({ where: { id: In(termIds) } }),
    ]);
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const termById = new Map(terms.map((t) => [t.id, t]));

    return { items: rows.map((row) => this.toView(row, subjectById, termById)), total };
  }

  async update(
    id: string,
    dto: UpdateCourseSectionDto,
  ): Promise<CourseSectionListItemDto> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEntity);
      const section = await this.findActiveOrThrow(repo, id);
      await repo.update(id, {
        nominalClassCode: dto.nominalClassCode ?? section.nominalClassCode,
        name: dto.name ?? section.name,
      });
    });

    const updated = await this.findActiveOrThrow(this.sections, id);
    const [subject, term] = await Promise.all([
      this.subjects.findOne({ where: { id: updated.subjectId } }),
      this.terms.findOne({ where: { id: updated.academicTermId } }),
    ]);
    return this.toView(
      updated,
      new Map(subject ? [[subject.id, subject]] : []),
      new Map(term ? [[term.id, term]] : []),
    );
  }

  async remove(id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEntity);
      await this.findActiveOrThrow(repo, id);
      await repo.update(id, { deletedAt: new Date() });
    });
  }

  /** Reused by the enrollments sub-resource (Task 6) to confirm a course
   * section exists and isn't soft-deleted before adding an enrollment. */
  async assertActive(id: string): Promise<void> {
    await this.findActiveOrThrow(this.sections, id);
  }

  private async assertSubjectAndTermActive(
    subjectId: string,
    academicTermId: string,
  ): Promise<void> {
    const [subject, term] = await Promise.all([
      this.subjects.findOne({ where: { id: subjectId, deletedAt: IsNull() } }),
      this.terms.findOne({ where: { id: academicTermId, deletedAt: IsNull() } }),
    ]);
    if (!subject) {
      throw new BadRequestException('subjectId does not reference an active subject');
    }
    if (!term) {
      throw new BadRequestException(
        'academicTermId does not reference an active academic term',
      );
    }
  }

  private async findActiveOrThrow(
    repo: Repository<CourseSectionEntity>,
    id: string,
  ): Promise<CourseSectionEntity> {
    const section = await repo.findOne({ where: { id, deletedAt: IsNull() } });
    if (!section) {
      throw new NotFoundException('Course section not found');
    }
    return section;
  }

  private toView(
    section: CourseSectionEntity,
    subjectById: Map<string, SubjectEntity>,
    termById: Map<string, AcademicTermEntity>,
  ): CourseSectionListItemDto {
    const subject = subjectById.get(section.subjectId);
    const term = termById.get(section.academicTermId);
    return {
      id: section.id,
      sectionCode: section.sectionCode,
      nominalClassCode: section.nominalClassCode,
      name: section.name,
      subject: subject
        ? { id: subject.id, code: subject.code, name: subject.name }
        : { id: section.subjectId, code: '', name: '' },
      academicTerm: term
        ? { id: term.id, code: term.code, name: term.name }
        : { id: section.academicTermId, code: '', name: '' },
    };
  }
}
```

- [ ] **Step 7: Implement `CourseSectionsController`, `CourseSectionsModule`, and wire into `MasterDataModule`**

`apps/api/src/master-data/course-sections/course-sections.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';
import { CourseSectionsService } from './course-sections.service';
import { CreateCourseSectionDto } from './dto/create-course-section.dto';
import { UpdateCourseSectionDto } from './dto/update-course-section.dto';
import { SearchCourseSectionsDto } from './dto/search-course-sections.dto';
import {
  CourseSectionListItemDto,
  PaginatedCourseSectionsDto,
} from './dto/course-section-list-item.dto';

@ApiTags('course-sections')
@Controller('course-sections')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CourseSectionsController {
  constructor(private readonly sections: CourseSectionsService) {}

  @Post()
  create(@Body() dto: CreateCourseSectionDto): Promise<{ id: string }> {
    return this.sections.create(dto);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedCourseSectionsDto })
  search(@Query() query: SearchCourseSectionsDto): Promise<PaginatedCourseSectionsDto> {
    return this.sections.search(query);
  }

  @Patch(':id')
  @ApiOkResponse({ type: CourseSectionListItemDto })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseSectionDto,
  ): Promise<CourseSectionListItemDto> {
    return this.sections.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.sections.remove(id);
  }
}
```

`apps/api/src/master-data/course-sections/course-sections.module.ts` — `exports: [CourseSectionsService]` because Task 6's enrollment endpoints live in this same module (added directly to this controller/service in Task 6, not a separate module), so no export is actually needed yet, but the entity registration must include `SubjectEntity`/`AcademicTermEntity` for the constructor's injected repositories to resolve:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSectionEntity } from './course-section.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { AcademicTermEntity } from '../academic-terms/academic-term.entity';
import { CourseSectionsService } from './course-sections.service';
import { CourseSectionsController } from './course-sections.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CourseSectionEntity, SubjectEntity, AcademicTermEntity]),
  ],
  controllers: [CourseSectionsController],
  providers: [CourseSectionsService],
})
export class CourseSectionsModule {}
```

Modify `apps/api/src/master-data/master-data.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';
import { LecturersModule } from './lecturers/lecturers.module';
import { StudentsModule } from './students/students.module';
import { CourseSectionsModule } from './course-sections/course-sections.module';

@Module({
  imports: [
    SubjectsModule,
    AcademicTermsModule,
    LecturersModule,
    StudentsModule,
    CourseSectionsModule,
  ],
})
export class MasterDataModule {}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all 5 `CourseSections (e2e)` tests green, plus every pre-existing suite still green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/master-data apps/api/src/database/data-source.ts apps/api/test/course-sections.e2e-spec.ts
git commit -m "feat(api): add Course Sections module CRUD (WEB-MD-19..22)"
```

---

### Task 6: Course Section Enrollments — sub-resource (`WEB-MD-23..24`)

Confirmed against the raw DDL (`course_section_enrollments`, lines 258-274 of `postgresql-schema-v2.sql`): columns are `id, course_section_id, student_id, enrolled_at, created_at, updated_at, deleted_at`, with a partial unique index `uq_course_section_enrollments_active` on `(course_section_id, student_id) WHERE deleted_at IS NULL` — enrolling the same student twice raises `23505`, already mapped to `409` by the existing `PostgresExceptionFilter`, so no new DB-error-handling code is needed here either. This entity lives inside the `course-sections/` module as a sub-resource (`POST/GET /course-sections/:sectionId/enrollments`, `DELETE /course-sections/:sectionId/enrollments/:studentId`), not as a sixth top-level `MasterDataModule` entry, per the design spec. `CourseSectionEnrollmentsService.enroll()`/`.list()` call `CourseSectionsService.assertActive()` (added in Task 5) to 404 on a missing/soft-deleted section before touching the enrollment table.

**Files:**
- Create: `apps/api/src/master-data/course-sections/enrollments/course-section-enrollment.entity.ts`
- Create: `apps/api/src/master-data/course-sections/enrollments/dto/create-enrollment.dto.ts`
- Create: `apps/api/src/master-data/course-sections/enrollments/dto/search-enrollments.dto.ts`
- Create: `apps/api/src/master-data/course-sections/enrollments/dto/enrollment-list-item.dto.ts`
- Create: `apps/api/src/master-data/course-sections/enrollments/course-section-enrollments.service.ts`
- Create: `apps/api/src/master-data/course-sections/enrollments/course-section-enrollments.controller.ts`
- Modify: `apps/api/src/master-data/course-sections/course-sections.module.ts` (register the enrollment entity + `StudentEntity`, add the new service/controller)
- Modify: `apps/api/src/database/data-source.ts` (register `CourseSectionEnrollmentEntity`)
- Test: `apps/api/test/course-section-enrollments.e2e-spec.ts`

**Interfaces:**
- Consumes: `CourseSectionsService.assertActive(id): Promise<void>` (Task 5); `StudentEntity` (Task 4).
- Produces: `CourseSectionEnrollmentEntity`; `EnrollmentListItemDto { id, enrolledAt: Date, student: { id, studentCode, fullName } }`; `PaginatedEnrollmentsDto`. Nothing downstream in this plan consumes these — the Excel import in Task 7 only touches `StudentsService`, not enrollments.

- [ ] **Step 1: Write the `CourseSectionEnrollmentEntity`**

`apps/api/src/master-data/course-sections/enrollments/course-section-enrollment.entity.ts`:
```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'course_section_enrollments' })
export class CourseSectionEnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'course_section_id', type: 'uuid' })
  courseSectionId!: string;

  @Column({ name: 'student_id', type: 'uuid' })
  studentId!: string;

  @Column({ name: 'enrolled_at', type: 'timestamptz' })
  enrolledAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
```

- [ ] **Step 2: Register the entity on the DataSource**

Modify `apps/api/src/database/data-source.ts`:
```ts
import { CourseSectionEnrollmentEntity } from '../master-data/course-sections/enrollments/course-section-enrollment.entity';
// ...
  entities: [
    RoleEntity,
    UserEntity,
    UserRoleEntity,
    SubjectEntity,
    AcademicTermEntity,
    LecturerEntity,
    StudentEntity,
    CourseSectionEntity,
    CourseSectionEnrollmentEntity,
  ],
```

- [ ] **Step 3: Write the DTOs**

`apps/api/src/master-data/course-sections/enrollments/dto/create-enrollment.dto.ts`:
```ts
import { IsUUID } from 'class-validator';

export class CreateEnrollmentDto {
  @IsUUID()
  studentId!: string;
}
```

`apps/api/src/master-data/course-sections/enrollments/dto/search-enrollments.dto.ts`:
```ts
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class SearchEnrollmentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
```

`apps/api/src/master-data/course-sections/enrollments/dto/enrollment-list-item.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';

export class EnrollmentStudentRefDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  studentCode!: string;

  @ApiProperty()
  fullName!: string;
}

export class EnrollmentListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  enrolledAt!: Date;

  @ApiProperty({ type: EnrollmentStudentRefDto })
  student!: EnrollmentStudentRefDto;
}

export class PaginatedEnrollmentsDto {
  @ApiProperty({ type: [EnrollmentListItemDto] })
  items!: EnrollmentListItemDto[];

  @ApiProperty()
  total!: number;
}
```

- [ ] **Step 4: Write the failing e2e test**

`apps/api/test/course-section-enrollments.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

describe('CourseSectionEnrollments (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let dataSource: DataSource;
  let sectionId: string;
  let studentId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    dataSource = app.get(DataSource);
    const adminUsername = `enroll_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Enrollments Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;

    const subjectResponse = await request(app.getHttpServer())
      .post('/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `ENRSUBJ_${Date.now()}`, name: 'Enrollments Test Subject' });

    const termResponse = await request(app.getHttpServer())
      .post('/academic-terms')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: `ENRTERM_${Date.now()}`,
        name: 'Enrollments Test Term',
        startsOn: '2026-09-01',
        endsOn: '2027-01-15',
      });

    const sectionResponse = await request(app.getHttpServer())
      .post('/course-sections')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        subjectId: subjectResponse.body.id,
        academicTermId: termResponse.body.id,
        sectionCode: `ENRSEC_${Date.now()}`,
      });
    sectionId = sectionResponse.body.id;

    const studentResponse = await request(app.getHttpServer())
      .post('/students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentCode: `ENRSTU_${Date.now()}`, fullName: 'Enrollment Test Student' });
    studentId = studentResponse.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects enrolling into a non-existent course section', async () => {
    const response = await request(app.getHttpServer())
      .post('/course-sections/00000000-0000-0000-0000-000000000000/enrollments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId });

    expect(response.status).toBe(404);
  });

  it('enrolls a student into a course section', async () => {
    const response = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId });

    expect(response.status).toBe(201);
    expect(response.body.id).toBeDefined();
  });

  it('rejects enrolling the same student twice', async () => {
    const response = await request(app.getHttpServer())
      .post(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ studentId });

    expect(response.status).toBe(409);
  });

  it('lists enrollments with joined student display fields', async () => {
    const response = await request(app.getHttpServer())
      .get(`/course-sections/${sectionId}/enrollments`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.items[0].student.id).toBe(studentId);
  });

  it('unenrolls a student', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/course-sections/${sectionId}/enrollments/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(204);
  });

  it('404s unenrolling a student who is not (or no longer) enrolled', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/course-sections/${sectionId}/enrollments/${studentId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `pnpm --filter api test:e2e`
Expected: FAIL — the `/course-sections/:sectionId/enrollments` routes don't exist yet.

- [ ] **Step 6: Implement `CourseSectionEnrollmentsService`**

`apps/api/src/master-data/course-sections/enrollments/course-section-enrollments.service.ts`:
```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { CourseSectionEnrollmentEntity } from './course-section-enrollment.entity';
import { StudentEntity } from '../../students/student.entity';
import { CourseSectionsService } from '../course-sections.service';
import { SearchEnrollmentsDto } from './dto/search-enrollments.dto';
import {
  EnrollmentListItemDto,
  PaginatedEnrollmentsDto,
} from './dto/enrollment-list-item.dto';

@Injectable()
export class CourseSectionEnrollmentsService {
  constructor(
    @InjectRepository(CourseSectionEnrollmentEntity)
    private readonly enrollments: Repository<CourseSectionEnrollmentEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    private readonly courseSections: CourseSectionsService,
    private readonly dataSource: DataSource,
  ) {}

  async enroll(courseSectionId: string, studentId: string): Promise<{ id: string }> {
    await this.courseSections.assertActive(courseSectionId);

    const student = await this.students.findOne({
      where: { id: studentId, deletedAt: IsNull() },
    });
    if (!student) {
      throw new BadRequestException('studentId does not reference an active student');
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEnrollmentEntity);
      return repo.save(
        repo.create({ courseSectionId, studentId, enrolledAt: new Date() }),
      );
    });
    return { id: saved.id };
  }

  async list(
    courseSectionId: string,
    query: SearchEnrollmentsDto,
  ): Promise<PaginatedEnrollmentsDto> {
    await this.courseSections.assertActive(courseSectionId);

    const [rows, total] = await this.enrollments.findAndCount({
      where: { courseSectionId, deletedAt: IsNull() },
      order: { enrolledAt: 'DESC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
    if (rows.length === 0) {
      return { items: [], total };
    }

    // Same batched-lookup-plus-Map idiom as CourseSectionsService.search():
    // resolve the referenced students' display fields with one follow-up
    // query instead of a raw SQL join.
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const studentRows = await this.students.find({ where: { id: In(studentIds) } });
    const studentById = new Map(studentRows.map((s) => [s.id, s]));

    const items: EnrollmentListItemDto[] = rows.map((row) => {
      const student = studentById.get(row.studentId);
      return {
        id: row.id,
        enrolledAt: row.enrolledAt,
        student: student
          ? { id: student.id, studentCode: student.studentCode, fullName: student.fullName }
          : { id: row.studentId, studentCode: '', fullName: '' },
      };
    });
    return { items, total };
  }

  async unenroll(courseSectionId: string, studentId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(CourseSectionEnrollmentEntity);
      const enrollment = await repo.findOne({
        where: { courseSectionId, studentId, deletedAt: IsNull() },
      });
      if (!enrollment) {
        throw new NotFoundException('Active enrollment not found');
      }
      await repo.update(enrollment.id, { deletedAt: new Date() });
    });
  }
}
```

- [ ] **Step 7: Implement `CourseSectionEnrollmentsController` and wire it into `CourseSectionsModule`**

`apps/api/src/master-data/course-sections/enrollments/course-section-enrollments.controller.ts`:
```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { CourseSectionEnrollmentsService } from './course-section-enrollments.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { SearchEnrollmentsDto } from './dto/search-enrollments.dto';
import { PaginatedEnrollmentsDto } from './dto/enrollment-list-item.dto';

@ApiTags('course-sections')
@Controller('course-sections/:sectionId/enrollments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CourseSectionEnrollmentsController {
  constructor(private readonly enrollments: CourseSectionEnrollmentsService) {}

  @Post()
  enroll(
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateEnrollmentDto,
  ): Promise<{ id: string }> {
    return this.enrollments.enroll(sectionId, dto.studentId);
  }

  @Get()
  @ApiOkResponse({ type: PaginatedEnrollmentsDto })
  list(
    @Param('sectionId') sectionId: string,
    @Query() query: SearchEnrollmentsDto,
  ): Promise<PaginatedEnrollmentsDto> {
    return this.enrollments.list(sectionId, query);
  }

  @Delete(':studentId')
  @HttpCode(204)
  async unenroll(
    @Param('sectionId') sectionId: string,
    @Param('studentId') studentId: string,
  ): Promise<void> {
    await this.enrollments.unenroll(sectionId, studentId);
  }
}
```

Modify `apps/api/src/master-data/course-sections/course-sections.module.ts` — add the enrollment entity, `StudentEntity`, and the new service/controller alongside the existing ones:
```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourseSectionEntity } from './course-section.entity';
import { SubjectEntity } from '../subjects/subject.entity';
import { AcademicTermEntity } from '../academic-terms/academic-term.entity';
import { StudentEntity } from '../students/student.entity';
import { CourseSectionEnrollmentEntity } from './enrollments/course-section-enrollment.entity';
import { CourseSectionsService } from './course-sections.service';
import { CourseSectionsController } from './course-sections.controller';
import { CourseSectionEnrollmentsService } from './enrollments/course-section-enrollments.service';
import { CourseSectionEnrollmentsController } from './enrollments/course-section-enrollments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CourseSectionEntity,
      SubjectEntity,
      AcademicTermEntity,
      StudentEntity,
      CourseSectionEnrollmentEntity,
    ]),
  ],
  controllers: [CourseSectionsController, CourseSectionEnrollmentsController],
  providers: [CourseSectionsService, CourseSectionEnrollmentsService],
})
export class CourseSectionsModule {}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all 6 `CourseSectionEnrollments (e2e)` tests green, plus every pre-existing suite still green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/master-data apps/api/src/database/data-source.ts apps/api/test/course-section-enrollments.e2e-spec.ts
git commit -m "feat(api): add Course Section Enrollments sub-resource (WEB-MD-23..24)"
```

---

### Task 7: BullMQ infra + Student Excel import (`WEB-MD-05`)

First real consumer of Redis in this app. The uploaded `.xlsx` is parsed with `exceljs` **in the request handler**, never written to disk or MinIO — only the parsed row data (plain JSON, not the file buffer) becomes the BullMQ job payload, so the only place the raw file ever exists is the multer in-memory buffer during that one request. A background worker (`@Processor`, same process as the API — no separate worker deployment for this thesis-scope app) validates each row against `CreateStudentDto`'s exact `class-validator` constraints from Task 4 and upserts via `StudentsService.upsertByCode()` (added in Task 4). One bad row fails that row only — the job always completes, reporting `created`/`updated`/`failed` counts plus a per-row error list. `POST /students/import` returns `202 { jobId }` immediately; `GET /students/import/:jobId` is polled for status.

**Files:**
- Modify: `apps/api/package.json` (dependencies: `@nestjs/bullmq`, `bullmq`, `ioredis`, `exceljs`; devDependencies: `@types/multer`)
- Modify: `apps/api/.env.example` (add `REDIS_HOST`, `REDIS_PORT`)
- Modify: `apps/api/src/app.module.ts` (register `BullModule.forRootAsync`)
- Modify: `apps/api/test/jest-e2e.json` (add `"forceExit": true`)
- Create: `apps/api/src/master-data/students/import/students-import.constants.ts`
- Create: `apps/api/src/master-data/students/import/parse-students-workbook.ts`
- Create: `apps/api/src/master-data/students/import/dto/import-job-status.dto.ts`
- Create: `apps/api/src/master-data/students/import/students-import.processor.ts`
- Create: `apps/api/src/master-data/students/import/students-import.controller.ts`
- Create: `apps/api/src/master-data/students/import/students-import.module.ts`
- Modify: `apps/api/src/master-data/master-data.module.ts` (add `StudentsImportModule`)
- Test: `apps/api/test/students-import.e2e-spec.ts`

**Interfaces:**
- Consumes: `StudentsService.upsertByCode(dto: CreateStudentDto): Promise<{ id: string; created: boolean }>` (Task 4); `CreateStudentDto` (Task 4, validated as-is — no new fields, no relaxed constraints).
- Produces: `StudentsImportResult { totalRows, created, updated, failed, errors: StudentsImportRowError[] }`; `ImportJobStatusDto { jobId, state, result: ImportResultDto | null, failedReason: string | null }`. Nothing later in this plan depends on these types — this is the last backend task.

- [ ] **Step 1: Add dependencies**

Modify `apps/api/package.json` — add to `dependencies`:
```json
"@nestjs/bullmq": "^10.2.3",
"bullmq": "^5.34.4",
"exceljs": "^4.4.0",
"ioredis": "^5.4.1",
```
and to `devDependencies`:
```json
"@types/multer": "^1.4.12",
```

Run: `pnpm install`

`exceljs@4.4.0`'s own `.d.ts` declares `load(buffer: Buffer)` against a pre-5.7 TypeScript lib, where `Uint8Array` (and therefore `Buffer`) wasn't generic. This workspace's TypeScript/`@types/node` combo makes `Buffer` generic (`Buffer<ArrayBufferLike>`), so `workbook.xlsx.load(buffer)` in Step 4 fails to compile with `Argument of type 'Buffer<ArrayBufferLike>' is not assignable to parameter of type 'Buffer'` — a structural-typing mismatch, not a real bug (deduping `@types/node` across the tree does **not** fix this; it's a TypeScript-lib-version skew, confirmed by checking that nothing in the tree still resolves to an older `@types/node`). Step 4's code below already carries the fix: a narrow `buffer as any` cast at the one call site, commented in place.

- [ ] **Step 2: Add Redis config to the env example**

Modify `apps/api/.env.example` — append:
```
REDIS_HOST=localhost
REDIS_PORT=6390
```

If you already have an `apps/api/.env` from an earlier task, `.env` is gitignored so `cp` won't overwrite it — add these same two lines to it by hand. `6390` is this project's host-mapped Redis port (see `docker-compose.yml` / the README ports table), not Redis's default `6379`.

- [ ] **Step 3: Register BullMQ globally**

Modify `apps/api/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { AccountsModule } from './accounts/accounts.module';
import { MasterDataModule } from './master-data/master-data.module';
import { dataSourceOptions } from './database/data-source';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(dataSourceOptions),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6390),
          // BullMQ's Worker issues blocking Redis commands (e.g. BZPOPMIN)
          // on this connection; ioredis's default finite retry limit fights
          // that and can hang the worker indefinitely. BullMQ's own docs
          // require this to be null.
          maxRetriesPerRequest: null,
        },
      }),
    }),
    HealthModule,
    AuthModule,
    AccountsModule,
    MasterDataModule,
  ],
})
export class AppModule {}
```

(`MasterDataModule` was already added here in Task 1 — this step only adds the `BullModule.forRootAsync` entry; the rest of the file is shown for context.) **`maxRetriesPerRequest: null` is not optional** — omitting it doesn't error visibly, it just hangs the very first import job's worker indefinitely on its blocking read, which reads as a stuck test suite with no error output at all. If Step 10's test run appears to hang rather than fail, check this setting first before anything else.

- [ ] **Step 4: Write the workbook parser**

`apps/api/src/master-data/students/import/parse-students-workbook.ts`:
```ts
import { BadRequestException } from '@nestjs/common';
import { Workbook } from 'exceljs';

export interface RawStudentImportRow {
  rowNumber: number;
  studentCode?: string;
  fullName?: string;
  dateOfBirth?: string;
  classCode?: string;
  cohortYear?: number;
}

const REQUIRED_HEADERS = [
  'student_code',
  'full_name',
  'date_of_birth',
  'class_code',
  'cohort_year',
];

/** Parses the uploaded workbook into plain row objects. Type coercion only
 * (cell value -> string | number | undefined) — semantic validity (regex,
 * ranges, required-ness) is left entirely to `CreateStudentDto`'s
 * class-validator constraints, checked later in the worker. */
export async function parseStudentsWorkbook(buffer: Buffer): Promise<RawStudentImportRow[]> {
  const workbook = new Workbook();
  // exceljs@4.4.0's own .d.ts declares `load(buffer: Buffer)` against a
  // pre-5.7 TypeScript lib where Uint8Array (and therefore Buffer) wasn't
  // generic. This workspace's TypeScript/@types-node combo makes Buffer
  // generic (`Buffer<ArrayBufferLike>`), so the same runtime Buffer no
  // longer structurally matches exceljs's older declared parameter type.
  // Both sides are plain Node Buffers at runtime; this cast only silences
  // the structural mismatch, not a real type error.
  await workbook.xlsx.load(buffer as any);
  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new BadRequestException('Workbook has no worksheets');
  }

  const headerValues = sheet.getRow(1).values as unknown[];
  const headers = headerValues.slice(1).map((value) => String(value ?? '').trim().toLowerCase());

  const missing = REQUIRED_HEADERS.filter((header) => !headers.includes(header));
  if (missing.length > 0) {
    throw new BadRequestException(
      `Workbook is missing required column(s): ${missing.join(', ')}`,
    );
  }

  const columnIndexByHeader = new Map(headers.map((header, index) => [header, index + 1]));
  const rows: RawStudentImportRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    const cell = (header: string) => row.getCell(columnIndexByHeader.get(header)!).value;
    const studentCode = nonEmptyString(cell('student_code'));
    const fullName = nonEmptyString(cell('full_name'));
    if (!studentCode && !fullName) {
      return; // skip fully blank rows
    }

    rows.push({
      rowNumber,
      studentCode,
      fullName,
      dateOfBirth: toDateString(cell('date_of_birth')),
      classCode: nonEmptyString(cell('class_code')),
      cohortYear: toOptionalNumber(cell('cohort_year')),
    });
  });

  return rows;
}

function nonEmptyString(value: unknown): string | undefined {
  if (value == null) {
    return undefined;
  }
  const str = String(value).trim();
  return str.length > 0 ? str : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  const num = typeof value === 'number' ? value : Number(value);
  return Math.trunc(num);
}

function toDateString(value: unknown): string | undefined {
  if (value == null || value === '') {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value).trim();
}
```

- [ ] **Step 4b: Write the queue name constant**

`apps/api/src/master-data/students/import/students-import.constants.ts` — kept in its own file, with no other imports, so the controller and processor can both depend on this constant without either of them creating a circular import with `students-import.module.ts` (which imports both of them). Declaring this constant directly in `students-import.module.ts` instead (as the controller/processor importing it back from there) creates exactly that cycle — the constant is still `undefined` at the point `@InjectQueue(...)` evaluates it, and Nest silently resolves the injection to its `'default'` queue instead of this one, throwing a confusing `Nest can't resolve dependencies... "BullQueue_default"` error at test time instead of at compile time:
```ts
export const STUDENTS_IMPORT_QUEUE = 'students-import';
```

- [ ] **Step 5: Write the job-status DTO**

`apps/api/src/master-data/students/import/dto/import-job-status.dto.ts`:
```ts
import { ApiProperty } from '@nestjs/swagger';

export class ImportRowErrorDto {
  @ApiProperty()
  row!: number;

  @ApiProperty({ nullable: true, type: String })
  studentCode!: string | null;

  @ApiProperty()
  message!: string;
}

export class ImportResultDto {
  @ApiProperty()
  totalRows!: number;

  @ApiProperty()
  created!: number;

  @ApiProperty()
  updated!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty({ type: [ImportRowErrorDto] })
  errors!: ImportRowErrorDto[];
}

export class ImportJobStatusDto {
  @ApiProperty()
  jobId!: string;

  @ApiProperty()
  state!: string;

  @ApiProperty({ nullable: true, type: ImportResultDto })
  result!: ImportResultDto | null;

  @ApiProperty({ nullable: true, type: String })
  failedReason!: string | null;
}
```

- [ ] **Step 6: Write the failing e2e test**

`apps/api/test/students-import.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';
import { PostgresExceptionFilter } from '../src/common/postgres-exception.filter';

jest.setTimeout(20000);

describe('StudentsImport (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    // e2e tests build the app independently of main.ts's bootstrap(), so the
    // global exception filter isn't picked up automatically — same fix
    // accounts.e2e-spec.ts already applies.
    app.useGlobalFilters(new PostgresExceptionFilter());
    await app.init();

    const dataSource = app.get(DataSource);
    const adminUsername = `import_admin_${Date.now()}`;

    await request(app.getHttpServer()).post('/auth/register').send({
      username: adminUsername,
      password: 'correct-horse-battery',
      displayName: 'Import Test Admin',
    });

    const [{ id: userId }] = await dataSource.query(
      `SELECT id FROM lab_management.users WHERE username = $1`,
      [adminUsername],
    );
    const [{ id: roleId }] = await dataSource.query(
      `SELECT id FROM lab_management.roles WHERE code = 'admin'`,
    );
    await dataSource.query(
      `INSERT INTO lab_management.user_roles (user_id, role_id) VALUES ($1, $2)`,
      [userId, roleId],
    );

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: adminUsername, password: 'correct-horse-battery' });
    adminToken = loginResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function buildWorkbookBuffer(
    rows: Array<[string, string, string, string, number | string]>,
  ): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('students');
    sheet.addRow(['student_code', 'full_name', 'date_of_birth', 'class_code', 'cohort_year']);
    rows.forEach((row) => sheet.addRow(row));
    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
  }

  async function pollUntilFinished(jobId: string): Promise<any> {
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline) {
      const response = await request(app.getHttpServer())
        .get(`/students/import/${jobId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      if (response.body.state === 'completed' || response.body.state === 'failed') {
        return response.body;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error(`Import job ${jobId} did not finish in time`);
  }

  it('rejects an import request without a file', async () => {
    const response = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(400);
  });

  it('imports valid rows, creating new students', async () => {
    const codeA = `IMPA_${Date.now()}`;
    const codeB = `IMPB_${Date.now()}`;
    const buffer = await buildWorkbookBuffer([
      [codeA, 'Import Student A', '', 'D20CQCE01', 2020],
      [codeB, 'Import Student B', '', '', ''],
    ]);

    const uploadResponse = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');

    expect(uploadResponse.status).toBe(202);
    const { jobId } = uploadResponse.body;
    expect(jobId).toBeDefined();

    const finished = await pollUntilFinished(jobId);
    expect(finished.state).toBe('completed');
    expect(finished.result.totalRows).toBe(2);
    expect(finished.result.created).toBe(2);
    expect(finished.result.failed).toBe(0);

    const searchResponse = await request(app.getHttpServer())
      .get(`/students?search=${codeA}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(
      searchResponse.body.items.some((item: any) => item.studentCode === codeA),
    ).toBe(true);
  });

  it('re-imports the same student code as an update, not a duplicate', async () => {
    const code = `IMPC_${Date.now()}`;
    const firstBuffer = await buildWorkbookBuffer([[code, 'Original Name', '', '', '']]);
    const firstUpload = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', firstBuffer, 'students.xlsx');
    await pollUntilFinished(firstUpload.body.jobId);

    const secondBuffer = await buildWorkbookBuffer([[code, 'Updated Name', '', '', '']]);
    const secondUpload = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', secondBuffer, 'students.xlsx');
    const finished = await pollUntilFinished(secondUpload.body.jobId);

    expect(finished.result.created).toBe(0);
    expect(finished.result.updated).toBe(1);

    const searchResponse = await request(app.getHttpServer())
      .get(`/students?search=${code}`)
      .set('Authorization', `Bearer ${adminToken}`);
    const match = searchResponse.body.items.find((item: any) => item.studentCode === code);
    expect(match.fullName).toBe('Updated Name');
  });

  it('reports per-row errors for invalid rows without failing the whole job', async () => {
    const validCode = `IMPD_${Date.now()}`;
    const buffer = await buildWorkbookBuffer([
      [validCode, 'Valid Row', '', '', ''],
      ['x', '', '', '', ''], // studentCode too short, fullName missing
    ]);

    const uploadResponse = await request(app.getHttpServer())
      .post('/students/import')
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buffer, 'students.xlsx');
    const finished = await pollUntilFinished(uploadResponse.body.jobId);

    expect(finished.result.totalRows).toBe(2);
    expect(finished.result.created).toBe(1);
    expect(finished.result.failed).toBe(1);
    expect(finished.result.errors[0].row).toBe(3);
  });

  it('404s on an unknown job id', async () => {
    const response = await request(app.getHttpServer())
      .get('/students/import/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `docker compose up -d redis` (if not already up), then `pnpm --filter api test:e2e`.
Expected: FAIL — `/students/import` routes don't exist yet.

- [ ] **Step 8: Implement the processor**

`apps/api/src/master-data/students/import/students-import.processor.ts`:
```ts
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
```

- [ ] **Step 9: Implement the controller and module, and wire into `MasterDataModule`**

`apps/api/src/master-data/students/import/students-import.controller.ts`:
```ts
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiOkResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { RolesGuard } from '../../../auth/roles.guard';
import { Roles } from '../../../auth/roles.decorator';
import { parseStudentsWorkbook } from './parse-students-workbook';
import { STUDENTS_IMPORT_QUEUE } from './students-import.constants';
import { StudentsImportJobData, StudentsImportResult } from './students-import.processor';
import { ImportJobStatusDto } from './dto/import-job-status.dto';

// No `dest`/`storage` option given to FileInterceptor -> multer's default
// is memory storage: the file lives only in `file.buffer` for this one
// request, never written to disk.
const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

@Controller('students/import')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class StudentsImportController {
  constructor(
    @InjectQueue(STUDENTS_IMPORT_QUEUE)
    private readonly importQueue: Queue<StudentsImportJobData, StudentsImportResult>,
  ) {}

  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMPORT_FILE_BYTES } }))
  async import(@UploadedFile() file?: Express.Multer.File): Promise<{ jobId: string }> {
    if (!file) {
      throw new BadRequestException('file is required');
    }
    const rows = await parseStudentsWorkbook(file.buffer);
    if (rows.length === 0) {
      throw new BadRequestException('Workbook has no data rows');
    }

    // BullMQ always assigns `job.id` synchronously by the time add() resolves.
    const job = await this.importQueue.add('import', { rows });
    return { jobId: job.id as string };
  }

  @Get(':jobId')
  @ApiOkResponse({ type: ImportJobStatusDto })
  async status(@Param('jobId') jobId: string): Promise<ImportJobStatusDto> {
    let job = await this.importQueue.getJob(jobId);
    if (!job) {
      throw new NotFoundException('Import job not found');
    }

    const state = await job.getState();
    if (state === 'completed' || state === 'failed') {
      // getState() and the already-fetched job's local `returnvalue`/
      // `failedReason` fields come from two separate reads — a job can
      // flip from active to completed in between them, leaving `job`
      // stale. Re-fetch once we know the terminal state we're reporting.
      // (BullMQ's Job class has no public reload(); a second getJob() is
      // the documented way to get a fresh snapshot.)
      job = (await this.importQueue.getJob(jobId)) ?? job;
    }
    return {
      jobId: job.id as string,
      state,
      result: state === 'completed' ? job.returnvalue ?? null : null,
      failedReason: state === 'failed' ? job.failedReason ?? null : null,
    };
  }
}
```

`apps/api/src/master-data/students/import/students-import.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { StudentsModule } from '../students.module';
import { StudentsImportController } from './students-import.controller';
import { StudentsImportProcessor } from './students-import.processor';
import { STUDENTS_IMPORT_QUEUE } from './students-import.constants';

@Module({
  imports: [StudentsModule, BullModule.registerQueue({ name: STUDENTS_IMPORT_QUEUE })],
  controllers: [StudentsImportController],
  providers: [StudentsImportProcessor],
})
export class StudentsImportModule {}
```

Modify `apps/api/src/master-data/master-data.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SubjectsModule } from './subjects/subjects.module';
import { AcademicTermsModule } from './academic-terms/academic-terms.module';
import { LecturersModule } from './lecturers/lecturers.module';
import { StudentsModule } from './students/students.module';
import { CourseSectionsModule } from './course-sections/course-sections.module';
import { StudentsImportModule } from './students/import/students-import.module';

@Module({
  imports: [
    SubjectsModule,
    AcademicTermsModule,
    LecturersModule,
    StudentsModule,
    CourseSectionsModule,
    StudentsImportModule,
  ],
})
export class MasterDataModule {}
```

- [ ] **Step 9b: Add `forceExit` to the e2e Jest config**

Modify `apps/api/test/jest-e2e.json` — add `"forceExit": true`:
```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "forceExit": true
}
```
BullMQ's `Queue`/`Worker` hold an ioredis connection that occasionally takes slightly longer to fully tear down than Jest's exit-detection window, even when `app.close()` in `afterAll` is awaited correctly — this is a widely-documented BullMQ+Jest interaction, not a bug in this module's code. Without `forceExit`, that shows up as an intermittent `A worker process has failed to exit gracefully` warning that flips the whole *test suite* to "failed" in Jest's summary even though every individual assertion passed — a false negative that would otherwise make this one otherwise-correct test file look broken at random.

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm --filter api test:e2e`
Expected: PASS — all 5 `StudentsImport (e2e)` tests green, plus every pre-existing suite still green.

- [ ] **Step 11: Commit**

```bash
git add apps/api/package.json apps/api/pnpm-lock.yaml apps/api/.env.example apps/api/src/app.module.ts apps/api/src/master-data apps/api/test/students-import.e2e-spec.ts
git commit -m "feat(api): add BullMQ-backed Student Excel import (WEB-MD-05)"
```

---

### Task 8: Frontend shared CRUD scaffold + Subjects page (`WEB-MD-11..14`)

First frontend task, and the only one that builds new shared plumbing. `AccountsPage` (Foundation plan) wrote its search input, TanStack Table wiring, create/edit form swap, and mutation `onSuccess` → `invalidateQueries` logic inline, bespoke. Five more near-identical pages justify hoisting that into a hook (`useEntityCrud`) plus a presentational component (`EntityCrudScaffold`) — copied line-for-line from `AccountsPage`'s JSX, just parameterized. Each entity page supplies only its table columns and its own form component; the plumbing is shared. This task also adds the first navigation UI the app has had — until now `/accounts` was reachable only because login redirects straight to it.

**Files:**
- Modify: `apps/web/src/app/(dashboard)/layout.tsx` (add a nav bar linking every Master Data page)
- Create: `apps/web/src/lib/use-entity-crud.ts`
- Create: `apps/web/src/components/master-data/entity-crud-scaffold.tsx`
- Create: `apps/web/src/components/master-data/subject-form.tsx`
- Create: `apps/web/src/components/master-data/edit-subject-form.tsx`
- Create: `apps/web/src/app/(dashboard)/subjects/page.tsx`
- Test: `apps/web/src/components/master-data/subject-form.test.tsx`
- Test: `apps/web/src/app/(dashboard)/subjects/page.test.tsx`

**Interfaces:**
- Consumes: `SubjectListItemDto`/`PaginatedSubjectsDto` shape (Task 1) via the regenerated `packages/shared` client; `Button`/`Input`/`Label`/`Card`/`Table` primitives (Foundation plan).
- Produces: `useEntityCrud<TItem extends { id: string }, TCreate, TUpdate>(config): { search, setSearch, data, error, isLoading, editingItem, setEditingItem, createMutation, updateMutation, deleteMutation }`; `EntityCrudScaffold<TItem>(props)`. Tasks 9–12 import both from these exact paths and don't redefine them.

- [ ] **Step 1: Regenerate the OpenAPI client**

Every backend task (1–7) is already implemented at this point, so one regeneration now covers every route the remaining frontend tasks need — no further regeneration is required later in this plan.

```bash
docker compose up -d postgres redis
pnpm --filter api migration:run
pnpm --filter api dev &   # leave running; or run in a second terminal
pnpm --filter @cine/shared generate:api-client
```

Confirm `packages/shared/src/api/schema.d.ts` now has entries for `/subjects`, `/academic-terms`, `/lecturers`, `/students`, `/course-sections`, `/course-sections/{sectionId}/enrollments`, and `/students/import`.

- [ ] **Step 2: Add navigation to the dashboard layout**

Modify `apps/web/src/app/(dashboard)/layout.tsx`:
```tsx
'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LogoutButton } from '@/components/layout/logout-button';

const NAV_LINKS = [
  { href: '/accounts', label: 'Tài khoản' },
  { href: '/subjects', label: 'Môn học' },
  { href: '/academic-terms', label: 'Học kỳ' },
  { href: '/lecturers', label: 'Giảng viên' },
  { href: '/students', label: 'Sinh viên' },
  { href: '/course-sections', label: 'Lớp học phần' },
] as const;

export default function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // One QueryClient per browser session, built lazily in state — never at
  // module scope. This file is a Client Component but Next still renders it
  // on the server, where a module-scope instance would be a single cache
  // shared by every concurrent request.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col">
        <header className="flex items-center justify-between border-b px-8 py-4">
          <span className="font-semibold">Quản lý phòng máy</span>
          <LogoutButton />
        </header>
        <nav className="flex flex-wrap gap-4 border-b bg-muted/40 px-8 py-3 text-sm">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Write the shared `useEntityCrud` hook**

`apps/web/src/lib/use-entity-crud.ts`:
```ts
'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface EntityListResult<TItem> {
  items: TItem[];
  total: number;
}

export interface UseEntityCrudConfig<TItem extends { id: string }, TCreate, TUpdate> {
  queryKey: string;
  list: (search: string) => Promise<EntityListResult<TItem>>;
  create: (values: TCreate) => Promise<void>;
  update: (id: string, values: TUpdate) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

/** Shared CRUD wiring for the Master Data admin pages — the search input's
 * state, the list query, and the three mutations' `onSuccess` ->
 * `invalidateQueries` plumbing that AccountsPage (Foundation plan) wrote
 * inline once. `list`/`create`/`update`/`remove` stay entity-specific
 * closures owned by each page (they know their own OpenAPI path strings and
 * response-shape casts) — this hook only owns what's identical across all
 * of them. */
export function useEntityCrud<TItem extends { id: string }, TCreate, TUpdate>(
  config: UseEntityCrudConfig<TItem, TCreate, TUpdate>,
) {
  const [search, setSearch] = useState('');
  const [editingItem, setEditingItem] = useState<TItem | null>(null);
  const queryClient = useQueryClient();

  const { data, error, isLoading } = useQuery({
    queryKey: [config.queryKey, search],
    queryFn: () => config.list(search),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: [config.queryKey] });

  const createMutation = useMutation({
    mutationFn: config.create,
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: TUpdate }) => config.update(id, values),
    onSuccess: () => {
      invalidate();
      setEditingItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: config.remove,
    onSuccess: invalidate,
  });

  return {
    search,
    setSearch,
    data,
    error,
    isLoading,
    editingItem,
    setEditingItem,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
```

- [ ] **Step 4: Write the shared `EntityCrudScaffold` component**

`apps/web/src/components/master-data/entity-crud-scaffold.tsx`:
```tsx
'use client';

import type { ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useReactTable, getCoreRowModel, flexRender } from '@tanstack/react-table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Shared presentational half of the Master Data CRUD pages: search input,
 * the loading/error/table swap, and the create/edit form swap. Copied
 * line-for-line from AccountsPage's JSX (Foundation plan) and parameterized
 * — each entity page supplies only `columns` and its own form component. */
export function EntityCrudScaffold<TItem>({
  title,
  searchPlaceholder,
  search,
  onSearchChange,
  columns,
  items,
  isLoading,
  error,
  errorMessage,
  createTitle,
  editTitle,
  isEditing,
  createForm,
  editForm,
}: {
  title: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (value: string) => void;
  columns: ColumnDef<TItem, any>[];
  items: TItem[];
  isLoading: boolean;
  error: unknown;
  errorMessage: string;
  createTitle: string;
  editTitle: string | null;
  isEditing: boolean;
  createForm: ReactNode;
  editForm: ReactNode;
}) {
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">{title}</h1>

      <Input
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />

      {/* Without these two branches a failed request renders an empty table
          indistinguishable from "no rows yet" — same reasoning AccountsPage
          already documents. */}
      {isLoading ? (
        <Card>
          <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
        </Card>
      ) : error ? (
        <Card>
          <p role="alert" className="p-4 text-sm text-destructive">
            {errorMessage}
          </p>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? editTitle : createTitle}</CardTitle>
        </CardHeader>
        <CardContent>{isEditing ? editForm : createForm}</CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 5: Write the Subject forms**

`apps/web/src/components/master-data/subject-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Empty-string -> undefined first, then coerce to number — z.coerce.number()
// alone turns '' into 0, which would silently fill in credits on an
// intentionally-blank optional field.
const creditsSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(0).max(30).optional(),
);

const subjectFormSchema = z.object({
  code: z.string().min(2).max(32).regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  name: z.string().min(1).max(200),
  credits: creditsSchema,
  description: z.string().optional(),
});

export type SubjectFormValues = z.infer<typeof subjectFormSchema>;

export function SubjectForm({
  onSubmit,
}: {
  onSubmit: (values: SubjectFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SubjectFormValues>({ resolver: zodResolver(subjectFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-code">Mã môn học</Label>
        <Input id="subject-code" {...register('code')} />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            {errors.code.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-name">Tên môn học</Label>
        <Input id="subject-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-credits">Số tín chỉ</Label>
        <Input id="subject-credits" type="number" {...register('credits')} />
        {errors.credits && (
          <p role="alert" className="text-sm text-destructive">
            {errors.credits.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="subject-description">Mô tả</Label>
        <Input id="subject-description" {...register('description')} />
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
```

`apps/web/src/components/master-data/edit-subject-form.tsx` — no `code` field: immutable after creation, same as the API's `UpdateSubjectDto`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const creditsSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(0).max(30).optional(),
);

const editSubjectFormSchema = z.object({
  name: z.string().min(1).max(200),
  credits: creditsSchema,
  description: z.string().optional(),
});

export type EditSubjectFormValues = z.infer<typeof editSubjectFormSchema>;

export function EditSubjectForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditSubjectFormValues;
  onSubmit: (values: EditSubjectFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditSubjectFormValues>({
    resolver: zodResolver(editSubjectFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-subject-name">Tên môn học</Label>
        <Input id="edit-subject-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-subject-credits">Số tín chỉ</Label>
        <Input id="edit-subject-credits" type="number" {...register('credits')} />
        {errors.credits && (
          <p role="alert" className="text-sm text-destructive">
            {errors.credits.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-subject-description">Mô tả</Label>
        <Input id="edit-subject-description" {...register('description')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Lưu</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Write the failing form test**

`apps/web/src/components/master-data/subject-form.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SubjectForm } from './subject-form';
import { EditSubjectForm } from './edit-subject-form';

describe('SubjectForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<SubjectForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã môn học/i), { target: { value: 'CS101' } });
    fireEvent.change(screen.getByLabelText(/tên môn học/i), {
      target: { value: 'Nhập môn CNTT' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'CS101', name: 'Nhập môn CNTT' }),
      ),
    );
  });

  it('rejects a code that fails the pattern', async () => {
    const onSubmit = vi.fn();
    render(<SubjectForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã môn học/i), { target: { value: '!!' } });
    fireEvent.change(screen.getByLabelText(/tên môn học/i), { target: { value: 'Something' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('EditSubjectForm', () => {
  it('has no code field and submits edited values', async () => {
    const onSubmit = vi.fn();
    render(
      <EditSubjectForm
        defaultValues={{ name: 'Old Name', credits: 3, description: undefined }}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />,
    );

    expect(screen.queryByLabelText(/mã môn học/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/tên môn học/i), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Name' })),
    );
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `./subject-form` and `./edit-subject-form` don't exist yet (they're written above but not yet saved — save them now if you haven't, then re-run).

- [ ] **Step 8: Write the Subjects page and its test**

`apps/web/src/app/(dashboard)/subjects/page.tsx`:
```tsx
'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import { SubjectForm, SubjectFormValues } from '@/components/master-data/subject-form';
import {
  EditSubjectForm,
  EditSubjectFormValues,
} from '@/components/master-data/edit-subject-form';
import { Button } from '@/components/ui/button';

interface SubjectRow {
  id: string;
  code: string;
  name: string;
  credits: number | null;
  description: string | null;
}

const columnHelper = createColumnHelper<SubjectRow>();

export default function SubjectsPage() {
  const crud = useEntityCrud<SubjectRow, SubjectFormValues, EditSubjectFormValues>({
    queryKey: 'subjects',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: SubjectRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/subjects', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/subjects/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/subjects/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('code', { header: 'Mã môn học' }),
    columnHelper.accessor('name', { header: 'Tên môn học' }),
    columnHelper.accessor('credits', {
      header: 'Số tín chỉ',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => crud.setEditingItem(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa môn học "${row.original.name}"?`)) {
                crud.deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <EntityCrudScaffold
      title="Quản lý môn học"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách môn học. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo môn học mới"
      editTitle={crud.editingItem ? `Sửa môn học — ${crud.editingItem.code}` : null}
      isEditing={crud.editingItem !== null}
      createForm={<SubjectForm onSubmit={(values) => crud.createMutation.mutate(values)} />}
      editForm={
        crud.editingItem && (
          <EditSubjectForm
            defaultValues={{
              name: crud.editingItem.name,
              credits: crud.editingItem.credits ?? undefined,
              description: crud.editingItem.description ?? undefined,
            }}
            onSubmit={(values) =>
              crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
            }
            onCancel={() => crud.setEditingItem(null)}
          />
        )
      }
    />
  );
}
```

`apps/web/src/app/(dashboard)/subjects/page.test.tsx` — mirrors `accounts/page.test.tsx`'s fetch-state coverage exactly; this is what exercises the shared scaffold and hook (they have no entity-specific logic of their own to test in isolation):
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SubjectsPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SubjectsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('SubjectsPage fetch states', () => {
  it('shows a loading state before the subjects arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));

    renderPage();

    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /không tải được danh sách môn học/i,
      ),
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('renders the returned subjects on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [{ id: 's1', code: 'CS101', name: 'Nhập môn CNTT', credits: 3, description: null }],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('CS101')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS — all `SubjectForm`/`EditSubjectForm`/`SubjectsPage` tests green, plus the pre-existing `accounts`/`middleware` suites still green.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/layout.tsx apps/web/src/lib/use-entity-crud.ts apps/web/src/components/master-data apps/web/src/app/\(dashboard\)/subjects packages/shared/src/api/schema.d.ts
git commit -m "feat(web): add shared CRUD scaffold and Subjects page (WEB-MD-11..14)"
```

---

### Task 9: Academic Terms page (`WEB-MD-15..18`)

Reuses `useEntityCrud`/`EntityCrudScaffold` from Task 8 as-is — this task only adds the entity-specific forms, columns, and page. The one wrinkle: `startsOn`/`endsOn` get a client-side `endsOn >= startsOn` check via Zod's `.refine()`, mirroring the API's own check (Task 2) so the error surfaces next to the date fields instead of round-tripping to the server first.

**Files:**
- Create: `apps/web/src/components/master-data/academic-term-form.tsx`
- Create: `apps/web/src/components/master-data/edit-academic-term-form.tsx`
- Create: `apps/web/src/app/(dashboard)/academic-terms/page.tsx`
- Test: `apps/web/src/components/master-data/academic-term-form.test.tsx`
- Test: `apps/web/src/app/(dashboard)/academic-terms/page.test.tsx`

**Interfaces:**
- Consumes: `useEntityCrud`, `EntityCrudScaffold` (Task 8); `AcademicTermListItemDto` shape (Task 2).
- Produces: `AcademicTermFormValues`, `EditAcademicTermFormValues`. Nothing later in this plan depends on these.

- [ ] **Step 1: Write the Academic Term forms**

`apps/web/src/components/master-data/academic-term-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const academicTermFormSchema = z
  .object({
    code: z
      .string()
      .min(2)
      .max(32)
      .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
    name: z.string().min(1).max(150),
    startsOn: z.string().min(1, 'Chọn ngày bắt đầu'),
    endsOn: z.string().min(1, 'Chọn ngày kết thúc'),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    path: ['endsOn'],
  });

export type AcademicTermFormValues = z.infer<typeof academicTermFormSchema>;

export function AcademicTermForm({
  onSubmit,
}: {
  onSubmit: (values: AcademicTermFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcademicTermFormValues>({ resolver: zodResolver(academicTermFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-code">Mã học kỳ</Label>
        <Input id="term-code" {...register('code')} />
        {errors.code && (
          <p role="alert" className="text-sm text-destructive">
            {errors.code.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-name">Tên học kỳ</Label>
        <Input id="term-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-starts-on">Ngày bắt đầu</Label>
        <Input id="term-starts-on" type="date" {...register('startsOn')} />
        {errors.startsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.startsOn.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="term-ends-on">Ngày kết thúc</Label>
        <Input id="term-ends-on" type="date" {...register('endsOn')} />
        {errors.endsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.endsOn.message}
          </p>
        )}
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
```

`apps/web/src/components/master-data/edit-academic-term-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const editAcademicTermFormSchema = z
  .object({
    name: z.string().min(1).max(150),
    startsOn: z.string().min(1, 'Chọn ngày bắt đầu'),
    endsOn: z.string().min(1, 'Chọn ngày kết thúc'),
    isActive: z.boolean(),
  })
  .refine((data) => data.endsOn >= data.startsOn, {
    message: 'Ngày kết thúc phải sau hoặc bằng ngày bắt đầu',
    path: ['endsOn'],
  });

export type EditAcademicTermFormValues = z.infer<typeof editAcademicTermFormSchema>;

export function EditAcademicTermForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditAcademicTermFormValues;
  onSubmit: (values: EditAcademicTermFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditAcademicTermFormValues>({
    resolver: zodResolver(editAcademicTermFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-term-name">Tên học kỳ</Label>
        <Input id="edit-term-name" {...register('name')} />
        {errors.name && (
          <p role="alert" className="text-sm text-destructive">
            {errors.name.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-term-starts-on">Ngày bắt đầu</Label>
        <Input id="edit-term-starts-on" type="date" {...register('startsOn')} />
        {errors.startsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.startsOn.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-term-ends-on">Ngày kết thúc</Label>
        <Input id="edit-term-ends-on" type="date" {...register('endsOn')} />
        {errors.endsOn && (
          <p role="alert" className="text-sm text-destructive">
            {errors.endsOn.message}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <input
          id="edit-term-is-active"
          type="checkbox"
          className="h-4 w-4 rounded border-input"
          {...register('isActive')}
        />
        <Label htmlFor="edit-term-is-active" className="font-normal">
          Đang mở
        </Label>
      </div>
      <div className="flex gap-2">
        <Button type="submit">Lưu</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the failing form test**

`apps/web/src/components/master-data/academic-term-form.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AcademicTermForm } from './academic-term-form';

describe('AcademicTermForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<AcademicTermForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã học kỳ/i), { target: { value: 'HK1_2026' } });
    fireEvent.change(screen.getByLabelText(/tên học kỳ/i), { target: { value: 'Học kỳ 1' } });
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu/i), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText(/ngày kết thúc/i), { target: { value: '2027-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ code: 'HK1_2026', startsOn: '2026-09-01', endsOn: '2027-01-15' }),
      ),
    );
  });

  it('rejects an end date before the start date', async () => {
    const onSubmit = vi.fn();
    render(<AcademicTermForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã học kỳ/i), { target: { value: 'HK1_2026' } });
    fireEvent.change(screen.getByLabelText(/tên học kỳ/i), { target: { value: 'Học kỳ 1' } });
    fireEvent.change(screen.getByLabelText(/ngày bắt đầu/i), { target: { value: '2027-01-15' } });
    fireEvent.change(screen.getByLabelText(/ngày kết thúc/i), { target: { value: '2026-09-01' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `./academic-term-form` doesn't exist yet.

- [ ] **Step 4: Write the Academic Terms page and its test**

`apps/web/src/app/(dashboard)/academic-terms/page.tsx`:
```tsx
'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import {
  AcademicTermForm,
  AcademicTermFormValues,
} from '@/components/master-data/academic-term-form';
import {
  EditAcademicTermForm,
  EditAcademicTermFormValues,
} from '@/components/master-data/edit-academic-term-form';
import { Button } from '@/components/ui/button';

interface AcademicTermRow {
  id: string;
  code: string;
  name: string;
  startsOn: string;
  endsOn: string;
  isActive: boolean;
}

const columnHelper = createColumnHelper<AcademicTermRow>();

export default function AcademicTermsPage() {
  const crud = useEntityCrud<AcademicTermRow, AcademicTermFormValues, EditAcademicTermFormValues>({
    queryKey: 'academic-terms',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/academic-terms', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: AcademicTermRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/academic-terms', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/academic-terms/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/academic-terms/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('code', { header: 'Mã học kỳ' }),
    columnHelper.accessor('name', { header: 'Tên học kỳ' }),
    columnHelper.accessor('startsOn', { header: 'Bắt đầu' }),
    columnHelper.accessor('endsOn', { header: 'Kết thúc' }),
    columnHelper.accessor((row) => (row.isActive ? 'Đang mở' : 'Đã đóng'), {
      header: 'Trạng thái',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => crud.setEditingItem(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa học kỳ "${row.original.name}"?`)) {
                crud.deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <EntityCrudScaffold
      title="Quản lý học kỳ"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách học kỳ. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo học kỳ mới"
      editTitle={crud.editingItem ? `Sửa học kỳ — ${crud.editingItem.code}` : null}
      isEditing={crud.editingItem !== null}
      createForm={
        <AcademicTermForm onSubmit={(values) => crud.createMutation.mutate(values)} />
      }
      editForm={
        crud.editingItem && (
          <EditAcademicTermForm
            defaultValues={{
              name: crud.editingItem.name,
              startsOn: crud.editingItem.startsOn,
              endsOn: crud.editingItem.endsOn,
              isActive: crud.editingItem.isActive,
            }}
            onSubmit={(values) =>
              crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
            }
            onCancel={() => crud.setEditingItem(null)}
          />
        )
      }
    />
  );
}
```

`apps/web/src/app/(dashboard)/academic-terms/page.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AcademicTermsPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AcademicTermsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('AcademicTermsPage fetch states', () => {
  it('shows a loading state before the terms arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/không tải được danh sách học kỳ/i),
    );
  });

  it('renders the returned terms on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 't1',
            code: 'HK1_2026',
            name: 'Học kỳ 1',
            startsOn: '2026-09-01',
            endsOn: '2027-01-15',
            isActive: true,
          },
        ],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('HK1_2026')).toBeInTheDocument());
    expect(screen.getByText('Đang mở')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS — all `AcademicTermForm`/`AcademicTermsPage` tests green, plus every pre-existing suite still green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/master-data apps/web/src/app/\(dashboard\)/academic-terms
git commit -m "feat(web): add Academic Terms page (WEB-MD-15..18)"
```

---

### Task 10: Lecturers page (`WEB-MD-06..09`)

Same shape as Task 9, no new wrinkles — plain optional text fields, no dates or cross-entity references.

**Files:**
- Create: `apps/web/src/components/master-data/lecturer-form.tsx`
- Create: `apps/web/src/components/master-data/edit-lecturer-form.tsx`
- Create: `apps/web/src/app/(dashboard)/lecturers/page.tsx`
- Test: `apps/web/src/components/master-data/lecturer-form.test.tsx`
- Test: `apps/web/src/app/(dashboard)/lecturers/page.test.tsx`

**Interfaces:**
- Consumes: `useEntityCrud`, `EntityCrudScaffold` (Task 8); `LecturerListItemDto` shape (Task 3).
- Produces: `LecturerFormValues`, `EditLecturerFormValues`. Nothing later in this plan depends on these.

- [ ] **Step 1: Write the Lecturer forms**

`apps/web/src/components/master-data/lecturer-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const lecturerFormSchema = z.object({
  employeeCode: z
    .string()
    .min(2)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  fullName: z.string().min(1).max(150),
  department: z.string().max(150).optional(),
  academicTitle: z.string().max(100).optional(),
});

export type LecturerFormValues = z.infer<typeof lecturerFormSchema>;

export function LecturerForm({
  onSubmit,
}: {
  onSubmit: (values: LecturerFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LecturerFormValues>({ resolver: zodResolver(lecturerFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-employee-code">Mã giảng viên</Label>
        <Input id="lecturer-employee-code" {...register('employeeCode')} />
        {errors.employeeCode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.employeeCode.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-full-name">Họ tên</Label>
        <Input id="lecturer-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-department">Khoa / Bộ môn</Label>
        <Input id="lecturer-department" {...register('department')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="lecturer-academic-title">Học vị / Học hàm</Label>
        <Input id="lecturer-academic-title" {...register('academicTitle')} />
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
```

`apps/web/src/components/master-data/edit-lecturer-form.tsx` — no `employeeCode` field: immutable after creation, same as `Subject.code`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const editLecturerFormSchema = z.object({
  fullName: z.string().min(1).max(150),
  department: z.string().max(150).optional(),
  academicTitle: z.string().max(100).optional(),
});

export type EditLecturerFormValues = z.infer<typeof editLecturerFormSchema>;

export function EditLecturerForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditLecturerFormValues;
  onSubmit: (values: EditLecturerFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditLecturerFormValues>({
    resolver: zodResolver(editLecturerFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-lecturer-full-name">Họ tên</Label>
        <Input id="edit-lecturer-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-lecturer-department">Khoa / Bộ môn</Label>
        <Input id="edit-lecturer-department" {...register('department')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-lecturer-academic-title">Học vị / Học hàm</Label>
        <Input id="edit-lecturer-academic-title" {...register('academicTitle')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Lưu</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the failing form test**

`apps/web/src/components/master-data/lecturer-form.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LecturerForm } from './lecturer-form';

describe('LecturerForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<LecturerForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã giảng viên/i), { target: { value: 'GV001' } });
    fireEvent.change(screen.getByLabelText(/họ tên/i), { target: { value: 'Nguyễn Văn A' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ employeeCode: 'GV001', fullName: 'Nguyễn Văn A' }),
      ),
    );
  });

  it('rejects a missing full name', async () => {
    const onSubmit = vi.fn();
    render(<LecturerForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã giảng viên/i), { target: { value: 'GV001' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `./lecturer-form` doesn't exist yet.

- [ ] **Step 4: Write the Lecturers page and its test**

`apps/web/src/app/(dashboard)/lecturers/page.tsx`:
```tsx
'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import { LecturerForm, LecturerFormValues } from '@/components/master-data/lecturer-form';
import {
  EditLecturerForm,
  EditLecturerFormValues,
} from '@/components/master-data/edit-lecturer-form';
import { Button } from '@/components/ui/button';

interface LecturerRow {
  id: string;
  employeeCode: string;
  fullName: string;
  department: string | null;
  academicTitle: string | null;
}

const columnHelper = createColumnHelper<LecturerRow>();

export default function LecturersPage() {
  const crud = useEntityCrud<LecturerRow, LecturerFormValues, EditLecturerFormValues>({
    queryKey: 'lecturers',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/lecturers', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: LecturerRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/lecturers', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/lecturers/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/lecturers/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('employeeCode', { header: 'Mã giảng viên' }),
    columnHelper.accessor('fullName', { header: 'Họ tên' }),
    columnHelper.accessor('department', {
      header: 'Khoa / Bộ môn',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('academicTitle', {
      header: 'Học vị / Học hàm',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => crud.setEditingItem(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa giảng viên "${row.original.fullName}"?`)) {
                crud.deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <EntityCrudScaffold
      title="Quản lý giảng viên"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách giảng viên. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo giảng viên mới"
      editTitle={crud.editingItem ? `Sửa giảng viên — ${crud.editingItem.employeeCode}` : null}
      isEditing={crud.editingItem !== null}
      createForm={<LecturerForm onSubmit={(values) => crud.createMutation.mutate(values)} />}
      editForm={
        crud.editingItem && (
          <EditLecturerForm
            defaultValues={{
              fullName: crud.editingItem.fullName,
              department: crud.editingItem.department ?? undefined,
              academicTitle: crud.editingItem.academicTitle ?? undefined,
            }}
            onSubmit={(values) =>
              crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
            }
            onCancel={() => crud.setEditingItem(null)}
          />
        )
      }
    />
  );
}
```

`apps/web/src/app/(dashboard)/lecturers/page.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LecturersPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <LecturersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('LecturersPage fetch states', () => {
  it('shows a loading state before the lecturers arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/không tải được danh sách giảng viên/i),
    );
  });

  it('renders the returned lecturers on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 'l1',
            employeeCode: 'GV001',
            fullName: 'Nguyễn Văn A',
            department: 'CNTT',
            academicTitle: 'Tiến sĩ',
          },
        ],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('GV001')).toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS — all `LecturerForm`/`LecturersPage` tests green, plus every pre-existing suite still green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/master-data apps/web/src/app/\(dashboard\)/lecturers
git commit -m "feat(web): add Lecturers page (WEB-MD-06..09)"
```

---

### Task 11: Students page (`WEB-MD-01..04`)

Same shape as Task 8's Subjects page — `studentCode` plays the same "immutable identifier, absent from the edit form" role `code` played there. `cohortYear` reuses the same empty-string-to-`undefined` preprocessing `credits` needed in Task 8, for the same reason. The Excel import UI (Task 14) links to this page's data but is a separate route, added later so this task stays focused on plain CRUD.

**Files:**
- Create: `apps/web/src/components/master-data/student-form.tsx`
- Create: `apps/web/src/components/master-data/edit-student-form.tsx`
- Create: `apps/web/src/app/(dashboard)/students/page.tsx`
- Test: `apps/web/src/components/master-data/student-form.test.tsx`
- Test: `apps/web/src/app/(dashboard)/students/page.test.tsx`

**Interfaces:**
- Consumes: `useEntityCrud`, `EntityCrudScaffold` (Task 8); `StudentListItemDto` shape (Task 4).
- Produces: `StudentFormValues`, `EditStudentFormValues`. Task 14's import UI does not reuse these — it posts a file, not a form.

- [ ] **Step 1: Write the Student forms**

`apps/web/src/components/master-data/student-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Same empty-string -> undefined preprocessing as `credits` in Task 8's
// Subject forms, for the same reason: z.coerce.number() alone turns '' into
// 0 on an intentionally-blank optional field.
const cohortYearSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(1900).max(2200).optional(),
);

const studentFormSchema = z.object({
  studentCode: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  fullName: z.string().min(1).max(150),
  dateOfBirth: z.string().optional(),
  classCode: z.string().max(50).optional(),
  cohortYear: cohortYearSchema,
});

export type StudentFormValues = z.infer<typeof studentFormSchema>;

export function StudentForm({
  onSubmit,
}: {
  onSubmit: (values: StudentFormValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<StudentFormValues>({ resolver: zodResolver(studentFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-code">Mã số sinh viên</Label>
        <Input id="student-code" {...register('studentCode')} />
        {errors.studentCode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.studentCode.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-full-name">Họ tên</Label>
        <Input id="student-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-date-of-birth">Ngày sinh</Label>
        <Input id="student-date-of-birth" type="date" {...register('dateOfBirth')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-class-code">Lớp</Label>
        <Input id="student-class-code" {...register('classCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="student-cohort-year">Năm nhập học</Label>
        <Input id="student-cohort-year" type="number" {...register('cohortYear')} />
        {errors.cohortYear && (
          <p role="alert" className="text-sm text-destructive">
            {errors.cohortYear.message}
          </p>
        )}
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
```

`apps/web/src/components/master-data/edit-student-form.tsx` — no `studentCode` field: immutable after creation, same as `Subject.code`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const cohortYearSchema = z.preprocess(
  (val) => (val === '' || val === undefined ? undefined : Number(val)),
  z.number().int().min(1900).max(2200).optional(),
);

const editStudentFormSchema = z.object({
  fullName: z.string().min(1).max(150),
  dateOfBirth: z.string().optional(),
  classCode: z.string().max(50).optional(),
  cohortYear: cohortYearSchema,
});

export type EditStudentFormValues = z.infer<typeof editStudentFormSchema>;

export function EditStudentForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditStudentFormValues;
  onSubmit: (values: EditStudentFormValues) => void;
  onCancel: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EditStudentFormValues>({
    resolver: zodResolver(editStudentFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-full-name">Họ tên</Label>
        <Input id="edit-student-full-name" {...register('fullName')} />
        {errors.fullName && (
          <p role="alert" className="text-sm text-destructive">
            {errors.fullName.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-date-of-birth">Ngày sinh</Label>
        <Input id="edit-student-date-of-birth" type="date" {...register('dateOfBirth')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-class-code">Lớp</Label>
        <Input id="edit-student-class-code" {...register('classCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-student-cohort-year">Năm nhập học</Label>
        <Input id="edit-student-cohort-year" type="number" {...register('cohortYear')} />
        {errors.cohortYear && (
          <p role="alert" className="text-sm text-destructive">
            {errors.cohortYear.message}
          </p>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit">Lưu</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the failing form test**

`apps/web/src/components/master-data/student-form.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { StudentForm } from './student-form';

describe('StudentForm', () => {
  it('submits parsed values on valid input', async () => {
    const onSubmit = vi.fn();
    render(<StudentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã số sinh viên/i), { target: { value: 'SV001' } });
    fireEvent.change(screen.getByLabelText(/họ tên/i), { target: { value: 'Trần Thị B' } });
    fireEvent.change(screen.getByLabelText(/năm nhập học/i), { target: { value: '2020' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ studentCode: 'SV001', fullName: 'Trần Thị B', cohortYear: 2020 }),
      ),
    );
  });

  it('rejects a student code shorter than 3 characters', async () => {
    const onSubmit = vi.fn();
    render(<StudentForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/mã số sinh viên/i), { target: { value: 'SV' } });
    fireEvent.change(screen.getByLabelText(/họ tên/i), { target: { value: 'Trần Thị B' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `./student-form` doesn't exist yet.

- [ ] **Step 4: Write the Students page and its test**

`apps/web/src/app/(dashboard)/students/page.tsx`:
```tsx
'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import { StudentForm, StudentFormValues } from '@/components/master-data/student-form';
import {
  EditStudentForm,
  EditStudentFormValues,
} from '@/components/master-data/edit-student-form';
import { Button } from '@/components/ui/button';

interface StudentRow {
  id: string;
  studentCode: string;
  fullName: string;
  dateOfBirth: string | null;
  classCode: string | null;
  cohortYear: number | null;
}

const columnHelper = createColumnHelper<StudentRow>();

export default function StudentsPage() {
  const crud = useEntityCrud<StudentRow, StudentFormValues, EditStudentFormValues>({
    queryKey: 'students',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/students', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: StudentRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/students', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/students/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/students/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('studentCode', { header: 'Mã số sinh viên' }),
    columnHelper.accessor('fullName', { header: 'Họ tên' }),
    columnHelper.accessor('classCode', {
      header: 'Lớp',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('cohortYear', {
      header: 'Năm nhập học',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => crud.setEditingItem(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa sinh viên "${row.original.fullName}"?`)) {
                crud.deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <EntityCrudScaffold
      title="Quản lý sinh viên"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách sinh viên. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo sinh viên mới"
      editTitle={crud.editingItem ? `Sửa sinh viên — ${crud.editingItem.studentCode}` : null}
      isEditing={crud.editingItem !== null}
      createForm={<StudentForm onSubmit={(values) => crud.createMutation.mutate(values)} />}
      editForm={
        crud.editingItem && (
          <EditStudentForm
            defaultValues={{
              fullName: crud.editingItem.fullName,
              dateOfBirth: crud.editingItem.dateOfBirth ?? undefined,
              classCode: crud.editingItem.classCode ?? undefined,
              cohortYear: crud.editingItem.cohortYear ?? undefined,
            }}
            onSubmit={(values) =>
              crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
            }
            onCancel={() => crud.setEditingItem(null)}
          />
        )
      }
    />
  );
}
```

`apps/web/src/app/(dashboard)/students/page.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentsPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
});

describe('StudentsPage fetch states', () => {
  it('shows a loading state before the students arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/không tải được danh sách sinh viên/i),
    );
  });

  it('renders the returned students on success', async () => {
    get.mockResolvedValue({
      data: {
        items: [
          {
            id: 'st1',
            studentCode: 'SV001',
            fullName: 'Trần Thị B',
            dateOfBirth: null,
            classCode: 'D20CQCE01',
            cohortYear: 2020,
          },
        ],
        total: 1,
      },
      response: new Response(null, { status: 200 }),
    });
    renderPage();
    await waitFor(() => expect(screen.getByText('SV001')).toBeInTheDocument());
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS — all `StudentForm`/`StudentsPage` tests green, plus every pre-existing suite still green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/master-data apps/web/src/app/\(dashboard\)/students
git commit -m "feat(web): add Students page (WEB-MD-01..04)"
```

---

### Task 12: Course Sections page (`WEB-MD-19..22`)

The one entity page with cross-entity references. The create form's subject/term pickers are plain HTML `<select>`s populated from two small `useQuery` calls made directly inside `CourseSectionForm` (not through `useEntityCrud` — these are auxiliary lookup lists for this form, not the resource the page manages). `subjectId`/`academicTermId`/`sectionCode` are immutable after creation (same precedent as `Subject.code`), so the edit form only has `nominalClassCode`/`name`, no selects. Each row also links to `/course-sections/:id/enrollments` (built in Task 13) for managing that section's roster.

**Files:**
- Create: `apps/web/src/components/master-data/course-section-form.tsx`
- Create: `apps/web/src/components/master-data/edit-course-section-form.tsx`
- Create: `apps/web/src/app/(dashboard)/course-sections/page.tsx`
- Test: `apps/web/src/components/master-data/course-section-form.test.tsx`
- Test: `apps/web/src/app/(dashboard)/course-sections/page.test.tsx`

**Interfaces:**
- Consumes: `useEntityCrud`, `EntityCrudScaffold` (Task 8); `CourseSectionListItemDto` shape (Task 5); `/subjects`, `/academic-terms` list endpoints (Tasks 1, 2) for the pickers.
- Produces: `CourseSectionFormValues`, `EditCourseSectionFormValues`; a link to `/course-sections/:id/enrollments`, the route Task 13 creates.

- [ ] **Step 1: Write the Course Section forms**

`apps/web/src/components/master-data/course-section-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const courseSectionFormSchema = z.object({
  subjectId: z.string().uuid('Chọn môn học'),
  academicTermId: z.string().uuid('Chọn học kỳ'),
  sectionCode: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9._-]+$/, 'Mã chỉ gồm chữ, số, ".", "_", "-"'),
  nominalClassCode: z.string().max(50).optional(),
  name: z.string().max(200).optional(),
});

export type CourseSectionFormValues = z.infer<typeof courseSectionFormSchema>;

interface ReferenceOption {
  id: string;
  code: string;
  name: string;
}

// Reference options for the subject/term selects — fetched here directly
// rather than through useEntityCrud, since these are auxiliary lookup
// lists for this form, not the resource the surrounding page manages.
function useReferenceOptions() {
  const subjects = useQuery({
    queryKey: ['subjects', '__all__'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/subjects', {
        params: { query: { search: '', page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return (data as unknown as { items: ReferenceOption[] }).items;
    },
  });

  const terms = useQuery({
    queryKey: ['academic-terms', '__all__'],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/academic-terms', {
        params: { query: { search: '', page: 1, pageSize: 100 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return (data as unknown as { items: ReferenceOption[] }).items;
    },
  });

  return { subjects: subjects.data ?? [], terms: terms.data ?? [] };
}

export function CourseSectionForm({
  onSubmit,
}: {
  onSubmit: (values: CourseSectionFormValues) => void;
}) {
  const { subjects, terms } = useReferenceOptions();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CourseSectionFormValues>({ resolver: zodResolver(courseSectionFormSchema) });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-subject">Môn học</Label>
        <select
          id="section-subject"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue=""
          {...register('subjectId')}
        >
          <option value="">-- Chọn môn học --</option>
          {subjects.map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.code} — {subject.name}
            </option>
          ))}
        </select>
        {errors.subjectId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.subjectId.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-term">Học kỳ</Label>
        <select
          id="section-term"
          className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          defaultValue=""
          {...register('academicTermId')}
        >
          <option value="">-- Chọn học kỳ --</option>
          {terms.map((term) => (
            <option key={term.id} value={term.id}>
              {term.code} — {term.name}
            </option>
          ))}
        </select>
        {errors.academicTermId && (
          <p role="alert" className="text-sm text-destructive">
            {errors.academicTermId.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-code">Mã lớp học phần</Label>
        <Input id="section-code" {...register('sectionCode')} />
        {errors.sectionCode && (
          <p role="alert" className="text-sm text-destructive">
            {errors.sectionCode.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-nominal-class-code">Lớp danh nghĩa</Label>
        <Input id="section-nominal-class-code" {...register('nominalClassCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="section-name">Tên lớp học phần</Label>
        <Input id="section-name" {...register('name')} />
      </div>
      <Button type="submit">Lưu</Button>
    </form>
  );
}
```

`apps/web/src/components/master-data/edit-course-section-form.tsx`:
```tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const editCourseSectionFormSchema = z.object({
  nominalClassCode: z.string().max(50).optional(),
  name: z.string().max(200).optional(),
});

export type EditCourseSectionFormValues = z.infer<typeof editCourseSectionFormSchema>;

export function EditCourseSectionForm({
  defaultValues,
  onSubmit,
  onCancel,
}: {
  defaultValues: EditCourseSectionFormValues;
  onSubmit: (values: EditCourseSectionFormValues) => void;
  onCancel: () => void;
}) {
  const { register, handleSubmit } = useForm<EditCourseSectionFormValues>({
    resolver: zodResolver(editCourseSectionFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-section-nominal-class-code">Lớp danh nghĩa</Label>
        <Input id="edit-section-nominal-class-code" {...register('nominalClassCode')} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="edit-section-name">Tên lớp học phần</Label>
        <Input id="edit-section-name" {...register('name')} />
      </div>
      <div className="flex gap-2">
        <Button type="submit">Lưu</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Hủy
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Write the failing form test**

`apps/web/src/components/master-data/course-section-form.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CourseSectionForm } from './course-section-form';

const SUBJECT_ID = '11111111-1111-1111-1111-111111111111';
const TERM_ID = '22222222-2222-2222-2222-222222222222';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { GET: (...args: unknown[]) => get(...args) },
}));

function renderForm(onSubmit = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <CourseSectionForm onSubmit={onSubmit} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((path: string) => {
    if (path === '/subjects') {
      return Promise.resolve({
        data: { items: [{ id: SUBJECT_ID, code: 'CS101', name: 'Nhập môn CNTT' }] },
        response: new Response(null, { status: 200 }),
      });
    }
    if (path === '/academic-terms') {
      return Promise.resolve({
        data: { items: [{ id: TERM_ID, code: 'HK1_2026', name: 'Học kỳ 1' }] },
        response: new Response(null, { status: 200 }),
      });
    }
    return Promise.resolve({
      data: { items: [] },
      response: new Response(null, { status: 200 }),
    });
  });
});

describe('CourseSectionForm', () => {
  it('submits parsed values once subject/term options load', async () => {
    const onSubmit = renderForm();

    await waitFor(() => expect(screen.getByText(/CS101/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/môn học/i), { target: { value: SUBJECT_ID } });
    fireEvent.change(screen.getByLabelText(/học kỳ/i), { target: { value: TERM_ID } });
    fireEvent.change(screen.getByLabelText(/mã lớp học phần/i), { target: { value: 'SEC01' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          subjectId: SUBJECT_ID,
          academicTermId: TERM_ID,
          sectionCode: 'SEC01',
        }),
      ),
    );
  });

  it('rejects submitting without choosing a subject', async () => {
    const onSubmit = renderForm();
    await waitFor(() => expect(screen.getByText(/CS101/)).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText(/học kỳ/i), { target: { value: TERM_ID } });
    fireEvent.change(screen.getByLabelText(/mã lớp học phần/i), { target: { value: 'SEC01' } });
    fireEvent.click(screen.getByRole('button', { name: /lưu/i }));

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — `./course-section-form` doesn't exist yet.

- [ ] **Step 4: Write the Course Sections page and its test**

`apps/web/src/app/(dashboard)/course-sections/page.tsx`:
```tsx
'use client';

import { createColumnHelper } from '@tanstack/react-table';
import Link from 'next/link';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import {
  CourseSectionForm,
  CourseSectionFormValues,
} from '@/components/master-data/course-section-form';
import {
  EditCourseSectionForm,
  EditCourseSectionFormValues,
} from '@/components/master-data/edit-course-section-form';
import { Button } from '@/components/ui/button';

interface CourseSectionRow {
  id: string;
  sectionCode: string;
  nominalClassCode: string | null;
  name: string | null;
  subject: { id: string; code: string; name: string };
  academicTerm: { id: string; code: string; name: string };
}

const columnHelper = createColumnHelper<CourseSectionRow>();

export default function CourseSectionsPage() {
  const crud = useEntityCrud<
    CourseSectionRow,
    CourseSectionFormValues,
    EditCourseSectionFormValues
  >({
    queryKey: 'course-sections',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/course-sections', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: CourseSectionRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/course-sections', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/course-sections/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/course-sections/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('sectionCode', { header: 'Mã lớp học phần' }),
    columnHelper.accessor((row) => `${row.subject.code} — ${row.subject.name}`, {
      header: 'Môn học',
      id: 'subject',
    }),
    columnHelper.accessor((row) => `${row.academicTerm.code} — ${row.academicTerm.name}`, {
      header: 'Học kỳ',
      id: 'term',
    }),
    columnHelper.accessor('nominalClassCode', {
      header: 'Lớp danh nghĩa',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/course-sections/${row.original.id}/enrollments`}
            className="text-sm underline"
          >
            Sinh viên
          </Link>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => crud.setEditingItem(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa lớp học phần "${row.original.sectionCode}"?`)) {
                crud.deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <EntityCrudScaffold
      title="Quản lý lớp học phần"
      searchPlaceholder="Tìm kiếm..."
      search={crud.search}
      onSearchChange={crud.setSearch}
      columns={columns}
      items={crud.data?.items ?? []}
      isLoading={crud.isLoading}
      error={crud.error}
      errorMessage="Không tải được danh sách lớp học phần. Hãy tải lại trang hoặc đăng nhập lại."
      createTitle="Tạo lớp học phần mới"
      editTitle={crud.editingItem ? `Sửa lớp học phần — ${crud.editingItem.sectionCode}` : null}
      isEditing={crud.editingItem !== null}
      createForm={
        <CourseSectionForm onSubmit={(values) => crud.createMutation.mutate(values)} />
      }
      editForm={
        crud.editingItem && (
          <EditCourseSectionForm
            defaultValues={{
              nominalClassCode: crud.editingItem.nominalClassCode ?? undefined,
              name: crud.editingItem.name ?? undefined,
            }}
            onSubmit={(values) =>
              crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
            }
            onCancel={() => crud.setEditingItem(null)}
          />
        )
      }
    />
  );
}
```

`apps/web/src/app/(dashboard)/course-sections/page.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CourseSectionsPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: vi.fn(),
    PATCH: vi.fn(),
    DELETE: vi.fn(),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CourseSectionsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue({
    data: { items: [] },
    response: new Response(null, { status: 200 }),
  });
});

describe('CourseSectionsPage fetch states', () => {
  it('shows a loading state before the sections arrive', async () => {
    get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/đang tải/i)).toBeInTheDocument();
  });

  it('shows an error message instead of an empty table when the request is rejected', async () => {
    get.mockResolvedValue({
      error: { statusCode: 401, message: 'Unauthorized' },
      response: new Response(null, { status: 401 }),
    });
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /không tải được danh sách lớp học phần/i,
      ),
    );
  });

  it('renders the returned sections with joined subject/term display fields', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/course-sections') {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'cs1',
                sectionCode: 'SEC01',
                nominalClassCode: 'D20CQCE01',
                name: null,
                subject: { id: 'subj1', code: 'CS101', name: 'Nhập môn CNTT' },
                academicTerm: { id: 'term1', code: 'HK1_2026', name: 'Học kỳ 1' },
              },
            ],
            total: 1,
          },
          response: new Response(null, { status: 200 }),
        });
      }
      return Promise.resolve({
        data: { items: [] },
        response: new Response(null, { status: 200 }),
      });
    });

    renderPage();
    await waitFor(() => expect(screen.getByText('SEC01')).toBeInTheDocument());
    expect(screen.getByText(/CS101 — Nhập môn CNTT/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sinh viên/i })).toHaveAttribute(
      'href',
      '/course-sections/cs1/enrollments',
    );
  });
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter web test`
Expected: PASS — all `CourseSectionForm`/`CourseSectionsPage` tests green, plus every pre-existing suite still green.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/master-data apps/web/src/app/\(dashboard\)/course-sections
git commit -m "feat(web): add Course Sections page (WEB-MD-19..22)"
```

---

### Task 13: Course Section enrollment management panel (`WEB-MD-23..24`)

Per the design spec, this is built on the scaffold's *list* half only — enrollment has no editable fields beyond existing/not-existing, so there's no create/edit form to swap in, and `EntityCrudScaffold` (which always expects both) doesn't fit. This task writes a small bespoke page instead: a student search-and-add panel, and a currently-enrolled list with a remove action, both plain `useQuery`/`useMutation` — no new shared abstraction needed for a page this simple.

**Files:**
- Create: `apps/web/src/app/(dashboard)/course-sections/[sectionId]/enrollments/page.tsx`
- Test: `apps/web/src/app/(dashboard)/course-sections/[sectionId]/enrollments/page.test.tsx`

**Interfaces:**
- Consumes: `GET/POST /course-sections/{sectionId}/enrollments`, `DELETE /course-sections/{sectionId}/enrollments/{studentId}` (Task 6); `GET /students` (Task 4); the link Task 12's page already points here.
- Produces: nothing consumed further in this plan.

- [ ] **Step 1: Write the failing page test**

`apps/web/src/app/(dashboard)/course-sections/[sectionId]/enrollments/page.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CourseSectionEnrollmentsPage from './page';

vi.mock('next/navigation', () => ({
  useParams: () => ({ sectionId: 'section-1' }),
}));

const get = vi.fn();
const post = vi.fn();
const del = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    GET: (...args: unknown[]) => get(...args),
    POST: (...args: unknown[]) => post(...args),
    DELETE: (...args: unknown[]) => del(...args),
  },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CourseSectionEnrollmentsPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
});

describe('CourseSectionEnrollmentsPage', () => {
  it('lists currently enrolled students', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/course-sections/{sectionId}/enrollments') {
        return Promise.resolve({
          data: {
            items: [
              {
                id: 'e1',
                enrolledAt: '2026-08-21T00:00:00.000Z',
                student: { id: 'st1', studentCode: 'SV001', fullName: 'Trần Thị B' },
              },
            ],
            total: 1,
          },
          response: new Response(null, { status: 200 }),
        });
      }
      return Promise.resolve({
        data: { items: [] },
        response: new Response(null, { status: 200 }),
      });
    });

    renderPage();

    await waitFor(() => expect(screen.getByText('SV001')).toBeInTheDocument());
  });

  it('searches for a student and enrolls them', async () => {
    get.mockImplementation((path: string) => {
      if (path === '/course-sections/{sectionId}/enrollments') {
        return Promise.resolve({
          data: { items: [], total: 0 },
          response: new Response(null, { status: 200 }),
        });
      }
      if (path === '/students') {
        return Promise.resolve({
          data: { items: [{ id: 'st2', studentCode: 'SV002', fullName: 'Lê Văn C' }] },
          response: new Response(null, { status: 200 }),
        });
      }
      return Promise.resolve({
        data: { items: [] },
        response: new Response(null, { status: 200 }),
      });
    });
    post.mockResolvedValue({ error: undefined });

    renderPage();

    const searchInput = screen.getByPlaceholderText(/tìm theo mã số hoặc họ tên/i);
    fireEvent.change(searchInput, { target: { value: 'Lê Văn C' } });

    await waitFor(() => expect(screen.getByText('SV002')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /thêm/i }));

    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/course-sections/{sectionId}/enrollments', {
        params: { path: { sectionId: 'section-1' } },
        body: { studentId: 'st2' },
      }),
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — the page doesn't exist yet.

- [ ] **Step 3: Write the enrollment management page**

`apps/web/src/app/(dashboard)/course-sections/[sectionId]/enrollments/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface EnrolledStudent {
  id: string;
  enrolledAt: string;
  student: { id: string; studentCode: string; fullName: string };
}

interface StudentSearchResult {
  id: string;
  studentCode: string;
  fullName: string;
}

export default function CourseSectionEnrollmentsPage() {
  // Client Components read dynamic route params via useParams() rather than
  // the `params` prop — in Next 15 that prop is a Promise, which useParams()
  // avoids entirely.
  const { sectionId } = useParams<{ sectionId: string }>();
  const queryClient = useQueryClient();
  const [studentSearch, setStudentSearch] = useState('');

  const enrollmentsQuery = useQuery({
    queryKey: ['course-section-enrollments', sectionId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET(
        '/course-sections/{sectionId}/enrollments',
        { params: { path: { sectionId } } },
      );
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: EnrolledStudent[]; total: number };
    },
  });

  const studentSearchQuery = useQuery({
    queryKey: ['students', studentSearch],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/students', {
        params: { query: { search: studentSearch, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return (data as unknown as { items: StudentSearchResult[] }).items;
    },
    enabled: studentSearch.length > 0,
  });

  const invalidateEnrollments = () =>
    queryClient.invalidateQueries({ queryKey: ['course-section-enrollments', sectionId] });

  const enrollMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await apiClient.POST('/course-sections/{sectionId}/enrollments', {
        params: { path: { sectionId } },
        body: { studentId },
      });
      if (error) throw error;
    },
    onSuccess: invalidateEnrollments,
  });

  const unenrollMutation = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await apiClient.DELETE(
        '/course-sections/{sectionId}/enrollments/{studentId}',
        { params: { path: { sectionId, studentId } } },
      );
      if (error) throw error;
    },
    onSuccess: invalidateEnrollments,
  });

  const enrolledStudentIds = new Set(
    (enrollmentsQuery.data?.items ?? []).map((item) => item.student.id),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Quản lý sinh viên trong lớp học phần</h1>

      <Card>
        <CardHeader>
          <CardTitle>Thêm sinh viên</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Input
            placeholder="Tìm theo mã số hoặc họ tên..."
            value={studentSearch}
            onChange={(e) => setStudentSearch(e.target.value)}
            className="max-w-xs"
          />
          {studentSearch && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã số sinh viên</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(studentSearchQuery.data ?? []).map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>{student.studentCode}</TableCell>
                    <TableCell>{student.fullName}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        disabled={enrolledStudentIds.has(student.id)}
                        onClick={() => enrollMutation.mutate(student.id)}
                      >
                        {enrolledStudentIds.has(student.id) ? 'Đã có trong lớp' : 'Thêm'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danh sách sinh viên đã đăng ký</CardTitle>
        </CardHeader>
        <CardContent>
          {enrollmentsQuery.isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Đang tải…</p>
          ) : enrollmentsQuery.error ? (
            <p role="alert" className="p-4 text-sm text-destructive">
              Không tải được danh sách sinh viên. Hãy tải lại trang.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã số sinh viên</TableHead>
                  <TableHead>Họ tên</TableHead>
                  <TableHead>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(enrollmentsQuery.data?.items ?? []).map((enrollment) => (
                  <TableRow key={enrollment.id}>
                    <TableCell>{enrollment.student.studentCode}</TableCell>
                    <TableCell>{enrollment.student.fullName}</TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (
                            window.confirm(
                              `Xóa sinh viên "${enrollment.student.fullName}" khỏi lớp học phần?`,
                            )
                          ) {
                            unenrollMutation.mutate(enrollment.student.id);
                          }
                        }}
                      >
                        Xóa
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS — both `CourseSectionEnrollmentsPage` tests green, plus every pre-existing suite still green.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/course-sections
git commit -m "feat(web): add Course Section enrollment management panel (WEB-MD-23..24)"
```

---

### Task 14: Student Excel import UI (`WEB-MD-05`)

Last task in the plan. `POST /students/import` takes `multipart/form-data`, but Task 7's controller has no `@ApiConsumes`/`@ApiBody` decorators, so the generated OpenAPI schema doesn't describe that request body — the typed `apiClient` can't express this call. A plain `fetch` with `credentials: 'include'` (the same cross-origin cookie workaround `api-client.ts` already documents) does the upload instead; polling `GET /students/import/:jobId` is fully typed and goes through `apiClient` as usual (this is also why Task 7's plan was revised to add `@ApiOkResponse({ type: ImportJobStatusDto })` to that endpoint — without it, even the polling call's response type would be unresolvable).

**Files:**
- Modify: `apps/web/package.json` (add `@testing-library/user-event` devDependency, for simulating a file-input selection in the test)
- Modify: `apps/web/src/app/(dashboard)/students/page.tsx` (add a link to `/students/import`)
- Create: `apps/web/src/app/(dashboard)/students/import/page.tsx`
- Test: `apps/web/src/app/(dashboard)/students/import/page.test.tsx`

**Interfaces:**
- Consumes: `POST /students/import` (Task 7, via raw `fetch`, not `apiClient`); `GET /students/import/{jobId}` -> `ImportJobStatusDto` (Task 7, via `apiClient`).
- Produces: nothing consumed further in this plan — this is the last task.

- [ ] **Step 1: Add the test dependency**

Modify `apps/web/package.json` — add to `devDependencies`:
```json
"@testing-library/user-event": "^14.5.2",
```

Run: `pnpm install`

- [ ] **Step 2: Link to the import page from the Students page**

Modify `apps/web/src/app/(dashboard)/students/page.tsx` — add the `Link` import and a small link above the scaffold; everything else in the file is unchanged from Task 11:
```tsx
'use client';

import Link from 'next/link';
import { createColumnHelper } from '@tanstack/react-table';
import { apiClient } from '@/lib/api-client';
import { useEntityCrud } from '@/lib/use-entity-crud';
import { EntityCrudScaffold } from '@/components/master-data/entity-crud-scaffold';
import { StudentForm, StudentFormValues } from '@/components/master-data/student-form';
import {
  EditStudentForm,
  EditStudentFormValues,
} from '@/components/master-data/edit-student-form';
import { Button } from '@/components/ui/button';

interface StudentRow {
  id: string;
  studentCode: string;
  fullName: string;
  dateOfBirth: string | null;
  classCode: string | null;
  cohortYear: number | null;
}

const columnHelper = createColumnHelper<StudentRow>();

export default function StudentsPage() {
  const crud = useEntityCrud<StudentRow, StudentFormValues, EditStudentFormValues>({
    queryKey: 'students',
    list: async (search) => {
      const { data, error, response } = await apiClient.GET('/students', {
        params: { query: { search, page: 1, pageSize: 20 } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as { items: StudentRow[]; total: number };
    },
    create: async (values) => {
      const { error } = await apiClient.POST('/students', { body: values });
      if (error) throw error;
    },
    update: async (id, values) => {
      const { error } = await apiClient.PATCH('/students/{id}', {
        params: { path: { id } },
        body: values,
      });
      if (error) throw error;
    },
    remove: async (id) => {
      const { error } = await apiClient.DELETE('/students/{id}', {
        params: { path: { id } },
      });
      if (error) throw error;
    },
  });

  const columns = [
    columnHelper.accessor('studentCode', { header: 'Mã số sinh viên' }),
    columnHelper.accessor('fullName', { header: 'Họ tên' }),
    columnHelper.accessor('classCode', {
      header: 'Lớp',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.accessor('cohortYear', {
      header: 'Năm nhập học',
      cell: (info) => info.getValue() ?? '—',
    }),
    columnHelper.display({
      id: 'actions',
      header: 'Thao tác',
      cell: ({ row }) => (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => crud.setEditingItem(row.original)}
          >
            Sửa
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              if (window.confirm(`Xóa sinh viên "${row.original.fullName}"?`)) {
                crud.deleteMutation.mutate(row.original.id);
              }
            }}
          >
            Xóa
          </Button>
        </div>
      ),
    }),
  ];

  return (
    <>
      <div className="mx-auto w-full max-w-4xl px-8 pt-8">
        <Link href="/students/import" className="text-sm underline">
          Nhập từ Excel
        </Link>
      </div>
      <EntityCrudScaffold
        title="Quản lý sinh viên"
        searchPlaceholder="Tìm kiếm..."
        search={crud.search}
        onSearchChange={crud.setSearch}
        columns={columns}
        items={crud.data?.items ?? []}
        isLoading={crud.isLoading}
        error={crud.error}
        errorMessage="Không tải được danh sách sinh viên. Hãy tải lại trang hoặc đăng nhập lại."
        createTitle="Tạo sinh viên mới"
        editTitle={crud.editingItem ? `Sửa sinh viên — ${crud.editingItem.studentCode}` : null}
        isEditing={crud.editingItem !== null}
        createForm={<StudentForm onSubmit={(values) => crud.createMutation.mutate(values)} />}
        editForm={
          crud.editingItem && (
            <EditStudentForm
              defaultValues={{
                fullName: crud.editingItem.fullName,
                dateOfBirth: crud.editingItem.dateOfBirth ?? undefined,
                classCode: crud.editingItem.classCode ?? undefined,
                cohortYear: crud.editingItem.cohortYear ?? undefined,
              }}
              onSubmit={(values) =>
                crud.updateMutation.mutate({ id: crud.editingItem!.id, values })
              }
              onCancel={() => crud.setEditingItem(null)}
            />
          )
        }
      />
    </>
  );
}
```

- [ ] **Step 3: Write the failing import page test**

`apps/web/src/app/(dashboard)/students/import/page.test.tsx`:
```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import StudentsImportPage from './page';

const get = vi.fn();
vi.mock('@/lib/api-client', () => ({
  apiClient: { GET: (...args: unknown[]) => get(...args) },
}));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <StudentsImportPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  get.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: 'job-1' }),
    }),
  );
});

describe('StudentsImportPage', () => {
  it('shows a validation error when submitting without a file', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('button', { name: /tải lên/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/chọn một file/i);
  });

  it('uploads a file and renders the completed result', async () => {
    get.mockResolvedValue({
      data: {
        jobId: 'job-1',
        state: 'completed',
        result: { totalRows: 2, created: 1, updated: 1, failed: 0, errors: [] },
        failedReason: null,
      },
      response: new Response(null, { status: 200 }),
    });

    const user = userEvent.setup();
    renderPage();

    const file = new File(['dummy'], 'students.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    await user.upload(screen.getByLabelText(/chọn file excel/i), file);
    await user.click(screen.getByRole('button', { name: /tải lên/i }));

    await waitFor(() => expect(screen.getByText(/tổng số dòng: 2/i)).toBeInTheDocument());
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/students/import'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('renders per-row errors when the job completes with failures', async () => {
    get.mockResolvedValue({
      data: {
        jobId: 'job-1',
        state: 'completed',
        result: {
          totalRows: 2,
          created: 1,
          updated: 0,
          failed: 1,
          errors: [{ row: 3, studentCode: 'x', message: 'fullName must be a string' }],
        },
        failedReason: null,
      },
      response: new Response(null, { status: 200 }),
    });

    const user = userEvent.setup();
    renderPage();

    const file = new File(['dummy'], 'students.xlsx', { type: 'application/octet-stream' });
    await user.upload(screen.getByLabelText(/chọn file excel/i), file);
    await user.click(screen.getByRole('button', { name: /tải lên/i }));

    await waitFor(() =>
      expect(screen.getByText('fullName must be a string')).toBeInTheDocument(),
    );
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `pnpm --filter web test`
Expected: FAIL — the page doesn't exist yet.

- [ ] **Step 5: Write the import page**

`apps/web/src/app/(dashboard)/students/import/page.tsx`:
```tsx
'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface ImportRowError {
  row: number;
  studentCode: string | null;
  message: string;
}

interface ImportResult {
  totalRows: number;
  created: number;
  updated: number;
  failed: number;
  errors: ImportRowError[];
}

interface ImportJobStatus {
  jobId: string;
  state: string;
  result: ImportResult | null;
  failedReason: string | null;
}

// POST /students/import accepts multipart/form-data, but Task 7's
// controller has no @ApiConsumes/@ApiBody decorators, so the generated
// OpenAPI schema doesn't describe this request body — the typed apiClient
// can't be used here. A plain fetch with credentials: 'include' (the same
// cross-origin cookie workaround api-client.ts documents) does the upload
// instead; polling below still goes through apiClient.
async function uploadImportFile(file: File): Promise<{ jobId: string }> {
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${apiBaseUrl}/students/import`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
  }
  return response.json();
}

export default function StudentsImportPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const statusQuery = useQuery({
    queryKey: ['students-import-status', jobId],
    queryFn: async () => {
      const { data, error, response } = await apiClient.GET('/students/import/{jobId}', {
        params: { path: { jobId: jobId as string } },
      });
      if (error || !response.ok) {
        throw error ?? new Error(`Yêu cầu thất bại (HTTP ${response.status})`);
      }
      return data as unknown as ImportJobStatus;
    },
    enabled: jobId !== null,
    // Keep polling until the job leaves the active/waiting states.
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'completed' || state === 'failed' ? false : 1000;
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setUploadError('Chọn một file .xlsx trước khi tải lên');
      return;
    }

    setUploadError(null);
    setIsUploading(true);
    setJobId(null);
    try {
      const { jobId: newJobId } = await uploadImportFile(file);
      setJobId(newJobId);
    } catch {
      setUploadError('Tải file lên thất bại. Hãy kiểm tra định dạng file và thử lại.');
    } finally {
      setIsUploading(false);
    }
  }

  const result = statusQuery.data?.state === 'completed' ? statusQuery.data.result : null;
  const isProcessing =
    jobId !== null &&
    statusQuery.data?.state !== 'completed' &&
    statusQuery.data?.state !== 'failed';

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Nhập danh sách sinh viên từ Excel</h1>

      <Card>
        <CardHeader>
          <CardTitle>Tải lên file .xlsx</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              aria-label="Chọn file Excel"
              className="text-sm"
            />
            <p className="text-sm text-muted-foreground">
              Cột bắt buộc: student_code, full_name, date_of_birth, class_code, cohort_year.
            </p>
            {uploadError && (
              <p role="alert" className="text-sm text-destructive">
                {uploadError}
              </p>
            )}
            <Button type="submit" disabled={isUploading}>
              {isUploading ? 'Đang tải lên…' : 'Tải lên'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {jobId && (
        <Card>
          <CardHeader>
            <CardTitle>Kết quả</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {isProcessing ? (
              <p className="text-sm text-muted-foreground">Đang xử lý…</p>
            ) : statusQuery.data?.state === 'failed' ? (
              <p role="alert" className="text-sm text-destructive">
                Import thất bại: {statusQuery.data.failedReason ?? 'Lỗi không xác định'}
              </p>
            ) : result ? (
              <>
                <p className="text-sm">
                  Tổng số dòng: {result.totalRows} — Tạo mới: {result.created} — Cập nhật:{' '}
                  {result.updated} — Lỗi: {result.failed}
                </p>
                {result.errors.length > 0 && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Dòng</TableHead>
                        <TableHead>Mã số sinh viên</TableHead>
                        <TableHead>Lỗi</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.map((rowError) => (
                        <TableRow key={rowError.row}>
                          <TableCell>{rowError.row}</TableCell>
                          <TableCell>{rowError.studentCode ?? '—'}</TableCell>
                          <TableCell>{rowError.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter web test`
Expected: PASS — all three `StudentsImportPage` tests green, plus every pre-existing suite (including `StudentsPage`, unaffected by its small link addition) still green.

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml apps/web/src/app/\(dashboard\)/students
git commit -m "feat(web): add Student Excel import UI (WEB-MD-05)"
```

---

## Plan self-review

**Spec coverage.** Every section of `docs/superpowers/specs/2026-08-21-master-data-module-design.md` maps to a task: §3 data model → Tasks 1–6 (one per table, `course_section_enrollments` folded into Task 6 as designed); §4 backend architecture (sub-module shape, decorated response DTOs, `MasterDataModule` aggregator) → Tasks 1–6; §5 Excel import → Task 7; §6 frontend architecture (shared scaffold, enrollment panel, import UI) → Tasks 8, 13, 14; §7 auth/RBAC → no dedicated task, correctly, since every controller in Tasks 1–7 already applies `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('admin')` inline, matching "no changes" in the spec; §8 testing bar (e2e per CRUD endpoint, one soft-delete-guard `23503` demonstration, a real BullMQ worker test, component tests for the scaffold and each form) → satisfied respectively by Tasks 1–7's e2e suites, Task 1's guard test, Task 7's real-queue e2e test, and Tasks 8–14's component tests. §9's three deferred decisions (operator/lecturer read access, lecturer Excel import, `lecturer_subject_assignments`) are correctly not tasks — they're explicitly out of scope.

**Placeholder scan.** No `TBD`/`TODO`/"add validation"/"similar to Task N" placeholders — every step has complete, runnable code. The two spots that look like forward references (Task 11 → Task 14's import link; Task 12 → Task 13's enrollment link) both name the exact task that resolves them and are called out explicitly rather than left implicit.

**Type consistency check.** Traced the field names/types that cross task boundaries: `SubjectListItemDto`'s `{ id, code, name, credits: number | null, description: string | null }` (Task 1) matches `SubjectRow` in Task 8 exactly. `AcademicTermListItemDto`'s `startsOn`/`endsOn` as plain date strings (Task 2) matches `AcademicTermRow` in Task 9. `CourseSectionListItemDto`'s nested `subject`/`academicTerm` ref shape (Task 5) matches `CourseSectionRow` in Task 12 and the enrollment page's own inline types in Task 13. `StudentsService.upsertByCode()`'s `{ id, created }` return (added to Task 4 alongside the rest of the service) matches how Task 7's processor destructures it. `CourseSectionsService.assertActive()` (added to Task 5) is the exact method Task 6's `CourseSectionEnrollmentsService` injects and calls. `ImportJobStatusDto` (Task 7, revised to carry `@ApiOkResponse`) matches the `ImportJobStatus` shape Task 14 casts its response to. No mismatched names found.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-21-master-data-module.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
