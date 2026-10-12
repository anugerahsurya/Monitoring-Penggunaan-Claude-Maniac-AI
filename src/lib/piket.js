import { dayKey } from './format'

export const TEAM = ['Rafi', 'Surya', 'Nisa', 'Sofi']
export const DAY_NAMES = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

// Jadwal piket Senin–Kamis, diacak deterministik per minggu:
// sama di semua komputer selama satu minggu, berganti setiap Senin. Jumat–Minggu bebas.
export function dutyFor(now = new Date()) {
  const dow = (now.getDay() + 6) % 7
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow)
  let seed = [...dayKey(monday)].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0, 0x9e3779b9)
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const order = [...TEAM]
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  const week = DAY_NAMES.map((name, i) => ({
    name,
    date: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
    who: i < 4 ? order[i] : null,
    today: i === dow,
  }))
  return { dow, monday, week, today: week[dow] }
}
