import { Pool } from 'pg'
import { config } from 'dotenv'

config({ path: '.env.test' })

// Safety-net teardown: deletes any test rows that individual afterAll blocks
// failed to clean up (e.g. due to test crashes). Runs once after the full suite.
export async function teardown(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) return

  const pool = new Pool({ connectionString: url, connectionTimeoutMillis: 5000 })

  try {
    // automation_runs FK → leads; must go first
    await pool.query(`
      DELETE FROM caiac.automation_runs
      WHERE lead_id IN (
        SELECT id FROM caiac.leads
        WHERE intake_data->>'_source' LIKE 'test-%'
      )
    `)

    await pool.query(`
      DELETE FROM caiac.leads
      WHERE intake_data->>'_source' LIKE 'test-%'
    `)
  } catch (err) {
    // Non-fatal — stale rows will be caught by the nightly cleanup job
    console.warn('global-setup teardown: could not clean test rows —', (err as Error).message)
  } finally {
    await pool.end()
  }
}
