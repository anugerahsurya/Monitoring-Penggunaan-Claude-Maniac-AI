const LOCAL = [
  ['Waktu', 'timestamp', 'Waktu setiap pesan; dasar jendela 5 jam, mingguan, harian, dan pola jam.'],
  ['Model', 'message.model', 'Model yang menjawab (mis. claude-opus-5-5, claude-sonnet-5).'],
  ['Input token', 'usage.input_tokens', 'Token masukan baru yang tidak berasal dari cache.'],
  ['Output token', 'usage.output_tokens', 'Token yang ditulis Claude, termasuk token berpikir.'],
  ['Thinking token', 'usage.output_tokens_details.thinking_tokens', 'Bagian output yang dipakai untuk penalaran.'],
  ['Cache read', 'usage.cache_read_input_tokens', 'Konteks yang dibaca ulang dari cache (murah, ±5–10% harga input).'],
  ['Cache write 5m / 1j', 'usage.cache_creation.ephemeral_5m/1h_input_tokens', 'Konteks yang disimpan ke cache (1,25× / 2× harga input).'],
  ['Web search', 'usage.server_tool_use.web_search_requests', 'Jumlah pencarian web server-side.'],
  ['Service tier, kecepatan, lokasi', 'usage.service_tier / speed / inference_geo', 'standard/fast dan region inferensi.'],
  ['Effort', 'effort', 'Tingkat usaha (low/medium/high/…) per giliran.'],
  ['Tool', 'message.content[].tool_use.name', 'Bash, Edit, Read, Write, Grep, MCP, dll.'],
  ['Stop reason', 'message.stop_reason', 'end_turn, tool_use, max_tokens, refusal.'],
  ['Proyek', 'cwd', 'Direktori kerja sesi.'],
  ['Git branch', 'gitBranch', 'Branch aktif saat sesi.'],
  ['Aplikasi', 'entrypoint', 'claude-vscode, claude-desktop, cli, dll.'],
  ['Versi', 'version', 'Versi Claude Code.'],
  ['Sesi & judul', 'sessionId, custom-title, ai-title', 'Identitas dan judul percakapan.'],
  ['Prompt manusia', 'type=user + origin.kind=human', 'Pesan yang benar-benar diketik (bukan hasil tool).'],
  ['Subagent', 'folder subagents/, isSidechain', 'Pekerjaan yang didelegasikan ke agen pembantu.'],
  ['Kompaksi', 'system: compact_boundary', 'Percakapan dipadatkan karena konteks penuh.'],
  ['Ringkasan sesi', 'type=cost-state', 'totalCostUSD, durasi API & tool, baris ditambah/dihapus, modelUsage.'],
  ['Mode izin', 'permissionMode', 'default / acceptEdits / plan / auto.'],
]

const OTHER = [
  ['Claude.ai (paket Pro/Max)', 'Persentase batas sesi 5 jam & mingguan di Settings → Usage; ekspor percakapan di Settings → Privacy.', 'Sumber resmi persentase batas. Tidak ada API publik; ekspor tanpa jumlah token.'],
  ['Usage & Cost Admin API', 'Token per hari/jam per model, workspace, API key, tier; biaya USD aktual.', 'Untuk pemakaian lewat API key. Butuh Admin API key.'],
  ['Claude Code OpenTelemetry', 'Metrik sesi, token, biaya, baris kode, commit, PR, waktu aktif.', 'Aktifkan CLAUDE_CODE_ENABLE_TELEMETRY=1, kirim ke kolektor OTel.'],
  ['Claude Team/Enterprise Analytics', 'Pengguna aktif, percakapan, pemakaian Claude Code per anggota.', 'Hanya untuk admin organisasi.'],
]

export default function Glossary() {
  return (
    <details className="glossary">
      <summary>Kamus atribut: data apa saja yang bisa diperoleh dari Claude</summary>
      <h3>1. Transkrip lokal Claude Code (sumber dashboard ini)</h3>
      <p className="note">
        Lokasi: <code>%USERPROFILE%\.claude\projects\&lt;proyek&gt;\&lt;sessionId&gt;.jsonl</code>. Mencakup Claude Code di VS Code,
        terminal, dan mode Code/Cowork di Claude Desktop. Skrip <code>collector/collect.py</code> meringkasnya lalu mengunggah ke Supabase.
        Membaca log tidak memakai token Claude.
      </p>
      <div className="tbl-wrap"><table>
        <thead><tr><th className="l">Atribut</th><th className="l">Asal field</th><th className="l">Makna</th></tr></thead>
        <tbody>{LOCAL.map(r => <tr key={r[0]}><td className="l">{r[0]}</td><td className="l"><code>{r[1]}</code></td><td className="l wrap">{r[2]}</td></tr>)}</tbody>
      </table></div>
      <h3>2. Sumber lain</h3>
      <div className="tbl-wrap"><table>
        <thead><tr><th className="l">Sumber</th><th className="l">Atribut</th><th className="l">Catatan</th></tr></thead>
        <tbody>{OTHER.map(r => <tr key={r[0]}><td className="l">{r[0]}</td><td className="l wrap">{r[1]}</td><td className="l wrap">{r[2]}</td></tr>)}</tbody>
      </table></div>
      <p className="note">
        Biaya ditampilkan sebagai <b>estimasi setara harga API</b>. Untuk paket langganan, tagihan sebenarnya tetap biaya langganan.
        Angka ini berguna untuk membandingkan intensitas pemakaian.
      </p>
    </details>
  )
}
