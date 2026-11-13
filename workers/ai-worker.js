/* ai-worker.js — menjalankan pencarian AI di thread terpisah agar UI tidak membeku. */
importScripts('../js/chess-engine.js', '../js/ai-evaluation.js', '../js/ai-engine.js');
const searcher = new CAI.Searcher();
onmessage = e => {
  const { id, moves, cfg, bonus } = e.data;
  try {
    const ch = new CAI.Chess();
    for (const u of moves) if (!ch.play(u)) throw new Error('riwayat langkah tidak valid');
    const r = searcher.think(ch, Object.assign({}, cfg, { bonus }));
    postMessage({ id, uci: r ? CAI.uciOf(r.move) : null, score: r && r.score, depth: r && r.depth, nodes: r && r.nodes });
  } catch (err) { postMessage({ id, uci: null, error: String(err) }); }
};
