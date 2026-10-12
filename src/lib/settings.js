import { useEffect, useState } from 'react'

const env = import.meta.env
const WEEK = 7 * 864e5
const H5 = 5 * 3600e3
export const WEEK_MS = WEEK

// Default sebelum akun dikalibrasi. Angka awal ini hasil kalibrasi akun Pro
// (19% sesi ≈ 334 rb token, 34% mingguan ≈ 3,78 jt token).
export const DEFAULTS = {
  limit5h: +env.VITE_LIMIT_5H_TOKENS || 1_750_000,
  limitWeek: +env.VITE_LIMIT_WEEK_TOKENS || 11_000_000,
  resetDay: 0,          // 0 = Senin … 6 = Minggu
  resetHour: 0,
}

const KEY = 'mc-settings'

export function useSettings() {
  const [s, setS] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULTS }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* mode privat */ } }, [s])
  return [s, setS]
}

// Token yang dihitung terhadap batas: input + cache write + output (cache read tidak dihitung).
export const countedTokens = r =>
  (r.input || 0) + (r.output || 0) + (r.cache_write ?? ((r.cache_write_5m || 0) + (r.cache_write_1h || 0)))

function weekStartFixed(t, s) {
  const d = new Date(t)
  d.setHours(s.resetHour, 0, 0, 0)
  const diff = ((d.getDay() + 6) % 7 - s.resetDay + 7) % 7
  d.setDate(d.getDate() - diff)
  if (d > t) d.setDate(d.getDate() - 7)
  return d
}

// Konfigurasi batas akun bersama: hasil kalibrasi (Supabase) bila ada, selain itu default.
export function accountConfig(settings, acc) {
  const anchor = acc ? new Date(acc.week_anchor) : null
  return {
    calibrated: !!acc,
    updatedAt: acc ? new Date(acc.updated_at) : null,
    updatedBy: acc?.updated_by || null,
    limit5h: acc ? +acc.limit_5h : settings.limit5h,
    limitWeek: acc ? +acc.limit_week : settings.limitWeek,
    weekStart: t => (anchor
      ? new Date(anchor.getTime() + Math.floor((t - anchor) / WEEK) * WEEK)
      : weekStartFixed(t, settings)),
  }
}

// Jendela sesi 5 jam akun bersama, dari gabungan pemakaian semua perangkat.
// Jendela dimulai pada jam bulat dari aktivitas pertama dan berakhir tepat 5 jam kemudian,
// sehingga baris per jam sudah cukup untuk menentukannya dengan tepat.
export function accountWindows(hourly) {
  const rows = hourly.filter(r => r.calls || r.prompts)
  const out = []
  let cur = null
  for (const r of rows) {
    if (!cur || r.t.getTime() >= cur.end.getTime()) {
      cur = { t: r.t, end: new Date(r.t.getTime() + H5), counted: 0, prompts: 0, byMember: {} }
      out.push(cur)
    }
    const c = countedTokens(r)
    cur.counted += c
    cur.prompts += r.prompts || 0
    cur.byMember[r.member] = (cur.byMember[r.member] || 0) + c
  }
  return out
}
