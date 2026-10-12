import { useState } from 'react'

// Tabel sederhana yang bisa diurutkan dengan klik judul kolom.
// cols: [{ key, label, render?, align: 'l' | 'r', className? }]
export default function DataTable({ rows, cols, defaultSort, defaultDir = -1, empty = 'Tidak ada data pada filter ini' }) {
  const [sort, setSort] = useState({ key: defaultSort, dir: defaultDir })
  if (!rows.length) return <div className="empty">{empty}</div>
  const sorted = [...rows].sort((a, b) => (a[sort.key] > b[sort.key] ? 1 : a[sort.key] < b[sort.key] ? -1 : 0) * sort.dir)
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            {cols.map(c => (
              <th
                key={c.key}
                className={c.align === 'l' ? 'l' : ''}
                onClick={() => setSort(s => ({ key: c.key, dir: s.key === c.key ? -s.dir : -1 }))}
                aria-sort={sort.key === c.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}
              >
                {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id ?? i}>
              {cols.map(c => (
                <td key={c.key} className={(c.align === 'l' ? 'l ' : '') + (c.className || '')}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
