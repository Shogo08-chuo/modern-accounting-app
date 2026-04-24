import 'dotenv/config'

import { AccountCategory, PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const seedAccounts = [
  { code: '100', name: '現金', category: AccountCategory.ASSET },
  { code: '110', name: '普通預金', category: AccountCategory.ASSET },
  { code: '120', name: '売掛金', category: AccountCategory.ASSET },
  { code: '200', name: '買掛金', category: AccountCategory.LIABILITY },
  { code: '210', name: '未払金', category: AccountCategory.LIABILITY },
  { code: '300', name: '資本金', category: AccountCategory.EQUITY },
  { code: '400', name: '売上', category: AccountCategory.REVENUE },
  { code: '500', name: '通信費', category: AccountCategory.EXPENSE },
  { code: '510', name: '旅費交通費', category: AccountCategory.EXPENSE },
  { code: '520', name: '支払手数料', category: AccountCategory.EXPENSE },
  { code: '530', name: '消耗品費', category: AccountCategory.EXPENSE }
] as const

async function main() {
  for (const account of seedAccounts) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: {
        name: account.name,
        category: account.category
      },
      create: {
        code: account.code,
        name: account.name,
        category: account.category
      }
    })
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Seed failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
