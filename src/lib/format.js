export const nf = new Intl.NumberFormat('id-ID')

export const usd = v =>
  '$' + (v >= 100
    ? v.toLocaleString('id-ID', { maximumFractionDigits: 0 })
    : v.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export const tok = v =>
  v >= 1e9 ? (v / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M'
    : v >= 1e6 ? (v / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt'
    : v >= 1e3 ? (v / 1e3).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' rb'
    : nf.format(Math.round(v))

export const pct = v => (v * 100).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'

export const pad = n => String(n).padStart(2, '0')

export const dayKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())

export const fromDayKey = k => { const [y, m, d] = k.split('-'); return new Date(+y, m - 1, +d) }

export const fmtDay = k => fromDayKey(k).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })

export const fmtDT = d => d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export const fmtTime = d => d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })

export const dur = ms => {
  const m = Math.max(0, Math.round(ms / 60000))
  return m < 60 ? m + ' mnt' : Math.floor(m / 60) + ' j ' + (m % 60) + ' mnt'
}

export const shortModel = m => (m || '').replace(/^claude-/, '')
export const shortEntry = e => (e || '').replace(/^claude-/, '')
export const shortTool = n => (n.startsWith('mcp__') ? 'MCP: ' + n.split('__').slice(2).join('_') : n)
