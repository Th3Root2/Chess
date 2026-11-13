/* app.js — kontrol UI: papan, mode permainan, bot (Web Worker + fallback), perekaman, halaman versi AI. */
(function (G) {
'use strict';
const C = G.CAI, L = C.Learning, VM = C.VersionManager, DB = C.DB, $ = id => document.getElementById(id);
const GLYPH = { 1: '♟', 2: '♞', 3: '♝', 4: '♜', 5: '♛', 6: '♚' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const S = { ch: new C.Chess(), mode: 'bot', pc: 1, diff: 'medium', live: false, over: false, sel: -1, targets: [], legal: [], hist: [], last: null,
  thinking: false, gid: 0, t0: 0, flip: false, drag: null, knowledge: L.emptyKnowledge(), activeId: 'v1.0', resultText: '', pending: 0, busy: false };

function showErr(e) { const el = $('err'); el.hidden = false; el.textContent = 'Error: ' + (e && e.message || e); console.error(e); }
G.addEventListener('error', e => showErr(e.error || e.message));
G.addEventListener('unhandledrejection', e => showErr(e.reason));

// ---------- Modal ----------
function modal(html, btns) {
  return new Promise(res => {
    const o = $('modal'), b = $('modalBox'); b.innerHTML = `<div>${html}</div><div class="mbtn"></div>`;
    btns.forEach(([label, val, cls]) => { const x = document.createElement('button'); x.innerHTML = label; x.className = cls || ''; x.onclick = () => { o.hidden = true; res(val); }; b.lastChild.appendChild(x); });
    o.hidden = false;
  });
}

// ---------- Papan ----------
function buildBoard() {
  const el = $('board'); el.innerHTML = '';
  for (let i = 0; i < 64; i++) {
    const sq = S.flip ? 63 - i : i, f = sq & 7, r = sq >> 3, d = document.createElement('div');
    d.dataset.sq = sq; d.dataset.p = '0'; d.className = 'sq ' + (((f + r) & 1) ? 'dark' : 'light');
    d.innerHTML = (i % 8 === 0 ? `<i class="co n">${8 - r}</i>` : '') + (i >= 56 ? `<i class="co f">${C.FILES[f]}</i>` : '');
    el.appendChild(d);
  }
}
function renderBoard(anim) {
  const el = $('board'); if (el.children.length !== 64) buildBoard();
  const chk = S.ch.inCheck(S.ch.turn) ? S.ch.kingSq[S.ch.turn === 1 ? 0 : 1] : -1; // tetap tampil saat skakmat
  for (const d of el.children) {
    const sq = +d.dataset.sq, p = S.ch.b[sq], f = sq & 7, r = sq >> 3;
    let cls = 'sq ' + (((f + r) & 1) ? 'dark' : 'light');
    if (sq === S.sel) cls += ' sel';
    if (S.last && (sq === S.last[0] || sq === S.last[1])) cls += ' last';
    if (sq === chk) cls += ' check';
    if (S.targets.includes(sq)) cls += p ? ' cap' : ' dot';
    if (C.GMUI) cls += C.GMUI.cls(sq);
    d.className = cls;
    if (String(p) !== d.dataset.p) { // ganti elemen bidak hanya jika berubah (menjaga event pointer saat drag)
      d.dataset.p = String(p); const old = d.querySelector('.pc'); if (old) old.remove();
      if (p) { const s = document.createElement('span'); s.className = 'pc ' + (p > 0 ? 'w' : 'b'); s.textContent = GLYPH[Math.abs(p)] + '\uFE0E'; d.appendChild(s); }
    }
  }
  if (C.GMUI) C.GMUI.draw();
  if (anim) {
    const to = el.querySelector(`[data-sq="${anim.to}"]`), fr = el.querySelector(`[data-sq="${anim.from}"]`), pc = to && to.querySelector('.pc');
    if (pc && fr) {
      const a = fr.getBoundingClientRect(), b = to.getBoundingClientRect();
      pc.style.transition = 'none'; pc.style.transform = `translate(${a.left - b.left}px,${a.top - b.top}px)`; pc.getBoundingClientRect();
      pc.style.transition = 'transform .18s ease'; pc.style.transform = '';
    }
  }
}
function statusText() {
  if (S.over) return S.resultText;
  const side = S.ch.turn === 1 ? 'Putih' : 'Hitam';
  if (S.thinking) return `Bot (${S.diff}) berpikir…`;
  return `Giliran ${side}` + (S.ch.inCheck(S.ch.turn) ? ' — Skak!' : '');
}
function renderPanel() {
  const st = $('status'); st.textContent = statusText(); st.className = 'status' + (S.over ? ' over' : ''); st.dataset.turn = S.ch.turn === 1 ? 'w' : 'b';
  let h = '';
  for (let i = 0; i < S.hist.length; i += 2) h += `<span class="n">${i / 2 + 1}.</span><span class="m">${esc(S.hist[i].san)}</span><span class="m">${S.hist[i + 1] ? esc(S.hist[i + 1].san) : ''}</span> `;
  const mv = $('moves'); mv.innerHTML = h || '<span class="muted">Belum ada langkah.</span>'; mv.scrollTop = mv.scrollHeight;
  $('bUndo').disabled = !S.live || S.over || !S.hist.length; $('bResign').disabled = !S.live || S.over; $('bRestart').disabled = !S.live;
  $('lblDiff').style.display = $('selMode').value === 'bot' ? '' : 'none';
}
function renderAll(anim) { renderBoard(anim); renderPanel(); if (C.GMUI) C.GMUI.onChange(); }

// ---------- Input ----------
const canHuman = () => S.live && !S.over && !S.thinking && (S.mode === 'pvp' || S.ch.turn === S.pc);
$('board').addEventListener('pointerdown', e => {
  const q = e.target.closest('.sq'); if (!q || !canHuman()) return; const sq = +q.dataset.sq;
  if (S.sel >= 0 && S.targets.includes(sq)) { tryMove(S.sel, sq); return; }
  const p = S.ch.b[sq];
  if (p && (p > 0) === (S.ch.turn > 0)) { S.sel = sq; S.targets = S.legal.filter(m => m.from === sq).map(m => m.to); S.drag = sq; }
  else { S.sel = -1; S.targets = []; }
  renderBoard();
});
document.addEventListener('pointerup', e => {
  if (S.drag == null) return; const from = S.drag; S.drag = null;
  const t = document.elementFromPoint(e.clientX, e.clientY), q = t && t.closest && t.closest('.sq'); if (!q) return;
  const sq = +q.dataset.sq; if (sq !== from && S.targets.includes(sq)) tryMove(from, sq);
});
async function tryMove(from, to) {
  const c = S.legal.filter(m => m.from === from && m.to === to); if (!c.length) return;
  if (c.length === 1) return apply(c[0]);
  const pr = await modal('<div class="promo">Promosi bidak ke:</div>', [5, 4, 3, 2].map(p => [`<span class="glyph" aria-label="${['', '', 'Kuda', 'Gajah', 'Benteng', 'Menteri'][p]}">${GLYPH[p]}\uFE0E</span>`, p]));
  apply(c.find(m => m.promo === pr) || c[0]);
}
function apply(m) {
  const san = S.ch.san(m, S.legal), u = C.uciOf(m); S.ch.make(m);
  S.hist.push({ san, uci: u, fen: S.ch.fen() }); S.last = [m.from, m.to]; S.sel = -1; S.targets = []; S.legal = S.ch.legal();
  renderAll({ from: m.from, to: m.to });
  const st = S.ch.status(); if (st.over) return finish(st);
  maybeBot();
}

// ---------- Bot (Web Worker + fallback main-thread) ----------
let worker = null, wfail = false, rid = 0; const reqs = new Map(); const local = new C.Searcher();
function initWorker() {
  try {
    worker = new Worker('workers/ai-worker.js');
    worker.onmessage = e => { const r = reqs.get(e.data.id); if (r) { reqs.delete(e.data.id); r.res(e.data); } };
    worker.onerror = () => { wfail = true; worker = null; const rs = [...reqs.values()]; reqs.clear(); rs.forEach(r => r.fallback()); };
  } catch (e) { wfail = true; worker = null; }
}
function runLocal(job) {
  const ch = new C.Chess(); job.moves.forEach(u => ch.play(u));
  const r = local.think(ch, Object.assign({}, job.cfg, { bonus: job.bonus }));
  return { uci: r ? C.uciOf(r.move) : null, score: r && r.score, depth: r && r.depth, nodes: r && r.nodes, local: true };
}
function askEngine(job) {
  return new Promise(res => {
    const id = ++rid, fb = () => setTimeout(() => res(runLocal(job)), 30);
    if (worker && !wfail) { reqs.set(id, { res, fallback: fb }); worker.postMessage(Object.assign({ id }, job)); } else fb();
  });
}
function maybeBot() { if (S.live && !S.over && S.mode === 'bot' && S.ch.turn !== S.pc) botMove(); }
function botMove() {
  const gid = S.gid; S.thinking = true; renderPanel();
  const job = { moves: S.hist.map(h => h.uci), cfg: C.DIFFICULTY[S.diff], bonus: L.rootBonus(S.knowledge, S.ch.posId()) };
  const t0 = Date.now();
  askEngine(job).then(r => {
    const wait = Math.max(0, 350 - (Date.now() - t0));
    setTimeout(() => {
      if (gid !== S.gid) return; S.thinking = false;
      $('engineInfo').textContent = r && r.depth ? `Bot ${S.diff} · AI ${S.activeId} · kedalaman ${r.depth} · ${r.nodes} node${r.local ? ' · (tanpa Web Worker)' : ''}` : '';
      const m = r && r.uci && S.legal.find(x => C.uciOf(x) === r.uci) || S.legal[0];
      if (m) apply(m);
    }, wait);
  });
}

// ---------- Siklus game ----------
function startGame(keep) {
  S.gid++; S.thinking = false;
  if (!keep) { S.mode = $('selMode').value; S.diff = $('selDiff').value; const c = $('selColor').value; S.pc = c === 'w' ? 1 : c === 'b' ? -1 : (Math.random() < .5 ? 1 : -1); }
  S.ch = new C.Chess(); S.hist = []; S.last = null; S.sel = -1; S.targets = []; S.over = false; S.live = true; S.t0 = Date.now(); S.resultText = '';
  S.flip = S.mode === 'bot' && S.pc === -1; S.legal = S.ch.legal(); $('engineInfo').textContent = '';
  buildBoard(); renderAll(); maybeBot();
}
async function finish(st) {
  S.over = true; S.thinking = false; S.live = true;
  const names = { '1-0': 'Putih menang', '0-1': 'Hitam menang', '1/2-1/2': 'Remis' };
  S.resultText = `${names[st.result]} — ${st.reason}`; renderAll();
  try {
    await C.Recorder.save({ mode: S.mode, playerColor: S.mode === 'pvp' ? 'both' : (S.pc === 1 ? 'white' : 'black'), difficulty: S.diff, moves: S.hist, result: st.result, reason: st.reason, startedAt: S.t0, aiVersion: S.activeId, cheatUsed: !!(C.GMUI && C.GMUI.state.used) });
    await refreshBanner();
  } catch (e) { showErr(e); }
}
async function resign() {
  if (!S.live || S.over) return;
  if (!await modal('Yakin menyerah? Pertandingan akan dicatat sebagai kekalahan.', [['Batal', false], ['Resign', true, 'danger']])) return;
  const loser = S.mode === 'bot' ? S.pc : S.ch.turn;
  S.gid++; finish({ result: loser === 1 ? '0-1' : '1-0', reason: 'resignation' });
}
function undo() {
  if (!S.live || S.over || !S.hist.length) return;
  S.gid++; S.thinking = false;
  const n = S.mode === 'bot' && S.ch.turn === S.pc ? 2 : 1;
  for (let i = 0; i < n && S.hist.length; i++) { S.ch.unmake(); S.hist.pop(); }
  const l = S.hist[S.hist.length - 1]; S.last = l ? [C.nameSq(l.uci.slice(0, 2)), C.nameSq(l.uci.slice(2, 4))] : null;
  S.sel = -1; S.targets = []; S.legal = S.ch.legal(); renderAll(); maybeBot();
}

// ---------- Banner & tab ----------
async function loadKnowledge() { const a = await VM.active(); S.knowledge = a.knowledge; S.activeId = a.id; S.pending = (await VM.pending()).length; }
async function refreshBanner() {
  await loadKnowledge(); const cand = VM.state.candidateId, b = $('aibanner');
  const upd = S.pending > 0 || cand;
  b.className = 'banner' + (upd ? ' upd' : '');
  b.innerHTML = `<span>AI <b>${esc(S.activeId)}</b> · Data baru: ${S.pending} pertandingan · ${cand ? 'Kandidat ' + esc(cand) + ' menunggu' : S.pending ? '<b>Update Available</b>' : 'Up to date'}</span>${upd ? '<button id="goAI">Buka</button>' : ''}`;
  const g = $('goAI'); if (g) g.onclick = () => showTab('ai');
  if (!DB.persistent) b.innerHTML += '<div class="muted">Peringatan: IndexedDB tidak tersedia, data hanya disimpan sementara.</div>';
}
function showTab(t) {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
  ['game', 'dash', 'ai'].forEach(x => { $('tab-' + x).hidden = x !== t; });
  if (t === 'dash') renderDash(); if (t === 'ai') renderAI(); if (t === 'game') renderBoard();
}
async function renderDash() {
  await loadKnowledge();
  C.Dashboard.render($('dash'), { matches: await DB.getAll('matches'), knowledge: S.knowledge, activeId: S.activeId, candidateId: VM.state.candidateId, pending: S.pending, persistent: DB.persistent });
}

// ---------- Halaman Versi AI ----------
const fmt = t => t ? new Date(t).toLocaleString('id-ID') : '-';
const badge = s => `<span class="badge ${s}">${s}</span>`;
async function renderAI() {
  await loadKnowledge();
  const vs = await VM.versions(), act = await VM.active(), prev = VM.state.previousId, cand = await VM.candidate();
  const matches = await DB.getAll('matches'), analyzed = act.knowledge.totals;
  const lastUp = vs.filter(v => v.status === 'active' || v.status === 'archived').map(v => v.activatedAt || v.createdAt).sort((a, b) => b - a)[0];
  const rep = (cand && cand.report) || vs.filter(v => v.report).slice(-1)[0] && vs.filter(v => v.report).slice(-1)[0].report;
  const repV = cand || vs.filter(v => v.report).slice(-1)[0];
  const cmp = rep ? `<table><tr><th>Uji</th><th>${repV.status === 'candidate' || repV.status === 'rejected' ? 'Versi aktif (' + esc(act.id) + ')' : 'Pembanding (' + esc(repV.parent) + ')'}</th><th>Kandidat ${esc(repV.id)}</th></tr>
    <tr><td>Langkah legal</td><td>—</td><td>${rep.legal.ok}/${rep.legal.total}</td></tr>
    <tr><td>Taktik dasar</td><td>${rep.tactics.active}/${rep.tactics.total}</td><td>${rep.tactics.cand}/${rep.tactics.total}</td></tr>
    <tr><td>Hindari blunder sederhana</td><td>${rep.avoid.active}/${rep.avoid.total}</td><td>${rep.avoid.cand}/${rep.avoid.total}</td></tr>
    <tr><td>Pertandingan (kandidat vs aktif)</td><td>—</td><td>${rep.match.w}M ${rep.match.d}R ${rep.match.l}K = ${Math.round(rep.match.score * 100)}%</td></tr></table>
    <div style="margin-top:6px">Hasil: ${rep.pass ? '<b class="ok">LULUS</b>' : '<b class="fail">GAGAL</b> — ' + esc(rep.reasons.join('; '))}</div>` : '<span class="muted">Belum ada pengujian.</span>';
  const rows = vs.slice().reverse().map(v => `<tr><td><b>${esc(v.id)}</b></td><td>${badge(v.status)}</td><td>${fmt(v.createdAt)}</td><td>${v.matchIds.length}</td><td>${v.knowledge.totals.positions}</td><td>
    ${v.status === 'candidate' ? `<button data-act="activate" class="primary">Aktifkan</button> <button data-act="discard">Buang</button>` : ''}${v.status === 'archived' ? `<button data-act="switch" data-id="${esc(v.id)}">Aktifkan</button>` : ''}</td></tr>`).join('');
  $('aiPage').innerHTML = `
    <div class="stats">${[[act.id, 'Active AI Version'], [prev || '—', 'Previous AI Version'], [cand ? cand.id : '—', 'Candidate AI Version'], [analyzed.matches, 'Pertandingan dianalisis'], [analyzed.positions, 'Posisi dipelajari'], [fmt(lastUp), 'Update terakhir']].map(([v, k]) => `<div class="stat"><div class="v" style="font-size:${String(v).length > 12 ? 16 : 28}px">${esc(v)}</div><div class="k">${k}</div></div>`).join('')}</div>
    <div class="sect"><h2>Pembaruan AI</h2>
      <div>Active Version: <b>${esc(act.id)}</b> · New Data: <b>${S.pending}</b> pertandingan · Status: <b>${cand ? 'Kandidat menunggu keputusan' : S.pending ? 'Update Available' : 'Up to date'}</b></div>
      <div class="muted">Total tersimpan: ${matches.length} pertandingan. Semua tingkat kesulitan memakai versi aktif yang sama. Kandidat tidak pernah aktif tanpa persetujuan.</div>
      <div class="row" style="margin-top:16px"><button id="bUpdate" class="primary" ${(!S.pending || cand || S.busy) ? 'disabled' : ''}>UPDATE AI</button>
        <button id="bRollback" ${prev && !S.busy ? '' : 'disabled'}>Rollback ke ${esc(prev || 'versi sebelumnya')}</button></div>
      <div id="upProg" hidden><div class="muted" id="upTxt"></div><div class="prog"><div id="upBar"></div></div></div></div>
    <div class="sect"><h2>Performance Comparison</h2>${cmp}</div>
    <div class="sect"><h2>Update History</h2><div style="overflow:auto"><table><tr><th>Versi</th><th>Status</th><th>Dibuat</th><th>Match</th><th>Posisi</th><th></th></tr>${rows}</table></div></div>
    <div class="sect"><h2>Opening memory (versi aktif)</h2>${L.summary(act.knowledge).openings.map(([k, n]) => `<div class="bar"><span class="lb" style="width:auto;flex:1">${esc(k)}</span><span class="nm">${n}×</span></div>`).join('') || '<span class="muted">Belum ada.</span>'}</div>`;
  $('bUpdate').onclick = doUpdate; $('bRollback').onclick = doRollback;
  $('aiPage').querySelectorAll('button[data-act]').forEach(b => b.onclick = async () => {
    try {
      if (b.dataset.act === 'activate') await VM.activateCandidate();
      else if (b.dataset.act === 'discard') { if (!await modal('Buang kandidat ini? Data pertandingan tetap aman.', [['Batal', false], ['Buang', true, 'danger']])) return; await VM.discardCandidate(); }
      else await VM.switchTo(b.dataset.id);
      await refreshBanner(); renderAI();
    } catch (e) { showErr(e); }
  });
}
async function doUpdate() {
  if (S.busy) return;
  const n = S.pending;
  if (!await modal(`Analisis <b>${n}</b> pertandingan baru dan buat kandidat versi baru?<br><span class="muted">Versi aktif tidak berubah sampai kamu menyetujui. Proses dapat memakan beberapa menit pada ponsel.</span>`, [['Batal', false], ['Ya, UPDATE AI', true, 'primary']])) return;
  S.busy = true; $('bUpdate').disabled = true; $('upProg').hidden = false;
  try {
    const cand = await VM.runUpdate((txt, f) => { $('upTxt').textContent = txt; $('upBar').style.width = Math.round((f || 0) * 100) + '%'; });
    S.busy = false; await refreshBanner(); await renderAI();
    if (cand.status === 'candidate') {
      if (await modal(`Kandidat <b>${esc(cand.id)}</b> lulus pengujian. Aktifkan sekarang untuk semua tingkat kesulitan?`, [['Nanti', false], ['Aktifkan', true, 'primary']])) { await VM.activateCandidate(); await refreshBanner(); renderAI(); }
    } else await modal(`Kandidat <b>${esc(cand.id)}</b> <b>gagal</b> pengujian dan ditolak:<br>${esc(cand.report.reasons.join('; '))}<br><span class="muted">Versi aktif tidak diganti. Data tidak dihapus.</span>`, [['OK', true, 'primary']]);
  } catch (e) { showErr(e); S.busy = false; renderAI(); }
}
async function doRollback() {
  if (!await modal('Kembali ke versi AI sebelumnya? Data pertandingan tidak dihapus.', [['Batal', false], ['Rollback', true, 'danger']])) return;
  try { await VM.rollback(); await refreshBanner(); renderAI(); } catch (e) { showErr(e); }
}

// ---------- Init ----------
async function init() {
  document.querySelectorAll('#tabs button').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('bNew').onclick = () => startGame(false); $('bRestart').onclick = () => startGame(true);
  $('bUndo').onclick = undo; $('bResign').onclick = resign;
  $('bFlip').onclick = () => { S.flip = !S.flip; buildBoard(); renderBoard(); };
  $('selMode').onchange = renderPanel;
  initWorker(); if (C.GMUI) C.GMUI.init();
  try { await DB.open(); await VM.init(); await refreshBanner(); } catch (e) { showErr(e); }
  startGame(false);
}
C.App = { S, renderBoard, canHuman, applyUci(u) { const m = S.legal.find(x => C.uciOf(x) === u); if (!m || !canHuman()) return false; apply(m); return true; } };
init();
})(globalThis);
