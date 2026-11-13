require('../js/chess-engine.js'); require('../js/ai-evaluation.js'); require('../js/ai-engine.js');
require('../js/database.js'); require('../js/match-recorder.js'); require('../js/ai-learning.js'); require('../js/ai-version-manager.js');
const C=CAI; let fail=0; const chk=(n,ok)=>{console.log(ok?'OK  ':'FAIL',n);if(!ok)fail++;};
(async()=>{
 await C.DB.open(); chk('DB fallback memori di Node (IndexedDB asli hanya ada di browser)',C.DB.persistent===false);
 await C.VersionManager.init(); const VM=C.VersionManager;
 // mainkan 4 pertandingan engine-vs-engine ringan & rekam
 const sr=new C.Searcher();
 for(let g=0;g<4;g++){const ch=new C.Chess(),mv=[];const t0=Date.now();let st;
  for(let i=0;i<50;i++){st=ch.status();if(st.over)break;const r=sr.think(ch,{maxDepth:2,timeMs:60,noise:60,blunder:0.1});const lg=ch.legal();const san=ch.san(r.move,lg);const u=C.uciOf(r.move);ch.make(r.move);mv.push({san,uci:u,fen:ch.fen()});}
  st=ch.status();await C.Recorder.save({mode:g%2?'bot':'pvp',playerColor:'both',difficulty:'easy',moves:mv,result:st.over?st.result:'1/2-1/2',reason:st.over?st.reason:'adjudikasi',startedAt:t0});}
 chk('4 pertandingan tersimpan',await C.DB.count('matches')===4);
 chk('pending = 4 sebelum update',(await VM.pending()).length===4);
 let t0=Date.now();
 const cand=await VM.runUpdate((m,f)=>{});
 console.log('update selesai',(Date.now()-t0)+'ms, status',cand.status,JSON.stringify(cand.report));
 chk('kandidat v1.1 dibuat',cand.id==='v1.1');
 chk('versi aktif TIDAK berubah otomatis',(await VM.active()).id==='v1.0');
 chk('pengetahuan terisi (posisi dipelajari)',cand.knowledge.totals.positions>0&&Object.keys(cand.knowledge.moveStats).length>0);
 chk('data lama tidak dihapus',await C.DB.count('matches')===4);
 if(cand.status==='candidate'){
  await VM.activateCandidate(); chk('aktivasi manual -> v1.1 aktif',(await VM.active()).id==='v1.1');
  chk('pending = 0 setelah aktivasi',(await VM.pending()).length===0);
  chk('match ditandai processedIn',(await C.DB.getAll('matches')).every(m=>m.processedIn==='v1.1'));
  await VM.rollback(); chk('rollback -> v1.0 aktif',(await VM.active()).id==='v1.0');
  chk('setelah rollback data masuk antrean lagi',(await VM.pending()).length===4);
 }
 // gerbang penolakan: jika uji kandidat gagal, versi aktif tidak boleh diganti dan kandidat berstatus 'rejected'
 const origRun=VM.tests.run; VM.tests.run=async()=>({legal:{ok:120,total:120},tactics:{active:5,cand:3,total:5},avoid:{active:2,cand:2,total:2},match:{games:6,w:0,d:2,l:4,score:0.33},pass:false,reasons:['skor taktik lebih buruk dari versi aktif'],date:Date.now()});
 const act0=(await VM.active()).id; const rej=await VM.runUpdate(()=>{}); VM.tests.run=origRun;
 chk('kandidat gagal berstatus rejected ('+rej.id+')',rej.status==='rejected');
 chk('versi aktif tetap '+act0+' dan tidak ada kandidat menunggu',(await VM.active()).id===act0&&VM.state.candidateId===null);
 chk('data pertandingan tetap utuh & masih antre',await C.DB.count('matches')===4&&(await VM.pending()).length===4);
 chk('versi ditolak tersimpan di riwayat',(await VM.versions()).some(v=>v.status==='rejected'));
 // batas bonus: pengetahuan tidak bisa mengalahkan taktik jelas
 const poison=C.Learning.emptyKnowledge();const id=new C.Chess('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1').posId();poison.moveStats[id]={a1a8:[0,9,0,0,9]};
 const bonus=C.Learning.rootBonus(poison,id);chk('penalti pengetahuan dibatasi ('+bonus.a1a8+' cp)',bonus.a1a8>=-120);
 console.log(fail?'ADA KEGAGALAN':'SEMUA LULUS');process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
