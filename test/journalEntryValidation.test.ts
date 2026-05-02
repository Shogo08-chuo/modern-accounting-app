import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateJournalEntryPayload } from '../src/routes/journalEntries.ts'

describe('validateJournalEntryPayload', () => {
  it('accepts a balanced journal entry', () => {
    const result = validateJournalEntryPayload({
      entryDate: '2026-04-01',
      description: '売上入金',
      lines: [
        { accountId: 1, type: 'DEBIT', amount: 1000 },
        { accountId: 2, type: 'CREDIT', amount: 1000 }
      ]
    })

    assert.ok('data' in result)
    assert.equal(result.data.description, '売上入金')
    assert.equal(result.data.lines.length, 2)
  })

  it('rejects an unbalanced journal entry', () => {
    const result = validateJournalEntryPayload({
      entryDate: '2026-04-01',
      description: '貸借不一致',
      lines: [
        { accountId: 1, type: 'DEBIT', amount: 1000 },
        { accountId: 2, type: 'CREDIT', amount: 900 }
      ]
    })

    assert.deepEqual(result, {
      error: '貸借が一致しません (借方:1000, 貸方:900)'
    })
  })

  it('requires both debit and credit lines', () => {
    const result = validateJournalEntryPayload({
      entryDate: '2026-04-01',
      description: '借方のみ',
      lines: [
        { accountId: 1, type: 'DEBIT', amount: 500 },
        { accountId: 2, type: 'DEBIT', amount: 500 }
      ]
    })

    assert.deepEqual(result, {
      error: '借方と貸方の明細をそれぞれ1行以上入力してください'
    })
  })

  it('rejects non-positive amounts', () => {
    const result = validateJournalEntryPayload({
      entryDate: '2026-04-01',
      description: '金額不正',
      lines: [
        { accountId: 1, type: 'DEBIT', amount: 0 },
        { accountId: 2, type: 'CREDIT', amount: 0 }
      ]
    })

    assert.deepEqual(result, {
      error: '金額は0より大きい必要があります'
    })
  })
})
