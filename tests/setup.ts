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
