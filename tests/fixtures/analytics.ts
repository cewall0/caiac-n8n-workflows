import { db } from "../helpers/db";

function currentPeriod(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export interface SeededAnalytics {
  clientId: string;
  period: string;
  leadIds: string[];
}

/**
 * Inserts deterministic analytics data for exact-value assertions in analytics tests.
 * All rows tagged with intake_data->>'_source' = 'test-analytics' for cleanup.
 *
 * Seeded state:
 * - 10 leads total: 6 with qualification_score >= 7, 4 with crm_synced_at set
 * - 3 automation_runs (review_request type): 3 sent, 2 responded, 1 positive
 * - ai_usage: 50 request_count for current period
 */
export async function seedAnalyticsData(clientId: string): Promise<SeededAnalytics> {
  const period = currentPeriod();

  const leads = await db.query<{ id: string }>(`
    INSERT INTO caiac.leads
      (client_id, crm_type, source_id, source_channel, lifecycle_stage, qualification_score, crm_synced_at, intake_data)
    VALUES
      ($1, 'sheet', 'test-a1', 'tally', 'intake', 9,    NOW(),  '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a2', 'tally', 'intake', 8,    NOW(),  '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a3', 'tally', 'intake', 7,    NOW(),  '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a4', 'tally', 'intake', 7,    NOW(),  '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a5', 'tally', 'intake', 7,    NOW(),  '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a6', 'tally', 'intake', 7,    NOW(),  '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a7', 'tally', 'intake', 4,    NULL,   '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a8', 'tally', 'intake', 3,    NULL,   '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a9', 'tally', 'intake', 2,    NULL,   '{"_source":"test-analytics"}'),
      ($1, 'sheet', 'test-a10','tally', 'intake', 1,    NULL,   '{"_source":"test-analytics"}')
    RETURNING id
  `, [clientId]);

  const leadIds = leads.map((r) => r.id);

  // 3 review automation runs: all sent, 2 responded, 1 positive
  await db.query(`
    INSERT INTO caiac.automation_runs
      (lead_id, automation_type, sent_at, responded_at, outcome)
    VALUES
      ($1, 'review_request', NOW(), NOW(), 'positive'),
      ($2, 'review_request', NOW(), NOW(), 'negative'),
      ($3, 'review_request', NOW(), NULL,  NULL)
  `, [leadIds[0], leadIds[1], leadIds[2]]);

  // Upsert ai_usage — 50 requests for current period
  await db.query(`
    INSERT INTO caiac.ai_usage (client_id, period, request_count)
    VALUES ($1, $2, 50)
    ON CONFLICT (client_id, period) DO UPDATE SET request_count = 50
  `, [clientId, period]);

  return { clientId, period, leadIds };
}

export async function cleanAnalyticsData(clientId: string): Promise<void> {
  const period = currentPeriod();

  // Clean automation_runs before leads (FK)
  await db.query(`
    DELETE FROM caiac.automation_runs
    WHERE lead_id IN (
      SELECT id FROM caiac.leads
      WHERE client_id = $1 AND intake_data->>'_source' = 'test-analytics'
    )
  `, [clientId]);

  await db.query(`
    DELETE FROM caiac.leads
    WHERE client_id = $1 AND intake_data->>'_source' = 'test-analytics'
  `, [clientId]);

  // Restore ai_usage to 0 rather than delete — avoids breaking other tests expecting the row to exist
  await db.query(`
    UPDATE caiac.ai_usage SET request_count = 0
    WHERE client_id = $1 AND period = $2
  `, [clientId, period]);
}
