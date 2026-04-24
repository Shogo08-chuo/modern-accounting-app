import { Hono } from 'hono'

import { prisma } from '../lib/prisma.ts'

export const accountsRoutes = new Hono()

accountsRoutes.get('/accounts', async (c) => {
  const accounts = await prisma.account.findMany()
  return c.json(accounts)
})

accountsRoutes.post('/accounts', async (c) => {
  try {
    const body = await c.req.json()
    const existingAccount = await prisma.account.findUnique({
      where: { code: body.code }
    })

    if (existingAccount) {
      return c.json({ error: 'この科目コードは既に登録されています' }, 400)
    }

    const newAccount = await prisma.account.create({
      data: {
        name: body.name,
        code: body.code,
        category: body.category
      }
    })

    return c.json(newAccount, 201)
  } catch (error) {
    console.error(error)
    return c.json({ error: '勘定科目の登録に失敗しました' }, 500)
  }
})
