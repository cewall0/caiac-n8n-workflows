import { config } from 'dotenv'
import { afterAll } from 'vitest'
import { db } from './helpers/db'

config({ path: '.env.test' })

afterAll(async () => {
  await db.end()
})
