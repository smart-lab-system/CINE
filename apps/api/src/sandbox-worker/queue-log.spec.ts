import { EventEmitter } from 'node:events';
import { logWorkerEvents } from './queue-log';

describe('logWorkerEvents — worker không được hỏng im lặng', () => {
  const setup = () => {
    const lines: string[] = [];
    const worker = new EventEmitter();
    logWorkerEvents(worker, 'exec (eval)', (l) => lines.push(l), { now: () => 0 });
    return { lines, worker };
  };

  it('lỗi kết nối → một dòng mang tên hàng đợi và nguồn; lặp lại thì gộp', () => {
    const { lines, worker } = setup();
    worker.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:6390'));
    worker.emit('error', new Error('connect ECONNREFUSED 127.0.0.1:6390'));
    expect(lines).toEqual(['LỖI hàng đợi exec (eval): connect ECONNREFUSED 127.0.0.1:6390']);
  });

  it('job hỏng (handler ném) → ghi jobId và lý do; mỗi job một dòng', () => {
    const { lines, worker } = setup();
    worker.emit('failed', { id: 'j-1' }, new Error('khe đo rò'));
    worker.emit('failed', { id: 'j-2' }, new Error('khe đo rò'));
    worker.emit('failed', undefined, new Error('mất job'));
    expect(lines).toEqual([
      'LỖI job exec (eval) j-1: khe đo rò',
      'LỖI job exec (eval) j-2: khe đo rò',
      'LỖI job exec (eval) ?: mất job',
    ]);
  });

  it('có listener `error` — BullMQ không còn tự console.error lỗi thô', () => {
    const { worker } = setup();
    expect(worker.listenerCount('error')).toBe(1);
  });
});
