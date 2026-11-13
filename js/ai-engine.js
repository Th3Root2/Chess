/* ai-engine.js — mesin pencari: negamax + alpha-beta, iterative deepening, move ordering,
   quiescence search, transposition table, killer/history heuristic, check extension, LMR ringan. */
(function (G) {
'use strict';
const C = G.CAI;
const MATE = 30000, INF = 32000;
const VAL = [0, 100, 320, 330, 500, 900, 20000];
const mkey = m => m.from | (m.to << 6) | (m.promo << 12);

class Searcher {
  constructor() { this.tt = new Map(); this.hist = new Int32Array(4096); this.killers = []; this.curD = 1; this.ttMax = 250000; }
  reset() { this.tt.clear(); this.hist.fill(0); }

  /** cfg: {maxDepth,timeMs,noise,blunder,bonus:{uci:cp}} -> {move,score,depth,nodes,time} atau null */
  think(ch, cfg) {
    cfg = Object.assign({ maxDepth: 3, timeMs: 1000, noise: 0, blunder: 0, bonus: null }, cfg);
    this.ch = ch; this.nodes = 0; this.stop = false; this.start = Date.now(); this.deadline = this.start + cfg.timeMs;
    this.killers = []; for (let i = 0; i < 130; i++) this.killers.push([0, 0]);
    this.hist.fill(0);
    if (this.tt.size > this.ttMax) this.tt.clear();
    const root = ch.legal();
    if (!root.length) return null;
    if (root.length === 1) return { move: root[0], score: 0, depth: 0, nodes: 0, time: 0 };
    const bonus = cfg.bonus || {};
    const multi = cfg.noise > 0 || cfg.blunder > 0;
    let best = root[0], bestScore = -INF, doneDepth = 0, scores = new Map();
    for (let d = 1; d <= cfg.maxDepth; d++) {
      this.curD = d;
      let alpha = -INF, iterBest = null, iterScore = -INF; const it = new Map();
      if (scores.size) root.sort((a, b) => (scores.get(b) ?? -INF) - (scores.get(a) ?? -INF));
      for (const m of root) {
        const bn = bonus[C.uciOf(m)] || 0;
        ch.make(m);
        const aRaw = multi ? -INF : alpha - bn;
        const sc = -this.nega(d - 1, -INF, -aRaw, 1);
        ch.unmake();
        if (this.stop && d > 1) break;
        const adj = sc + bn; it.set(m, adj);
        if (adj > iterScore) { iterScore = adj; iterBest = m; if (!multi) alpha = adj; }
      }
      if (this.stop && d > 1) break;
      best = iterBest; bestScore = iterScore; scores = it; doneDepth = d;
      if (Math.abs(bestScore) > MATE - 100) break;
      if (Date.now() - this.start > cfg.timeMs * 0.6) break;
    }
    if (multi && scores.size) {
      const arr = [...scores.entries()].sort((a, b) => b[1] - a[1]);
      if (Math.random() < cfg.blunder) {
        const pool = arr.filter(x => x[1] >= bestScore - 250).slice(0, 4);
        if (pool.length) best = pool[Math.floor(Math.random() * pool.length)][0];
      } else {
        let bs = -Infinity;
        for (const [m, s] of arr) { const v = s + (Math.random() * 2 - 1) * cfg.noise; if (v > bs) { bs = v; best = m; } }
      }
    }
    return { move: best, score: bestScore, depth: doneDepth, nodes: this.nodes, time: Date.now() - this.start };
  }

  order(moves, ttm, ply, quiet) {
    const k = this.killers[ply] || [0, 0];
    for (const m of moves) {
      let s;
      if (ttm && mkey(m) === ttm) s = 1e6;
      else if (m.cap) s = 1e5 + VAL[Math.abs(m.cap)] * 10 - VAL[Math.abs(m.piece)] / 10;
      else if (m.promo) s = 9e4 + m.promo;
      else { const mk = mkey(m); s = mk === k[0] ? 8e4 : mk === k[1] ? 7e4 : this.hist[m.from * 64 + m.to]; }
      m.s = s;
    }
    moves.sort((a, b) => b.s - a.s);
  }

  nega(d, alpha, beta, ply) {
    if ((++this.nodes & 1023) === 0 && this.curD > 1 && Date.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const ch = this.ch;
    if (ch.half >= 100 || ch.isRep()) return 0;
    const us0 = ch.turn, inChk = ch.inCheck(us0);
    if (inChk) d++;
    if (d <= 0) return this.q(alpha, beta, ply);
    const key = ch.key(); let ttm = 0; const e = this.tt.get(key);
    if (e) {
      ttm = e.m;
      if (e.d >= d) {
        let s = e.s; if (s > MATE - 100) s -= ply; else if (s < -MATE + 100) s += ply;
        if (e.f === 0) return s; if (e.f === 1 && s >= beta) return s; if (e.f === 2 && s <= alpha) return s;
      }
    }
    const moves = ch.pseudo(false); this.order(moves, ttm, ply);
    let best = -INF, bm = 0, legal = 0; const a0 = alpha;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      ch.make(m);
      if (ch.inCheck(us0)) { ch.unmake(); continue; }
      legal++;
      let sc;
      if (legal > 4 && d >= 3 && !m.cap && !m.promo && !inChk) {
        sc = -this.nega(d - 2, -alpha - 1, -alpha, ply + 1);
        if (sc > alpha) sc = -this.nega(d - 1, -beta, -alpha, ply + 1);
      } else sc = -this.nega(d - 1, -beta, -alpha, ply + 1);
      ch.unmake();
      if (this.stop) return 0;
      if (sc > best) { best = sc; bm = mkey(m); }
      if (sc > alpha) {
        alpha = sc;
        if (alpha >= beta) {
          if (!m.cap && ply < 128) { const k = this.killers[ply]; if (k[0] !== mkey(m)) { k[1] = k[0]; k[0] = mkey(m); } this.hist[m.from * 64 + m.to] += d * d; }
          break;
        }
      }
    }
    if (legal === 0) return inChk ? -MATE + ply : 0;
    let st = best; if (st > MATE - 100) st += ply; else if (st < -MATE + 100) st -= ply;
    if (this.tt.size >= this.ttMax && !this.tt.has(key)) return best; // batas RAM: jangan tambah entri baru
    this.tt.set(key, { d, s: st, f: best <= a0 ? 2 : best >= beta ? 1 : 0, m: bm });
    return best;
  }

  q(alpha, beta, ply) {
    if ((++this.nodes & 1023) === 0 && this.curD > 1 && Date.now() > this.deadline) this.stop = true;
    if (this.stop) return 0;
    const ch = this.ch, sp = C.evaluate(ch);
    if (ply >= 60 || sp >= beta) return sp;
    if (sp > alpha) alpha = sp;
    const moves = ch.pseudo(true); this.order(moves, 0, 127);
    const us = ch.turn;
    for (const m of moves) {
      if (!m.promo && sp + VAL[Math.abs(m.cap)] + 200 < alpha) continue;
      ch.make(m);
      if (ch.inCheck(us)) { ch.unmake(); continue; }
      const sc = -this.q(-beta, -alpha, ply + 1);
      ch.unmake();
      if (this.stop) return 0;
      if (sc >= beta) return sc;
      if (sc > alpha) alpha = sc;
    }
    return alpha;
  }

  // ---- Analisis Multi-PV bertahap (dipakai Grandmaster Assistant) ----
  /** Siapkan analisis. cfg: {timeMs, multipv, hash}. Mengembalikan jumlah langkah legal. */
  multiStart(ch, cfg) {
    this.ch = ch; this.nodes = 0; this.stop = false; this.curD = 1; this.start = Date.now();
    this.deadline = this.start + (cfg.timeMs || 5000); this.ttMax = cfg.hash || 250000; this.k = Math.max(1, cfg.multipv || 3);
    this.tt.clear(); this.hist.fill(0); this.killers = []; for (let i = 0; i < 130; i++) this.killers.push([0, 0]);
    this.root = ch.legal(); this.prev = new Map(); return this.root.length;
  }
  /** Cari satu kedalaman penuh. null = dihentikan (waktu habis) sebelum selesai. Skor sudut pandang pihak yang jalan. */
  multiDepth(d) {
    this.curD = d; const ch = this.ch, k = this.k, lines = [];
    const rs = this.root.slice().sort((a, b) => (this.prev.get(b) ?? -INF) - (this.prev.get(a) ?? -INF));
    for (const m of rs) {
      const aRaw = lines.length >= k ? lines[k - 1].score - 1 : -INF;
      ch.make(m); const sc = -this.nega(d - 1, -INF, -aRaw, 1); ch.unmake();
      if (this.stop && d > 1) return null;
      this.prev.set(m, sc);
      if (sc > aRaw) { lines.push({ move: m, score: sc }); lines.sort((a, b) => b.score - a.score); if (lines.length > k) lines.pop(); }
    }
    for (const l of lines) { l.pv = this.extractPv(l.move, d + 4).map(C.uciOf); l.uci = l.pv[0]; delete l.move; }
    return { depth: d, lines, nodes: this.nodes, time: Date.now() - this.start, ttSize: this.tt.size };
  }
  extractPv(m, max) {
    const ch = this.ch, pv = [m]; let made = 1; ch.make(m);
    for (let i = 0; i < max; i++) {
      const e = this.tt.get(ch.key()); if (!e || !e.m || ch.isRep()) break;
      const nm = ch.legal().find(x => mkey(x) === e.m); if (!nm) break;
      pv.push(nm); ch.make(nm); made++;
    }
    for (let i = 0; i < made; i++) ch.unmake();
    return pv;
  }
  /** Jalankan seluruh iterative deepening secara sinkron (di Web Worker); onDepth dipanggil tiap kedalaman selesai. */
  multiRun(ch, cfg, onDepth) {
    const n = this.multiStart(ch, cfg); if (!n) return 0;
    const maxD = cfg.maxDepth || 12; let last = null;
    for (let d = 1; d <= maxD; d++) {
      const r = this.multiDepth(d); if (!r) break; last = r; onDepth && onDepth(r);
      if (Math.abs(r.lines[0].score) > MATE - 100 || n === 1) break;
      if (Date.now() - this.start > (cfg.timeMs || 5000) * 0.7) break; // kedalaman berikutnya hampir pasti tidak selesai
    }
    return last ? last.depth : 0;
  }
  /** Skor quiescence statis (sudut pandang pihak yang jalan) — untuk menaksir keuntungan taktis. */
  quiet(ch) { this.ch = ch; this.nodes = 0; this.stop = false; this.curD = 1; this.deadline = Infinity; return this.q(-INF, INF, 0); }
}
/** Skor posisi (sudut pandang pihak yang jalan) untuk analisis; menangani mate/stalemate. */
function analyze(searcher, ch, depth, ms) {
  if (!ch.hasLegal()) return ch.inCheck(ch.turn) ? -MATE : 0;
  const r = searcher.think(ch, { maxDepth: depth, timeMs: ms });
  return r.depth === 0 ? C.evaluate(ch) : r.score;
}
C.Searcher = Searcher; C.analyzePosition = analyze; C.MATE = MATE;
C.DIFFICULTY = {
  easy: { maxDepth: 2, timeMs: 500, noise: 70, blunder: 0.15 },
  medium: { maxDepth: 3, timeMs: 1200, noise: 20, blunder: 0.03 },
  hard: { maxDepth: 5, timeMs: 2500, noise: 0, blunder: 0 },
  expert: { maxDepth: 7, timeMs: 5000, noise: 0, blunder: 0 }
};
})(globalThis);
