/* analysis-worker.js — Grandmaster Assistant: analisis Multi-PV dan penilaian langkah di thread terpisah.
   Dihentikan dengan worker.terminate() oleh thread utama (pencarian sinkron tidak bisa diinterupsi dengan pesan). */
importScripts('../js/chess-engine.js', '../js/ai-evaluation.js', '../js/ai-engine.js', '../js/grandmaster.js');
const sr = new CAI.Searcher();
function replay(moves) { const ch = new CAI.Chess(); for (const u of moves) if (!ch.play(u)) throw new Error('riwayat langkah tidak valid'); return ch; }
onmessage = e => {
  const { id, type, moves, cfg } = e.data;
  try {
    if (type === 'multi') {
      const ch = replay(moves); const n = sr.multiRun(ch, cfg, r => postMessage({ id, type: 'depth', ...r }));
      postMessage({ id, type: 'done', legal: ch.legal().length, reached: n });
    } else if (type === 'judge') {
      const before = replay(moves.slice(0, -1)).fen();
      postMessage({ id, type: 'judge', result: CAI.GM.judge(sr, before, moves[moves.length - 1], cfg.depth, cfg.timeMs) });
    }
  } catch (err) { postMessage({ id, type: 'error', error: String(err) }); }
};
