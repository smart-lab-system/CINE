import { describe, expect, it } from 'vitest';
import {
  encodeWireMessage,
  parseWireMessage,
  type LabCommandRequest,
  type PromptIdentifyPayload,
} from './lan-protocol';

describe('PROMPT_IDENTIFY wire', () => {
  it('round-trips command with sessionCode payload', () => {
    const payload: PromptIdentifyPayload = {
      sessionCode: 'Q7X4KD',
      examLabel: 'Giữa kỳ · CTDL',
    };
    const request: LabCommandRequest = {
      requestId: 'req-1',
      command: 'PROMPT_IDENTIFY',
      payload,
      issuedAt: '2026-11-28T00:00:00.000Z',
    };
    const raw = encodeWireMessage({ type: 'command', request });
    const parsed = parseWireMessage(raw.trimEnd());
    expect(parsed?.type).toBe('command');
    if (parsed?.type !== 'command') return;
    expect(parsed.request.command).toBe('PROMPT_IDENTIFY');
    expect(parsed.request.payload).toEqual(payload);
  });

  it('round-trips CANCEL_IDENTIFY', () => {
    const request: LabCommandRequest = {
      requestId: 'req-2',
      command: 'CANCEL_IDENTIFY',
      issuedAt: '2026-11-28T00:00:00.000Z',
    };
    const raw = encodeWireMessage({ type: 'command', request });
    const parsed = parseWireMessage(raw.trimEnd());
    expect(parsed?.type).toBe('command');
    if (parsed?.type !== 'command') return;
    expect(parsed.request.command).toBe('CANCEL_IDENTIFY');
  });
});

describe('StudentNode PROMPT_IDENTIFY handler', () => {
  it('normalizes sessionCode and emits identifyRequired', async () => {
    const { StudentNode } = await import('./student-node');
    const node = new StudentNode('machine-1', '', 'Chưa đăng nhập');
    const events: Array<{ sessionCode: string; examLabel?: string }> = [];
    node.on('identifyRequired', (e) => events.push(e));

    const responses: unknown[] = [];
    const sock = {
      write: (buf: string) => {
        const msg = parseWireMessage(buf.trimEnd());
        if (msg?.type === 'command_response') responses.push(msg.response);
      },
      destroyed: false,
    };

    await (
      node as unknown as {
        handleCommand: (
          s: { write: (b: string) => void; destroyed: boolean },
          r: LabCommandRequest,
        ) => Promise<void>;
      }
    ).handleCommand(sock, {
      requestId: 'r1',
      command: 'PROMPT_IDENTIFY',
      payload: { sessionCode: 'ab12cd', examLabel: 'Ca 1' },
      issuedAt: new Date().toISOString(),
    });

    expect(events).toEqual([{ sessionCode: 'AB12CD', examLabel: 'Ca 1' }]);
    expect(responses[0]).toMatchObject({ ok: true, requestId: 'r1' });
  });

  it('rejects PROMPT_IDENTIFY without sessionCode', async () => {
    const { StudentNode } = await import('./student-node');
    const node = new StudentNode('machine-1', '', 'Chưa đăng nhập');
    const events: unknown[] = [];
    node.on('identifyRequired', (e) => events.push(e));

    const responses: unknown[] = [];
    const sock = {
      write: (buf: string) => {
        const msg = parseWireMessage(buf.trimEnd());
        if (msg?.type === 'command_response') responses.push(msg.response);
      },
      destroyed: false,
    };

    await (
      node as unknown as {
        handleCommand: (
          s: { write: (b: string) => void; destroyed: boolean },
          r: LabCommandRequest,
        ) => Promise<void>;
      }
    ).handleCommand(sock, {
      requestId: 'r2',
      command: 'PROMPT_IDENTIFY',
      payload: {},
      issuedAt: new Date().toISOString(),
    });

    expect(events).toHaveLength(0);
    expect(responses[0]).toMatchObject({ ok: false, requestId: 'r2' });
  });
});
