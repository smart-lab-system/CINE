import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

/**
 * Entity lệch migration không nổ lúc khởi động — nó nổ ở truy vấn đầu tiên chạm cột đó
 * (`column … does not exist`), thường là trong worker, lúc đang chấm. Test này hỏi DB cho MỌI
 * cột của MỌI entity đã đăng ký.
 */
describe('Entity khớp schema (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    ds = app.get(DataSource);
  });
  afterAll(async () => app.close());

  it('mọi cột khai trong entity đều có trong DB, và nullable khớp', async () => {
    const rows: { table_name: string; column_name: string; is_nullable: 'YES' | 'NO' }[] = await ds.query(
      `SELECT table_name, column_name, is_nullable FROM information_schema.columns WHERE table_schema = 'examcollect'`,
    );
    const db = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.is_nullable === 'YES']));
    const problems: string[] = [];
    for (const meta of ds.entityMetadatas) {
      for (const col of meta.columns) {
        const key = `${meta.tableName}.${col.databaseName}`;
        if (!db.has(key)) problems.push(`${key}: không có trong DB`);
        else if (db.get(key) !== col.isNullable) problems.push(`${key}: entity nullable=${col.isNullable}, DB nullable=${db.get(key)}`);
      }
    }
    expect(problems).toEqual([]);
  });
});
