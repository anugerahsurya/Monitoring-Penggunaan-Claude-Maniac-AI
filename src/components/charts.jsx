import {
  BarController, BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineController, LineElement,
  PointElement, Tooltip,
} from 'chart.js'
import { Bar, Line } from 'react-chartjs-2'
import { C } from '../lib/theme'

ChartJS.register(BarController, LineController, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Tooltip, Filler)
ChartJS.defaults.font.family = '"Plus Jakarta Sans", system-ui, sans-serif'
ChartJS.defaults.font.size = 12
ChartJS.defaults.color = C.muted

export function baseOptions({ stacked = false, fmt = v => v, horizontal = false, max, tooltipLabel } = {}) {
  const valueAxis = {
    stacked, beginAtZero: true, max,
    grid: { color: C.grid, drawTicks: false }, border: { display: false },
    ticks: { color: C.muted, padding: 6, callback: v => fmt(v), maxTicksLimit: 6 },
  }
  const catAxis = {
    stacked, grid: { display: false }, border: { color: C.grid },
    ticks: { color: C.muted, autoSkip: !horizontal, maxRotation: 0, autoSkipPadding: 14 },
  }
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 600, easing: 'easeOutQuart' },
    indexAxis: horizontal ? 'y' : 'x',
    interaction: horizontal ? { mode: 'nearest', intersect: true, axis: 'y' } : { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text2, borderColor: C.border, borderWidth: 1,
        padding: 10, boxPadding: 4, usePointStyle: true, cornerRadius: 10,
        titleFont: { weight: '700' },
        filter: item => item.raw != null && !item.dataset.isRef,
        callbacks: { label: tooltipLabel || (c => ` ${c.dataset.label}: ${fmt(c.raw)}`) },
      },
    },
    scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
  }
}

export const barDataset = (label, data, color, extra = {}) => ({
  label, data, backgroundColor: color, borderColor: C.surface, borderWidth: { top: 2 },
  borderSkipped: 'bottom', borderRadius: 4, maxBarThickness: 34, ...extra,
})

export const hbarDataset = (label, data, color) => ({
  label, data, backgroundColor: color, borderRadius: { topRight: 4, bottomRight: 4 },
  borderSkipped: 'left', maxBarThickness: 20,
})

// Garis acuan batas 100% (tidak ikut tooltip).
export const refLine = (n, value, label = 'Batas') => ({
  type: 'line', label, data: new Array(n).fill(value), borderColor: C.text2, borderDash: [5, 4], borderWidth: 1.5,
  pointRadius: 0, pointHoverRadius: 0, isRef: true, order: -1,
})

export function BarChart({ data, options, height = 280 }) {
  return <div className="chart" style={{ height }}><Bar data={data} options={options} /></div>
}

export function LineChart({ data, options, height = 280 }) {
  return <div className="chart" style={{ height }}><Line data={data} options={options} /></div>
}
