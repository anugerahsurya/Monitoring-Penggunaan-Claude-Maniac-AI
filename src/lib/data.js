import { createClient } from '@supabase/supabase-js'
import { dayKey } from './format'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const DAYS_BACK = 180

async function fetchAll(sb, table, timeCol, since) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').gte(timeCol, since).order(timeCol).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

async function loadRaw() {
  if (URL && KEY) {
    const sb = createClient(URL, KEY, { auth: { persistSession: false } })
    const since = new Date(Date.now() - DAYS_BACK * 864e5).toISOString()
    const [hourly, tools, sessions, windows] = await Promise.all([
      fetchAll(sb, 'usage_hourly', 'hour', since),
      fetchAll(sb, 'tool_hourly', 'hour', since),
      fetchAll(sb, 'sessions', 'started_at', since),
      fetchAll(sb, 'usage_windows', 'started_at', since),
    ])
    return { source: 'Supabase', hourly, tools, sessions, windows }
  }
  const r = await fetch('/local-data.json', { cache: 'no-store' })
  if (!r.ok) throw new Error('Supabase belum dikonfigurasi dan local-data.json tidak ditemukan.')
  return { source: 'file lokal', ...(await r.json()) }
}

export async function loadData() {
  const raw = await loadRaw()
  const withTime = (r, col) => { const t = new Date(r[col]); return { ...r, t, day: dayKey(t) } }
  const byTime = (a, b) => a.t - b.t
  return {
    source: raw.source,
    hourly: raw.hourly.map(r => withTime(r, 'hour')).sort(byTime),
    tools: raw.tools.map(r => withTime(r, 'hour')).sort(byTime),
    sessions: raw.sessions.map(r => ({ ...withTime(r, 'started_at'), end: new Date(r.ended_at) })).sort(byTime),
    windows: raw.windows.map(r => ({ ...withTime(r, 'started_at'), end: new Date(r.ends_at), last: new Date(r.last_at) })).sort(byTime),
  }
}
