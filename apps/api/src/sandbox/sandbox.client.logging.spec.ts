import { EventEmitter } from 'node:events';
import { createSandboxClient } from './sandbox.client';

// Không Redis: Queue/QueueEvents thay bằng EventEmitter ghi lại chính nó — thứ đang kiểm là
// dây nối log, không phải BullMQ. `add` trả một job mà worker "trả lời" sai schema.
jest.mock('bullmq', () => {
  const { EventEmitter: Emitter } = jest.requireActual<typeof import('node:events')>('node:events');
  const instances: { name: string; kind: string; emitter: EventEmitter }[] = [];
  const make = (kind: string) =>
    class extends Emitter {
      constructor(name: string) {
        super();
        instances.push({ name, kind, emitter: this });
      }
      async add() {
        return { waitUntilFinished: async () => ({ rác: true }), remove: async () => undefined };
      }
      async close() {}
    };
  return { Queue: make('queue'), QueueEvents: make('events'), __instances: instances };
});
const { __instances: instances } = jest.requireMock<{ __instances: { name: string; kind: string; emitter: EventEmitter }[] }>('bullmq');

const inline = (content: string) => ({ kind: 'inline' as const, content });

describe('createSandboxClient — log của phía API', () => {
  beforeEach(() => instances.splice(0));

  it('lỗi kết nối của cả bốn đầu (hai hàng đợi, hai luồng sự kiện) → vào log, kèm tên đầu và prefix', async () => {
    const lines: string[] = [];
    const { close } = createSandboxClient({ redisUrl: 'redis://localhost:6390', prefix: 'cine-sbx-eval', log: (l) => lines.push(l) });
    expect(instances).toHaveLength(4);
    for (const i of instances) expect(i.emitter.listenerCount('error')).toBe(1);
    instances.find((i) => i.kind === 'events' && i.name === 'sandbox-exec')!.emitter.emit('error', new Error('ECONNREFUSED'));
    expect(lines).toEqual(['sandbox: lỗi kết nối sandbox-exec/sự kiện (cine-sbx-eval): ECONNREFUSED']);
    await close();
  });

  it('kết quả sai schema từ worker → unavailable VÀ một dòng cảnh báo (trước đây `warn` không được nối)', async () => {
    const lines: string[] = [];
    const { client, close } = createSandboxClient({ redisUrl: 'redis://localhost:6390', log: (l) => lines.push(l) });
    const r = await client.exec({
      language: 'cpp',
      program: { files: [{ path: 'main.cpp', ref: inline('int main(){}') }], driver: null, entry: null },
      cases: [{ name: 'a', group: null, stdin: inline(''), expected: inline('') }],
      budgetMs: 1_000,
    });
    expect(r.unavailable).toMatch(/sai schema/);
    expect(lines).toEqual([expect.stringMatching(/^sandbox exec .*: kết quả sai schema/)]);
    await close();
  });
});
