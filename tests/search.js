require('../js/chess-engine.js'); require('../js/ai-evaluation.js'); require('../js/ai-engine.js');
const {Chess,Searcher,uciOf}=CAI; const s=new Searcher(); let fail=0;
const chk=(n,ok)=>{console.log(ok?'OK  ':'FAIL',n);if(!ok)fail++;};
let t0=Date.now();
for(const [fen,exp] of [['6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1','a1a8'],['r5k1/5ppp/8/8/8/8/5PPP/6K1 b - - 0 1','a8a1'],['4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1','d1d5'],['r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1','d5c7']]){
 const c=new Chess(fen);const r=s.think(c,{maxDepth:4,timeMs:2000});chk(fen+' -> '+uciOf(r.move)+' (d'+r.depth+', '+r.nodes+' nodes, '+r.time+'ms)',uciOf(r.move)===exp);}
const c=new Chess();const r=s.think(c,{maxDepth:5,timeMs:2500});console.log('start pos',uciOf(r.move),'d'+r.depth,r.nodes,'nodes',r.time+'ms');
// partai penuh engine vs engine, cek legalitas
let illegal=0,plies=0;
for(let g=0;g<3;g++){const x=new Chess();for(let i=0;i<120;i++){const st=x.status();if(st.over){console.log('game',g,st.result,st.reason,i,'plies');break;}const r=s.think(x,{maxDepth:3,timeMs:150,noise:30,blunder:0.05});const u=uciOf(r.move);if(!x.legal().some(m=>uciOf(m)===u))illegal++;x.make(r.move);plies++;}}
chk('langkah ilegal dari AI = '+illegal+' dari '+plies,illegal===0);
console.log('total',Date.now()-t0,'ms');process.exit(fail?1:0);
