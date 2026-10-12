import { useState } from 'react'
import { motion } from 'motion/react'
import { Modal } from './ui'
import { DAY_NAMES } from '../lib/piket'
import { DEFAULTS } from '../lib/settings'
import { nf } from '../lib/format'
import { EASE_OUT } from '../lib/theme'

const fmtShort = d => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })

export function DutyModal({ open, onClose, duty, memberColor }) {
  const { today, week, monday } = duty
  const sunday = week[6].date
  return (
    <Modal open={open} onClose={onClose} labelledBy="dutyTitle">
      <div className="eyebrow">Piket pengatur penggunaan Claude</div>
      <h3 id="dutyTitle">{today.name}, {today.date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</h3>
      <div className="sub">Minggu {fmtShort(monday)} – {fmtShort(sunday)}</div>
      <motion.div
        className="hero"
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: EASE_OUT, delay: 0.08 }}
      >
        <div className="avatar" style={{ background: today.who ? memberColor[today.who] : '#5f8a3a' }}>{today.who ? today.who[0] : '✓'}</div>
        <div>
          <div className="hero-name">{today.who || 'Bebas'}</div>
          <div className="sub">{today.who ? 'bertugas mengatur penggunaan Claude hari ini' : 'Jumat–Minggu tidak ada piket'}</div>
        </div>
      </motion.div>
      <ul className="week">
        {week.map((d, i) => (
          <motion.li
            key={d.name}
            className={d.today ? 'today' : ''}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: EASE_OUT, delay: 0.12 + i * 0.035 }}
          >
            <span>{d.name}, {fmtShort(d.date)}{d.today ? ' · hari ini' : ''}</span>
            {d.who ? <span className="who"><i style={{ background: memberColor[d.who] }} />{d.who}</span> : <span className="free-txt">Bebas</span>}
          </motion.li>
        ))}
      </ul>
      <div className="actions"><button className="btn-primary" onClick={onClose} autoFocus>Siap, mengerti</button></div>
    </Modal>
  )
}

export function SettingsModal({ open, onClose, settings, setSettings }) {
  const [draft, setDraft] = useState(settings)
  const set = (k, v) => setDraft(d => ({ ...d, [k]: v }))
  const save = () => { setSettings(draft); onClose() }
  return (
    <Modal open={open} onClose={onClose} labelledBy="setTitle" width={480}>
      <div className="eyebrow">Pengaturan</div>
      <h3 id="setTitle">Batas penggunaan</h3>
      <p className="sub">
        Anthropic tidak mempublikasikan batas paket dalam angka token. Cocokkan angka di sini dengan persentase di
        Claude → Settings → Usage, lalu sesuaikan. Pengaturan disimpan di browser ini.
      </p>
      <div className="form">
        <label>Batas jendela 5 jam (token)
          <input type="number" min="1" step="100000" value={draft.limit5h} onChange={e => set('limit5h', +e.target.value || 1)} />
          <span className="hint">{nf.format(draft.limit5h)} token</span>
        </label>
        <label>Batas mingguan (token)
          <input type="number" min="1" step="1000000" value={draft.limitWeek} onChange={e => set('limitWeek', +e.target.value || 1)} />
          <span className="hint">{nf.format(draft.limitWeek)} token</span>
        </label>
        <label>Reset mingguan setiap
          <div className="row">
            <select value={draft.resetDay} onChange={e => set('resetDay', +e.target.value)}>
              {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <select value={draft.resetHour} onChange={e => set('resetHour', +e.target.value)}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}.00</option>)}
            </select>
          </div>
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.countCacheRead} onChange={e => set('countCacheRead', e.target.checked)} />
          Hitung cache read sebagai pemakaian
        </label>
      </div>
      <div className="actions">
        <button className="btn-ghost" onClick={() => setDraft(DEFAULTS)}>Kembalikan default</button>
        <button className="btn-primary" onClick={save}>Simpan</button>
      </div>
    </Modal>
  )
}
