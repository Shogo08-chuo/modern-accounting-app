import { Prisma } from '@prisma/client';
import { Hono } from 'hono';
import { prisma } from "../lib/prisma.js";
const router = new Hono();
function parseJournalEntriesQuery(query) {
    const accountIdParam = query.accountId;
    const dateFromParam = query.dateFrom;
    const dateToParam = query.dateTo;
    const accountId = accountIdParam ? Number(accountIdParam) : undefined;
    if (accountIdParam && Number.isNaN(accountId)) {
        return { error: 'accountId は数値で指定してください' };
    }
    const dateFrom = dateFromParam ? new Date(dateFromParam) : undefined;
    if (dateFromParam && Number.isNaN(dateFrom?.getTime())) {
        return { error: 'dateFrom は有効な日付で指定してください' };
    }
    const dateTo = dateToParam ? new Date(dateToParam) : undefined;
    if (dateToParam && Number.isNaN(dateTo?.getTime())) {
        return { error: 'dateTo は有効な日付で指定してください' };
    }
    return {
        accountId,
        dateFrom,
        dateTo
    };
}
function buildJournalEntriesWhere(filters) {
    const conditions = [];
    if (filters.accountId !== undefined) {
        conditions.push({
            lines: {
                some: {
                    accountId: filters.accountId
                }
            }
        });
    }
    if (filters.dateFrom || filters.dateTo) {
        conditions.push({
            entryDate: {
                gte: filters.dateFrom,
                lte: filters.dateTo
            }
        });
    }
    if (conditions.length === 0) {
        return undefined;
    }
    if (conditions.length === 1) {
        return conditions[0];
    }
    return { AND: conditions };
}
function validateJournalEntryPayload(body) {
    if (!body || typeof body !== 'object') {
        return { error: 'リクエストボディが不正です' };
    }
    const payload = body;
    const { entryDate, description, lines } = payload;
    if (typeof entryDate !== 'string' || Number.isNaN(new Date(entryDate).getTime())) {
        return { error: 'entryDate は有効な日付で指定してください' };
    }
    if (typeof description !== 'string' || description.trim().length === 0) {
        return { error: 'description は必須です' };
    }
    if (!Array.isArray(lines) || lines.length < 2) {
        return { error: '明細は2行以上入力してください' };
    }
    let debitTotal = 0;
    let creditTotal = 0;
    let hasDebitLine = false;
    let hasCreditLine = false;
    const normalizedLines = [];
    for (const line of lines) {
        if (!line || typeof line !== 'object') {
            return { error: '明細の形式が不正です' };
        }
        const rawLine = line;
        const lineType = rawLine.type;
        const accountId = Number(rawLine.accountId);
        const amount = Number(rawLine.amount);
        if (!Number.isInteger(accountId) || accountId <= 0) {
            return { error: 'accountId は正の整数で指定してください' };
        }
        if (lineType !== 'DEBIT' && lineType !== 'CREDIT') {
            return { error: '明細の貸借区分が不正です' };
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return { error: '金額は0より大きい必要があります' };
        }
        if (lineType === 'DEBIT') {
            hasDebitLine = true;
            debitTotal += amount;
        }
        else {
            hasCreditLine = true;
            creditTotal += amount;
        }
        normalizedLines.push({
            accountId,
            type: lineType,
            amount
        });
    }
    if (!hasDebitLine || !hasCreditLine) {
        return { error: '借方と貸方の明細をそれぞれ1行以上入力してください' };
    }
    if (debitTotal !== creditTotal) {
        return {
            error: `貸借が一致しません (借方:${debitTotal}, 貸方:${creditTotal})`
        };
    }
    return {
        data: {
            entryDate,
            description: description.trim(),
            lines: normalizedLines
        }
    };
}
router.post('/journal-entries', async (c) => {
    try {
        const body = await c.req.json();
        const validationResult = validateJournalEntryPayload(body);
        if ('error' in validationResult) {
            return c.json({ error: validationResult.error }, 400);
        }
        const { entryDate, description, lines } = validationResult.data;
        const result = await prisma.$transaction(async (tx) => {
            const entry = await tx.journalEntry.create({
                data: {
                    entryDate: new Date(entryDate),
                    description,
                    lines: {
                        create: lines.map((line) => ({
                            accountId: line.accountId,
                            type: line.type,
                            amount: Number(line.amount)
                        }))
                    }
                },
                include: { lines: true }
            });
            return entry;
        });
        return c.json(result, 201);
    }
    catch (error) {
        console.error(error);
        return c.json({ error: '伝票の保存に失敗しました' }, 500);
    }
});
router.get('/journal-entries', async (c) => {
    const parsedQuery = parseJournalEntriesQuery({
        accountId: c.req.query('accountId'),
        dateFrom: c.req.query('dateFrom'),
        dateTo: c.req.query('dateTo')
    });
    if ('error' in parsedQuery) {
        return c.json({ error: parsedQuery.error }, 400);
    }
    const entries = await prisma.journalEntry.findMany({
        where: buildJournalEntriesWhere(parsedQuery),
        include: { lines: { include: { account: true } } },
        orderBy: { entryDate: parsedQuery.accountId !== undefined ? 'asc' : 'desc' }
    });
    return c.json(entries);
});
router.delete('/journal-entries/:id', async (c) => {
    const id = Number(c.req.param('id'));
    if (Number.isNaN(id)) {
        return c.json({ error: 'id は数値で指定してください' }, 400);
    }
    try {
        const deletedEntryCount = await prisma.$transaction(async (tx) => {
            await tx.journalEntryLine.deleteMany({
                where: { journalEntryId: id }
            });
            const deletedEntry = await tx.journalEntry.deleteMany({
                where: { id }
            });
            return deletedEntry.count;
        });
        if (deletedEntryCount === 0) {
            return c.json({ error: '指定された伝票が見つかりません' }, 404);
        }
        return c.json({ success: true }, 200);
    }
    catch (error) {
        console.error(error);
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
            return c.json({ error: `伝票の削除に失敗しました (${error.code})` }, 500);
        }
        return c.json({ error: '伝票の削除に失敗しました' }, 500);
    }
});
router.get('/ledger/:accountId', async (c) => {
    const accountId = parseInt(c.req.param('accountId'));
    const lines = await prisma.journalEntryLine.findMany({
        where: { accountId },
        include: { journalEntry: true },
        orderBy: { journalEntry: { entryDate: 'asc' } }
    });
    return c.json(lines);
});
export { router as journalEntriesRoutes };
