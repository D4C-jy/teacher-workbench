const TOKEN_KEY = 'twb.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
}

export async function api<T = any>(path: string, opts: ApiOptions = {}): Promise<T> {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  if (!res.ok) throw new Error(data?.error || `请求失败（${res.status}）`)
  return data as T
}

export interface ApiUser {
  id: number
  username: string
  displayName: string
}

export interface TodayData {
  date: string
  weekday: string
  week: number
  focusClassId: number | null
  sessions: Array<{
    id: number
    classId: number
    start: string
    end: string
    courseName: string
    className: string
    room: string | null
    status: 'planned' | 'done' | 'cancelled'
    present: number
  }>
  stats: { sessions: number; attendances: number; lowBalance: number }
  lowStudents: Array<{ id: number; name: string; balance: number }>
  expiring: number
  classStudents: Array<{ id: number; name: string; balance: number }>
  equipment: {
    total: number
    inStock: number
    lent: number
    repair: number
    items: Array<{ id: number; code: string; model: string; status: string }>
  }
  lentLoans: Array<{ code: string; borrower_name: string; due_at: string | null }>
}
