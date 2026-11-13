/* match-recorder.js — merekam setiap pertandingan (PvP & PvBot) ke IndexedDB. */
(function (G) {
'use strict';
const C = G.CAI;
const uid = () => 'M' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
C.Recorder = {
  /** info: {mode:'pvp'|'bot', playerColor:'white'|'black'|'both', difficulty, moves:[{san,uci,fen}], result, reason, startedAt, aiVersion} */
  async save(info) {
    const rec = {
      id: uid(), date: new Date(info.startedAt).toISOString(), mode: info.mode, playerColor: info.playerColor,
      difficulty: info.mode === 'bot' ? info.difficulty : null, startFen: C.START,
      moves: info.moves.map((m, i) => ({ ply: i + 1, san: m.san, uci: m.uci, fen: m.fen })),
      result: info.result, reason: info.reason, durationMs: Date.now() - info.startedAt, aiVersion: info.aiVersion || null, cheatUsed: !!info.cheatUsed, processedIn: null
    };
    await C.DB.put('matches', rec);
    return rec;
  }
};
})(globalThis);
