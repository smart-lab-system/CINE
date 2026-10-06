import type { ParsedSemester } from './semester-name';

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
  }
}

export interface CliArgs {
  command: 'snapshot' | 'backfill' | 'verify';
  databaseUrl?: string;
  confirmHost?: string;
  out?: string;
  before?: string;
  dryRun: boolean;
  defaultSemester?: ParsedSemester;
  merges: Array<{ from: string; into: string }>;
  inactiveRooms: string[];
  expect: Record<string, number>;
}

const COMMANDS = ['snapshot', 'backfill', 'verify'] as const;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

export function parseCliArgs(argv: string[]): CliArgs {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command as (typeof COMMANDS)[number])) {
    throw new CliUsageError(`Lệnh phải là một trong: ${COMMANDS.join(', ')}.`);
  }
  const args: CliArgs = { command: command as CliArgs['command'], dryRun: false, merges: [], inactiveRooms: [], expect: {} };
  for (let i = 0; i < rest.length; i += 1) {
    const flag = rest[i];
    const value = (): string => {
      const next = rest[(i += 1)];
      if (next === undefined || next.startsWith('--')) throw new CliUsageError(`${flag} cần một giá trị.`);
      return next;
    };
    switch (flag) {
      case '--database-url':
        args.databaseUrl = value();
        break;
      case '--confirm-host':
        args.confirmHost = value();
        break;
      case '--out':
        args.out = value();
        break;
      case '--before':
        args.before = value();
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--default-semester': {
        const match = /^(\d{4}):([123])$/.exec(value());
        if (!match) throw new CliUsageError('--default-semester phải có dạng YYYY:T (T = 1, 2 hoặc 3), vd 2026:1.');
        args.defaultSemester = { year: Number(match[1]), term: Number(match[2]) as 1 | 2 | 3 };
        break;
      }
      case '--merge': {
        const text = value();
        const at = text.indexOf('=');
        if (at <= 0 || at === text.length - 1) throw new CliUsageError('--merge phải có dạng NGUỒN=ĐÍCH (theo `class.name`; tên không chứa dấu "=").');
        args.merges.push({ from: text.slice(0, at), into: text.slice(at + 1) });
        break;
      }
      case '--inactive-room':
        args.inactiveRooms.push(value());
        break;
      case '--expect': {
        const match = /^([a-z_][a-z0-9_]*)=(-?\d+)$/.exec(value());
        if (!match) throw new CliUsageError('--expect phải có dạng bảng=số (số nguyên, có thể âm), vd enrollment=-9.');
        args.expect[match[1]] = Number(match[2]);
        break;
      }
      default:
        throw new CliUsageError(`Cờ lạ: ${flag}`);
    }
  }
  return args;
}

/**
 * Chốt chặn chạy nhầm đích. `apps/api/.env` trỏ Supabase từ xa (memory `cine-migration-hits-supabase`), nên một lệnh ghi chạy với `.env` mặc định là
 * ghi vào DB thật. Máy nào không phải local phải được XÁC NHẬN bằng cách gõ lại đúng host — gõ sai hay không gõ đều từ chối.
 */
export function assertTargetConfirmed(
  databaseUrl: string | undefined,
  confirmHost: string | undefined,
): { host: string; database: string } {
  if (!databaseUrl) throw new CliUsageError('Thiếu DATABASE_URL (hoặc --database-url).');
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new CliUsageError('DATABASE_URL không đọc được thành URL.');
  }
  const host = url.hostname;
  const database = url.pathname.replace(/^\//, '');
  if (!LOCAL_HOSTS.has(host) && confirmHost !== host) {
    throw new CliUsageError(
      `Đích ${host}/${database} KHÔNG phải máy local. Nếu đúng là nơi muốn chạy, thêm --confirm-host ${host}. ` +
        '(apps/api/.env trỏ Supabase từ xa — kiểm tra kỹ trước khi xác nhận.)',
    );
  }
  return { host, database };
}
