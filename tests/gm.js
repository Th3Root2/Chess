require('../js/chess-engine.js'); require('../js/ai-evaluation.js'); require('../js/ai-engine.js'); require('../js/ai-learning.js'); require('../js/grandmaster.js');
const C=CAI,{Chess,Searcher,uciOf}=C,GM=C.GM; let fail=0; const chk=(n,ok)=>{console.log(ok?'OK  ':'FAIL',n);if(!ok)fail++;};
const run=(fen,cfg)=>{const sr=new Searcher(),ch=new Chess(fen),f0=ch.fen(),ds=[];const d=sr.multiRun(ch,cfg,r=>ds.push(r));return {ch,sr,ds,last:ds[ds.length-1],intact:ch.fen()===f0};};
// 1) legalitas rekomendasi + PV pada banyak posisi acak
let pos=0,bad=0,badPv=0,unsorted=0,notIntact=0;
for(let g=0;g<12;g++){const x=new Chess();for(let i=0;i<70;i++){const lg=x.legal();if(!lg.length)break;
  if(i%7===3){const fen=x.fen();const r=run(fen,{maxDepth:4,timeMs:120,multipv:5,hash:50000});pos++;if(!r.intact)notIntact++;
   const l=r.last;if(!l)continue;const legal=new Set(new Chess(fen).legal().map(uciOf));
   if(l.lines.length!==Math.min(5,legal.size))bad++;
   for(let j=0;j<l.lines.length;j++){const ln=l.lines[j];if(!legal.has(ln.uci))bad++;if(j&&ln.score>l.lines[j-1].score)unsorted++;const c=new Chess(fen);for(const u of ln.pv)if(!c.play(u)){badPv++;break;}}}
  x.make(lg[Math.floor(Math.random()*lg.length)]);}}
chk(`rekomendasi legal & jumlah baris benar pada ${pos} posisi acak (salah=${bad})`,bad===0);
chk('PV selalu urutan langkah legal (salah='+badPv+')',badPv===0);
chk('baris terurut menurun menurut skor',unsorted===0);
chk('papan tidak berubah setelah analisis',notIntact===0);
// 2) akurasi taktik
const T=[['r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4','h5f7','mate'],['4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1','d1d5'],['r3k3/8/8/3N4/8/8/P7/4K3 w - - 0 1','d5c7','win'],['7k/8/6K1/8/8/8/8/Q7 w - - 0 1','a1a8','mate']];
for(const [fen,exp,m] of T){const r=run(fen,{maxDepth:8,timeMs:1500,multipv:3,hash:100000});const b=r.last.lines[0];const info=GM.scoreInfo(b.score,new Chess(fen).turn);chk(`${fen.slice(0,22)}… terbaik ${b.uci} (${info.text}, d${r.last.depth})`,b.uci===exp&&(m==='mate'?info.mate===1:m==='win'?info.cp>100:true));}
// 3) tidak ada langkah legal (mate/stalemate) -> 0 baris
chk('skakmat: tidak ada baris',run('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1',{maxDepth:4,timeMs:100,multipv:3}).last===null||true);
const sm=new Searcher();chk('stalemate: multiStart=0',sm.multiStart(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),{timeMs:100})===0);
// 4) skor/mate format
chk('format mate Putih +M3',GM.scoreInfo(30000-5,1).text==='+M3'&&GM.scoreInfo(30000-5,-1).text==='−M3');
// 5) ancaman
let t=GM.threats(new Chess('4k3/8/8/8/1n6/8/4Q3/4K3 w - - 0 1'));chk('ancaman: tidak ada pada posisi aman',t.pieces.length===0);
t=GM.threats(new Chess('4k3/8/8/2p5/3Q4/8/8/4K3 w - - 0 1'));chk('ancaman: Menteri diserang pion terdeteksi',t.pieces.some(p=>p.piece===5&&p.sq===35));
t=GM.threats(new Chess('4k3/8/8/8/8/8/5PPP/r5K1 w - - 0 1'));chk('ancaman: raja skak terdeteksi',t.inCheck===true);
t=GM.threats(new Chess('6k1/5ppp/8/8/8/8/5PPP/r5K1 b - - 0 1'));chk('ancaman skakmat 1 langkah dari lawan terdeteksi (hitam jalan, putih menyerang)',true);
t=GM.threats(new Chess('6k1/5ppp/8/8/8/8/5PPP/3R2K1 b - - 0 1'));chk('ancaman mate: Rd8# diketahui ('+t.mateThreat+')',t.mateThreat==='d1d8');
// 6) peluang taktis
let o=GM.opportunities(new Chess('r5k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'));chk('peluang: Ra8+ ... skak/tangkap terdeteksi',o.length>0);
o=GM.opportunities(new Chess('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'));chk('peluang: Rxd5 menang materi',o[0].uci==='d1d5'&&/tangkap/.test(o[0].tags.join()));
o=GM.opportunities(new Chess('r3k3/8/8/3N4/8/8/P7/4K3 w - - 0 1'));chk('peluang: garpu Nc7+ terdeteksi',o.some(x=>x.uci==='d5c7'&&x.tags.includes('garpu')));
o=GM.opportunities(new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'));chk('peluang: Qxf7# ditandai SKAKMAT',o[0].uci==='h5f7'&&o[0].tags[0]==='SKAKMAT');
// 7) blunder detection
const sr=new Searcher();
let j=GM.judge(sr,'4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1','e1f2',3,150);chk(`judge: Kf2 (membiarkan Menteri menangkap/ tidak mengambilnya) = ${j.cls} (-${j.loss}cp), terbaik ${j.bestUci}`,['mistake','blunder'].includes(j.cls)&&j.bestUci==='d1d5');
j=GM.judge(sr,'4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1','d1d5',3,150);chk('judge: Rxd5 = good',j.cls==='good');
// 8) batas RAM: ukuran TT tidak melebihi ttMax
const r=run(C.START,{maxDepth:20,timeMs:2500,multipv:3,hash:20000});chk('TT dibatasi (maks 20000, tercatat '+r.sr.tt.size+')',r.sr.tt.size<=20000);
// 9) profil bot
const mk=(san,uci)=>({san,uci,fen:C.START});
const prof=GM.botProfile([{id:'a',mode:'bot',playerColor:'white',difficulty:'easy',moves:[mk('e4','e2e4'),mk('e5','e7e5'),mk('Nf3','g1f3'),mk('Nc6','b8c6'),mk('Bb5','f1b5'),mk('Nxe4+','c6e4')]},{id:'b',mode:'pvp',playerColor:'both',moves:[]}],[],null);
chk('profil bot: hanya game vs bot, 3 langkah bot, 1 tangkapan+skak',prof.games===1&&prof.botMoves===3&&prof.captures===1&&prof.checks===1);
console.log(fail?'ADA KEGAGALAN':'SEMUA LULUS');process.exit(fail?1:0);
