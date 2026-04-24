import { Hono } from 'hono';
import { prisma } from "../lib/prisma.js";
export const reportsRoutes = new Hono();
reportsRoutes.get('/reports/all-lines', async (c) => {
    const lines = await prisma.journalEntryLine.findMany({
        include: { account: true }
    });
    return c.json(lines);
});
reportsRoutes.get('/reports/financial-statements', async (c) => {
    const lines = await prisma.journalEntryLine.findMany({
        include: { account: true }
    });
    let asset = 0;
    let liability = 0;
    let equity = 0;
    let revenue = 0;
    let expense = 0;
    lines.forEach((line) => {
        const amount = Number(line.amount);
        const cat = line.account.category;
        if (cat === 'ASSET')
            asset += line.type === 'DEBIT' ? amount : -amount;
        else if (cat === 'LIABILITY')
            liability += line.type === 'CREDIT' ? amount : -amount;
        else if (cat === 'EQUITY')
            equity += line.type === 'CREDIT' ? amount : -amount;
        else if (cat === 'REVENUE')
            revenue += line.type === 'CREDIT' ? amount : -amount;
        else if (cat === 'EXPENSE')
            expense += line.type === 'DEBIT' ? amount : -amount;
    });
    const netIncome = revenue - expense;
    const report = {
        bs: {
            asset,
            liability,
            equity: equity + netIncome
        },
        pl: {
            revenue,
            expense,
            netIncome
        }
    };
    return c.json(report);
});
