/* grandmaster.js — Grandmaster Assistant: format skor, ancaman, peluang taktis, breakdown evaluasi,
   penilaian langkah (blunder detection) dan profil gaya bot. Hanya MEMBACA data; tidak mengubah data pembelajaran. */
(function (G) {
'use strict';
const C = G.CAI, { KNT, KNG, RAYS, PATT } = C.TABLES;
const VAL = [0, 100, 320, 330, 500, 900, 0];
const NAME = ['', 'Pion', 'Kuda', 'Gajah', 'Benteng', 'Menteri', 'Raja'];
const ci = c => (c === 1 ? 0 : 1);
const MATE = 30000;

/** Peta serangan satu warna: cnt[sq] = jumlah penyerang, min[sq] = nilai penyerang terkecil. */
function attackMap(ch, color) {
  const b = ch.b, cnt = new Int8Array(64), min = new Int16Array(64).fill(9999);
  const add = (sq, v) => { cnt[sq]++; if (v < min[sq]) min[sq] = v; };
  for (let s = 0; s < 64; s++) {
    const p = b[s]; if (!p || (p > 0) !== (color > 0)) continue; const t = Math.abs(p), v = t === 6 ? 20000 : VAL[t];
    if (t === 1) for (const a of PATT[ci(color)][s]) add(a, v);
    else if (t === 2) for (const a of KNT[s]) add(a, v);
    else if (t === 6) for (const a of KNG[s]) add(a, v);
    else { const d0 = t === 3 ? 4 : 0, d1 = t === 4 ? 4 : 8; for (let d = d0; d < d1; d++) for (const a of RAYS[s][d]) { add(a, v); if (b[a]) break; } }
  }
  return { cnt, min };
}
/** Ubah skor (sudut pandang pihak yang jalan) menjadi info tampilan sudut pandang Putih. */
function scoreInfo(score, turn) {
  const w = turn === 1 ? score : -score;
  if (Math.abs(score) > MATE - 100) {
    const plies = MATE - Math.abs(score), n = Math.ceil(plies / 2), wm = w > 0;
    return { cp: w, mate: wm ? n : -n, text: (wm ? '+M' : '−M') + n, forMover: score > 0 };
  }
  const t = (w >= 0 ? '+' : '−') + (Math.abs(w) / 100).toFixed(2); return { cp: w, mate: null, text: t, forMover: score > 0 };
}
const winPct = cp => Math.round(100 / (1 + Math.pow(10, -cp / 400)));
const side = c => (c === 1 ? 'Putih' : 'Hitam');

function kingSafety(ch, color) {
  const b = ch.b, ks = ch.kingSq[ci(color)], f = ks & 7, r = ks >> 3, dir = color === 1 ? -1 : 1; let v = 0, pawnOnFile = false;
  for (let s = 0; s < 64; s++) if (b[s] === color && (s & 7) === f) pawnOnFile = true;
  for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) {
    const r1 = r + dir, r2 = r + 2 * dir;
    if (r1 >= 0 && r1 < 8 && b[r1 * 8 + g] === color) v += 10; else if (r2 >= 0 && r2 < 8 && b[r2 * 8 + g] === color) v += 5;
  }
  if (!pawnOnFile) v -= 15;
  const em = attackMap(ch, -color); let zone = 0; for (const a of KNG[ks]) if (em.cnt[a]) zone++; if (em.cnt[ks]) zone += 2;
  return v - zone * 8;
}
/** Rincian evaluasi (heuristik, sudut pandang Putih, centipawn). */
function breakdown(searcher, ch) {
  let mat = 0; for (let s = 0; s < 64; s++) { const p = ch.b[s]; if (p) mat += (p > 0 ? 1 : -1) * VAL[Math.abs(p)]; }
  const sgn = ch.turn === 1 ? 1 : -1, stat = C.evaluate(ch) * sgn, quiet = searcher.quiet(ch) * sgn;
  const ks = kingSafety(ch, 1) - kingSafety(ch, -1);
  return { material: mat, kingSafety: ks, positional: Math.round(stat - mat - ks), tactical: Math.round(quiet - stat), total: Math.round(quiet) };
}

/** Bidak sisi yang jalan yang terancam + ancaman skakmat 1 langkah dari lawan. */
function threats(ch) {
  const us = ch.turn, E = attackMap(ch, -us), M = attackMap(ch, us), out = [];
  for (let s = 0; s < 64; s++) {
    const p = ch.b[s]; if (!p || (p > 0) !== (us > 0) || Math.abs(p) === 6) continue; const v = VAL[Math.abs(p)];
    if (!E.cnt[s]) continue;
    if (!M.cnt[s]) out.push({ sq: s, piece: Math.abs(p), reason: 'tidak terlindungi', sev: v });
    else if (E.min[s] < v) out.push({ sq: s, piece: Math.abs(p), reason: 'diserang bidak bernilai lebih rendah', sev: v - E.min[s] });
  }
  out.sort((a, b) => b.sev - a.sev);
  let mateThreat = null;
  if (!ch.inCheck(us)) { // lawan "melewati giliran": adakah skakmat 1 langkah?
    try {
      const f = ch.fen().split(' '); f[1] = us === 1 ? 'b' : 'w'; f[3] = '-';
      const x = new C.Chess(f.join(' '));
      for (const m of x.legal()) { x.make(m); const st = x.status(); x.unmake(); if (st.over && st.reason === 'checkmate') { mateThreat = C.uciOf(m); break; } }
    } catch (e) { /* posisi tidak valid untuk uji ini */ }
  }
  return { pieces: out.slice(0, 6), mateThreat, inCheck: ch.inCheck(us), ourKing: ch.kingSq[ci(us)], theirKing: ch.kingSq[ci(-us)] };
}

/** Peluang taktis heuristik untuk sisi yang jalan: skakmat, tangkapan menang materi, skak, garpu, promosi. */
function opportunities(ch) {
  const us = ch.turn, E = attackMap(ch, -us), legal = ch.legal(), out = [];
  for (const m of legal) {
    const u = C.uciOf(m), a = Math.abs(m.piece); let gain = 0; const tags = [];
    if (m.cap) { const vic = VAL[Math.abs(m.cap)], loss = E.cnt[m.to] ? VAL[a] || 20000 : 0; const g = vic - loss; if (g > 0) { tags.push(`tangkap ${NAME[Math.abs(m.cap)]} (+${g})`); gain = Math.max(gain, g); } }
    if (m.promo) { tags.push('promosi'); gain = Math.max(gain, 800); }
    ch.make(m);
    const st = ch.status();
    if (st.over && st.reason === 'checkmate') { tags.unshift('SKAKMAT'); gain = 99999; }
    else {
      if (ch.inCheck(ch.turn)) { tags.push('skak'); gain = Math.max(gain, 30); }
      const A = attackMap(ch, us), D = attackMap(ch, -us); let forks = 0; // garpu: bidak yang pindah menyerang ≥2 target bernilai
      const mv = VAL[m.promo || a] || 20000;
      for (let s = 0; s < 64; s++) { const p = ch.b[s]; if (!p || (p > 0) === (us > 0) || Math.abs(p) === 1) continue; const pv = Math.abs(p) === 6 ? 20000 : VAL[Math.abs(p)];
        if (attackedBy(ch, m.to, s) && (pv >= mv || !D.cnt[s])) forks++; }
      if (forks >= 2 && a !== 6) { tags.push('garpu'); gain = Math.max(gain, 200 * forks); }
    }
    ch.unmake();
    if (tags.length) out.push({ uci: u, san: ch.san(m, legal), tags, gain });
  }
  out.sort((a, b) => b.gain - a.gain); return out.slice(0, 6);
}
function attackedBy(ch, from, target) { // apakah bidak di 'from' menyerang 'target' pada papan saat ini
  const p = ch.b[from], t = Math.abs(p), color = p > 0 ? 1 : -1;
  if (t === 1) return PATT[ci(color)][from].includes(target);
  if (t === 2) return KNT[from].includes(target);
  if (t === 6) return KNG[from].includes(target);
  const d0 = t === 3 ? 4 : 0, d1 = t === 4 ? 4 : 8;
  for (let d = d0; d < d1; d++) for (const a of RAYS[from][d]) { if (a === target) return true; if (ch.b[a]) break; }
  return false;
}

/** Nilai kualitas satu langkah: bandingkan skor terbaik sebelum langkah dengan skor setelahnya. */
function judge(searcher, fenBefore, uci, depth, ms) {
  const ch = new C.Chess(fenBefore);
  const sc = c => { if (!c.hasLegal()) return c.inCheck(c.turn) ? -MATE : 0; searcher.reset(); const r = searcher.think(c, { maxDepth: depth, timeMs: ms }); return r.depth === 0 ? C.evaluate(c) : r.score; };
  let best = null; if (ch.hasLegal()) { searcher.reset(); const r = searcher.think(ch, { maxDepth: depth, timeMs: ms }); best = r && C.uciOf(r.move); }
  const before = sc(ch), san = ch.play(uci); if (!san) throw new Error('langkah tidak valid');
  const after = sc(ch), loss = Math.round(Math.min(2000, Math.max(0, before + after)));
  const cls = loss <= 30 ? 'good' : loss <= 80 ? 'inaccuracy' : loss <= 200 ? 'mistake' : 'blunder';
  return { uci, san: san.san, bestUci: best, loss, cls, mover: fenBefore.split(' ')[1] === 'w' ? 1 : -1 };
}

/** Profil gaya bot dari data pertandingan mentah (read-only). */
function botProfile(matches, analyses, difficulty) {
  const ms = matches.filter(m => m.mode === 'bot' && (!difficulty || m.difficulty === difficulty)).slice(-300);
  const P = { games: ms.length, botMoves: 0, captures: 0, checks: 0, earlyQueen: 0, castled: 0, castlePlySum: 0, openings: {}, firstMove: {}, repertoire: {}, blunder: null };
  const anaMap = new Map((analyses || []).map(a => [a.matchId, a])); const cls = { good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }; let anaN = 0;
  for (const m of ms) {
    const botCol = m.playerColor === 'white' ? 'b' : 'w', a = anaMap.get(m.id); let own = 0, castled = false;
    const name = C.Learning ? C.Learning.openingName(m.moves.slice(0, 6).map(x => x.san)) : '?'; P.openings[name] = (P.openings[name] || 0) + 1;
    for (let i = 0; i < m.moves.length; i++) {
      const mover = i % 2 === 0 ? 'w' : 'b'; if (mover !== botCol) continue; const mv = m.moves[i]; P.botMoves++; own++;
      if (mv.san.includes('x')) P.captures++; if (/[+#]$/.test(mv.san)) P.checks++;
      if (mv.san[0] === 'Q' && own <= 8) P.earlyQueen++;
      if (mv.san.startsWith('O-O') && !castled) { castled = true; P.castled++; P.castlePlySum += own; }
      if (i === 0) P.firstMove[mv.san] = (P.firstMove[mv.san] || 0) + 1;
      const key = (i === 0 ? C.START : m.moves[i - 1].fen).split(' ').slice(0, 3).join(' ') + (mover === 'w' ? ' w' : ' b');
      const r = P.repertoire[key] || (P.repertoire[key] = {}); r[mv.uci] = (r[mv.uci] || 0) + 1;
      if (a && a.plies[i]) { cls[a.plies[i].cls]++; anaN++; }
    }
  }
  if (anaN) P.blunder = { n: anaN, ...cls };
  return P;
}
/** Langkah yang pernah dimainkan bot pada posisi persis ini (tambahan informasi, bukan input engine). */
function repertoireAt(profile, ch) {
  const key = ch.fen().split(' ').slice(0, 3).join(' ') + (ch.turn === 1 ? ' w' : ' b');
  // key riwayat memakai format 'papan giliran hak-rokade giliran' → samakan: papan+giliran+rokade lalu giliran
  const k2 = ch.fen().split(' ').slice(0, 3).join(' ') + (ch.turn === 1 ? ' w' : ' b');
  return profile.repertoire[key] || profile.repertoire[k2] || null;
}
C.GM = { attackMap, scoreInfo, winPct, breakdown, threats, opportunities, judge, botProfile, repertoireAt, NAME, side, VAL };
})(globalThis);
