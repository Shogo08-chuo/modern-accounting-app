import 'dotenv/config'

import { serve } from '@hono/node-server'
import { app } from './app.ts'

const port = Number(process.env.PORT || 3001)

serve({
  fetch: app.fetch,
  port
})
