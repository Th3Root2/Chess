/* ai-learning.js — sistem pembelajaran berbasis STATISTIK + evaluasi engine (bukan machine learning / neural network).
   Tiga lapisan data terpisah:
   1) data mentah     : store "matches"   (langkah, SAN, FEN, hasil)
   2) data dianalisis : store "analysis"  (evaluasi engine per posisi, kualitas tiap langkah)
   3) pengetahuan AI  : "knowledge" di dalam tiap versi AI (statistik langkah, opening memory)            */
(function (G) {
'use strict';
const C = G.CAI;
const TAG = 'a1';               // ubah jika metode analisis berubah (membuat cache analisis lama tidak dipakai)
const ANALYSIS_DEPTH = 3, ANALYSIS_MS = 100, MAX_PLY_STATS = 60, DECIDED = 900;
const yieldUI = () => new Promise(r => setTimeout(r, 0));
const OPEN = [['e4 e5 Nf3 Nc6 Bb5', 'Ruy Lopez'], ['e4 e5 Nf3 Nc6 Bc4', 'Italian Game'], ['e4 e5 Nf3 Nc6 d4', 'Scotch Game'], ['e4 e5 Nf3 Nc6', 'Open Game'],
  ['e4 e5', "King's Pawn Game"], ['e4 c5', 'Sicilian Defense'], ['e4 e6', 'French Defense'], ['e4 c6', 'Caro-Kann Defense'], ['e4 d5', 'Scandinavian Defense'],
  ['d4 d5 c4', "Queen's Gambit"], ['d4 Nf6 c4 g6', "King's Indian Setup"], ['d4 Nf6', 'Indian Defense'], ['d4 d5', "Queen's Pawn Game"], ['c4', 'English Opening'],
  ['Nf3', 'Reti Opening'], ['e4', "King's Pawn Opening"], ['d4', "Queen's Pawn Opening"]].sort((a, b) => b[0].length - a[0].length);
const openingName = sans => { const s = sans.join(' '); for (const [p, n] of OPEN) if (s === p || s.startsWith(p + ' ')) return n; return 'Lainnya'; };
const classify = loss => loss <= 30 ? 'good' : loss <= 80 ? 'inaccuracy' : loss <= 200 ? 'mistake' : 'blunder';
const clone = o => JSON.parse(JSON.stringify(o));

const L = {
  TAG, openingName, classify, clone, searcher: new C.Searcher(),
  emptyKnowledge() { return { moveStats: {}, openings: {}, openingResults: {}, totals: { matches: 0, positions: 0, moves: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 } }; },

  /** Analisis satu pertandingan: evaluasi engine tiap posisi -> kualitas tiap langkah (bukan sekadar hasil akhir). */
  async analyzeMatch(match, cache) {
    cache = cache || new Map();
    const ch = new C.Chess(), n = match.moves.length, ids = [], ev = [];
    for (let i = 0; i <= n; i++) {
      const id = ch.posId(); ids.push(id);
      let v = cache.get(id);
      if (v === undefined) { L.searcher.reset(); v = C.analyzePosition(L.searcher, ch, ANALYSIS_DEPTH, ANALYSIS_MS); cache.set(id, v); await yieldUI(); }
      ev.push(v);
      if (i < n && !ch.play(match.moves[i].uci)) throw new Error('langkah tidak valid pada ' + match.id);
    }
    const plies = [], counts = { good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
    for (let i = 0; i < n; i++) {
      const loss = Math.min(2000, Math.max(0, ev[i] + ev[i + 1])); // ev[i+1] sudut pandang lawan
      const cls = classify(loss); counts[cls]++;
      plies.push({ ply: i + 1, posId: ids[i], uci: match.moves[i].uci, san: match.moves[i].san, evalBefore: ev[i], loss, cls });
    }
    return { matchId: match.id, tag: TAG, plies, counts, positions: n + 1 };
  },

  /** Gabungkan hasil analisis ke pengetahuan (menghasilkan objek baru; data lama tidak diubah). */
  merge(base, matches, analyses) {
    const k = clone(base);
    matches.forEach((m, mi) => {
      const a = analyses[mi]; if (!a) return;
      const res = m.result, whiteScore = res === '1-0' ? 1 : res === '0-1' ? 0 : 0.5;
      for (const p of a.plies) {
        if (p.ply > MAX_PLY_STATS || Math.abs(p.evalBefore) > DECIDED) continue; // posisi sudah menang/kalah telak: tidak dipelajari
        const st = k.moveStats[p.posId] || (k.moveStats[p.posId] = {});
        const e = st[p.uci] || (st[p.uci] = [0, 0, 0, 0, 0]); // [good, bad, win, draw, loss] dari sudut pandang pemain yang melangkah
        if (p.cls === 'good') e[0]++; else if (p.cls === 'mistake' || p.cls === 'blunder') e[1]++;
        const ms = p.ply % 2 === 1 ? whiteScore : 1 - whiteScore;
        e[ms === 1 ? 2 : ms === 0 ? 4 : 3]++;
      }
      for (const c of ['good', 'inaccuracy', 'mistake', 'blunder']) k.totals[c] += a.counts[c];
      k.totals.positions += a.positions; k.totals.moves += m.moves.length; k.totals.matches++;
      if (m.moves.length >= 4) {
        const key = m.moves.slice(0, 6).map(x => x.san).join(' ');
        k.openings[key] = (k.openings[key] || 0) + 1;
        const r = k.openingResults[key] || (k.openingResults[key] = [0, 0, 0]);
        r[whiteScore === 1 ? 0 : whiteScore === 0 ? 2 : 1]++;
      }
    });
    return k;
  },

  /** Bonus/penalti centipawn untuk langkah di posisi akar. Kecil dibanding evaluasi engine: hasil game bukan penentu tunggal. */
  rootBonus(k, posId) {
    const out = {}; const st = k && k.moveStats && k.moveStats[posId]; if (!st) return out;
    for (const [u, e] of Object.entries(st)) {
      const [g, b, w, d, l] = e; let v = 0;
      if (g > 0) { v += Math.min(20, 6 * g); const n = w + d + l; if (n) v += ((w + 0.5 * d) / n - 0.5) * 16 * Math.min(1, n / 3); }
      v -= Math.min(120, 40 * b);
      v = Math.max(-120, Math.min(30, v)); if (v) out[u] = Math.round(v);
    }
    return out;
  },

  /** Ringkasan: pola langkah yang dikenali, opening memory, dll. */
  summary(k) {
    let recurring = 0, errors = 0, positions = 0; const top = [];
    for (const [pos, st] of Object.entries(k.moveStats)) {
      positions++;
      for (const [u, e] of Object.entries(st)) { if (e[0] >= 2) { recurring++; top.push({ pos, uci: u, n: e[0] }); } if (e[1] >= 1) errors++; }
    }
    top.sort((a, b) => b.n - a.n);
    return { positions, recurring, errors, topPatterns: top.slice(0, 5), openings: Object.entries(k.openings).sort((a, b) => b[1] - a[1]).slice(0, 5) };
  }
};
C.Learning = L;
})(globalThis);
