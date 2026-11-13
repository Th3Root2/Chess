require('../js/chess-engine.js'); require('../js/ai-evaluation.js');
const {Chess}=CAI; let fail=0;
const t=(name,fen,d,exp)=>{const c=new Chess(fen);const t0=Date.now();const n=c.perft(d);const ok=n===exp;if(!ok)fail++;console.log(ok?'OK  ':'FAIL',name,'d'+d,n,'/',exp,(Date.now()-t0)+'ms');};
t('start',CAI.START,4,197281);
t('kiwipete','r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',3,97862);
t('pos3','8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',4,43238);
t('pos4','r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',3,9467);
t('pos5','rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',3,62379);
let bad=0;
for(let g=0;g<30;g++){const x=new Chess();for(let i=0;i<80;i++){const l=x.legal();if(!l.length)break;x.make(l[Math.floor(Math.random()*l.length)]);const y=new Chess(x.fen());if(y.key()!==x.key())bad++;}}
console.log(bad?'FAIL':'OK  ','hash incremental vs penuh, mismatch=',bad);if(bad)fail++;
process.exit(fail?1:0);
