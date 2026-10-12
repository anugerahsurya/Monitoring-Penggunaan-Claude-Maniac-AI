import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Modal } from './ui'
import { DAY_NAMES } from '../lib/piket'
import { DEFAULTS, WEEK_MS, accountConfig, accountWindows, countedTokens } from '../lib/settings'
import { dur, fmtDT, fmtTime, nf, tok } from '../lib/format'
import { hasSupabase, saveAccountSettings } from '../lib/data'

const store = {
  get: k => { try { return localStorage.getItem(k) || '' } catch { return '' } },
  set: (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k) } catch { /* abaikan */ } },
}

// Kalibrasi akun bersama dari popup "Plan usage limits" di Claude:
// persen sesi + persen mingguan + "Resets in" mingguan → batas token & jadwal reset akun.
export default function CalibrateModal({ open, onClose, members, data, settings, setSettings, onSaved }) {
  const [token, setToken] = useState(() => store.get('mc-token'))
  const [remember, setRemember] = useState(true)
  const [sesPct, setSesPct] = useState('')
  const [weekPct, setWeekPct] = useState('')
  const [rh, setRh] = useState('')
  const [rm, setRm] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [def, setDef] = useState(settings)

  const calc = useMemo(() => {
    const now = new Date()
    const cur = accountConfig(settings, data.account)
    const wins = accountWindows(data.hourly)
    const last = wins[wins.length - 1]
    const active = !!last && now < last.end
    const used5h = active ? last.counted : 0
    const anchor = rh !== '' || rm !== ''
      ? new Date(Math.round((now.getTime() + ((+rh || 0) * 60 + (+rm || 0)) * 60000) / 60000) * 60000)
      : null
    const ws = anchor ? new Date(anchor.getTime() - WEEK_MS) : cur.weekStart(now)
    // baris per jam: ikutkan jam yang sebagian berada setelah awal minggu
    const usedWeek = data.hourly.filter(r => r.t.getTime() + 3600e3 > ws.getTime()).reduce((a, r) => a + countedTokens(r), 0)
    const newest = Object.values(data.lastSeen).reduce((a, t) => (!a || t > a ? t : a), null)
    const sp = +sesPct
    const wp = +weekPct
    return {
      now, cur, active, last, used5h, usedWeek, anchor, newest,
      stale: !newest || now - newest > 30 * 60000,
      limit5h: sp > 0 && active && used5h > 0 ? used5h / (sp / 100) : null,
      limitWeek: wp > 0 && usedWeek > 0 ? usedWeek / (wp / 100) : null,
    }
  }, [sesPct, weekPct, rh, rm, data, settings])

  const canSave = !!(calc.limit5h || calc.limitWeek || calc.anchor) && (!hasSupabase || !!token.trim())

  async function save() {
    setBusy(true)
    setMsg(null)
    try {
      const who = await saveAccountSettings({
        token,
        member: store.get('mc-me') || null,
        weekAnchor: calc.anchor || calc.cur.weekStart(calc.now),
        limit5h: calc.limit5h || calc.cur.limit5h,
        limitWeek: calc.limitWeek || calc.cur.limitWeek,
      })
      if (who) store.set('mc-me', who)
      store.set('mc-token', remember ? token.trim() : '')
      setSettings(def)
      setMsg({ ok: true, text: `Tersimpan${who ? ' sebagai ' + who : ''}. Dashboard dimuat ulang.` })
      await onSaved()
      setTimeout(onClose, 700)
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const sp = +sesPct
  return (
    <Modal open={open} onClose={onClose} labelledBy="calTitle" width={560}>
      <div className="eyebrow">Kalibrasi akun bersama</div>
      <h3 id="calTitle">Cocokkan dengan angka di Claude</h3>
      <p className="sub">
        Buka popup <b>Plan usage limits</b> di Claude (atau ketik <code>/usage</code> di Claude Code), lalu salin angkanya ke sini.
        Karena keempat perangkat memakai akun yang sama, kalibrasi cukup dilakukan sekali oleh siapa saja.
      </p>

      <div className="form">
        <AnimatePresence>
          {calc.stale && (
            <motion.div className="callout warn" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              Data terbaru yang terunggah: {calc.newest ? fmtDT(calc.newest) : 'belum ada'}. Jalankan <b>Unggah Penggunaan.bat</b> di perangkat
              yang dipakai hari ini, lalu muat ulang halaman, supaya angkanya sama dengan yang tampil di Claude.
            </motion.div>
          )}
        </AnimatePresence>

        <div className="row2">
          <label>Session limit (%)
            <input type="number" min="0" max="100" step="1" value={sesPct} onChange={e => setSesPct(e.target.value)} placeholder="mis. 19" />
            <span className="hint">
              {calc.active
                ? <>Terpakai {tok(calc.used5h)} sejak {fmtTime(calc.last.t)} · reset {fmtTime(calc.last.end)} (sisa {dur(calc.last.end - calc.now)})</>
                : 'Tidak ada sesi aktif, jadi batas sesi belum bisa dikalibrasi sekarang.'}
            </span>
          </label>
          <label>Weekly · all models (%)
            <input type="number" min="0" max="100" step="1" value={weekPct} onChange={e => setWeekPct(e.target.value)} placeholder="mis. 34" />
            <span className="hint">Terpakai {tok(calc.usedWeek)} sejak reset mingguan terakhir</span>
          </label>
        </div>

        <label>Weekly “Resets in”
          <div className="row">
            <input type="number" min="0" max="168" value={rh} onChange={e => setRh(e.target.value)} placeholder="jam" style={{ width: 90 }} />
            <span className="unit">jam</span>
            <input type="number" min="0" max="59" value={rm} onChange={e => setRm(e.target.value)} placeholder="menit" style={{ width: 90 }} />
            <span className="unit">menit</span>
          </div>
          <span className="hint">
            {calc.anchor
              ? <>Reset mingguan akun: <b>{DAY_NAMES[(calc.anchor.getDay() + 6) % 7]} {fmtTime(calc.anchor)}</b>, berulang setiap minggu</>
              : 'Contoh: “Resets in 16 hr 28 min”, isi 16 dan 28. Isi juga persen mingguan di atas.'}
          </span>
        </label>

        {hasSupabase && (
          <label>Token unggah (milik anggota mana pun)
            <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="token di collector/config.json" autoComplete="off" />
          </label>
        )}

        <div className="preview">
          <div><span>Batas sesi 5 jam</span><b>{calc.limit5h ? tok(calc.limit5h) : tok(calc.cur.limit5h) + ' (tetap)'}</b></div>
          <div><span>Batas mingguan</span><b>{calc.limitWeek ? tok(calc.limitWeek) : tok(calc.cur.limitWeek) + ' (tetap)'}</b></div>
          {sp > 0 && sp < 10 && <div className="hint">Persen di bawah 10% masih kasar karena Claude membulatkannya. Kalibrasi ulang saat pemakaian lebih tinggi supaya lebih akurat.</div>}
        </div>
        <div className="hint">
          Hanya pemakaian yang tercatat oleh Claude Code dan sudah diunggah yang bisa dihitung. Obrolan di claude.ai ikut memakai kuota akun,
          tapi tidak tercatat di sini, sehingga hasil kalibrasi bisa sedikit melenceng.
          {!hasSupabase && ' Mode file lokal: hasil hanya disimpan di browser ini.'}
        </div>
      </div>

      <details className="defaults">
        <summary>Default sebelum akun dikalibrasi</summary>
        <div className="form">
          <div className="row2">
            <label>Batas 5 jam (token)
              <input type="number" min="1" step="100000" value={def.limit5h} onChange={e => setDef(d => ({ ...d, limit5h: +e.target.value || 1 }))} />
              <span className="hint">{nf.format(def.limit5h)}</span>
            </label>
            <label>Batas mingguan (token)
              <input type="number" min="1" step="1000000" value={def.limitWeek} onChange={e => setDef(d => ({ ...d, limitWeek: +e.target.value || 1 }))} />
              <span className="hint">{nf.format(def.limitWeek)}</span>
            </label>
          </div>
          <label>Reset mingguan default
            <div className="row">
              <select value={def.resetDay} onChange={e => setDef(d => ({ ...d, resetDay: +e.target.value }))}>
                {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <select value={def.resetHour} onChange={e => setDef(d => ({ ...d, resetHour: +e.target.value }))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}.00</option>)}
              </select>
              <button className="btn-ghost" onClick={() => setDef(DEFAULTS)}>Kembalikan</button>
            </div>
          </label>
        </div>
      </details>

      <AnimatePresence>
        {msg && (
          <motion.div className={'callout ' + (msg.ok ? 'ok' : 'err')} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {msg.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="actions">
        {hasSupabase && (
          <label className="check remember"><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Ingat token di browser ini</label>
        )}
        <button className="btn-ghost" onClick={() => { setSettings(def); onClose() }}>Simpan default saja</button>
        <motion.button className="btn-primary" disabled={!canSave || busy} onClick={save} whileTap={{ scale: 0.97 }}>
          {busy ? 'Menyimpan…' : 'Simpan kalibrasi'}
        </motion.button>
      </div>
    </Modal>
  )
}
