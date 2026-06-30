import { Pool, type QueryResultRow } from 'pg'

let pool: Pool | null = null
export let dbAvailable = false

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
      connectionTimeoutMillis: 3000,
    })
  }
  return pool
}

export async function checkDbConnection(): Promise<void> {
  if (!process.env.DATABASE_URL) return
  try {
    await getPool().query('SELECT 1')
    dbAvailable = true
  } catch {
    // DB unreachable — tests that need it will skip
  }
}

export const db = {
  query: <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) =>
    getPool().query<T>(sql, params).then((r) => r.rows),

  queryOne: async <T extends QueryResultRow = QueryResultRow>(sql: string, params?: unknown[]) => {
    const rows = await getPool().query<T>(sql, params).then((r) => r.rows)
    return rows[0] ?? null
  },

  end: () => pool?.end(),
}

export const TEST_CLIENT_SLUG = process.env.TEST_CLIENT_SLUG ?? 'henderson'
