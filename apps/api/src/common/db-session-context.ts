import { QueryRunner } from 'typeorm';

export type StatusChangeContext = {
  userId: string;
  commandId: string;
  reason: string;
};

/**
 * Sets transaction-local GUCs that status-history triggers read
 * (`app.actor_type`, `app.current_user_id`, `app.command_id`,
 * `app.status_change_reason`). Call inside an open transaction before the
 * status UPDATE. The third `set_config` argument is `true` (local to this
 * transaction) so the values do not leak onto the pooled connection.
 */
export async function setStatusChangeContext(
  qr: Pick<QueryRunner, 'query'>,
  ctx: StatusChangeContext,
): Promise<void> {
  await qr.query(
    `SELECT
       set_config('app.actor_type', $1, true),
       set_config('app.current_user_id', $2, true),
       set_config('app.command_id', $3, true),
       set_config('app.status_change_reason', $4, true)`,
    ['user', ctx.userId, ctx.commandId, ctx.reason],
  );
}
