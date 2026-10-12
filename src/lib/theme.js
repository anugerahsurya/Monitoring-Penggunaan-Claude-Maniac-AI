// Palet kategorikal bernuansa Claude, divalidasi (CVD & kontras) untuk permukaan #fffefb.
// Urutan slot adalah bagian dari validasi: jangan diacak.
export const SERIES = ['#c96442', '#3d6fb4', '#d49a1e', '#5f8a3a', '#8b5fbf', '#c2456b']
export const slot = i => SERIES[Math.min(i, SERIES.length - 1)]

export const C = {
  surface: '#fffefb',
  border: '#e8e4d8',
  grid: '#efebe1',
  text: '#141413',
  text2: '#4a4944',
  muted: '#87867f',
  accent: '#c96442',
  warning: '#b7791f',
  critical: '#c0392b',
}

// Ramp berurutan satu warna (terakota) untuk heatmap, dari "nol" ke "padat".
export const SEQ = ['#f3f0e8', '#f6dccd', '#eebfa6', '#e29f7f', '#d47f5b', '#c15f3c', '#9c4529']

export const EASE_OUT = [0.23, 1, 0.32, 1]
