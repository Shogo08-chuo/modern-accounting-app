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
    const report = {
        bs: { asset: 0, liability: 0, equity: 0 },
        pl: { revenue: 0, expense: 0, netIncome: 0 }
    };
    lines.forEach((line) => {
        const amount = Number(line.amount);
        const cat = line.account.category;
        if (cat === 'ASSET')
            report.bs.asset += line.type === 'DEBIT' ? amount : -amount;
        else if (cat === 'LIABILITY')
            report.bs.liability += line.type === 'CREDIT' ? amount : -amount;
        else if (cat === 'EQUITY')
            report.bs.equity += line.type === 'CREDIT' ? amount : -amount;
        else if (cat === 'REVENUE')
            report.pl.revenue += line.type === 'CREDIT' ? amount : -amount;
        else if (cat === 'EXPENSE')
            report.pl.expense += line.type === 'DEBIT' ? amount : -amount;
    });
    report.pl.netIncome = report.pl.revenue - report.pl.expense;
    return c.json(report);
});
