import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverResourceSql, patchSqlInitForDocker } from './spring-boot-preview';

describe('discoverResourceSql / patchSqlInitForDocker', () => {
  it('nhận sql/data.sql → classpath:sql/data.sql', async () => {
    const root = await mkdtemp(join(tmpdir(), 'cine-sql-'));
    const res = join(root, 'src', 'main', 'resources', 'sql');
    await mkdir(res, { recursive: true });
    await writeFile(join(res, 'data.sql'), 'INSERT INTO t VALUES (1);\n', 'utf8');
    await writeFile(join(root, 'src', 'main', 'resources', 'schema.sql'), 'CREATE TABLE t(id INT);\n', 'utf8');

    const found = await discoverResourceSql(root);
    expect(found.dataLocations).toEqual(['classpath:sql/data.sql']);
    expect(found.schemaLocations).toEqual(['classpath:schema.sql']);

    await patchSqlInitForDocker(root);
    const props = await import('node:fs/promises').then((fs) =>
      fs.readFile(join(root, 'src', 'main', 'resources', 'application.properties'), 'utf8'),
    );
    expect(props).toContain('spring.jpa.defer-datasource-initialization=true');
    expect(props).toContain('spring.sql.init.data-locations=classpath:sql/data.sql');
    expect(props).toContain('spring.sql.init.schema-locations=classpath:schema.sql');
  });
});
