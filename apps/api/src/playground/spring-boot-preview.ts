import { existsSync } from 'node:fs';
import { readFile, writeFile, cp, access, readdir } from 'node:fs/promises';
import { basename, join, relative, sep } from 'node:path';
import { spawnCli, type DockerCli } from '../sandbox-worker/docker-cli';

export interface SpringPreviewStart {
  composeProject: string;
  hostPort: number;
  previewUrl: string;
}

function previewHost(): string {
  return process.env.PLAYGROUND_PREVIEW_HOST ?? '127.0.0.1';
}

/**
 * nest emit JS → `dist/src/playground/`, assets mặc định → `dist/playground/`.
 * Thử vài vị trí để không phụ thuộc layout dist.
 */
function templateDir(): string {
  const leaf = join('templates', 'spring-boot-mariadb');
  const candidates = [
    join(__dirname, leaf),
    // dist/src/playground → dist/playground/templates/...
    join(__dirname, '..', '..', '..', 'playground', leaf),
    join(process.cwd(), 'src', 'playground', leaf),
    join(process.cwd(), 'dist', 'src', 'playground', leaf),
    join(process.cwd(), 'dist', 'playground', leaf),
  ];
  const found = candidates.find((p) => existsSync(join(p, 'Dockerfile')));
  if (!found) {
    throw new Error(
      `không tìm thấy spring-boot template Dockerfile. Đã thử:\n${candidates.join('\n')}`,
    );
  }
  return found;
}

/** Ghi Dockerfile + compose vào workDir bài. */
export async function materializeSpringTemplate(workDir: string): Promise<void> {
  const tpl = templateDir();
  await cp(join(tpl, 'Dockerfile'), join(workDir, 'Dockerfile'));
  await cp(join(tpl, 'docker-compose.yml'), join(workDir, 'docker-compose.yml'));
}

/**
 * Đổi localhost → db trong application.properties (nếu có).
 * Spring vẫn ưu tiên env SPRING_DATASOURCE_* từ compose.
 */
export async function patchDatasourceLocalhost(workDir: string): Promise<void> {
  const propsPath = join(workDir, 'src', 'main', 'resources', 'application.properties');
  try {
    await access(propsPath);
  } catch {
    return;
  }
  let text = await readFile(propsPath, 'utf8');
  text = text
    .replace(/jdbc:mariadb:\/\/localhost(?::\d+)?/gi, 'jdbc:mariadb://db:3306')
    .replace(/jdbc:mysql:\/\/localhost(?::\d+)?/gi, 'jdbc:mysql://db:3306');
  await writeFile(propsPath, text, 'utf8');
}

/** Tìm .sql dưới src/main/resources → classpath:… */
export async function discoverResourceSql(workDir: string): Promise<{
  schemaLocations: string[];
  dataLocations: string[];
}> {
  const root = join(workDir, 'src', 'main', 'resources');
  if (!existsSync(root)) return { schemaLocations: [], dataLocations: [] };

  const relFiles: string[] = [];
  async function walk(dir: string): Promise<void> {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (e.name.toLowerCase().endsWith('.sql')) {
        relFiles.push(relative(root, abs).split(sep).join('/'));
      }
    }
  }
  await walk(root);

  const schemaLocations: string[] = [];
  const dataLocations: string[] = [];
  for (const rel of relFiles) {
    const name = basename(rel).toLowerCase();
    const cp = `classpath:${rel}`;
    if (name.startsWith('schema')) schemaLocations.push(cp);
    else dataLocations.push(cp);
  }
  return { schemaLocations, dataLocations };
}

/**
 * Gắn spring.sql.init.* trỏ đúng file .sql trong project (vd. sql/data.sql).
 * Cần defer vì ddl-auto tạo bảng trước, rồi mới INSERT.
 */
export async function patchSqlInitForDocker(workDir: string): Promise<void> {
  const { schemaLocations, dataLocations } = await discoverResourceSql(workDir);
  if (schemaLocations.length === 0 && dataLocations.length === 0) return;

  const propsPath = join(workDir, 'src', 'main', 'resources', 'application.properties');
  let text = '';
  try {
    text = await readFile(propsPath, 'utf8');
  } catch {
    text = '';
  }
  if (text.includes('# playground: SQL init')) return;

  const extra = [
    '',
    '# playground: SQL init (sau Hibernate ddl)',
    'spring.jpa.defer-datasource-initialization=true',
    'spring.sql.init.mode=always',
  ];
  if (schemaLocations.length > 0) {
    extra.push(`spring.sql.init.schema-locations=${schemaLocations.join(',')}`);
  }
  if (dataLocations.length > 0) {
    extra.push(`spring.sql.init.data-locations=${dataLocations.join(',')}`);
  }
  await writeFile(propsPath, `${text.trimEnd()}\n${extra.join('\n')}\n`, 'utf8');
}

function composeProjectName(runId: string): string {
  // Docker Compose project: [a-z0-9][a-z0-9_-]*
  return `pg${runId.replace(/-/g, '').slice(0, 24)}`;
}

async function readAppHostPort(docker: DockerCli, project: string): Promise<number | null> {
  const portOut = await docker.run(
    ['compose', '-p', project, 'port', 'app', '8080'],
    { maxStdoutBytes: 1_024, wallMs: 30_000 },
  );
  const text = `${portOut.stdout.toString('utf8')}\n${portOut.stderr}`;
  const m = text.match(/:(\d+)\s*$/m);
  if (m) return Number(m[1]);
  return null;
}

/**
 * Build + up Spring Boot + MariaDB. Lần đầu có thể vài phút (Maven download).
 */
export async function startSpringBootPreview(opts: {
  workDir: string;
  runId: string;
  docker?: DockerCli;
}): Promise<SpringPreviewStart> {
  const docker = opts.docker ?? spawnCli();
  const project = composeProjectName(opts.runId);

  await materializeSpringTemplate(opts.workDir);
  await patchDatasourceLocalhost(opts.workDir);
  await patchSqlInitForDocker(opts.workDir);

  const up = await docker.run(
    [
      'compose',
      '-p',
      project,
      '-f',
      join(opts.workDir, 'docker-compose.yml'),
      '--project-directory',
      opts.workDir,
      'up',
      '--build',
      '-d',
      '--remove-orphans',
    ],
    { maxStdoutBytes: 512 * 1024, wallMs: 12 * 60_000 },
  );

  if (up.code !== 0) {
    await stopSpringBootPreview(project, docker).catch(() => undefined);
    throw new Error(
      `docker compose up thất bại: ${up.stderr || up.stdout.toString('utf8').slice(-2000)}`,
    );
  }

  for (let i = 0; i < 60; i++) {
    const hostPort = await readAppHostPort(docker, project);
    if (hostPort) {
      return {
        composeProject: project,
        hostPort,
        previewUrl: `http://${previewHost()}:${hostPort}/`,
      };
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  const logs = await docker.run(
    ['compose', '-p', project, '-f', join(opts.workDir, 'docker-compose.yml'), '--project-directory', opts.workDir, 'logs', '--no-color', '--tail', '80'],
    { maxStdoutBytes: 64 * 1024, wallMs: 30_000 },
  );
  await stopSpringBootPreview(project, docker).catch(() => undefined);
  throw new Error(
    `không lấy được port app:8080 — logs:\n${logs.stdout.toString('utf8') || logs.stderr}`,
  );
}

export async function stopSpringBootPreview(
  composeProject: string,
  docker?: DockerCli,
): Promise<void> {
  const cli = docker ?? spawnCli();
  await cli.run(
    ['compose', '-p', composeProject, 'down', '-v', '--remove-orphans'],
    { maxStdoutBytes: 16_024, wallMs: 120_000 },
  ).catch(() => undefined);
}
