import { Hono } from 'hono';
import { cors } from 'hono/cors';
// 明示的に .ts を付けます
import { accountsRoutes } from "./routes/accounts.js";
import { journalEntriesRoutes } from "./routes/journalEntries.js";
import { reportsRoutes } from "./routes/reports.js";
export const app = new Hono();
app.use('/*', cors());
app.route('/', accountsRoutes);
app.route('/', journalEntriesRoutes);
app.route('/', reportsRoutes);
app.get('/', (c) => {
    return c.text('Hello Hono! DB connection is ready.');
});
