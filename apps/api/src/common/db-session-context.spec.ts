import { setStatusChangeContext } from './db-session-context';

describe('setStatusChangeContext', () => {
  it('issues transaction-local set_config for actor, user, command, and reason', async () => {
    const query = jest.fn().mockResolvedValue([]);

    await setStatusChangeContext(
      { query },
      {
        userId: '11111111-1111-1111-1111-111111111111',
        commandId: '22222222-2222-2222-2222-222222222222',
        reason: 'published',
      },
    );

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("set_config('app.actor_type'");
    expect(sql).toContain("set_config('app.current_user_id'");
    expect(sql).toContain("set_config('app.command_id'");
    expect(sql).toContain("set_config('app.status_change_reason'");
    expect(sql).toMatch(/true\s*\)/);
    expect(params).toEqual([
      'user',
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      'published',
    ]);
  });
});
