/* ai-version-manager.js — versi AI, pembaruan manual, pengujian kandidat, aktivasi, rollback. */
(function (G) {
'use strict';
const C = G.CAI, L = C.Learning, DB = C.DB;
const yieldUI = () => new Promise(r => setTimeout(r, 0));

// ---- Pengujian kandidat ------------------------------------------------------------------
const TACTICS = [
  { fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1', type: 'mate' },
  { fen: 'r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1', type: 'mate' },
  { fen: '7k/8/6K1/8/8/8/8/Q7 w - - 0 1', type: 'mate' },
  { fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1', type: 'best', exp: ['d1d5'] },
  { fen: 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', type: 'best', exp: ['d5c7'] }
];
const AVOID = [ // langkah tidak boleh membuat lawan bisa menangkap Menteri
  { fen: '4k3/8/8/8/8/2n5/8/3QK3 w - - 0 1' },
  { fen: '4k3/8/8/2p5/3Q4/8/8/4K3 w - - 0 1' }
];
const seeded = s => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const T = {
  pick(sr, ch, k) { const r = sr.think(ch, { maxDepth: 3, timeMs: 300, bonus: L.rootBonus(k, ch.posId()) }); return r && r.move; },
  tacticsScore(k) {
    const sr = new C.Searcher(); let ok = 0;
    for (const t of TACTICS) {
      const ch = new C.Chess(t.fen), m = T.pick(sr, ch, k); if (!m) continue;
      if (t.type === 'best') { if (t.exp.includes(C.uciOf(m))) ok++; }
      else { ch.make(m); if (ch.status().reason === 'checkmate') ok++; }
    }
    return ok;
  },
  avoidScore(k) {
    const sr = new C.Searcher(); let ok = 0;
    for (const t of AVOID) {
      const ch = new C.Chess(t.fen), m = T.pick(sr, ch, k); if (!m) continue;
      ch.make(m); if (!ch.legal().some(x => Math.abs(x.cap) === 5)) ok++;
    }
    return ok;
  },
  legalTest(k) {
    const sr = new C.Searcher(); let total = 0, ok = 0; const rng = seeded(7);
    for (let g = 0; g < 3; g++) {
      const ch = new C.Chess();
      for (let i = 0; i < 40; i++) {
        const lg = ch.legal(); if (!lg.length) break;
        const r = i < 4 ? { move: lg[Math.floor(rng() * lg.length)] } : sr.think(ch, { maxDepth: 1, timeMs: 30, bonus: L.rootBonus(k, ch.posId()) });
        total++; if (lg.some(x => C.uciOf(x) === C.uciOf(r.move)) && new C.Chess(ch.fen()).legal().length === lg.length) ok++;
        ch.make(r.move);
      }
    }
    return { ok, total };
  },
  async match(kCand, kAct, games, progress) {
    const sc = new C.Searcher(), sa = new C.Searcher(); let w = 0, d = 0, l = 0;
    for (let g = 0; g < games; g++) {
      const candWhite = g % 2 === 0, rng = seeded(100 + (g >> 1)), ch = new C.Chess();
      let res = null;
      for (let ply = 0; ply < 60; ply++) {
        const st = ch.status(); if (st.over) { res = st.result; break; }
        let m;
        if (ply < 4) { const lg = ch.legal(); m = lg[Math.floor(rng() * lg.length)]; }
        else { const candTurn = (ch.turn === 1) === candWhite; m = (candTurn ? sc : sa).think(ch, { maxDepth: 2, timeMs: 80, bonus: L.rootBonus(candTurn ? kCand : kAct, ch.posId()) }).move; }
        ch.make(m); if (ply % 6 === 0) await yieldUI();
      }
      if (!res) { const e = C.evaluate(ch) * ch.turn; res = e > 250 ? '1-0' : e < -250 ? '0-1' : '1/2-1/2'; } // adjudikasi
      const cs = res === '1/2-1/2' ? 0.5 : ((res === '1-0') === candWhite ? 1 : 0);
      if (cs === 1) w++; else if (cs === 0) l++; else d++;
      progress && progress(`Uji lawan versi aktif: game ${g + 1}/${games}`, (g + 1) / games);
    }
    return { games, w, d, l, score: (w + d / 2) / games };
  },
  async run(kAct, kCand, progress) {
    progress && progress('Uji langkah legal…', 0); await yieldUI();
    const legal = T.legalTest(kCand);
    progress && progress('Uji taktik dasar…', 0); await yieldUI();
    const tact = { active: T.tacticsScore(kAct), cand: T.tacticsScore(kCand), total: TACTICS.length };
    const avoid = { active: T.avoidScore(kAct), cand: T.avoidScore(kCand), total: AVOID.length };
    const match = await T.match(kCand, kAct, 6, progress);
    const reasons = [];
    if (legal.ok !== legal.total) reasons.push('langkah ilegal terdeteksi');
    if (tact.cand < tact.active) reasons.push('skor taktik lebih buruk dari versi aktif');
    if (avoid.cand < avoid.active) reasons.push('lebih sering membuat blunder sederhana');
    if (match.score < 0.45) reasons.push('skor lawan versi aktif di bawah 45%');
    return { legal, tactics: tact, avoid, match, pass: reasons.length === 0, reasons, date: Date.now() };
  }
};

// ---- Manajer versi -------------------------------------------------------------------------
const VM = {
  state: null, tests: T,
  async init() {
    let vs = await DB.getAll('versions');
    if (!vs.length) {
      await DB.put('versions', { id: 'v1.0', minor: 0, createdAt: Date.now(), parent: null, status: 'active', knowledge: L.emptyKnowledge(), matchIds: [], report: null });
      await DB.put('meta', { key: 'state', activeId: 'v1.0', previousId: null, candidateId: null });
    }
    this.state = await DB.get('meta', 'state');
    return this.state;
  },
  async save() { await DB.put('meta', this.state); },
  async versions() { return (await DB.getAll('versions')).sort((a, b) => a.minor - b.minor); },
  async get(id) { return DB.get('versions', id); },
  async active() { return this.get(this.state.activeId); },
  async candidate() { return this.state.candidateId ? this.get(this.state.candidateId) : null; },
  async pending() { const act = await this.active(), done = new Set(act.matchIds); return (await DB.getAll('matches')).filter(m => !done.has(m.id)); },

  /** Tombol UPDATE AI: analisis -> bangun kandidat -> uji lawan versi aktif. TIDAK mengaktifkan kandidat. */
  async runUpdate(progress) {
    if (this.state.candidateId) throw new Error('Masih ada kandidat yang menunggu keputusan.');
    const act = await this.active(), pend = await this.pending();
    if (!pend.length) throw new Error('Tidak ada data pertandingan baru.');
    const cache = new Map(), analyses = [];
    for (let i = 0; i < pend.length; i++) {
      let a = await DB.get('analysis', pend[i].id);
      if (!a || a.tag !== L.TAG) { a = await L.analyzeMatch(pend[i], cache); await DB.put('analysis', a); }
      analyses.push(a); progress && progress(`Menganalisis pertandingan ${i + 1}/${pend.length}`, (i + 1) / pend.length);
    }
    const knowledge = L.merge(act.knowledge, pend, analyses);
    const vs = await this.versions(), minor = Math.max(...vs.map(v => v.minor)) + 1;
    const cand = { id: 'v1.' + minor, minor, createdAt: Date.now(), parent: act.id, status: 'testing', knowledge, matchIds: act.matchIds.concat(pend.map(m => m.id)), newMatches: pend.length, report: null };
    await DB.put('versions', cand);
    cand.report = await T.run(act.knowledge, knowledge, progress);
    cand.status = cand.report.pass ? 'candidate' : 'rejected';
    await DB.put('versions', cand);
    if (cand.report.pass) { this.state.candidateId = cand.id; await this.save(); }
    return cand;
  },
  async activateCandidate() {
    const cand = await this.candidate(); if (!cand) throw new Error('Tidak ada kandidat.');
    const prev = await this.active(), old = new Set(prev.matchIds);
    prev.status = 'archived'; cand.status = 'active'; cand.activatedAt = Date.now();
    await DB.put('versions', prev); await DB.put('versions', cand);
    for (const id of cand.matchIds) if (!old.has(id)) { const m = await DB.get('matches', id); if (m) { m.processedIn = cand.id; await DB.put('matches', m); } }
    this.state.previousId = prev.id; this.state.activeId = cand.id; this.state.candidateId = null; await this.save();
    return cand;
  },
  async discardCandidate() { const c = await this.candidate(); if (!c) return; c.status = 'discarded'; await DB.put('versions', c); this.state.candidateId = null; await this.save(); },
  /** Pindah ke versi lama (rollback). Data pertandingan tidak dihapus. */
  async switchTo(id) {
    const t = await this.get(id), cur = await this.active();
    if (!t || t.id === cur.id || !['archived'].includes(t.status)) throw new Error('Versi tidak dapat diaktifkan.');
    cur.status = 'archived'; t.status = 'active'; t.activatedAt = Date.now();
    await DB.put('versions', cur); await DB.put('versions', t);
    this.state.previousId = cur.id; this.state.activeId = t.id; await this.save();
  },
  async rollback() { if (!this.state.previousId) throw new Error('Belum ada versi sebelumnya.'); return this.switchTo(this.state.previousId); }
};
C.VersionManager = VM;
})(globalThis);
