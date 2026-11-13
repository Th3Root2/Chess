/* chess-engine.js — aturan catur lengkap (legal move generation, SAN, FEN, draw rules). Tanpa library eksternal. */
(function (G) {
'use strict';
const C = G.CAI = G.CAI || {};
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
const sqName = s => FILES[s & 7] + (8 - (s >> 3));
const nameSq = n => (8 - (+n[1])) * 8 + FILES.indexOf(n[0]);
const LET = { 1: '', 2: 'N', 3: 'B', 4: 'R', 5: 'Q', 6: 'K' };
const PL = { 2: 'n', 3: 'b', 4: 'r', 5: 'q' };
const ci = c => (c === 1 ? 0 : 1);
const uciOf = m => sqName(m.from) + sqName(m.to) + (m.promo ? PL[m.promo] : '');

const KNT = [], KNG = [], RAYS = [], PATT = [[], []];
const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
for (let s = 0; s < 64; s++) {
  const f = s & 7, r = s >> 3;
  KNT[s] = []; KNG[s] = []; RAYS[s] = [];
  for (const [df, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
    const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) KNT[s].push(nr * 8 + nf);
  }
  for (const [df, dr] of DIRS) {
    const nf = f + df, nr = r + dr; if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8) KNG[s].push(nr * 8 + nf);
    const ray = []; let cf = f + df, cr = r + dr;
    while (cf >= 0 && cf < 8 && cr >= 0 && cr < 8) { ray.push(cr * 8 + cf); cf += df; cr += dr; }
    RAYS[s].push(ray);
  }
  PATT[0][s] = []; PATT[1][s] = [];
  for (const df of [-1, 1]) if (f + df >= 0 && f + df < 8) {
    if (r - 1 >= 0) PATT[0][s].push((r - 1) * 8 + f + df);
    if (r + 1 < 8) PATT[1][s].push((r + 1) * 8 + f + df);
  }
}
const CMASK = new Uint8Array(64).fill(15);
CMASK[60] &= ~3; CMASK[63] &= ~1; CMASK[56] &= ~2; CMASK[4] &= ~12; CMASK[7] &= ~4; CMASK[0] &= ~8;

let seed = 0x2545F491;
const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; };
const Z1 = new Int32Array(800), Z2 = new Int32Array(800);
for (let i = 0; i < 800; i++) { Z1[i] = rnd(); Z2[i] = rnd(); }
const pz = (p, s) => (p > 0 ? p - 1 : 5 - p) * 64 + s;

class Chess {
  constructor(fen) { this.load(fen || START); }
  load(fen) {
    const p = fen.trim().split(/\s+/);
    if (p.length < 2) throw new Error('FEN tidak valid');
    this.b = new Int8Array(64);
    const rows = p[0].split('/'); if (rows.length !== 8) throw new Error('FEN tidak valid');
    const map = { p: 1, n: 2, b: 3, r: 4, q: 5, k: 6 };
    this.kingSq = [-1, -1];
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const ch of rows[r]) {
        if (ch >= '1' && ch <= '8') f += +ch;
        else { const t = map[ch.toLowerCase()]; if (!t) throw new Error('FEN tidak valid'); const v = ch === ch.toLowerCase() ? -t : t; this.b[r * 8 + f] = v; if (t === 6) this.kingSq[v > 0 ? 0 : 1] = r * 8 + f; f++; }
      }
    }
    if (this.kingSq[0] < 0 || this.kingSq[1] < 0) throw new Error('FEN tanpa raja');
    this.turn = p[1] === 'b' ? -1 : 1;
    this.castle = 0; const cs = p[2] || '-';
    if (cs.includes('K')) this.castle |= 1; if (cs.includes('Q')) this.castle |= 2; if (cs.includes('k')) this.castle |= 4; if (cs.includes('q')) this.castle |= 8;
    this.ep = p[3] && p[3] !== '-' ? nameSq(p[3]) : -1;
    this.half = +p[4] || 0; this.full = +p[5] || 1;
    this.stack = [];
    this.computeHash();
    this.keys = [this.key()];
  }
  computeHash() {
    let h1 = 0, h2 = 0;
    for (let s = 0; s < 64; s++) { const v = this.b[s]; if (v) { const i = pz(v, s); h1 ^= Z1[i]; h2 ^= Z2[i]; } }
    h1 ^= Z1[768 + this.castle]; h2 ^= Z2[768 + this.castle];
    if (this.turn === -1) { h1 ^= Z1[792]; h2 ^= Z2[792]; }
    this.eh1 = 0; this.eh2 = 0;
    if (this.ep >= 0 && this.epCapturable()) { this.eh1 = Z1[784 + (this.ep & 7)]; this.eh2 = Z2[784 + (this.ep & 7)]; }
    this.h1 = h1 ^ this.eh1; this.h2 = h2 ^ this.eh2;
  }
  key() { return (this.h1 >>> 0) * 2097152 + (this.h2 >>> 11); }
  epCapturable() { const us = this.turn; for (const s of PATT[ci(-us)][this.ep]) if (this.b[s] === us) return true; return false; }
  zx(p, s) { const i = pz(p, s); this.h1 ^= Z1[i]; this.h2 ^= Z2[i]; }

  isAttacked(sq, by) {
    const b = this.b;
    for (const s of PATT[ci(-by)][sq]) if (b[s] === by) return true;
    for (const s of KNT[sq]) if (b[s] === by * 2) return true;
    for (const s of KNG[sq]) if (b[s] === by * 6) return true;
    const R = RAYS[sq];
    for (let d = 0; d < 8; d++) {
      const r = R[d];
      for (let i = 0; i < r.length; i++) {
        const v = b[r[i]];
        if (v) { if (v === by * 5 || v === by * (d < 4 ? 4 : 3)) return true; break; }
      }
    }
    return false;
  }
  inCheck(color) { return this.isAttacked(this.kingSq[ci(color)], -color); }

  pseudo(capOnly) {
    const b = this.b, us = this.turn, out = [];
    const lo = capOnly ? 5 : 2;
    for (let s = 0; s < 64; s++) {
      const p = b[s]; if (p === 0 || (p > 0) !== (us > 0)) continue;
      const t = p > 0 ? p : -p;
      if (t === 1) {
        const r = s >> 3, dir = us === 1 ? -8 : 8, promoR = us === 1 ? 0 : 7, startR = us === 1 ? 6 : 1, to = s + dir;
        if (b[to] === 0) {
          if ((to >> 3) === promoR) { for (let pr = 5; pr >= lo; pr--) out.push({ from: s, to, piece: p, cap: 0, promo: pr, flag: 0 }); }
          else if (!capOnly) {
            out.push({ from: s, to, piece: p, cap: 0, promo: 0, flag: 0 });
            if (r === startR && b[to + dir] === 0) out.push({ from: s, to: to + dir, piece: p, cap: 0, promo: 0, flag: 1 });
          }
        }
        for (const a of PATT[ci(us)][s]) {
          const q = b[a];
          if (q !== 0 && (q > 0) !== (us > 0)) {
            if ((a >> 3) === promoR) { for (let pr = 5; pr >= lo; pr--) out.push({ from: s, to: a, piece: p, cap: q, promo: pr, flag: 0 }); }
            else out.push({ from: s, to: a, piece: p, cap: q, promo: 0, flag: 0 });
          } else if (q === 0 && a === this.ep) out.push({ from: s, to: a, piece: p, cap: -us, promo: 0, flag: 2 });
        }
      } else if (t === 2 || t === 6) {
        for (const a of (t === 2 ? KNT[s] : KNG[s])) {
          const q = b[a];
          if (q === 0) { if (!capOnly) out.push({ from: s, to: a, piece: p, cap: 0, promo: 0, flag: 0 }); }
          else if ((q > 0) !== (us > 0)) out.push({ from: s, to: a, piece: p, cap: q, promo: 0, flag: 0 });
        }
        if (t === 6 && !capOnly) {
          const rights = us === 1 ? this.castle & 3 : (this.castle >> 2) & 3, base = us === 1 ? 60 : 4;
          if (rights && s === base) {
            const o = -us;
            if ((rights & 1) && b[base + 1] === 0 && b[base + 2] === 0 && b[base + 3] === us * 4 &&
              !this.isAttacked(base, o) && !this.isAttacked(base + 1, o) && !this.isAttacked(base + 2, o))
              out.push({ from: s, to: base + 2, piece: p, cap: 0, promo: 0, flag: 3 });
            if ((rights & 2) && b[base - 1] === 0 && b[base - 2] === 0 && b[base - 3] === 0 && b[base - 4] === us * 4 &&
              !this.isAttacked(base, o) && !this.isAttacked(base - 1, o) && !this.isAttacked(base - 2, o))
              out.push({ from: s, to: base - 2, piece: p, cap: 0, promo: 0, flag: 4 });
          }
        }
      } else {
        const d0 = t === 3 ? 4 : 0, d1 = t === 4 ? 4 : 8;
        for (let d = d0; d < d1; d++) {
          for (const a of RAYS[s][d]) {
            const q = b[a];
            if (q === 0) { if (!capOnly) out.push({ from: s, to: a, piece: p, cap: 0, promo: 0, flag: 0 }); }
            else { if ((q > 0) !== (us > 0)) out.push({ from: s, to: a, piece: p, cap: q, promo: 0, flag: 0 }); break; }
          }
        }
      }
    }
    return out;
  }
  make(m) {
    const b = this.b, us = this.turn, P = m.piece;
    this.stack.push({ m, castle: this.castle, ep: this.ep, half: this.half, h1: this.h1, h2: this.h2, eh1: this.eh1, eh2: this.eh2, k0: this.kingSq[0], k1: this.kingSq[1] });
    this.h1 ^= this.eh1; this.h2 ^= this.eh2;
    this.zx(P, m.from);
    if (m.cap) { const cs = m.flag === 2 ? m.to + (us === 1 ? 8 : -8) : m.to; this.zx(m.cap, cs); if (m.flag === 2) b[cs] = 0; }
    b[m.from] = 0;
    const np = m.promo ? us * m.promo : P; b[m.to] = np; this.zx(np, m.to);
    if (m.flag === 3) { const rf = m.from + 3, rt = m.from + 1; b[rf] = 0; b[rt] = us * 4; this.zx(us * 4, rf); this.zx(us * 4, rt); }
    else if (m.flag === 4) { const rf = m.from - 4, rt = m.from - 1; b[rf] = 0; b[rt] = us * 4; this.zx(us * 4, rf); this.zx(us * 4, rt); }
    if (P === 6 || P === -6) this.kingSq[ci(us)] = m.to;
    const oc = this.castle; this.castle &= CMASK[m.from] & CMASK[m.to];
    this.h1 ^= Z1[768 + oc] ^ Z1[768 + this.castle]; this.h2 ^= Z2[768 + oc] ^ Z2[768 + this.castle];
    this.ep = m.flag === 1 ? (m.from + m.to) >> 1 : -1;
    this.half = (P === 1 || P === -1 || m.cap) ? 0 : this.half + 1;
    if (us === -1) this.full++;
    this.turn = -us;
    this.h1 ^= Z1[792]; this.h2 ^= Z2[792];
    this.eh1 = 0; this.eh2 = 0;
    if (this.ep >= 0 && this.epCapturable()) { const f = this.ep & 7; this.eh1 = Z1[784 + f]; this.eh2 = Z2[784 + f]; this.h1 ^= this.eh1; this.h2 ^= this.eh2; }
    this.keys.push(this.key());
  }
  unmake() {
    const st = this.stack.pop(), m = st.m, b = this.b, us = -this.turn; this.turn = us;
    b[m.from] = m.piece;
    if (m.flag === 2) { b[m.to] = 0; b[m.to + (us === 1 ? 8 : -8)] = m.cap; } else b[m.to] = m.cap;
    if (m.flag === 3) { b[m.from + 3] = us * 4; b[m.from + 1] = 0; } else if (m.flag === 4) { b[m.from - 4] = us * 4; b[m.from - 1] = 0; }
    this.castle = st.castle; this.ep = st.ep; this.half = st.half; this.h1 = st.h1; this.h2 = st.h2; this.eh1 = st.eh1; this.eh2 = st.eh2;
    this.kingSq[0] = st.k0; this.kingSq[1] = st.k1;
    if (us === -1) this.full--;
    this.keys.pop();
  }
  legal() {
    const us = this.turn, out = [];
    for (const m of this.pseudo(false)) { this.make(m); if (!this.inCheck(us)) out.push(m); this.unmake(); }
    return out;
  }
  hasLegal() { const us = this.turn; for (const m of this.pseudo(false)) { this.make(m); const ok = !this.inCheck(us); this.unmake(); if (ok) return true; } return false; }
  san(m, legal) {
    let s;
    if (m.flag === 3) s = 'O-O'; else if (m.flag === 4) s = 'O-O-O';
    else {
      const t = Math.abs(m.piece);
      if (t === 1) { s = m.cap ? FILES[m.from & 7] + 'x' : ''; s += sqName(m.to); if (m.promo) s += '=' + LET[m.promo]; }
      else {
        s = LET[t];
        const oth = (legal || this.legal()).filter(o => o !== m && o.to === m.to && o.piece === m.piece && o.from !== m.from);
        if (oth.length) {
          if (!oth.some(o => (o.from & 7) === (m.from & 7))) s += FILES[m.from & 7];
          else if (!oth.some(o => (o.from >> 3) === (m.from >> 3))) s += (8 - (m.from >> 3));
          else s += sqName(m.from);
        }
        if (m.cap) s += 'x'; s += sqName(m.to);
      }
    }
    this.make(m);
    if (this.inCheck(this.turn)) s += this.hasLegal() ? '+' : '#';
    this.unmake();
    return s;
  }
  play(uci) {
    const legal = this.legal(), m = legal.find(x => uciOf(x) === uci);
    if (!m) return null;
    const san = this.san(m, legal); this.make(m); return { m, san };
  }
  fen() {
    let f = '';
    for (let r = 0; r < 8; r++) {
      let e = 0;
      for (let c = 0; c < 8; c++) {
        const v = this.b[r * 8 + c];
        if (!v) { e++; continue; } if (e) { f += e; e = 0; }
        const ch = 'pnbrqk'[Math.abs(v) - 1]; f += v > 0 ? ch.toUpperCase() : ch;
      }
      if (e) f += e; if (r < 7) f += '/';
    }
    const cs = (this.castle & 1 ? 'K' : '') + (this.castle & 2 ? 'Q' : '') + (this.castle & 4 ? 'k' : '') + (this.castle & 8 ? 'q' : '');
    return `${f} ${this.turn === 1 ? 'w' : 'b'} ${cs || '-'} ${this.ep >= 0 ? sqName(this.ep) : '-'} ${this.half} ${this.full}`;
  }
  /** ID posisi untuk basis pengetahuan: papan + giliran + hak rokade + en passant (hanya jika dapat dilakukan). */
  posId() {
    const p = this.fen().split(' ');
    return `${p[0]} ${p[1]} ${p[2]} ${this.ep >= 0 && this.epCapturable() ? p[3] : '-'}`;
  }
  repCount() { const k = this.keys, n = k.length; let c = 1; for (let i = n - 3; i >= 0 && i >= n - 1 - this.half; i -= 2) if (k[i] === k[n - 1]) c++; return c; }
  isRep() { const k = this.keys, n = k.length; for (let i = n - 3; i >= 0 && i >= n - 1 - this.half; i -= 2) if (k[i] === k[n - 1]) return true; return false; }
  insufficient() {
    const mn = [];
    for (let s = 0; s < 64; s++) { const p = Math.abs(this.b[s]); if (p === 1 || p === 4 || p === 5) return false; if (p === 2 || p === 3) mn.push([p, s]); }
    if (mn.length <= 1) return true;
    if (mn.every(x => x[0] === 3)) { const col = x => ((x[1] >> 3) + (x[1] & 7)) & 1; return mn.every(x => col(x) === col(mn[0])); }
    return false;
  }
  status() {
    if (!this.hasLegal()) {
      if (this.inCheck(this.turn)) return { over: true, result: this.turn === 1 ? '0-1' : '1-0', reason: 'checkmate' };
      return { over: true, result: '1/2-1/2', reason: 'stalemate' };
    }
    if (this.insufficient()) return { over: true, result: '1/2-1/2', reason: 'insufficient material' };
    if (this.repCount() >= 3) return { over: true, result: '1/2-1/2', reason: 'threefold repetition' };
    if (this.half >= 100) return { over: true, result: '1/2-1/2', reason: 'fifty-move rule' };
    return { over: false, check: this.inCheck(this.turn) };
  }
  perft(d) {
    if (d === 0) return 1; let n = 0;
    for (const m of this.legal()) { this.make(m); n += this.perft(d - 1); this.unmake(); }
    return n;
  }
}
Object.assign(C, { Chess, START, sqName, nameSq, uciOf, FILES, TABLES: { KNT, KNG, RAYS, PATT } });
})(globalThis);
