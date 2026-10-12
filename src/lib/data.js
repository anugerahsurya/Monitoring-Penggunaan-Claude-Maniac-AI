import { createClient } from '@supabase/supabase-js'
import { dayKey } from './format'

const URL = import.meta.env.VITE_SUPABASE_URL
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const DAYS_BACK = 180
const LOCAL_ACC_KEY = 'mc-account-settings'   // hanya untuk mode file lokal (tanpa Supabase)

const sb = URL && KEY
  ? createClient(URL.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/$/, ''), KEY.trim(), { auth: { persistSession: false } })
  : null
export const hasSupabase = !!sb

async function fetchAll(table, timeCol, since) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select('*').gte(timeCol, since).order(timeCol).range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...data)
    if (data.length < 1000) return out
  }
}

async function loadAccountSettings() {
  if (!sb) {
    try { return JSON.parse(localStorage.getItem(LOCAL_ACC_KEY) || 'null') } catch { return null }
  }
  const { data, error } = await sb.from('account_settings').select('*').eq('id', 'team').maybeSingle()
  if (error) { console.warn('account_settings:', error.message); return null }   // tabel belum dibuat → pakai default
  return data
}

async function loadRaw() {
  if (sb) {
    const since = new Date(Date.now() - DAYS_BACK * 864e5).toISOString()
    const [hourly, tools, sessions] = await Promise.all([
      fetchAll('usage_hourly', 'hour', since),
      fetchAll('tool_hourly', 'hour', since),
      fetchAll('sessions', 'started_at', since),
    ])
    return { source: 'Supabase', hourly, tools, sessions }
  }
  const r = await fetch('/local-data.json', { cache: 'no-store' })
  if (!r.ok) throw new Error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum terbaca saat build. Isi di Vercel → Settings → Environment Variables, lalu Redeploy.')
  return { source: 'file lokal', ...(await r.json()) }
}

export async function loadData() {
  const [raw, account] = await Promise.all([loadRaw(), loadAccountSettings()])
  const withTime = (r, col) => { const t = new Date(r[col]); return { ...r, t, day: dayKey(t) } }
  const byTime = (a, b) => a.t - b.t
  const sessions = raw.sessions.map(r => ({ ...withTime(r, 'started_at'), end: new Date(r.ended_at) })).sort(byTime)
  // waktu aktivitas terakhir yang sudah terunggah per anggota (perangkat)
  const lastSeen = {}
  sessions.forEach(s => { if (!lastSeen[s.member] || s.end > lastSeen[s.member]) lastSeen[s.member] = s.end })
  return {
    source: raw.source,
    hourly: raw.hourly.map(r => withTime(r, 'hour')).sort(byTime),
    tools: raw.tools.map(r => withTime(r, 'hour')).sort(byTime),
    sessions,
    lastSeen,
    account,
  }
}

// Simpan kalibrasi akun bersama. Di Supabase butuh token unggah salah satu anggota.
export async function saveAccountSettings({ token, weekAnchor, limit5h, limitWeek, member }) {
  const row = {
    id: 'team', week_anchor: weekAnchor.toISOString(), limit_5h: Math.round(limit5h), limit_week: Math.round(limitWeek),
    updated_at: new Date().toISOString(), updated_by: member || null,
  }
  if (!sb) { localStorage.setItem(LOCAL_ACC_KEY, JSON.stringify(row)); return row.updated_by }
  const { data, error } = await sb.rpc('save_account_settings', {
    p_token: token.trim(), p_week_anchor: row.week_anchor, p_limit_5h: row.limit_5h, p_limit_week: row.limit_week,
  })
  if (error) {
    throw new Error(/save_account_settings|schema cache/.test(error.message)
      ? 'Fungsi belum ada. Jalankan supabase/002_account_settings.sql di SQL Editor.'
      : error.message)
  }
  return data?.member
}
