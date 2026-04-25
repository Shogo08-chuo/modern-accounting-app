import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { accountsRoutes } from "./routes/accounts.js";
import { journalEntriesRoutes } from "./routes/journalEntries.js";
import { reportsRoutes } from "./routes/reports.js";
import { basicAuthMiddleware } from "./middleware/basicAuth.js";
export const app = new Hono();
app.use('/*', cors());
app.get('/health', (c) => {
    return c.text('ok');
});
app.use('/*', basicAuthMiddleware);
app.route('/', accountsRoutes);
app.route('/', journalEntriesRoutes);
app.route('/', reportsRoutes);
app.get('/', (c) => {
    return c.text('Hello Hono! DB connection is ready.');
});
