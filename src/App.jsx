import { useCallback, useEffect, useMemo, useState } from 'react'
import { MotionConfig, motion } from 'motion/react'
import { loadData } from './lib/data'
import { dayKey, fmtDay, fmtDT, fromDayKey, nf, pct, shortEntry, shortModel, shortTool, tok, usd, dur } from './lib/format'
import { countedTokens, useSettings } from './lib/settings'
import { TEAM, dutyFor } from './lib/piket'
import { EASE_OUT, slot } from './lib/theme'
import { AnimatedNumber, Card, Legend, Segmented } from './components/ui'
import { BarChart, LineChart, barDataset, baseOptions, hbarDataset } from './components/charts'
import LimitsSection from './components/LimitsSection'
import Heatmap from './components/Heatmap'
import DataTable from './components/DataTable'
import Glossary from './components/Glossary'
import { DutyModal } from './components/Modals'
import CalibrateModal from './components/Calibrate'

const PERIODS = [
  { value: 1, label: 'Hari ini' }, { value: 7, label: '7 hari' }, { value: 30, label: '30 hari' },
  { value: 90, label: '90 hari' }, { value: 0, label: 'Semua' },
]
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0)
const uniq = arr => [...new Set(arr)]
const toggleIn = set => k => { const n = new Set(set); n.has(k) ? n.delete(k) : n.add(k); return n }

export default function App() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [settings, setSettings] = useSettings()
  const [period, setPeriod] = useState(30)
  const [range, setRange] = useState({ from: '', to: '' })
  const [f, setF] = useState({ member: '', project: '', model: '', entry: '', sub: true })
  const [hidden, setHidden] = useState({ tok: new Set(), act: new Set(), cost: new Set() })
  const [dutyOpen, setDutyOpen] = useState(false)
  const [setOpen, setSetOpen] = useState(false)
  const duty = useMemo(() => dutyFor(), [])

  useEffect(() => { loadData().then(setData).catch(e => setError(e.message)) }, [])

  // pop-up piket muncul otomatis sekali per hari di browser ini
  useEffect(() => {
    let shown = null
    try { shown = localStorage.getItem('piket-shown') } catch { /* abaikan */ }
    const today = dayKey(new Date())
    if (shown !== today) {
      const t = setTimeout(() => setDutyOpen(true), 500)
      try { localStorage.setItem('piket-shown', today) } catch { /* abaikan */ }
      return () => clearTimeout(t)
    }
  }, [])

  const allMembers = useMemo(() => {
    const present = data ? uniq(data.hourly.map(r => r.member)) : []
    return [...TEAM.filter(m => present.includes(m)), ...present.filter(m => !TEAM.includes(m)).sort()]
  }, [data])
  // warna mengikuti orang (bukan peringkat): urutan tim tetap
  const memberColor = useMemo(() => {
    const names = [...TEAM, ...allMembers.filter(m => !TEAM.includes(m))]
    return Object.fromEntries(names.map((m, i) => [m, slot(i)]))
  }, [allMembers])

  const bounds = useMemo(() => {
    if (!data || !data.hourly.length) { const t = dayKey(new Date()); return { first: t, last: t } }
    return { first: data.hourly[0].day, last: data.hourly[data.hourly.length - 1].day }
  }, [data])

  const choosePeriod = useCallback(p => {
    setPeriod(p)
    const today = dayKey(new Date())
    if (p === 0) setRange({ from: bounds.first, to: today > bounds.last ? today : bounds.last })
    else { const s = new Date(); s.setDate(s.getDate() - (p - 1)); setRange({ from: dayKey(s), to: today }) }
  }, [bounds])
  useEffect(() => { if (data) choosePeriod(period) }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  const from = range.from || bounds.first
  const to = range.to || bounds.last

  const view = useMemo(() => {
    if (!data) return null
    const inScope = r => r.day >= from && r.day <= to && (!f.member || r.member === f.member) &&
      (!f.project || r.project === f.project) && (!f.entry || r.entry === f.entry) && (f.sub || !r.subagent)
    const calls = data.hourly.filter(r => r.model && inScope(r) && (!f.model || r.model === f.model))
    const promptRows = data.hourly.filter(r => r.prompts && inScope(r))
    const tools = data.tools.filter(r => inScope(r) && (!f.model || r.model === f.model))
    const sessions = data.sessions.filter(s => s.day >= from && s.day <= to && (!f.member || s.member === f.member) &&
      (!f.project || s.project === f.project) && (!f.entry || s.entry === f.entry) && (!f.model || s.models.split(', ').includes(f.model)))

    const days = []
    for (let d = fromDayKey(from); dayKey(d) <= to; d.setDate(d.getDate() + 1)) days.push(dayKey(d))
    const idx = Object.fromEntries(days.map((d, i) => [d, i]))
    const perDay = (rows, fn) => { const a = new Array(days.length).fill(0); rows.forEach(r => { if (idx[r.day] != null) a[idx[r.day]] += fn(r) }); return a }

    const tot = {
      input: sum(calls, r => r.input), output: sum(calls, r => r.output), thinking: sum(calls, r => r.thinking),
      cr: sum(calls, r => r.cache_read), cw: sum(calls, r => r.cache_write_5m + r.cache_write_1h),
      cost: sum(calls, r => r.cost), calls: sum(calls, r => r.calls), web: sum(calls, r => r.web_search),
      prompts: sum(promptRows, r => r.prompts), counted: sum(calls, r => countedTokens(r)),
    }
    const activeDays = new Set(calls.map(r => r.day)).size
    return { calls, promptRows, tools, sessions, days, idx, perDay, tot, activeDays }
  }, [data, from, to, f])

  if (error) return <div className="wrap"><div className="card empty">Gagal memuat data: {error}</div></div>
  if (!data || !view) return <div className="wrap"><div className="loading"><span className="spinner" /> Memuat data…</div></div>

  const { calls, promptRows, tools, sessions, days, perDay, tot, activeDays } = view
  const labels = days.map(fmtDay)
  const opt = arr => [...arr].sort()
  const projects = opt(uniq(data.hourly.map(r => r.project)))
  const models = opt(uniq(data.hourly.map(r => r.model).filter(Boolean)))
  const entries = opt(uniq(data.hourly.map(r => r.entry)))
  // batas berlaku untuk akun bersama: selalu semua anggota, tidak ikut filter
  const teamMembers = [...TEAM, ...allMembers.filter(m => !TEAM.includes(m))]

  // --- token harian per jenis
  const TOK = [['input', 'Input', r => r.input], ['cw', 'Cache write', r => r.cache_write_5m + r.cache_write_1h], ['cr', 'Cache read', r => r.cache_read], ['output', 'Output', r => r.output]]
  const tokData = { labels, datasets: TOK.map((t, i) => [t, i]).filter(([t]) => !hidden.tok.has(t[0])).map(([t, i]) => barDataset(t[1], perDay(calls, t[2]), slot(i))) }

  // --- aktivitas
  const actData = {
    labels,
    datasets: [['p', 'Prompt', perDay(promptRows, r => r.prompts), 0], ['c', 'Panggilan API', perDay(calls, r => r.calls), 1]]
      .filter(s => !hidden.act.has(s[0]))
      .map(s => ({ label: s[1], data: s[2], borderColor: slot(s[3]), backgroundColor: slot(s[3]), borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2, pointHoverBorderColor: '#fffefb', tension: 0.3 })),
  }

  // --- per anggota / proyek / tool
  const group = (rows, key, val) => { const g = {}; rows.forEach(r => { g[r[key]] = (g[r[key]] || 0) + val(r) }); return Object.entries(g).sort((a, b) => b[1] - a[1]) }
  const byMember = group(calls, 'member', r => countedTokens(r))
  const byProject = group(calls, 'project', r => countedTokens(r))
  const byTool = group(tools, 'tool', r => r.count).slice(0, 12)

  // --- biaya per model (urutan stabil berdasarkan seluruh data)
  const modelOrder = group(data.hourly.filter(r => r.model), 'model', r => r.cost).map(e => e[0])
  const costModels = modelOrder.filter(m => calls.some(r => r.model === m))
  const costData = { labels, datasets: costModels.filter(m => !hidden.cost.has(m)).map(m => barDataset(shortModel(m), perDay(calls.filter(r => r.model === m), r => r.cost).map(v => +v.toFixed(4)), slot(modelOrder.indexOf(m)))) }

  // --- rincian biaya per jenis token (estimasi)
  const PR = { 'claude-fable-5-1': [10, 50, 0.25], 'claude-fable-5': [10, 50, 1], 'claude-opus-5-5': [4, 20, 0.2], 'claude-opus-5': [5, 25, 0.5], 'claude-sonnet-5-5': [2, 10, 0.2], 'claude-sonnet-5': [2, 10, 0.2], 'claude-haiku-5-5': [0.1, 0.5, 0.01] }
  const brk = { input: 0, cw: 0, cr: 0, output: 0, crFull: 0 }
  calls.forEach(r => { const p = PR[r.model] || [5, 25, 0.5]; brk.input += r.input * p[0] / 1e6; brk.output += r.output * p[1] / 1e6; brk.cr += r.cache_read * p[2] / 1e6; brk.crFull += r.cache_read * p[0] / 1e6; brk.cw += (r.cache_write_5m * 1.25 + r.cache_write_1h * 2) * p[0] / 1e6 })
  const brkRows = [['input', 'Input', tot.input, 0], ['cw', 'Cache write', tot.cw, 1], ['cr', 'Cache read', tot.cr, 2], ['output', 'Output', tot.output, 3]]
  const brkTotal = Math.max(1e-9, brk.input + brk.cw + brk.cr + brk.output)

  // --- tabel harian & sesi
  const daily = days.map((d, i) => ({ id: d, day: d, tokens: 0, counted: 0, prompts: 0, calls: 0, input: 0, output: 0, cr: 0, cw: 0, cost: 0, members: new Set() }))
  calls.forEach(r => { const x = daily[view.idx[r.day]]; x.calls += r.calls; x.input += r.input; x.output += r.output; x.cr += r.cache_read; x.cw += r.cache_write_5m + r.cache_write_1h; x.cost += r.cost; x.counted += countedTokens(r); x.members.add(r.member) })
  promptRows.forEach(r => { daily[view.idx[r.day]].prompts += r.prompts })
  const dailyRows = daily.filter(r => r.calls || r.prompts).map(r => ({ ...r, members: [...r.members].join(', ') }))
  const maxDaily = Math.max(1, ...dailyRows.map(r => r.counted))
  const sessRows = sessions.map(s => ({ ...s, id: s.member + s.session_id, start: s.t, span: s.end - s.t, lines: s.lines_added + s.lines_removed }))

  const kpis = [
    ['Token terhitung', tot.counted, tok, 'input + cache write + output'],
    ['Total token', tot.input + tot.output + tot.cr + tot.cw, tok, `termasuk cache read ${tok(tot.cr)}`],
    ['Prompt diketik', tot.prompts, v => nf.format(Math.round(v)), `${(tot.prompts / Math.max(1, activeDays)).toLocaleString('id-ID', { maximumFractionDigits: 1 })} per hari aktif`],
    ['Panggilan API', tot.calls, v => nf.format(Math.round(v)), `${(tot.calls / Math.max(1, tot.prompts)).toLocaleString('id-ID', { maximumFractionDigits: 1 })} per prompt`],
    ['Sesi', sessions.length, v => nf.format(Math.round(v)), `${activeDays} hari aktif dari ${days.length}`],
    ['Cache hit rate', tot.cr / Math.max(1, tot.cr + tot.input + tot.cw), pct, 'porsi konteks dari cache'],
    ['Pemanggilan tool', sum(tools, r => r.count), v => nf.format(Math.round(v)), `${nf.format(tot.web)} pencarian web`],
    ['Estimasi biaya API', tot.cost, usd, 'setara tarif API, bukan tagihan langganan'],
  ]

  const sel = (key, label, items, fmt = x => x) => (
    <label>{label}
      <select value={f[key]} onChange={e => setF(s => ({ ...s, [key]: e.target.value }))}>
        <option value="">Semua</option>
        {items.map(x => <option key={x} value={x}>{fmt(x)}</option>)}
      </select>
    </label>
  )

  return (
    <MotionConfig reducedMotion="user">
      <div className="wrap">
        <motion.header initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }}>
          <div className="brand">
            <motion.div className="logo" aria-hidden="true" initial={{ scale: 0.8, rotate: -8 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', duration: 0.6, bounce: 0.35 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h4l3-7 4 14 3-7h4" /></svg>
            </motion.div>
            <div>
              <h1>Monitoring Claude</h1>
              <div className="by">by Maniac AI</div>
            </div>
          </div>
          <div className="head-actions">
            <button className="duty-chip" onClick={() => setDutyOpen(true)}>
              <span className="dot" />
              {duty.today.who ? <>Piket hari ini: <b>{duty.today.who}</b></> : 'Hari ini bebas piket'}
            </button>
            <motion.button className="btn-primary" onClick={() => setDutyOpen(true)} whileTap={{ scale: 0.97 }}>Jadwal piket</motion.button>
          </div>
        </motion.header>
        <div className="meta">Sumber: {data.source} · {nf.format(data.hourly.length)} baris ringkasan · data {bounds.first} s.d. {bounds.last} · dimuat {fmtDT(new Date())}</div>

        <motion.div className="filters" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.05 }}>
          <label>Periode<Segmented id="period" options={PERIODS} value={period} onChange={choosePeriod} /></label>
          <label>Dari<input type="date" value={from} onChange={e => { setPeriod(-1); setRange(r => ({ ...r, from: e.target.value })) }} /></label>
          <label>Sampai<input type="date" value={to} onChange={e => { setPeriod(-1); setRange(r => ({ ...r, to: e.target.value })) }} /></label>
          {sel('member', 'Anggota', allMembers)}
          {sel('project', 'Proyek', projects)}
          {sel('model', 'Model', models, shortModel)}
          {sel('entry', 'Aplikasi', entries, shortEntry)}
          <label className="check"><input type="checkbox" checked={f.sub} onChange={e => setF(s => ({ ...s, sub: e.target.checked }))} /> Sertakan subagent</label>
        </motion.div>

        <div className="grid">
          <LimitsSection
            members={teamMembers} memberColor={memberColor} hourly={data.hourly} settings={settings}
            account={data.account} lastSeen={data.lastSeen} dutyToday={duty.today.who}
            from={from} to={to} onOpenSettings={() => setSetOpen(true)} i0={0}
          />

          <div className="kpis span-12">
            {kpis.map((k, i) => (
              <motion.div key={k[0]} className="kpi" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.15 + i * 0.03 }}>
                <div className="k">{k[0]}</div>
                <div className="v"><AnimatedNumber value={k[1]} format={k[2]} /></div>
                <div className="d">{k[3]}</div>
              </motion.div>
            ))}
          </div>

          <Card i={3} className="span-8" title="Token harian per jenis" desc="Klik legenda untuk menyembunyikan jenis. Cache read biasanya dominan namun paling ringan.">
            <Legend items={TOK.map((t, i) => ({ key: t[0], label: t[1], color: slot(i) }))} hidden={hidden.tok} onToggle={k => setHidden(h => ({ ...h, tok: toggleIn(h.tok)(k) }))} />
            <BarChart data={tokData} options={baseOptions({ stacked: true, fmt: tok })} />
          </Card>

          <Card i={4} className="span-4" title="Komposisi token" desc="Porsi tiap jenis token (bobot setara tarif API).">
            {calls.length ? <>
              <div className="stack">
                {brkRows.map(r => brk[r[0]] > 0 && (
                  <motion.div key={r[0]} style={{ background: slot(r[3]) }} initial={{ flexGrow: 0 }} animate={{ flexGrow: brk[r[0]] }} transition={{ duration: 0.7, ease: EASE_OUT }} title={r[1]} />
                ))}
              </div>
              <table className="brk"><thead><tr><th className="l">Jenis</th><th>Token</th><th>Bobot</th></tr></thead>
                <tbody>{brkRows.map(r => <tr key={r[0]}><td className="l"><i style={{ background: slot(r[3]) }} />{r[1]}</td><td>{tok(r[2])}</td><td>{pct(brk[r[0]] / brkTotal)}</td></tr>)}</tbody>
              </table>
              <div className="note">Cache menghemat: {tok(tot.cr)} token konteks dibaca ulang dengan bobot ±{pct(brk.cr / Math.max(1e-9, brk.crFull))} dari input biasa.</div>
            </> : <div className="empty">Tidak ada data</div>}
          </Card>

          <Card i={5} className="span-7" title="Pola jam kerja" desc="Jumlah prompt per hari-dalam-minggu × jam (waktu lokal).">
            <Heatmap rows={promptRows} />
          </Card>

          <Card i={6} className="span-5" title="Aktivitas harian" desc="Prompt yang diketik vs. panggilan API yang dihasilkan.">
            <Legend items={[{ key: 'p', label: 'Prompt', color: slot(0) }, { key: 'c', label: 'Panggilan API', color: slot(1) }]} hidden={hidden.act} onToggle={k => setHidden(h => ({ ...h, act: toggleIn(h.act)(k) }))} />
            <LineChart data={actData} options={baseOptions({ fmt: v => nf.format(v) })} height={250} />
          </Card>

          <Card i={7} className="span-4" title="Token per anggota" desc="Token terhitung dalam periode.">
            <BarChart height={260} data={{ labels: byMember.map(e => e[0]), datasets: [{ ...hbarDataset('Token', byMember.map(e => e[1]), slot(0)), backgroundColor: byMember.map(e => memberColor[e[0]]) }] }} options={baseOptions({ horizontal: true, fmt: tok })} />
          </Card>

          <Card i={8} className="span-4" title="Token per proyek" desc="Folder kerja tempat Claude dijalankan.">
            <BarChart height={260} data={{ labels: byProject.map(e => (e[0].length > 24 ? e[0].slice(0, 23) + '…' : e[0])), datasets: [hbarDataset('Token', byProject.map(e => e[1]), slot(0))] }} options={baseOptions({ horizontal: true, fmt: tok })} />
          </Card>

          <Card i={9} className="span-4" title="Tool terpopuler" desc="Jumlah pemanggilan tool (12 teratas).">
            <BarChart height={260} data={{ labels: byTool.map(e => shortTool(e[0])), datasets: [hbarDataset('Pemanggilan', byTool.map(e => e[1]), slot(0))] }} options={baseOptions({ horizontal: true, fmt: v => nf.format(v) })} />
          </Card>

          <Card i={10} className="span-12" title="Rincian harian" desc="Klik judul kolom untuk mengurutkan.">
            <DataTable rows={dailyRows} defaultSort="day" cols={[
              { key: 'day', label: 'Tanggal', align: 'l', render: r => fromDayKey(r.day).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) },
              { key: 'members', label: 'Anggota', align: 'l' },
              { key: 'prompts', label: 'Prompt', render: r => nf.format(r.prompts) },
              { key: 'calls', label: 'Panggilan API', render: r => nf.format(r.calls) },
              { key: 'input', label: 'Input', render: r => tok(r.input) },
              { key: 'output', label: 'Output', render: r => tok(r.output) },
              { key: 'cw', label: 'Cache write', render: r => tok(r.cw) },
              { key: 'cr', label: 'Cache read', render: r => tok(r.cr) },
              { key: 'counted', label: 'Token terhitung', render: r => <span className="bar-cell"><b style={{ width: Math.round(r.counted / maxDaily * 80) }} />{tok(r.counted)}</span> },
              { key: 'cost', label: 'Est. biaya', render: r => usd(r.cost) },
            ]} />
          </Card>

          <Card i={11} className="span-12" title="Sesi" desc="Rentang = pesan pertama s.d. terakhir (termasuk jeda).">
            <DataTable rows={sessRows} defaultSort="start" cols={[
              { key: 'title', label: 'Judul', align: 'l', className: 'title', render: r => <span title={r.title}>{r.title}</span> },
              { key: 'member', label: 'Anggota', align: 'l' },
              { key: 'project', label: 'Proyek', align: 'l' },
              { key: 'entry', label: 'Aplikasi', align: 'l', render: r => shortEntry(r.entry) },
              { key: 'models', label: 'Model', align: 'l', render: r => r.models.split(', ').map(shortModel).join(', ') },
              { key: 'start', label: 'Mulai', render: r => fmtDT(r.start) },
              { key: 'span', label: 'Rentang', render: r => dur(r.span) },
              { key: 'prompts', label: 'Prompt' },
              { key: 'calls', label: 'Panggilan', render: r => nf.format(r.calls) },
              { key: 'tokens', label: 'Token', render: r => tok(r.tokens) },
              { key: 'lines', label: 'Baris +/−', render: r => (r.lines ? `+${nf.format(r.lines_added)} / −${nf.format(r.lines_removed)}` : '—') },
              { key: 'cost', label: 'Est. biaya', render: r => usd(r.cost) },
            ]} />
          </Card>

          <Card i={12} className="span-12" title="Estimasi biaya harian per model" desc="USD setara tarif API, sebagai pembanding intensitas. Bukan tagihan paket langganan.">
            <Legend items={costModels.map(m => ({ key: m, label: shortModel(m), color: slot(modelOrder.indexOf(m)) }))} hidden={hidden.cost} onToggle={k => setHidden(h => ({ ...h, cost: toggleIn(h.cost)(k) }))} />
            <BarChart data={costData} options={baseOptions({ stacked: true, fmt: usd })} height={240} />
          </Card>
        </div>

        <Glossary />
        <footer>Monitoring Claude · by Maniac AI</footer>
      </div>

      <DutyModal open={dutyOpen} onClose={() => setDutyOpen(false)} duty={duty} memberColor={memberColor} />
      {setOpen && <CalibrateModal open={setOpen} onClose={() => setSetOpen(false)} members={teamMembers} data={data} settings={settings} setSettings={setSettings} onSaved={() => loadData().then(setData)} />}
    </MotionConfig>
  )
}
