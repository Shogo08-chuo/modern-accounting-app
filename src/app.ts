import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { accountsRoutes } from './routes/accounts.ts'
import { journalEntriesRoutes } from './routes/journalEntries.ts'
import { reportsRoutes } from './routes/reports.ts'

export const app = new Hono()

app.use('/*', cors())

app.route('/', accountsRoutes)
app.route('/', journalEntriesRoutes)
app.route('/', reportsRoutes)

app.get('/', (c) => {
  return c.text('Hello Hono! DB connection is ready.')
})
