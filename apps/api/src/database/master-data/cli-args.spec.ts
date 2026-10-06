import { assertTargetConfirmed, CliUsageError, parseCliArgs } from './cli-args';

describe('parseCliArgs', () => {
  it('backfill đầy đủ', () => {
    const args = parseCliArgs([
      'backfill', '--dry-run', '--default-semester', '2026:1',
      '--merge', 'Hệ Quản Trị Dữ Liệu MongoDB=DHKTPM18ATT', '--inactive-room', 'TEST-KHONG-PHONG',
      '--database-url', 'postgresql://u:p@db.example.com:5432/x', '--confirm-host', 'db.example.com',
    ]);
    expect(args).toEqual({
      command: 'backfill', dryRun: true, defaultSemester: { year: 2026, term: 1 },
      merges: [{ from: 'Hệ Quản Trị Dữ Liệu MongoDB', into: 'DHKTPM18ATT' }], inactiveRooms: ['TEST-KHONG-PHONG'], expect: {},
      databaseUrl: 'postgresql://u:p@db.example.com:5432/x', confirmHost: 'db.example.com',
    });
  });

  it('verify với --before và nhiều --expect (số âm được)', () => {
    const args = parseCliArgs(['verify', '--before', 'before.json', '--expect', 'enrollment=-9', '--expect', 'student=54']);
    expect(args.command).toBe('verify');
    expect(args.before).toBe('before.json');
    expect(args.expect).toEqual({ enrollment: -9, student: 54 });
  });

  it.each([
    [[], /Lệnh phải là/],
    [['lam-gi-do'], /Lệnh phải là/],
    [['backfill', '--khong-co'], /Cờ lạ/],
    [['backfill', '--merge'], /cần một giá trị/],
    [['backfill', '--merge', '--dry-run'], /cần một giá trị/], // một cờ đứng ngay sau cờ cần giá trị không được nuốt làm giá trị
    [['backfill', '--merge', 'khong-co-dau-bang'], /NGUỒN=ĐÍCH/],
    [['backfill', '--default-semester', '2026-1'], /YYYY:T/],
    [['backfill', '--default-semester', '2026:4'], /YYYY:T/],
    [['verify', '--expect', 'enrollment'], /bảng=số/],
    [['verify', '--expect', 'enrollment=abc'], /bảng=số/],
    [['verify', '--expect', 'bảng-có-dấu=1'], /bảng=số/],
  ])('đối số sai %j → CliUsageError', (argv, message) => {
    expect(() => parseCliArgs(argv as string[])).toThrow(CliUsageError);
    expect(() => parseCliArgs(argv as string[])).toThrow(message);
  });
});

describe('assertTargetConfirmed — Review Focus 4: không chạy nhầm đích', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])('máy local (%s) không cần xác nhận', (host) => {
    expect(assertTargetConfirmed(`postgresql://u:p@${host}:5442/examcollect`, undefined).database).toBe('examcollect');
  });

  it('máy từ xa mà thiếu --confirm-host → từ chối, nêu host và cách xác nhận', () => {
    const attempt = () => assertTargetConfirmed('postgresql://u:p@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres', undefined);
    expect(attempt).toThrow(CliUsageError);
    expect(attempt).toThrow(/--confirm-host aws-0-ap-southeast-1\.pooler\.supabase\.com/);
  });

  it('máy từ xa mà --confirm-host SAI → từ chối (xác nhận phải đúng host đang trỏ tới)', () => {
    expect(() => assertTargetConfirmed('postgresql://u:p@db.example.com:5432/x', 'db.other.com')).toThrow(CliUsageError);
  });

  it('máy từ xa với --confirm-host đúng → cho chạy và trả host/database để in ra', () => {
    expect(assertTargetConfirmed('postgresql://u:p@db.example.com:5432/postgres', 'db.example.com')).toEqual({ host: 'db.example.com', database: 'postgres' });
  });

  it('thiếu URL hoặc URL hỏng → CliUsageError', () => {
    expect(() => assertTargetConfirmed(undefined, undefined)).toThrow(/DATABASE_URL/);
    expect(() => assertTargetConfirmed('không phải url', undefined)).toThrow(/URL/);
  });
});
