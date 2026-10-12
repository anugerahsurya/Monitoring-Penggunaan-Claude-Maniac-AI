import { useMemo } from 'react'
import { motion } from 'motion/react'
import { BarChart, barDataset, baseOptions, refLine } from './charts'
import { Card, Legend, Progress } from './ui'
import { dur, fmtDT, fmtTime, nf, pct, tok } from '../lib/format'
import { countedTokens, weekStart } from '../lib/settings'
import { C, EASE_OUT } from '../lib/theme'

const WEEK = 7 * 864e5

function status(p) {
  if (p >= 1) return { label: 'Melebihi batas', icon: '⛔', color: C.critical }
  if (p >= 0.8) return { label: 'Hampir habis', icon: '⚠️', color: C.warning }
  return { label: 'Aman', icon: '✓', color: C.accent }
}

function Meter({ title, used, limit, foot }) {
  const p = used / Math.max(1, limit)
  const st = status(p)
  return (
    <div className="meter">
      <div className="meter-top">
        <span className="meter-title">{title}</span>
        <span className="meter-status" style={{ color: st.color }}>{st.icon} {st.label}</span>
      </div>
      <div className="meter-val">
        <b>{pct(p)}</b>
        <span>{tok(used)} / {tok(limit)} token</span>
      </div>
      <Progress value={p} color={st.color} />
      <div className="meter-foot">{foot}</div>
    </div>
  )
}

export default function LimitsSection({ members, memberColor, hourly, windows, settings, from, to, onOpenSettings, i0 = 0 }) {
  const now = new Date()
  const ws = weekStart(now, settings)
  const we = new Date(ws.getTime() + WEEK)

  const cards = useMemo(() => members.map(m => {
    const mw = windows.filter(w => w.member === m)
    const last = mw[mw.length - 1]
    const active = last && now < last.end
    const usedWeek = hourly.filter(r => r.member === m && r.t >= ws).reduce((s, r) => s + countedTokens(r, settings), 0)
    const lastSeen = mw.length ? mw.reduce((a, w) => (w.last > a ? w.last : a), mw[0].last) : null
    return { m, active, last, used5h: active ? countedTokens(last, settings) : 0, usedWeek, lastSeen }
  }), [members, windows, hourly, settings]) // eslint-disable-line react-hooks/exhaustive-deps

  // grafik jendela 5 jam dalam rentang tanggal terpilih
  const winData = useMemo(() => {
    const W = windows.filter(w => members.includes(w.member) && w.day >= from && w.day <= to)
    const labels = W.map(w => fmtDT(w.t))
    const datasets = members.map(m => barDataset(m, W.map(w => (w.member === m ? +(countedTokens(w, settings) / settings.limit5h * 100).toFixed(1) : null)), memberColor[m]))
    const maxP = Math.max(100, ...W.map(w => countedTokens(w, settings) / settings.limit5h * 100))
    return { W, data: { labels, datasets: [...datasets, refLine(W.length, 100, 'Batas 5 jam')] }, max: Math.ceil((maxP + 10) / 10) * 10 }
  }, [windows, members, from, to, settings, memberColor])

  // grafik mingguan: periode mengikuti hari & jam reset
  const weekData = useMemo(() => {
    const start = weekStart(new Date(from + 'T12:00'), settings)
    const weeks = []
    for (let t = start.getTime(); t <= now.getTime(); t += WEEK) weeks.push(new Date(t))
    const val = (m, w) => hourly.filter(r => r.member === m && r.t >= w && r.t < new Date(w.getTime() + WEEK)).reduce((s, r) => s + countedTokens(r, settings), 0)
    const vals = members.map(m => weeks.map(w => val(m, w)))
    const maxP = Math.max(100, ...vals.flat().map(v => v / settings.limitWeek * 100))
    return {
      weeks, vals,
      data: {
        labels: weeks.map(w => w.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })),
        datasets: [...members.map((m, i) => barDataset(m, vals[i].map(v => +(v / settings.limitWeek * 100).toFixed(1)), memberColor[m])), refLine(weeks.length, 100, 'Batas mingguan')],
      },
      max: Math.ceil((maxP + 10) / 10) * 10,
    }
  }, [hourly, members, from, settings, memberColor]) // eslint-disable-line react-hooks/exhaustive-deps

  const winOpts = baseOptions({
    fmt: v => v + '%', max: winData.max,
    tooltipLabel: c => {
      const w = winData.W[c.dataIndex]
      return ` ${c.dataset.label}: ${tok(countedTokens(w, settings))} (${c.raw}%) · ${nf.format(w.prompts)} prompt`
    },
  })
  winOpts.datasets = { bar: { skipNull: true } }
  const weekOpts = baseOptions({
    fmt: v => v + '%', max: weekData.max,
    tooltipLabel: c => ` ${c.dataset.label}: ${tok(weekData.vals[c.datasetIndex][c.dataIndex])} (${c.raw}%)`,
  })

  const legendItems = members.map(m => ({ key: m, label: m, color: memberColor[m] }))

  return (
    <>
      <Card
        i={i0}
        className="span-12 limits"
        title="Batas penggunaan"
        desc={`Token terhitung = input + cache write + output${settings.countCacheRead ? ' + cache read' : ''}. Batas 5 jam ${tok(settings.limit5h)} · mingguan ${tok(settings.limitWeek)} (reset ${['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'][settings.resetDay]} ${String(settings.resetHour).padStart(2, '0')}.00).`}
        right={<button className="btn-ghost" onClick={onOpenSettings}>⚙ Atur batas</button>}
      >
        <div className="limit-cards">
          {cards.map((c, k) => (
            <motion.div
              key={c.m}
              className="limit-card"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 + k * 0.05 }}
            >
              <div className="limit-who">
                <span className="avatar sm" style={{ background: memberColor[c.m] }}>{c.m[0]}</span>
                <b>{c.m}</b>
                <span className="muted small">{c.lastSeen ? 'data terakhir ' + fmtDT(c.lastSeen) : 'belum ada data'}</span>
              </div>
              <Meter
                title="Jendela 5 jam"
                used={c.used5h}
                limit={settings.limit5h}
                foot={c.active
                  ? <>Reset pukul <b>{fmtTime(c.last.end)}</b> · sisa {dur(c.last.end - now)}</>
                  : 'Tidak ada jendela aktif. Jendela baru dimulai saat prompt berikutnya.'}
              />
              <Meter
                title="Mingguan"
                used={c.usedWeek}
                limit={settings.limitWeek}
                foot={<>Reset <b>{we.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</b> pukul {fmtTime(we)} · sisa {dur(we - now)}</>}
              />
            </motion.div>
          ))}
        </div>
      </Card>

      <Card i={i0 + 1} className="span-8" title="Pemakaian per jendela 5 jam" desc="Persentase dari batas 5 jam. Garis putus-putus = 100%.">
        {members.length > 1 && <Legend items={legendItems} />}
        {winData.W.length ? <BarChart data={winData.data} options={winOpts} height={300} /> : <div className="empty">Tidak ada jendela pada rentang ini</div>}
      </Card>

      <Card i={i0 + 2} className="span-4" title="Pemakaian mingguan" desc="Persentase dari batas mingguan per periode reset.">
        {members.length > 1 && <Legend items={legendItems} />}
        <BarChart data={weekData.data} options={weekOpts} height={300} />
      </Card>
    </>
  )
}
