import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { SEQ } from '../lib/theme'

const DN = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const pad = n => String(n).padStart(2, '0')

// Jumlah prompt per hari-dalam-minggu × jam (waktu lokal).
export default function Heatmap({ rows }) {
  const H = Array.from({ length: 7 }, () => new Array(24).fill(0))
  rows.forEach(r => { if (r.prompts) H[(r.t.getDay() + 6) % 7][r.t.getHours()] += r.prompts })
  const max = Math.max(1, ...H.flat())
  const step = v => (v === 0 ? 0 : Math.min(6, 1 + Math.floor((v / max) * 5.999)))
  const [tip, setTip] = useState(null)

  return (
    <div className="heat-wrap" onMouseLeave={() => setTip(null)}>
      <div className="heat">
        <div />
        {Array.from({ length: 24 }, (_, h) => <div key={h} className="hr">{h % 3 === 0 ? h : ''}</div>)}
        {H.map((row, d) => [
          <div key={'l' + d} className="lbl">{DN[d]}</div>,
          ...row.map((v, h) => (
            <div
              key={d + '-' + h}
              className="c"
              style={{ background: SEQ[step(v)] }}
              onMouseEnter={e => setTip({ x: e.currentTarget.offsetLeft, y: e.currentTarget.offsetTop, text: `${DN[d]} ${pad(h)}.00–${pad(h)}.59 · ${v} prompt` })}
            />
          )),
        ])}
      </div>
      <AnimatePresence>
        {tip && (
          <motion.div
            className="heat-tip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, left: tip.x, top: tip.y - 34 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {tip.text}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="heatscale">Sedikit {SEQ.map(c => <i key={c} style={{ background: c }} />)} Banyak (maks {max})</div>
    </div>
  )
}
