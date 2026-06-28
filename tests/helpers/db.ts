import { Pool } from 'pg'

let pool: Pool | null = null

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
    })
  }
  return pool
}

export const db = {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    getPool().query<T>(sql, params).then((r) => r.rows),

  queryOne: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
    const rows = await getPool().query<T>(sql, params).then((r) => r.rows)
    return rows[0] ?? null
  },

  end: () => pool?.end(),
}

export const TEST_CLIENT_SLUG = process.env.TEST_CLIENT_SLUG ?? 'henderson'
