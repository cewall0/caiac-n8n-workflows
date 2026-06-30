import { config } from 'dotenv'
import { afterAll, beforeAll } from 'vitest'
import { db, checkDbConnection } from './helpers/db'

config({ path: '.env.test' })

beforeAll(async () => {
  await checkDbConnection()
}, 5000)

afterAll(async () => {
  await db.end()
})

// Global teardown — deletes all test-tagged rows even if individual afterAll blocks crash.
// Registered via vitest globalSetup if needed; can also be called directly from any test file.
export async function globalTeardown() {
  try {
    await db.query(`
      DELETE FROM caiac.automation_runs
      WHERE lead_id IN (
        SELECT id FROM caiac.leads WHERE intake_data->>'_source' LIKE 'test-%'
      )
    `)
    await db.query(`DELETE FROM caiac.leads WHERE intake_data->>'_source' LIKE 'test-%'`)
    await db.query(`DELETE FROM caiac.ai_usage WHERE request_count = 0 AND period = to_char(now(), 'YYYY-MM')`)
  } catch {
    // Best-effort — nightly cleanup job handles stragglers
  } finally {
    await db.end()
  }
}
