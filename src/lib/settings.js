import { useEffect, useState } from 'react'

const env = import.meta.env
export const DEFAULTS = {
  limit5h: +env.VITE_LIMIT_5H_TOKENS || 1_000_000,
  limitWeek: +env.VITE_LIMIT_WEEK_TOKENS || 10_000_000,
  resetDay: 0,          // 0 = Senin … 6 = Minggu
  resetHour: 0,
  countCacheRead: false,
}

const KEY = 'mc-settings'

export function useSettings() {
  const [s, setS] = useState(() => {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULTS }
  })
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* mode privat */ } }, [s])
  return [s, setS]
}

// Token yang dihitung terhadap batas. Cache read jauh lebih ringan, jadi defaultnya tidak dihitung.
export const countedTokens = (r, s) =>
  (r.input || 0) + (r.output || 0) + (r.cache_write ?? ((r.cache_write_5m || 0) + (r.cache_write_1h || 0))) +
  (s.countCacheRead ? r.cache_read || 0 : 0)

// Awal periode mingguan yang memuat waktu t, mengikuti hari & jam reset.
export function weekStart(t, s) {
  const d = new Date(t)
  d.setHours(s.resetHour, 0, 0, 0)
  const diff = ((d.getDay() + 6) % 7 - s.resetDay + 7) % 7
  d.setDate(d.getDate() - diff)
  if (d > t) d.setDate(d.getDate() - 7)
  return d
}
