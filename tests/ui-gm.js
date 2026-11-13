// Uji UI Grandmaster Assistant (Playwright/Chromium). Pemakaian: node tests/ui-gm.js <url>
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html'; const worker = URL.startsWith('http');
let fail = 0; const chk = (n, ok) => { console.log(ok ? 'OK  ' : 'FAIL', n); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForSelector('#board .sq'); await sleep(500);
  const click = async sq => { await page.locator(`#board [data-sq="${sq}"]`).click(); await sleep(70); };
  const move = async (a, b) => { await click(a); await click(b); };
  const waitDone = async (t = 30000) => { await page.waitForFunction(() => !CAI.GMUI.state.running && CAI.GMUI.state.lines.length > 0, null, { timeout: t }); await sleep(100); };
  const snap = () => page.evaluate(async () => JSON.stringify([await CAI.DB.getAll('versions'), await CAI.DB.getAll('analysis')]));
  const before = await snap();
  // --- Cheat Mode nonaktif secara default
  chk('panel tersembunyi saat Cheat Mode nonaktif', await page.locator('#gmBody').isHidden() && (await page.locator('#gmArrows').innerHTML()) === '');
  await page.click('#gmToggle'); chk('Enable Cheat Mode membuka panel', await page.locator('#gmBody').isVisible()); await page.click('.gmset summary');
  // --- PvP: pembukaan Scholar's mate
  await page.selectOption('#selMode', 'pvp'); await page.selectOption('#selColor', 'w'); await page.click('#bNew'); await sleep(300);
  await page.selectOption('#gmPreset', 'quick'); await page.fill('#gmTime', '2'); await page.locator('#gmTime').dispatchEvent('change');
  const hist0 = await page.evaluate(() => CAI.App.S.hist.length);
  await page.click('#gmAnalyze'); await waitDone();
  const hist1 = await page.evaluate(() => CAI.App.S.hist.length);
  chk('analisis selesai & TIDAK memainkan langkah otomatis', hist0 === 0 && hist1 === 0);
  const st = await page.evaluate(() => { const x = CAI.GMUI.state, S = CAI.App.S; return { n: x.lines.length, d: x.depth, uci: x.lines.map(l => l.uci), legal: S.legal.map(CAI.uciOf), pv: x.lines.map(l => l.pv.length), nodes: x.nodes }; });
  chk(`Multi-PV: ${st.n} baris, kedalaman ${st.d}, ${st.nodes} node`, st.n === 3 && st.d >= 4);
  chk('semua rekomendasi legal', st.uci.every(u => st.legal.includes(u)));
  chk('panah terbaik + alternatif tergambar di papan utama (SVG)', (await page.locator('#gmArrows g').count()) === 3);
  chk('highlight kotak asal/tujuan langkah terbaik', (await page.locator('#board .gm-from').count()) === 1 && (await page.locator('#board .gm-to').count()) === 1);
  chk('highlight langkah alternatif', (await page.locator('#board .gm-alt').count()) >= 1);
  chk('tabel alternatif menampilkan 3 baris + eval', (await page.locator('.gm-t tr').count()) >= 4 && /[+−]\d/.test(await page.textContent('.gm-eval')));
  chk('tidak ada papan kedua', (await page.locator('#board').count()) === 1);
  // Next best
  await page.click('#gmNext'); chk('Next Best Move beralih ke langkah #2 (warna emas)', (await page.locator('#board .gm-to2').count()) === 1 && (await page.textContent('.gm-best')).includes('#2'));
  await page.click('#gmNext'); await page.click('#gmNext');
  chk('Show Best Move off menyembunyikan panah utama', await (async () => { await page.click('#gmShowBest'); const n = await page.locator('#gmArrows g').count(); await page.click('#gmShowBest'); return n === 2; })());
  chk('Show Alternative off menyembunyikan alternatif', await (async () => { await page.click('#gmShowAlt'); const n = await page.locator('#gmArrows g').count(); await page.click('#gmShowAlt'); return n === 1; })());
  // Apply best (langkah pertama = rekomendasi #1)
  const best = st.uci[0]; await page.click('#gmApply'); await sleep(300);
  chk('Apply Best Move memainkan langkah #1 (' + best + ')', await page.evaluate(b => CAI.App.S.hist.length === 1 && CAI.App.S.hist[0].uci === b, best));
  chk('analisis lama dihapus saat posisi berubah (stop otomatis)', (await page.evaluate(() => CAI.GMUI.state.lines.length)) === 0 && (await page.locator('#gmArrows g').count()) === 0);
  // Mainkan: 1...e5 2.Qh5 Nc6 3.Bc4 -> hitam jalan, putih mengancam Qxf7#
  const seq = await page.evaluate(() => CAI.App.S.hist[0].uci); // langkah putih pertama bisa apa saja; reset game agar deterministik
  await page.click('#bNew'); await sleep(300);
  for (const [a, b] of [[52, 36], [12, 28], [59, 31], [1, 18], [61, 34]]) await move(a, b);
  chk('ancaman skakmat 1 langkah dari lawan terdeteksi', (await page.textContent('#gmOut')).includes('mengancam skakmat') && (await page.locator('#board .gm-mated').count()) === 1);
  await move(6, 21); // 3...Nf6?? membiarkan Qxf7#
  await page.click('#gmJudge'); await page.waitForFunction(() => CAI.GMUI.state.judge && !CAI.GMUI.state.judge.pending, null, { timeout: 20000 });
  const j = await page.evaluate(() => CAI.GMUI.state.judge); chk(`Blunder Detection: 3...Nf6 = ${j.cls} (−${(j.loss / 100).toFixed(2)})`, j.cls === 'blunder');
  await page.click('#gmAnalyze'); await waitDone();
  const mt = await page.evaluate(() => ({ u: CAI.GMUI.state.lines[0].uci, t: document.getElementById('gmOut').textContent }));
  chk('Checkmate Detection: Qxf7# ditemukan (' + mt.u + ')', mt.u === 'h5f7' && /Skakmat dalam 1/.test(mt.t));
  chk('indikator skakmat pada raja lawan', (await page.locator('#board .gm-mate').count()) === 1);
  await page.screenshot({ path: '/tmp/gm-mate.png', fullPage: true });
  await page.click('#gmApply'); await sleep(400);
  chk('mematikan lawan: Hitam di-skakmat, hasil direkam', /Putih menang.*checkmate/.test(await page.textContent('#status')));
  await sleep(500); chk('match tercatat dengan flag cheatUsed', await page.evaluate(async () => (await CAI.DB.getAll('matches')).some(m => m.cheatUsed === true)));
  // --- Stop Analysis & New Game menghentikan pencarian
  await page.selectOption('#gmPreset', 'deep'); await page.click('#bNew'); await sleep(300);
  await page.click('#gmAnalyze'); await sleep(700); chk('analisis berjalan (deep)', await page.evaluate(() => CAI.GMUI.state.running));
  await page.click('#gmStop'); await sleep(200);
  chk('Stop Analysis menghentikan pencarian & worker', await page.evaluate(() => !CAI.GMUI.state.running && (!CAI.GMUI.state.aw)));
  await page.click('#gmAnalyze'); await sleep(500); await page.click('#bNew'); await sleep(300);
  chk('New Game menghentikan analisis berjalan', await page.evaluate(() => !CAI.GMUI.state.running && CAI.GMUI.state.lines.length === 0));
  // --- Bot: langkah bot dinilai otomatis + profil gaya bot
  await page.selectOption('#selMode', 'bot'); await page.selectOption('#selDiff', 'easy'); await page.selectOption('#selColor', 'w'); await page.click('#bNew'); await sleep(300);
  await page.selectOption('#gmPreset', 'quick'); await move(52, 36);
  await page.waitForFunction(() => CAI.GMUI.state.judge && CAI.GMUI.state.judge.forBot && !CAI.GMUI.state.judge.pending, null, { timeout: 30000 });
  chk('langkah bot dinilai otomatis (' + await page.evaluate(() => CAI.GMUI.state.judge.cls) + ')', true);
  chk('statistik live bot tersimpan di meta terpisah', await page.evaluate(async () => ((await CAI.DB.get('meta', 'gmBotLive')) || {}).judged >= 1));
  chk('panel gaya bot tampil', (await page.textContent('#gmOut')).includes('Analisis gaya bot'));
  // --- Data pembelajaran tidak berubah oleh Cheat Mode
  chk('versi AI & data analisis pembelajaran TIDAK berubah', (await snap()) === before);
  // --- Performa: CPU 4x lebih lambat, preset cepat; UI harus tetap responsif (hanya jalur Worker)
  if (worker) {
    await page.click('#bNew'); await sleep(300);
    const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => { window.__gaps = []; let l = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__gaps.push(n - l); l = n; }, 50); });
    const t0 = Date.now(); await page.click('#gmAnalyze'); await waitDone(40000); const dur = Date.now() - t0;
    const gaps = await page.evaluate(() => { clearInterval(window.__iv); return window.__gaps; }); const mx = Math.max(...gaps);
    chk(`CPU 4× lebih lambat: analisis selesai ${dur} ms (batas 2000 ms + overhead), jeda UI terbesar ${Math.round(mx)} ms`, dur < 8000 && mx < 400);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const tt = await page.evaluate(() => CAI.GMUI.state.nodes); chk('Preset cepat mengembalikan hasil (' + tt + ' node)', tt > 0);
  } else console.log('INFO fallback file://: uji jeda UI dilewati (analisis di thread utama)');
  chk('tidak ada error JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''), errs.length === 0);
  await browser.close(); console.log(fail ? 'ADA KEGAGALAN' : 'SEMUA LULUS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
