import { pipelineFor } from './pipeline';

describe('pipelineFor (§14.1, T-PIPE-1)', () => {
  it('bài code khai cpp hay python → investigator', () => {
    expect(pipelineFor({ deliverableType: 'code_project', language: 'cpp' })).toBe('investigator');
    expect(pipelineFor({ deliverableType: 'code_project', language: 'python' })).toBe('investigator');
  });

  it('bài code CHƯA khai ngôn ngữ → one_shot; hệ thống không đoán từ đuôi file', () => {
    expect(pipelineFor({ deliverableType: 'code_project', language: null })).toBe('one_shot');
  });

  it('bài code khai java hay node → one_shot — sandbox chỉ chạy cpp, python (§3.5)', () => {
    expect(pipelineFor({ deliverableType: 'code_project', language: 'java' })).toBe('one_shot');
    expect(pipelineFor({ deliverableType: 'code_project', language: 'node' })).toBe('one_shot');
  });

  it('bài tự luận, ảnh → one_shot', () => {
    expect(pipelineFor({ deliverableType: 'document', language: null })).toBe('one_shot');
    expect(pipelineFor({ deliverableType: 'image', language: null })).toBe('one_shot');
  });
});
