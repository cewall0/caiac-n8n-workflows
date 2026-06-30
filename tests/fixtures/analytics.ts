import { db } from '../helpers/db'

function currentPeriod(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Seeds deterministic analytics rows tagged with _source = 'test-analytics'
 * so they can be found and deleted without touching real data.
 *
 * Seeds:
 * - 10 leads (6 with qualification_score >= 7, 4 with crm_synced_at)
 * - 3 automation_runs (review_request) against the first 3 leads
 * - ai_usage row: 50 requests for current month
 */
export async function seedAnalyticsData(clientId: string): Promise<void> {
  const period = currentPeriod()

  await db.query(
    `INSERT INTO caiac.leads
       (client_id, source_channel, lifecycle_stage, qualification_score, crm_synced_at, intake_data)
     VALUES
       ($1, 'tally', 'intake', 9, NOW(),  '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 8, NOW(),  '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 7, NOW(),  '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 8, NOW(),  '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 7, NULL,   '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 9, NULL,   '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 4, NULL,   '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 3, NULL,   '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 2, NULL,   '{"_source":"test-analytics"}'::jsonb),
       ($1, 'tally', 'intake', 1, NULL,   '{"_source":"test-analytics"}'::jsonb)`,
    [clientId],
  )

  const leads = await db.query<{ id: string }>(
    `SELECT id FROM caiac.leads
     WHERE client_id = $1 AND intake_data->>'_source' = 'test-analytics'
     ORDER BY created_at
     LIMIT 3`,
    [clientId],
  )

  if (leads.length >= 3) {
    await db.query(
      `INSERT INTO caiac.automation_runs
         (lead_id, automation_type, sent_at, responded_at, outcome)
       VALUES
         ($1, 'review_request', NOW() - interval '2 days', NOW() - interval '1 day', 'positive'),
         ($2, 'review_request', NOW() - interval '3 days', NOW() - interval '2 days', 'neutral'),
         ($3, 'review_request', NOW() - interval '1 day',  NULL,                      NULL)`,
      [leads[0].id, leads[1].id, leads[2].id],
    )
  }

  await db.query(
    `INSERT INTO caiac.ai_usage (client_id, period, request_count, last_used_at)
     VALUES ($1, $2, 50, NOW())
     ON CONFLICT (client_id, period) DO UPDATE SET request_count = 50, last_used_at = NOW()`,
    [clientId, period],
  )
}

/**
 * Removes all rows seeded by seedAnalyticsData for the given client.
 * Also deletes the ai_usage row for the current month.
 */
export async function cleanAnalyticsData(clientId: string): Promise<void> {
  const period = currentPeriod()

  // automation_runs FK → leads; delete first
  await db.query(
    `DELETE FROM caiac.automation_runs
     WHERE lead_id IN (
       SELECT id FROM caiac.leads
       WHERE client_id = $1 AND intake_data->>'_source' = 'test-analytics'
     )`,
    [clientId],
  )

  await db.query(
    `DELETE FROM caiac.leads
     WHERE client_id = $1 AND intake_data->>'_source' = 'test-analytics'`,
    [clientId],
  )

  await db.query(
    `DELETE FROM caiac.ai_usage WHERE client_id = $1 AND period = $2`,
    [clientId, period],
  )
}
