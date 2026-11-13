/* gm-ui.js — antarmuka Grandmaster Assistant (CHEAT MODE). Memakai papan utama; tidak pernah memainkan langkah
   tanpa klik "Apply Best Move" dari pemain. Hanya membaca data pembelajaran; menulis hanya ke meta 'gmBotLive'. */
(function (G) {
'use strict';
const C = G.CAI, GM = C.GM, DB = C.DB, $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const PRESETS = { quick: { depth: 8, time: 2, multipv: 3, hash: 50000 }, balanced: { depth: 12, time: 6, multipv: 3, hash: 150000 }, deep: { depth: 16, time: 15, multipv: 5, hash: 400000 } };
const low = /Android/i.test(navigator.userAgent) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
const X = { on: false, used: false, running: false, token: 0, lines: [], depth: 0, nodes: 0, ms: 0, sel: 0, showBest: true, showAlt: true, hist: [], threats: null, opps: [], bd: null,
  posKey: '', fen: '', turn: 1, msg: '', judge: null, judgeFor: '', profile: null, live: null, auto: false, botA: true, preset: low ? 'quick' : 'balanced', cfg: Object.assign({}, PRESETS[low ? 'quick' : 'balanced']), t0: 0, gameT0: 0, aw: null, jw: null, localSr: null, localJ: null, deb: null, maxDepth: 0 };
const app = () => C.App;

function loadSettings() { try { const s = JSON.parse(localStorage.getItem('gm-settings')); if (s) { X.preset = s.preset; X.cfg = s.cfg; X.auto = !!s.auto; X.botA = s.botA !== false; } } catch (e) { /* abaikan */ } }
function saveSettings() { try { localStorage.setItem('gm-settings', JSON.stringify({ preset: X.preset, cfg: X.cfg, auto: X.auto, botA: X.botA })); } catch (e) { /* abaikan */ } }

// ---------- util ----------
function sanLine(fen, ucis, max) {
  const ch = new C.Chess(fen), out = [];
  for (const u of ucis.slice(0, max || 8)) { const r = ch.play(u); if (!r) break; out.push(r.san); }
  return out;
}
function pvText(fen, ucis, turn, max) {
  const sans = sanLine(fen, ucis, max), n0 = +fen.split(' ')[5] || 1; let t = '', n = n0, w = turn === 1;
  sans.forEach((s, i) => { if (w) t += `${n}. `; else if (i === 0) t += `${n}… `; t += s + ' '; if (!w) n++; w = !w; });
  return t.trim();
}
const kill = k => { if (X[k]) { try { X[k].terminate(); } catch (e) { /* abaikan */ } X[k] = null; } };
const humanTurn = () => { const S = app().S; return S.live && !S.over && (S.mode === 'pvp' || S.ch.turn === S.pc); };

// ---------- analisis ----------
function stop(silent) {
  X.token++; kill('aw'); X.running = false; if (X.deb) { clearTimeout(X.deb); X.deb = null; }
  if (!silent) X.msg = 'Analisis dihentikan.'; render();
}
function statics() {
  const S = app().S;
  X.fen = S.ch.fen(); X.turn = S.ch.turn; X.lines = []; X.hist = []; X.sel = 0; X.depth = 0; X.nodes = 0; X.ms = 0;
  if (!X.localSr) X.localSr = new C.Searcher();
  X.threats = GM.threats(S.ch); X.opps = GM.opportunities(S.ch);
  X.bd = S.ch.hasLegal() ? GM.breakdown(X.localSr, S.ch) : null;
}
function start() {
  if (!X.on) return; const S = app().S;
  stop(true); statics(); X.used = true; X.msg = '';
  if (!S.ch.hasLegal()) { X.msg = S.ch.inCheck(S.ch.turn) ? 'Skakmat — tidak ada langkah legal.' : 'Stalemate — tidak ada langkah legal.'; render(); drawAll(); return; }
  const token = ++X.token, moves = S.hist.map(h => h.uci), cfg = { maxDepth: X.cfg.depth, timeMs: X.cfg.time * 1000, multipv: X.cfg.multipv, hash: X.cfg.hash };
  X.running = true; X.t0 = Date.now(); X.maxDepth = cfg.maxDepth; render(); drawAll();
  const onMsg = m => {
    if (token !== X.token) return;
    if (m.type === 'depth') { X.depth = m.depth; X.lines = m.lines; X.nodes = m.nodes; X.ms = m.time; X.hist.push(m.lines[0].uci); if (X.sel >= m.lines.length) X.sel = 0; render(); drawAll(); }
    else if (m.type === 'done') { X.running = false; kill('aw'); render(); }
    else if (m.type === 'error') { X.running = false; kill('aw'); X.msg = 'Error analisis: ' + m.error; render(); }
  };
  const local = () => {
    const sr = X.localSr, ch = new C.Chess(); moves.forEach(u => ch.play(u));
    if (!sr.multiStart(ch, cfg)) { X.running = false; render(); return; }
    let d = 1; const n = sr.root.length;
    const step = () => {
      if (token !== X.token) return; const r = sr.multiDepth(d);
      if (!r) { X.running = false; render(); return; }
      onMsg({ type: 'depth', ...r });
      if (d >= cfg.maxDepth || n === 1 || Math.abs(r.lines[0].score) > 29900 || Date.now() - sr.start > cfg.timeMs * 0.7) { onMsg({ type: 'done' }); return; }
      d++; setTimeout(step, 15);
    };
    setTimeout(step, 20);
  };
  let w = null; try { w = new Worker('workers/analysis-worker.js'); } catch (e) { w = null; }
  if (!w) { X.msg = 'Web Worker tidak tersedia — analisis berjalan di thread utama (UI bisa terhenti sesaat).'; return local(); }
  X.aw = w; w.onmessage = e => onMsg(e.data);
  w.onerror = () => { if (token !== X.token) return; kill('aw'); X.msg = 'Web Worker gagal dimuat (mis. dibuka dari file://) — memakai thread utama.'; local(); };
  w.postMessage({ id: token, type: 'multi', moves, cfg });
}

// ---------- penilaian langkah ----------
function judgeLast(forBot) {
  const S = app().S; if (!S.hist.length) { X.msg = 'Belum ada langkah untuk diperiksa.'; render(); return; }
  const moves = S.hist.map(h => h.uci), key = S.hist.length + ':' + moves[moves.length - 1], moverCol = S.hist.length % 2 === 1 ? 1 : -1, jc = { depth: 4, timeMs: 400 };
  X.judgeFor = key; X.judge = { pending: true, forBot, moverCol }; render();
  const done = res => {
    if (X.judgeFor !== key) return; const before = new C.Chess(); moves.slice(0, -1).forEach(u => before.play(u));
    const bp = res.bestUci && before.play(res.bestUci); X.judge = { ...res, forBot, bestSan: bp ? bp.san : null, pending: false }; render();
    if (forBot) recordLive(res.cls);
  };
  const local = () => setTimeout(() => { try { if (!X.localJ) X.localJ = new C.Searcher(); const b = new C.Chess(); moves.slice(0, -1).forEach(u => b.play(u)); done(GM.judge(X.localJ, b.fen(), moves[moves.length - 1], jc.depth, jc.timeMs)); } catch (e) { X.judge = null; X.msg = String(e.message || e); render(); } }, 30);
  let w = null; try { w = new Worker('workers/analysis-worker.js'); } catch (e) { w = null; }
  if (!w) return local();
  kill('jw'); X.jw = w;
  w.onmessage = e => { kill('jw'); if (e.data.type === 'judge') done(e.data.result); };
  w.onerror = () => { kill('jw'); local(); };
  w.postMessage({ id: key, type: 'judge', moves, cfg: jc });
}
async function recordLive(cls) { // statistik live gaya bot — disimpan terpisah dari data pembelajaran
  try {
    const cur = (await DB.get('meta', 'gmBotLive')) || { key: 'gmBotLive', judged: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    cur.judged++; cur[cls]++; await DB.put('meta', cur); X.live = cur; render();
  } catch (e) { /* abaikan */ }
}
async function loadProfile() {
  try {
    const S = app().S, ms = await DB.getAll('matches'), an = await DB.getAll('analysis');
    X.profile = GM.botProfile(ms, an, S.mode === 'bot' ? S.diff : null); X.live = (await DB.get('meta', 'gmBotLive')) || null;
  } catch (e) { X.profile = null; }
  render();
}

// ---------- papan ----------
function cls(sq) {
  if (!X.on) return ''; let c = '';
  if (X.showBest && X.lines[X.sel]) { const u = X.lines[X.sel].uci, a = C.nameSq(u.slice(0, 2)), b = C.nameSq(u.slice(2, 4)); if (sq === a) c += ' gm-from'; if (sq === b) c += X.sel === 0 ? ' gm-to' : ' gm-to2'; }
  if (X.showAlt) X.lines.forEach((l, i) => { if (i !== X.sel && sq === C.nameSq(l.uci.slice(2, 4))) c += ' gm-alt'; });
  if (X.threats) {
    if (X.threats.pieces.some(p => p.sq === sq)) c += ' gm-threat';
    if (X.threats.mateThreat && sq === X.threats.ourKing) c += ' gm-mated';
  }
  const l = X.lines[X.sel]; if (l && X.showBest && X.threats) { const si = GM.scoreInfo(l.score, X.turn); if (si.mate && si.forMover && sq === X.threats.theirKing) c += ' gm-mate'; }
  return c;
}
function xy(sq, flip) { const f = sq & 7, r = sq >> 3; return [(flip ? 7 - f : f) + 0.5, (flip ? 7 - r : r) + 0.5]; }
function arrow(u, color, w, dash) {
  const S = app().S, [x1, y1] = xy(C.nameSq(u.slice(0, 2)), S.flip), [x2, y2] = xy(C.nameSq(u.slice(2, 4)), S.flip);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, hl = 0.34 + w, hw = 0.2 + w * 0.8;
  const ex = x2 - ux * 0.12, ey = y2 - uy * 0.12, bx = ex - ux * hl, by = ey - uy * hl, sx = x1 + ux * 0.2, sy = y1 + uy * 0.2;
  const pts = `${ex},${ey} ${bx - uy * hw},${by + ux * hw} ${bx + uy * hw},${by - ux * hw}`, da = dash ? ' stroke-dasharray=".18 .14"' : '';
  return `<g opacity=".92"><line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="#14171c" stroke-width="${w + 0.07}" stroke-linecap="round"${da}/><polygon points="${pts}" fill="#14171c" stroke="#14171c" stroke-width=".07" stroke-linejoin="round"/>` +
    `<line x1="${sx}" y1="${sy}" x2="${bx}" y2="${by}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"${da}/><polygon points="${pts}" fill="${color}"/></g>`;
}
function draw() {
  const el = $('gmArrows'); if (!el) return; let h = '';
  if (X.on) {
    if (X.showAlt) X.lines.forEach((l, i) => { if (i !== X.sel) h += arrow(l.uci, '#dfe6ee', 0.08); });
    if (X.showBest && X.lines[X.sel]) h += arrow(X.lines[X.sel].uci, X.sel === 0 ? '#4fd18b' : '#b7f0d2', 0.17);
    if (X.threats && X.threats.mateThreat) h += arrow(X.threats.mateThreat, '#ff7266', 0.1, true);
  }
  el.innerHTML = h;
}
function drawAll() { const A = app(); A.renderBoard(); }

// ---------- panel ----------
const evalHtml = () => {
  if (!X.lines.length) return '';
  const b = X.lines[0], si = GM.scoreInfo(b.score, X.turn), wp = GM.winPct(si.mate ? (si.mate > 0 ? 2000 : -2000) : si.cp);
  const h = X.hist, stable = h.length >= 3 && h.slice(-3).every(u => u === h[h.length - 1]);
  let lastChange = 0; for (let i = h.length - 1; i > 0; i--) if (h[i] !== h[i - 1]) { lastChange = i + 1; break; }
  return `<div class="gm-eval"><b>${si.text}</b> <span class="muted">(Putih ${wp}% · Hitam ${100 - wp}%)</span><div class="evbar"><i style="width:${wp}%"></i></div>
    <div class="muted">${stable ? 'Langkah terbaik stabil 3 kedalaman terakhir.' : (h.length >= 2 ? `Langkah terbaik berubah terakhir di kedalaman ${lastChange} — hasil belum tentu final.` : (X.running ? 'Menunggu kedalaman berikutnya…' : 'Pencarian berhenti lebih awal (mate ditemukan / hanya satu langkah legal / waktu habis).'))}</div></div>`;
};
function render() {
  const body = $('gmBody'); if (!body) return;
  $('gmToggle').textContent = X.on ? 'Disable Cheat Mode' : 'Enable Cheat Mode'; $('gmToggle').classList.toggle('danger', X.on); body.hidden = !X.on; if (!X.on) return;
  const S = app().S, has = X.lines.length > 0, canApply = has && humanTurn();
  $('gmAnalyze').disabled = X.running; $('gmStop').disabled = !X.running; $('gmNext').disabled = X.lines.length < 2; $('gmApply').disabled = !canApply; $('gmJudge').disabled = !S.hist.length;
  $('gmShowBest').classList.toggle('on', X.showBest); $('gmShowAlt').classList.toggle('on', X.showAlt); $('gmShowBest').setAttribute('aria-pressed', X.showBest); $('gmShowAlt').setAttribute('aria-pressed', X.showAlt);
  let h = '';
  const status = X.running ? `Menganalisis… kedalaman ${X.depth}/${X.maxDepth} · ${X.nodes.toLocaleString('id-ID')} node · ${(X.ms / 1000).toFixed(1)} s` : has ? `Selesai: kedalaman ${X.depth} · ${X.nodes.toLocaleString('id-ID')} node · ${(X.ms / 1000).toFixed(1)} s` : 'Tekan Analyze Position untuk menghitung langkah terbaik.';
  h += `<div class="muted">${esc(status)}</div>${X.msg ? `<div class="gm-note">${esc(X.msg)}</div>` : ''}`;
  if (has) {
    h += evalHtml();
    const b = X.lines[X.sel], sans = sanLine(X.fen, [b.uci], 1)[0], si = GM.scoreInfo(b.score, X.turn);
    h += `<div class="gm-best ${X.sel === 0 ? '' : 'alt'}"><div class="muted">${X.sel === 0 ? 'Best Move' : 'Langkah #' + (X.sel + 1)} untuk ${GM.side(X.turn)}</div><div class="big">${esc(sans)} <span class="muted">${esc(b.uci)}</span></div>${si.mate && si.forMover ? `<div><b>Skakmat dalam ${Math.abs(si.mate)} langkah</b></div>` : ''}${!si.forMover && si.mate ? '<div><b class="fail">Posisi kalah (mate melawan) — pilih perlawanan terbaik</b></div>' : ''}</div>`;
    h += `<table class="gm-t"><tr><th>#</th><th>Langkah</th><th>Eval</th><th>Δ</th><th>Menang*</th></tr>` + X.lines.map((l, i) => {
      const s = GM.scoreInfo(l.score, X.turn), d = X.lines[0].score - l.score, mw = GM.winPct(Math.max(-2000, Math.min(2000, l.score)));
      return `<tr class="${i === X.sel ? 'sel' : ''}"><td>${i + 1}</td><td><b>${esc(sanLine(X.fen, [l.uci], 1)[0])}</b><div class="muted pv">${esc(pvText(X.fen, l.pv, X.turn, 6))}</div></td><td>${s.text}</td><td>${i ? (Math.abs(d) > 20000 ? 'mate' : '−' + (d / 100).toFixed(2)) : '—'}</td><td>${mw}%</td></tr>`; }).join('') + `</table><div class="muted">*perkiraan peluang menang bagi pihak yang jalan (${GM.side(X.turn)}), dari skor engine — bukan jaminan.</div>`;
    const rep = X.profile && X.profile.repertoire && (() => { try { const c = new C.Chess(X.fen); c.play(b.uci); const r = GM.repertoireAt(X.profile, c); return r ? Object.entries(r).sort((a, z) => z[1] - a[1]).map(([u, n]) => `${sanLine(c.fen(), [u], 1)[0] || u} ×${n}`).join(', ') : null; } catch (e) { return null; } })();
    if (rep) h += `<div class="muted">Info tambahan (data pertandingan, tidak memengaruhi engine): setelah langkah ini bot pernah membalas ${esc(rep)}.</div>`;
  }
  if (X.bd) h += `<h4>Evaluasi posisi (heuristik, cp, Putih−Hitam)</h4><table class="gm-t"><tr><td>Material</td><td>${fmt(X.bd.material)}</td><td>King safety</td><td>${fmt(X.bd.kingSafety)}</td></tr><tr><td>Positional</td><td>${fmt(X.bd.positional)}</td><td>Tactical</td><td>${fmt(X.bd.tactical)}</td></tr></table>`;
  if (X.threats) {
    const t = X.threats, list = t.pieces.map(p => `${GM.NAME[p.piece]} ${C.sqName(p.sq)} ${p.reason}`);
    h += `<h4>Ancaman (${GM.side(X.turn)})</h4>` + (t.inCheck ? '<div class="gm-bad">Raja sedang di-skak.</div>' : '') + (t.mateThreat ? `<div class="gm-bad">Lawan mengancam skakmat 1 langkah (${esc(t.mateThreat)}).</div>` : '') + (list.length ? '<ul>' + list.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>' : (t.inCheck || t.mateThreat ? '' : '<div class="muted">Tidak ada bidak yang langsung terancam.</div>'));
  }
  if (X.opps.length) h += `<h4>Peluang taktis</h4><ul>${X.opps.map(o => `<li><b>${esc(o.san)}</b> — ${esc(o.tags.join(', '))}</li>`).join('')}</ul>`;
  if (X.judge) {
    const j = X.judge;
    h += `<h4>${j.forBot ? 'Langkah bot terakhir' : 'Langkah terakhir'}</h4>` + (j.pending ? '<div class="muted">Menilai…</div>' : `<div><span class="badge j-${j.cls}">${j.cls}</span> ${esc(j.san)} · selisih −${(j.loss / 100).toFixed(2)}${j.bestUci && j.bestUci !== j.uci ? ` · terbaik ${esc(j.bestSan || j.bestUci)}` : ''}</div>`);
  }
  if (X.botA) h += botHtml();
  h += `<div class="meta">Engine: Grandmaster (engine JavaScript bawaan CHESS AI, <b>bukan Stockfish</b>). Analisis 100% lokal.</div>`;
  $('gmOut').innerHTML = h;
}
const fmt = v => (v >= 0 ? '+' : '−') + (Math.abs(v) / 100).toFixed(2);
function botHtml() {
  const P = X.profile; let h = '<h4>Analisis gaya bot</h4>';
  if (!P || !P.games) return h + '<div class="muted">Belum ada pertandingan vs bot tersimpan.</div>';
  const pc = (a, b) => (b ? Math.round(100 * a / b) : 0) + '%', top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${esc(k)} ×${n}`).join(', ') || '—';
  h += `<ul><li>${P.games} game vs bot${app().S.mode === 'bot' ? ` (level ${app().S.diff})` : ''}, ${P.botMoves} langkah bot</li><li>Pembukaan: ${top(P.openings)} · langkah pertama bot: ${top(P.firstMove)}</li>
    <li>Tactical: ${pc(P.captures, P.botMoves)} tangkapan, ${pc(P.checks, P.botMoves)} skak, Menteri keluar dini ${P.earlyQueen}×</li>
    <li>Pertahanan: rokade di ${pc(P.castled, P.games)} game${P.castled ? ` (rata-rata langkah ke-${(P.castlePlySum / P.castled).toFixed(1)})` : ''}</li>`;
  h += P.blunder ? `<li>Kualitas (dari analisis tersimpan, ${P.blunder.n} langkah): blunder ${pc(P.blunder.blunder, P.blunder.n)}, mistake ${pc(P.blunder.mistake, P.blunder.n)}, inaccuracy ${pc(P.blunder.inaccuracy, P.blunder.n)}</li>` : '<li>Frekuensi blunder: belum ada data teranalisis (jalankan UPDATE AI atau biarkan Cheat Mode menilai langkah bot).</li>';
  if (X.live && X.live.judged) h += `<li>Dinilai live: ${X.live.judged} langkah bot — blunder ${X.live.blunder}, mistake ${X.live.mistake}, inaccuracy ${X.live.inaccuracy}</li>`;
  return h + '</ul><div class="muted">Hanya informasi tambahan; tidak mengubah data pembelajaran bot.</div>';
}

// ---------- hook dari app.js ----------
function onChange() {
  const S = app().S; if (S.t0 !== X.gameT0) { X.gameT0 = S.t0; X.used = false; X.judge = null; if (X.on) loadProfile(); }
  const key = S.t0 + '|' + S.gid + '|' + S.ch.fen() + '|' + S.hist.length; if (key === X.posKey) return; X.posKey = key;
  if (!X.on) return;
  stop(true); X.msg = ''; statics(); render(); app().renderBoard(); // hapus panah/highlight lama
  const l = S.hist[S.hist.length - 1];
  if (X.botA && S.mode === 'bot' && S.hist.length && (S.hist.length % 2 === 1 ? 1 : -1) === -S.pc && l) judgeLast(true); else X.judge = null;
  if (X.auto && humanTurn() && S.ch.hasLegal()) X.deb = setTimeout(start, 250);
}
function init() {
  loadSettings();
  const set = () => { $('gmPreset').value = X.preset; $('gmDepth').value = X.cfg.depth; $('gmTime').value = X.cfg.time; $('gmPV').value = X.cfg.multipv; $('gmHash').value = X.cfg.hash; $('gmAuto').checked = X.auto; $('gmBotA').checked = X.botA; };
  set();
  $('gmToggle').onclick = () => { X.on = !X.on; if (X.on) { statics(); loadProfile(); if (X.auto && humanTurn()) start(); } else { stop(true); kill('jw'); X.lines = []; X.threats = null; X.judge = null; } render(); drawAll(); };
  $('gmAnalyze').onclick = start; $('gmStop').onclick = () => stop(false);
  $('gmShowBest').onclick = () => { X.showBest = !X.showBest; render(); drawAll(); }; $('gmShowAlt').onclick = () => { X.showAlt = !X.showAlt; render(); drawAll(); };
  $('gmNext').onclick = () => { if (X.lines.length) { X.sel = (X.sel + 1) % X.lines.length; X.showBest = true; render(); drawAll(); } };
  $('gmApply').onclick = () => { const l = X.lines[X.sel]; if (!l) return; if (!humanTurn()) { X.msg = 'Bukan giliran Anda.'; render(); return; } if (!app().applyUci(l.uci)) { X.msg = 'Langkah tidak valid pada posisi saat ini.'; render(); } };
  $('gmJudge').onclick = () => judgeLast(false);
  $('gmPreset').onchange = e => { const v = e.target.value; X.preset = v; if (PRESETS[v]) X.cfg = Object.assign({}, PRESETS[v]); set(); saveSettings(); };
  const num = (id, key, lo, hi) => { $(id).onchange = e => { X.cfg[key] = Math.max(lo, Math.min(hi, +e.target.value || lo)); X.preset = 'custom'; set(); saveSettings(); }; };
  num('gmDepth', 'depth', 1, 30); num('gmTime', 'time', 1, 60); num('gmPV', 'multipv', 1, 5); num('gmHash', 'hash', 10000, 1000000);
  $('gmAuto').onchange = e => { X.auto = e.target.checked; saveSettings(); }; $('gmBotA').onchange = e => { X.botA = e.target.checked; saveSettings(); render(); };
  render();
}
C.GMUI = { init, onChange, cls, draw, state: X, start, stop, PRESETS };
})(globalThis);
