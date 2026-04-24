'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'

type Account = {
  id: number
  name: string
  code: string
  category: string
}

type JournalEntryLine = {
  accountId: number
  type: 'DEBIT' | 'CREDIT'
  amount: number
  account?: {
    name: string
  }
}

type JournalEntry = {
  id: number
  entryDate: string
  description: string
  lines: JournalEntryLine[]
}

type FinancialReport = {
  bs: { asset: number; liability: number; equity: number }
  pl: { revenue: number; expense: number; netIncome: number }
}

type LedgerEntry = JournalEntry & {
  runningBalance: number
}

const emptySubscribe = () => () => {}
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001'

function calculateSignedAmount(category: string, lineType: 'DEBIT' | 'CREDIT', amount: number) {
  const debitIncreases = category === 'ASSET' || category === 'EXPENSE'
  return debitIncreases
    ? (lineType === 'DEBIT' ? amount : -amount)
    : (lineType === 'CREDIT' ? amount : -amount)
}

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [report, setReport] = useState<FinancialReport | null>(null)
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [selectedAccountId, setSelectedAccountId] = useState('')

  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [category, setCategory] = useState('ASSET')

  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0])
  const [description, setDescription] = useState('')
  const [debitAccountId, setDebitAccountId] = useState('')
  const [creditAccountId, setCreditAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const numericAmount = Number(amount)
  const isAmountInvalid = amount !== '' && (!Number.isFinite(numericAmount) || numericAmount <= 0)

  const selectedAccount = accounts.find((account) => String(account.id) === selectedAccountId)
  const isLedgerView = Boolean(selectedAccount)

  const displayedEntries: Array<JournalEntry | LedgerEntry> = (() => {
    if (!selectedAccount) {
      return entries
    }

    let runningBalance = 0

    return entries.map((entry) => {
      const balanceChange = entry.lines
        .filter((line) => line.accountId === selectedAccount.id)
        .reduce((sum, line) => sum + calculateSignedAmount(selectedAccount.category, line.type, line.amount), 0)

      runningBalance += balanceChange

      return {
        ...entry,
        runningBalance
      }
    })
  })()

  function fetchAccounts() {
    fetch(`${API_BASE_URL}/accounts`)
      .then(res => res.json())
      .then(data => setAccounts(data))
      .catch(err => console.error("通信エラー:", err))
  }

  function fetchEntries(accountId?: string) {
    const params = new URLSearchParams()
    if (accountId) {
      params.set('accountId', accountId)
    }

    const url = params.size > 0
      ? `${API_BASE_URL}/journal-entries?${params.toString()}`
      : `${API_BASE_URL}/journal-entries`

    fetch(url)
      .then(res => res.json())
      .then(data => setEntries(data))
      .catch(err => console.error("仕訳取得エラー:", err))
  }

  function fetchReport() {
    fetch(`${API_BASE_URL}/reports/financial-statements`)
      .then(res => res.json())
      .then(data => setReport(data))
      .catch(err => console.error("レポート取得エラー:", err))
  }

  useEffect(() => {
    fetchAccounts()
    fetchReport()
  }, [])

  useEffect(() => {
    fetchEntries(selectedAccountId)
  }, [selectedAccountId])

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await fetch(`${API_BASE_URL}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, code, category })
    })
    if (res.ok) {
      fetchAccounts(); setName(''); setCode(''); setCategory('ASSET')
      alert('科目を登録しました')
    }
  }

  const handleJournalSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      alert('金額は0より大きい数値を入力してください')
      return
    }
    
    const journalData = {
      entryDate,
      description,
      lines: [
        { accountId: Number(debitAccountId), type: 'DEBIT', amount: numericAmount, description },
        { accountId: Number(creditAccountId), type: 'CREDIT', amount: numericAmount, description }
      ]
    }

    try {
      const res = await fetch(`${API_BASE_URL}/journal-entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(journalData)
      })

      const result = await res.json()
      if (res.ok) {
        alert('伝票を登録しました！')
        setDescription('')
        setAmount('')
        setDebitAccountId('')
        setCreditAccountId('')
        fetchEntries(selectedAccountId)
        fetchReport()
      } else {
        alert(`エラー: ${result.error}`)
      }
    } catch (err) {
      console.error("送信エラー:", err)
    }
  }

  const handleDelete = async (entryId: number) => {
    const confirmed = window.confirm('この仕訳を削除しますか？')

    if (!confirmed) {
      return
    }

    try {
      const res = await fetch(`${API_BASE_URL}/journal-entries/${entryId}`, {
        method: 'DELETE'
      })

      if (res.ok) {
        fetchEntries(selectedAccountId)
        fetchReport()
        alert('仕訳を削除しました')
      } else {
        let result: { error?: string } = {}

        try {
          const responseText = await res.text()
          if (responseText.trim()) {
            result = JSON.parse(responseText)
          }
        } catch {
          result = {}
        }

        alert(`エラー: ${result.error ?? `伝票の削除に失敗しました (HTTP ${res.status})`}`)
      }
    } catch (err) {
      console.error("削除エラー:", err)
    }
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen bg-gray-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-gray-900">モダン会計システム</h1>
          <p className="text-gray-600">エンジニアのための複式簿記アプリ</p>
        </header>

        {/* --- 財務諸表（ダッシュボード） --- */}
        {report && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl shadow-sm border border-blue-200">
              <h2 className="text-xl font-bold text-blue-900 mb-4 border-b border-blue-200 pb-2">📊 損益計算書 (P/L)</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-gray-700"><span>収益:</span> <span className="font-mono">{report.pl.revenue.toLocaleString()} 円</span></div>
                <div className="flex justify-between text-gray-700"><span>費用:</span> <span className="font-mono text-red-600">- {report.pl.expense.toLocaleString()} 円</span></div>
                <div className="flex justify-between font-bold text-lg text-blue-900 pt-2 border-t border-blue-200 mt-2">
                  <span>当期純利益:</span> <span className="font-mono">{report.pl.netIncome.toLocaleString()} 円</span>
                </div>
              </div>
            </div>

            <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl shadow-sm border border-green-200">
              <h2 className="text-xl font-bold text-green-900 mb-4 border-b border-green-200 pb-2">⚖️ 貸借対照表 (B/S)</h2>
              <div className="space-y-2">
                <div className="flex justify-between text-gray-700"><span>資産:</span> <span className="font-mono">{report.bs.asset.toLocaleString()} 円</span></div>
                <div className="flex justify-between text-gray-700"><span>負債:</span> <span className="font-mono">{report.bs.liability.toLocaleString()} 円</span></div>
                <div className="flex justify-between text-gray-700"><span>純資産:</span> <span className="font-mono">{report.bs.equity.toLocaleString()} 円</span></div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white p-6 rounded-xl shadow-sm border-2 border-blue-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
            <span className="mr-2">📝</span> 振替伝票入力
          </h2>
          <form onSubmit={handleJournalSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} className="border p-2 rounded w-full" required />
              <input type="text" placeholder="摘要（例：PC購入）" value={description} onChange={e => setDescription(e.target.value)} className="border p-2 rounded w-full" required />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-xs text-gray-500 block mb-1">借方科目</label>
                <select value={debitAccountId} onChange={e => setDebitAccountId(e.target.value)} className="border p-2 rounded w-full bg-white" required>
                  <option value="">選択してください</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">貸方科目</label>
                <select value={creditAccountId} onChange={e => setCreditAccountId(e.target.value)} className="border p-2 rounded w-full bg-white" required>
                  <option value="">選択してください</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">金額</label>
                <input
                  type="number"
                  placeholder="金額"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  min="1"
                  step="1"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className={`border p-2 rounded w-full ${isAmountInvalid ? 'border-red-500 bg-red-50' : ''}`}
                  required
                />
                {isAmountInvalid && (
                  <p className="mt-1 text-xs text-red-600">金額は0より大きい数値を入力してください。</p>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={isAmountInvalid}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-md hover:bg-blue-700 transition-all shadow-md disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed disabled:shadow-none"
            >
              伝票を登録する
            </button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
            <span className="mr-2">📖</span> {selectedAccount ? `${selectedAccount.name}の元帳` : '仕訳履歴一覧'}
          </h2>
          <div className="mb-4">
            <label htmlFor="ledger-account-filter" className="text-sm font-medium text-gray-700 block mb-2">
              勘定科目で絞り込み
            </label>
            <select
              id="ledger-account-filter"
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="border p-2 rounded w-full md:w-80 bg-white"
            >
              <option value="">すべて</option>
              {accounts.map((account) => (
                <option key={`ledger-filter-${account.id}`} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">日付</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">摘要</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">仕訳内容（借方 / 貸方）</th>
                  {isLedgerView && (
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase">差引残高</th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayedEntries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-blue-50 transition-colors">
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {new Date(entry.entryDate).toLocaleDateString('ja-JP')}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-gray-900">
                      {entry.description}
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      <div className="space-y-1">
                        {entry.lines.map((line: JournalEntryLine, idx: number) => (
                          <div key={idx} className="flex justify-between w-64">
                            <span className={line.type === 'DEBIT' ? 'text-blue-700' : 'text-green-700 ml-4'}>
                              {line.type === 'DEBIT' ? ' (借) ' : ' (貸) '} {line.account?.name}
                            </span>
                            <span className="font-mono">{line.amount.toLocaleString()}円</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    {isLedgerView && 'runningBalance' in entry && (
                      <td className="px-4 py-4 whitespace-nowrap text-sm font-mono text-gray-700">
                        {entry.runningBalance.toLocaleString()}円
                      </td>
                    )}
                    <td className="px-4 py-4 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.id)}
                        className="inline-flex items-center rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
                      >
                        削除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayedEntries.length === 0 && <p className="text-center py-8 text-gray-400">登録された仕訳はありません</p>}
          </div>
        </div>

        {/* 勘定科目登録セクション */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center">
            <span className="mr-2">🆕</span> 新規科目登録
          </h2>
          <form onSubmit={handleAccountSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input type="text" placeholder="科目名" value={name} onChange={e => setName(e.target.value)} className="border p-2 rounded" required />
            <input type="text" placeholder="コード" value={code} onChange={e => setCode(e.target.value)} className="border p-2 rounded" required />
            <select value={category} onChange={e => setCategory(e.target.value)} className="border p-2 rounded bg-white">
              <option value="ASSET">資産</option><option value="LIABILITY">負債</option>
              <option value="EQUITY">純資産</option><option value="REVENUE">収益</option><option value="EXPENSE">費用</option>
            </select>
            <button type="submit" className="bg-gray-800 text-white py-2 px-4 rounded hover:bg-black transition-colors">科目を追加</button>
          </form>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">📂 登録済みの勘定科目</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {accounts.map((a: Account) => (
              <div key={`account-${a.id}-${a.code}`} className="flex items-center p-3 bg-gray-50 border border-gray-100 rounded-md">
                <span className="w-12 font-mono text-xs font-bold text-blue-600 text-center">{a.code}</span>
                <span className="ml-3 font-medium text-gray-700">{a.name}</span>
                <span className="ml-auto text-[10px] font-bold text-gray-400 uppercase">{a.category}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
