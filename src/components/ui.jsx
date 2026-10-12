import { useEffect, useRef } from 'react'
import { AnimatePresence, animate, motion } from 'motion/react'
import { EASE_OUT } from '../lib/theme'

// Kartu dengan animasi masuk berurutan (stagger) — hanya saat pertama muncul.
export function Card({ i = 0, className = '', title, desc, right, children }) {
  return (
    <motion.section
      className={'card ' + className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE_OUT, delay: 0.05 + i * 0.04 }}
    >
      {(title || right) && (
        <div className="card-head">
          <div>
            {title && <h2>{title}</h2>}
            {desc && <div className="desc">{desc}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </motion.section>
  )
}

// Angka yang "berhitung" halus ke nilai baru saat filter berubah.
export function AnimatedNumber({ value, format }) {
  const ref = useRef(null)
  const prev = useRef(0)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    const ctl = animate(from, value, {
      duration: 0.6,
      ease: EASE_OUT,
      onUpdate: v => { if (ref.current) ref.current.textContent = format(v) },
    })
    return () => ctl.stop()
  }, [value, format])
  return <span ref={ref}>{format(value)}</span>
}

// Kontrol segmen dengan "pil" aktif yang meluncur (shared layout).
export function Segmented({ id, options, value, onChange }) {
  return (
    <div className="seg" role="tablist">
      {options.map(o => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {value === o.value && (
            <motion.span layoutId={'seg-' + id} className="seg-pill" transition={{ type: 'spring', duration: 0.35, bounce: 0.15 }} />
          )}
          <span className="seg-label">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Legend({ items, hidden, onToggle }) {
  return (
    <div className="legend">
      {items.map(it => (
        <motion.button
          key={it.key}
          type="button"
          className={'legend-item' + (hidden?.has(it.key) ? ' off' : '')}
          onClick={() => onToggle?.(it.key)}
          whileTap={{ scale: 0.96 }}
        >
          <i style={{ background: it.color }} />
          {it.label}
        </motion.button>
      ))}
    </div>
  )
}

export function Progress({ value, color }) {
  return (
    <div className="progress">
      <motion.div
        className="progress-fill"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: Math.min(100, value * 100) + '%' }}
        transition={{ duration: 0.8, ease: EASE_OUT }}
      />
    </div>
  )
}

export function Modal({ open, onClose, children, labelledBy, width = 440 }) {
  useEffect(() => {
    if (!open) return
    const onKey = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="overlay"
          onClick={e => e.target === e.currentTarget && onClose()}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } }}
        >
          <motion.div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            style={{ width: `min(${width}px, 100%)` }}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.26, ease: EASE_OUT } }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.15, ease: 'easeIn' } }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
