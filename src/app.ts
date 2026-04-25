import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { accountsRoutes } from './routes/accounts.ts'
import { journalEntriesRoutes } from './routes/journalEntries.ts'
import { reportsRoutes } from './routes/reports.ts'
import { basicAuthMiddleware } from './middleware/basicAuth.ts'

export const app = new Hono()

const allowedCorsOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.use(
  '/*',
  cors({
    origin: (origin) => {
      if (!origin) {
        return undefined
      }

      return allowedCorsOrigins.includes(origin) ? origin : null
    },
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    maxAge: 600
  })
)

app.get('/health', (c) => {
  return c.text('ok')
})

app.use('/*', basicAuthMiddleware)

app.route('/', accountsRoutes)
app.route('/', journalEntriesRoutes)
app.route('/', reportsRoutes)

app.get('/', (c) => {
  return c.text('Hello Hono! DB connection is ready.')
})
