/* ai-evaluation.js — evaluasi posisi heuristik (material, PST, struktur pion, mobilitas, keamanan raja, dll). */
(function (G) {
'use strict';
const C = G.CAI;
const PV = [0, 100, 320, 330, 500, 900, 0];
const PH = [0, 0, 1, 1, 2, 4, 0];
const T = {
1: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
2: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
3: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
4: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
5: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20]
};
const KMG = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
const KEG = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];
const MOBW = [0, 0, 4, 4, 2, 1];
const PASS = [0, 5, 10, 20, 35, 60, 100, 0];
const KN = [], RY = [];
for (let s = 0; s < 64; s++) {
  KN[s] = []; RY[s] = [];
  const f = s & 7, r = s >> 3;
  for (const [df, dr] of [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]]) { const a = f + df, b = r + dr; if (a >= 0 && a < 8 && b >= 0 && b < 8) KN[s].push(b * 8 + a); }
  for (const [df, dr] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]]) {
    const ray = []; let a = f + df, b = r + dr; while (a >= 0 && a < 8 && b >= 0 && b < 8) { ray.push(b * 8 + a); a += df; b += dr; } RY[s].push(ray);
  }
}

/** Skor dari sudut pandang pihak yang jalan (centipawn). */
function evaluate(ch) {
  const b = ch.b;
  let base = 0, kmg = 0, keg = 0, phase = 0, nonKP = 0, minors = 0, mob = 0, wBish = 0, bBish = 0, wk = -1, bk = -1;
  const cnt = [new Int8Array(8), new Int8Array(8)];
  const maxRW = new Int8Array(8).fill(-1), minRB = new Int8Array(8).fill(8);
  const wp = [], bp = [];
  for (let s = 0; s < 64; s++) {
    const p = b[s]; if (!p) continue;
    const t = p > 0 ? p : -p, w = p > 0, idx = w ? s : s ^ 56, sg = w ? 1 : -1;
    phase += PH[t];
    if (t === 6) { kmg += sg * KMG[idx]; keg += sg * KEG[idx]; if (w) wk = s; else bk = s; continue; }
    base += sg * (PV[t] + T[t][idx]);
    const f = s & 7, r = s >> 3;
    if (t === 1) {
      if (w) { cnt[0][f]++; if (r > maxRW[f]) maxRW[f] = r; wp.push(s); } else { cnt[1][f]++; if (r < minRB[f]) minRB[f] = r; bp.push(s); }
      continue;
    }
    nonKP++; if (t === 2 || t === 3) minors++;
    if (t === 3) { if (w) wBish++; else bBish++; }
    let m = 0;
    if (t === 2) { for (const a of KN[s]) if (b[a] * p <= 0) m++; }
    else {
      const d0 = t === 3 ? 4 : 0, d1 = t === 4 ? 4 : 8;
      for (let d = d0; d < d1; d++) for (const a of RY[s][d]) { const q = b[a]; if (!q) m++; else { if (q * p < 0) m++; break; } }
    }
    mob += sg * m * MOBW[t];
  }
  if (!wp.length && !bp.length && (nonKP === 0 || (nonKP === minors && minors <= 1))) return 0; // materi tidak cukup
  let pawn = 0;
  for (const s of wp) {
    const f = s & 7, r = s >> 3;
    if (cnt[0][f] > 1) pawn -= 10;
    if (!((f > 0 ? cnt[0][f - 1] : 0) + (f < 7 ? cnt[0][f + 1] : 0))) pawn -= 12;
    let passed = true;
    for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) if (minRB[g] < r) { passed = false; break; }
    if (passed) pawn += PASS[6 - r];
  }
  for (const s of bp) {
    const f = s & 7, r = s >> 3;
    if (cnt[1][f] > 1) pawn += 10;
    if (!((f > 0 ? cnt[1][f - 1] : 0) + (f < 7 ? cnt[1][f + 1] : 0))) pawn += 12;
    let passed = true;
    for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) if (maxRW[g] > r) { passed = false; break; }
    if (passed) pawn -= PASS[r - 1];
  }
  let rk = 0;
  for (let s = 0; s < 64; s++) {
    const p = b[s]; if (p !== 4 && p !== -4) continue;
    const w = p > 0, f = s & 7, r = s >> 3;
    let v = 0; if (!cnt[w ? 0 : 1][f]) v += cnt[w ? 1 : 0][f] ? 10 : 20;
    if (w ? r === 1 : r === 6) v += 15;
    rk += w ? v : -v;
  }
  const pair = (wBish >= 2 ? 30 : 0) - (bBish >= 2 ? 30 : 0);
  const ph = Math.min(24, phase);
  const shield = (ks, w) => {
    const f = ks & 7, r = ks >> 3, dir = w ? -1 : 1; let v = 0;
    for (let g = Math.max(0, f - 1); g <= Math.min(7, f + 1); g++) {
      const r1 = r + dir, r2 = r + 2 * dir, pw = w ? 1 : -1;
      if (r1 >= 0 && r1 < 8 && b[r1 * 8 + g] === pw) v += 10;
      else if (r2 >= 0 && r2 < 8 && b[r2 * 8 + g] === pw) v += 5;
    }
    if (!cnt[w ? 0 : 1][f]) v -= 15;
    return v;
  };
  const ksafe = shield(wk, true) - shield(bk, false);
  let dev = 0;
  if (ph > 12) {
    dev -= ((b[57] === 2) + (b[62] === 2) + (b[58] === 3) + (b[61] === 3)) * 8;
    dev += ((b[1] === -2) + (b[6] === -2) + (b[2] === -3) + (b[5] === -3)) * 8;
  }
  const kingScore = (kmg * ph + keg * (24 - ph)) / 24;
  const score = base + pawn + mob + rk + pair + dev + kingScore + (ksafe * ph) / 24;
  return (ch.turn === 1 ? score : -score) + 10;
}
C.evaluate = evaluate;
})(globalThis);
