import { useMemo } from 'react'
import { motion } from 'motion/react'
import { BarChart, barDataset, baseOptions, refLine } from './charts'
import { Card, Legend } from './ui'
import { dur, fmtDT, fmtTime, nf, pct, tok } from '../lib/format'
import { WEEK_MS, accountConfig, accountWindows, countedTokens } from '../lib/settings'
import { C, EASE_OUT } from '../lib/theme'

const N_WEEKS_MAX = 26

function status(p) {
  if (p >= 1) return { label: 'Melebihi batas', icon: '⛔', color: C.critical }
  if (p >= 0.8) return { label: 'Hampir habis', icon: '⚠️', color: C.warning }
  return { label: 'Aman', icon: '✓', color: C.accent }
}

// Meter kuota akun; isinya ditumpuk per anggota supaya terlihat siapa memakai berapa.
function StackedMeter({ title, byMember, limit, members, memberColor, foot }) {
  const used = Object.values(byMember).reduce((a, b) => a + b, 0)
  const p = used / Math.max(1, limit)
  const st = status(p)
  const scale = Math.max(limit, used)          // di atas 100%: penuhi bar, proporsi tetap
  const parts = members.filter(m => byMember[m] > 0)
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
      <div className="progress stacked">
        {parts.map((m, i) => (
          <motion.div
            key={m}
            className="progress-seg"
            style={{ background: memberColor[m] }}
            initial={{ width: 0 }}
            animate={{ width: (byMember[m] / scale) * 100 + '%' }}
            transition={{ duration: 0.8, ease: EASE_OUT, delay: i * 0.06 }}
            title={`${m}: ${tok(byMember[m])}`}
          />
        ))}
      </div>
      {parts.length > 0 && (
        <div className="meter-split">
          {parts.map(m => (
            <span key={m}><i style={{ background: memberColor[m] }} />{m} {tok(byMember[m])} ({pct(byMember[m] / Math.max(1, limit))})</span>
          ))}
        </div>
      )}
      <div className="meter-foot">{foot}</div>
    </div>
  )
}

const fmtReset = d => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' }) + ' ' + fmtTime(d)

export default function LimitsSection({ members, memberColor, hourly, settings, account, lastSeen, dutyToday, from, to, onOpenSettings, i0 = 0 }) {
  const now = new Date()
  const cfg = useMemo(() => accountConfig(settings, account), [settings, account])
  const windows = useMemo(() => accountWindows(hourly), [hourly])

  const last = windows[windows.length - 1]
  const active = !!last && now < last.end
  const ws = cfg.weekStart(now)
  const we = new Date(ws.getTime() + WEEK_MS)
  const weekBy = {}
  hourly.forEach(r => { if (r.t >= ws) weekBy[r.member] = (weekBy[r.member] || 0) + countedTokens(r) })

  // jendela 5 jam akun dalam rentang tanggal, ditumpuk per anggota
  const winData = useMemo(() => {
    const W = windows.filter(w => {
      const d = w.t.getFullYear() + '-' + String(w.t.getMonth() + 1).padStart(2, '0') + '-' + String(w.t.getDate()).padStart(2, '0')
      return d >= from && d <= to
    })
    const datasets = members
      .filter(m => W.some(w => w.byMember[m]))
      .map(m => barDataset(m, W.map(w => +(((w.byMember[m] || 0) / cfg.limit5h) * 100).toFixed(1)), memberColor[m]))
    const maxP = Math.max(100, ...W.map(w => (w.counted / cfg.limit5h) * 100))
    return {
      W,
      data: { labels: W.map(w => fmtDT(w.t)), datasets: [...datasets, refLine(W.length, 100, 'Batas sesi')] },
      max: Math.ceil((maxP + 10) / 10) * 10,
    }
  }, [windows, members, from, to, cfg, memberColor])

  // mingguan per periode reset akun, ditumpuk per anggota
  const weekData = useMemo(() => {
    const fromT = new Date(from + 'T00:00').getTime()
    const cur = cfg.weekStart(now).getTime()
    let n = 1
    while (n < N_WEEKS_MAX && cur - (n - 1) * WEEK_MS > fromT) n++
    const starts = Array.from({ length: n }, (_, i) => cur - (n - 1 - i) * WEEK_MS)
    const vals = members.map(m => starts.map(s =>
      hourly.filter(r => r.member === m && r.t >= s && r.t < s + WEEK_MS).reduce((a, r) => a + countedTokens(r), 0)))
    const totals = starts.map((_, i) => vals.reduce((a, v) => a + v[i], 0))
    const maxP = Math.max(100, ...totals.map(v => (v / cfg.limitWeek) * 100))
    return {
      vals, totals,
      data: {
        labels: starts.map(s => new Date(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })),
        datasets: [
          ...members.map((m, i) => [m, i]).filter(([, i]) => vals[i].some(v => v > 0))
            .map(([m, i]) => barDataset(m, vals[i].map(v => +((v / cfg.limitWeek) * 100).toFixed(1)), memberColor[m])),
          refLine(starts.length, 100, 'Batas mingguan'),
        ],
      },
      max: Math.ceil((maxP + 10) / 10) * 10,
    }
  }, [hourly, members, from, cfg, memberColor]) // eslint-disable-line react-hooks/exhaustive-deps

  const winOpts = baseOptions({
    stacked: true, fmt: v => v + '%', max: winData.max,
    tooltipLabel: c => ` ${c.dataset.label}: ${tok(winData.W[c.dataIndex].byMember[c.dataset.label] || 0)} (${c.raw}%)`,
  })
  winOpts.plugins.tooltip.filter = i => i.raw > 0 && !i.dataset.isRef
  winOpts.plugins.tooltip.callbacks.footer = items => {
    const w = winData.W[items[0].dataIndex]
    return `Total ${tok(w.counted)} (${pct(w.counted / cfg.limit5h)}) · ${nf.format(w.prompts)} prompt`
  }
  const weekOpts = baseOptions({
    stacked: true, fmt: v => v + '%', max: weekData.max,
    tooltipLabel: c => ` ${c.dataset.label}: ${tok(weekData.vals[members.indexOf(c.dataset.label)][c.dataIndex])} (${c.raw}%)`,
  })
  weekOpts.plugins.tooltip.filter = i => i.raw > 0 && !i.dataset.isRef
  weekOpts.plugins.tooltip.callbacks.footer = items => {
    const v = weekData.totals[items[0].dataIndex]
    return `Total ${tok(v)} (${pct(v / cfg.limitWeek)})`
  }

  const legendItems = members.map(m => ({ key: m, label: m, color: memberColor[m] }))
  const usedBy5h = active ? last.byMember : {}

  return (
    <>
      <Card
        i={i0}
        className="span-12 limits"
        title="Batas penggunaan akun Claude bersama"
        desc="Satu akun dipakai bergantian di perangkat tiap anggota. Kuota sesi 5 jam dan mingguan dihitung dari gabungan semua perangkat. Token terhitung = input + cache write + output."
        right={<button className="btn-ghost" onClick={onOpenSettings}>⚙ Kalibrasi</button>}
      >
        {cfg.calibrated
          ? <div className="calib-note">✓ Terkalibrasi{cfg.updatedBy ? ` oleh ${cfg.updatedBy}` : ''} · {fmtDT(cfg.updatedAt)}</div>
          : (
            <div className="callout">
              Akun belum dikalibrasi. Batas masih memakai default ({tok(cfg.limit5h)} per 5 jam, {tok(cfg.limitWeek)} per minggu, reset Senin 00.00).{' '}
              <button className="link" onClick={onOpenSettings}>Kalibrasi sekarang</button>
            </div>
          )}

        <div className="limit-grid">
          <motion.div className="limit-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.1 }}>
            <StackedMeter
              title="Sesi (jendela 5 jam)"
              byMember={usedBy5h}
              limit={cfg.limit5h}
              members={members}
              memberColor={memberColor}
              foot={active
                ? <>Dimulai {fmtTime(last.t)} · reset pukul <b>{fmtTime(last.end)}</b> · sisa {dur(last.end - now)}</>
                : 'Tidak ada sesi aktif. Jendela baru dimulai saat prompt berikutnya dari perangkat mana pun.'}
            />
          </motion.div>
          <motion.div className="limit-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 }}>
            <StackedMeter
              title="Mingguan"
              byMember={weekBy}
              limit={cfg.limitWeek}
              members={members}
              memberColor={memberColor}
              foot={<>Reset <b>{fmtReset(we)}</b> · sisa {dur(we - now)}</>}
            />
          </motion.div>
        </div>

        <div className="devices">
          <span className="devices-label">Data terakhir per perangkat</span>
          {members.map(m => (
            <span key={m} className={'device' + (dutyToday === m ? ' duty' : '')}>
              <i style={{ background: memberColor[m] }} />
              <b>{m}</b>{dutyToday === m && <em>piket</em>}
              <span className="muted">{lastSeen[m] ? fmtDT(lastSeen[m]) : 'belum unggah'}</span>
            </span>
          ))}
        </div>
      </Card>

      <Card i={i0 + 1} className="span-8" title="Pemakaian per jendela 5 jam" desc="Persentase kuota sesi akun, ditumpuk per anggota. Garis putus-putus = 100%.">
        <Legend items={legendItems} />
        {winData.W.length ? <BarChart data={winData.data} options={winOpts} height={300} /> : <div className="empty">Tidak ada jendela pada rentang ini</div>}
      </Card>

      <Card i={i0 + 2} className="span-4" title="Pemakaian mingguan" desc="Persentase kuota mingguan akun per periode reset.">
        <Legend items={legendItems} />
        <BarChart data={weekData.data} options={weekOpts} height={300} />
      </Card>
    </>
  )
}
