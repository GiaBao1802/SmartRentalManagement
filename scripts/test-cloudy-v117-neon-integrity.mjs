import pg from 'pg';

const targetValue = process.env.CLOUDY_V117_TEST_DATABASE_URL;
const expectedHost = process.env.CLOUDY_V117_EXPECTED_HOST;
const parentHost = process.env.CLOUDY_V117_PARENT_HOST;
const branchName = process.env.CLOUDY_V117_BRANCH_NAME;
const branchId = process.env.CLOUDY_V117_BRANCH_ID;
const expiresAt = process.env.CLOUDY_V117_EXPIRES_AT;
if (!targetValue || !expectedHost || !parentHost || branchName !== 'goctro-cloudy-v117-test-20261029' || branchId !== 'br-small-tree-a1mhsspy' || expiresAt !== '2026-11-05T00:00:00Z') {
  throw new Error('Set the exact selected V1.17 rehearsal branch and its connection privately in the environment.');
}
const target = new URL(targetValue);
if (target.hostname !== expectedHost || !target.hostname.endsWith('.aws.neon.tech') || target.pathname !== '/neondb' || target.hostname === parentHost) {
  throw new Error('Refusing Cloudy V1.17 integrity checks outside the selected disposable Neon branch.');
}

const client = new pg.Client({ connectionString: targetValue });
await client.connect();
try {
  const identity = await client.query('SELECT current_database() AS database, current_setting($1) AS version', ['server_version_num']);
  if (identity.rows[0].database !== 'neondb' || Number(identity.rows[0].version) < 180000) throw new Error('Expected PostgreSQL 18 neondb on the disposable test branch.');
  const account = await client.query("SELECT account_id FROM public.accounts WHERE role = 'admin' ORDER BY account_id LIMIT 1");
  if (!account.rows[0]) throw new Error('The rehearsal fixture needs one existing account for the temporary reviewer foreign key.');

  await client.query('BEGIN');
  try {
    const digest = 'f'.repeat(64);
    const feedback = await client.query(`
      INSERT INTO public.cloudy_unresolved_feedback
        (message_digest, sanitized_message, source, predicted_intent, model_version, first_seen_at, last_seen_at, updated_at)
      VALUES ($1, 'temporary integrity probe', 'resident_cloudy_chat', 'help', 'test', now() - interval '31 days', now() - interval '31 days', now())
      RETURNING feedback_id`, [digest]);
    const feedbackId = feedback.rows[0].feedback_id;
    const review = await client.query(`
      INSERT INTO public.cloudy_unresolved_feedback_reviews
        (feedback_id, reviewer_account_id, action, previous_status, next_status)
      VALUES ($1, $2, 'status_changed', 'new', 'reviewed') RETURNING review_id`, [feedbackId, account.rows[0].account_id]);
    const reviewId = review.rows[0].review_id;

    for (const [label, sql] of [
      ['update', 'UPDATE public.cloudy_unresolved_feedback_reviews SET next_status = \'no_action\' WHERE review_id = $1'],
      ['delete', 'DELETE FROM public.cloudy_unresolved_feedback_reviews WHERE review_id = $1'],
      ['parent delete without cleanup scope', 'DELETE FROM public.cloudy_unresolved_feedback WHERE feedback_id = $1'],
    ]) {
      await client.query('SAVEPOINT integrity_probe');
      let blocked = false;
      try { await client.query(sql, [label === 'parent delete without cleanup scope' ? feedbackId : reviewId]); }
      catch (error) {
        if (error?.code !== '23514') throw error;
        blocked = true;
      }
      await client.query('ROLLBACK TO SAVEPOINT integrity_probe');
      await client.query('RELEASE SAVEPOINT integrity_probe');
      if (!blocked) throw new Error(`Append-only guard did not reject: ${label}.`);
    }

    await client.query("SELECT set_config('goctro.cloudy_feedback_retention_cleanup', 'on', true)");
    const removed = await client.query('DELETE FROM public.cloudy_unresolved_feedback WHERE feedback_id = $1 RETURNING feedback_id', [feedbackId]);
    const remaining = await client.query('SELECT count(*)::int AS count FROM public.cloudy_unresolved_feedback_reviews WHERE review_id = $1', [reviewId]);
    if (removed.rowCount !== 1 || remaining.rows[0].count !== 0) throw new Error('Authorized retention cleanup did not cascade the temporary review audit.');
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
  console.log(`V1.17 audit/retention SQL integrity PASS on ${branchName}; unauthorized audit mutations blocked; transaction-scoped cleanup cascade verified; all probe rows rolled back.`);
} finally {
  await client.end();
}
