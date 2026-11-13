/* dashboard.js — statistik & grafik sederhana (bar CSS). */
(function (G) {
'use strict';
const C = G.CAI, L = C.Learning;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bars = (rows, total) => rows.map(([lb, n]) => `<div class="bar"><span class="lb">${esc(lb)}</span><span class="tr"><span class="fi" style="display:block;width:${total ? Math.round(100 * n / total) : 0}%"></span></span><span class="nm">${n}</span></div>`).join('');
const card = (v, k) => `<div class="stat"><div class="v">${esc(v)}</div><div class="k">${esc(k)}</div></div>`;

C.Dashboard = {
  render(el, d) {
    const ms = d.matches, pvp = ms.filter(m => m.mode === 'pvp').length, bot = ms.length - pvp;
    const moves = ms.reduce((a, m) => a + m.moves.length, 0);
    const res = { w: 0, d: 0, b: 0 }; ms.forEach(m => { if (m.result === '1-0') res.w++; else if (m.result === '0-1') res.b++; else res.d++; });
    const diffs = {}; ms.filter(m => m.mode === 'bot').forEach(m => { diffs[m.difficulty] = (diffs[m.difficulty] || 0) + 1; });
    const op = {}; ms.forEach(m => { if (m.moves.length >= 2) { const n = L.openingName(m.moves.slice(0, 6).map(x => x.san)); op[n] = (op[n] || 0) + 1; } });
    const topOp = Object.entries(op).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const k = d.knowledge, sum = L.summary(k), t = k.totals, qTot = t.good + t.inaccuracy + t.mistake + t.blunder;
    const upd = d.pending > 0 ? `Update Available (${d.pending} pertandingan baru)` : 'Up to date';
    el.innerHTML = `
      <div class="stats">${card(ms.length, 'Total pertandingan')}${card(pvp, 'Player vs Player')}${card(bot, 'Player vs Bot')}${card(moves, 'Langkah terekam')}
        ${card(t.positions, 'Posisi dianalisis (versi aktif)')}${card(d.activeId, 'Versi AI aktif')}</div>
      <div class="sect"><h2>Status pembaruan</h2><div>${esc(upd)} · Versi aktif <b>${esc(d.activeId)}</b>${d.candidateId ? ' · Kandidat menunggu: <b>' + esc(d.candidateId) + '</b>' : ''}</div>
        <div class="muted">Penyimpanan: ${d.persistent ? 'IndexedDB (permanen)' : 'memori sementara — IndexedDB tidak tersedia, data hilang saat ditutup'}</div></div>
      <div class="sect"><h2>Distribusi hasil</h2>${bars([['Putih menang', res.w], ['Remis', res.d], ['Hitam menang', res.b]], ms.length)}</div>
      <div class="sect"><h2>Pertandingan vs Bot per level</h2>${Object.keys(diffs).length ? bars(Object.entries(diffs), bot) : '<span class="muted">Belum ada.</span>'}</div>
      <div class="sect"><h2>Opening paling sering</h2>${topOp.length ? bars(topOp, ms.length) : '<span class="muted">Belum ada data.</span>'}</div>
      <div class="sect"><h2>Kualitas langkah (hasil analisis engine)</h2>${qTot ? bars([['Good', t.good], ['Inaccuracy', t.inaccuracy], ['Mistake', t.mistake], ['Blunder', t.blunder]], qTot) : '<span class="muted">Belum ada data teranalisis — tekan UPDATE AI di halaman Versi AI.</span>'}</div>
      <div class="sect"><h2>Pola yang dikenali (versi aktif)</h2>
        <div>Posisi dengan statistik: <b>${sum.positions}</b> · Pola langkah berulang (≥2 kali baik): <b>${sum.recurring}</b> · Langkah keliru tercatat: <b>${sum.errors}</b></div>
        ${sum.topPatterns.length ? '<table><tr><th>Langkah</th><th>Muncul baik</th></tr>' + sum.topPatterns.map(p => `<tr><td>${esc(p.uci)} ${p.pos.startsWith('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w') ? '(posisi awal)' : ''}</td><td>${p.n}×</td></tr>`).join('') + '</table>' : ''}</div>`;
  }
};
})(globalThis);
