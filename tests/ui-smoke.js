// Uji UI end-to-end dengan Playwright/Chromium (opsional; butuh server HTTP lokal atau file://)
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = process.argv[2] || 'http://localhost:8765/index.html';
let fail = 0; const chk = (n, ok) => { console.log(ok ? 'OK  ' : 'FAIL', n); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await page.goto(URL); await page.waitForSelector('#board .sq'); await sleep(400);
  chk('papan 64 kotak', (await page.locator('#board .sq').count()) === 64);
  chk('32 bidak', (await page.locator('#board .pc').count()) === 32);
  const click = async sq => { await page.locator(`#board [data-sq="${sq}"]`).click(); await sleep(60); };
  // PvBot: e2-e4 lalu tunggu bot
  await page.selectOption('#selDiff', 'easy'); await page.click('#bNew'); await sleep(200);
  await click(52); chk('klik e2 -> ada target legal', (await page.locator('#board .dot').count()) === 2);
  await click(36); await sleep(2500);
  chk('bot membalas (2 langkah di riwayat)', (await page.locator('#moves .m').filter({ hasText: /\S/ }).count()) === 2);
  // Undo kembali ke awal
  await page.click('#bUndo'); await sleep(300); chk('undo memundurkan 2 ply (riwayat kosong)', (await page.locator('#moves .m').count()) === 0);
  // Main sebagai Hitam: bot (putih) harus jalan duluan
  await page.selectOption('#selColor', 'b'); await page.click('#bNew'); await sleep(2500);
  chk('pemain Hitam: bot membuka lebih dulu', (await page.locator('#moves .m').filter({ hasText: /\S/ }).count()) === 1);
  // PvP: Fool's mate
  await page.selectOption('#selMode', 'pvp'); await page.selectOption('#selColor', 'w'); await page.click('#bNew'); await sleep(200);
  for (const [a, b] of [[53, 45], [12, 28], [54, 38], [3, 39]]) { await click(a); await click(b); }
  await sleep(500);
  chk('checkmate terdeteksi: ' + (await page.textContent('#status')), /Hitam menang.*checkmate/.test(await page.textContent('#status')));
  await sleep(500);
  const cnt = await page.evaluate(() => CAI.DB.count('matches')); chk('pertandingan tersimpan di IndexedDB (' + cnt + ')', cnt >= 1);
  chk('IndexedDB permanen aktif', await page.evaluate(() => CAI.DB.persistent));
  const persist = URL.startsWith('http');
  if (persist) { await page.reload(); await page.waitForSelector('#board .sq'); await sleep(500); chk('data tetap ada setelah reload', (await page.evaluate(() => CAI.DB.count('matches'))) === cnt); }
  await page.screenshot({ path: '/tmp/ui-game.png' });
  // Dashboard
  await page.click('[data-tab=dash]'); await sleep(300); chk('dashboard menampilkan total pertandingan', (await page.textContent('#dash')).includes('Total pertandingan'));
  await page.screenshot({ path: '/tmp/ui-dash.png', fullPage: true });
  // Versi AI + update
  await page.click('[data-tab=ai]'); await sleep(300);
  chk('banner/halaman: Update Available', (await page.textContent('#aiPage')).includes('Update Available'));
  await page.click('#bUpdate'); await sleep(200); await page.click('#modalBox button.primary'); // konfirmasi
  await page.waitForSelector('#modal:not([hidden])', { timeout: 120000 }); await sleep(300);
  const mtxt = await page.textContent('#modalBox'); console.log('   dialog hasil:', mtxt.replace(/\s+/g, ' ').slice(0, 120));
  if (/lulus/.test(mtxt)) { await page.click('#modalBox button.primary'); await sleep(500); chk('kandidat diaktifkan manual -> v1.1', (await page.textContent('#aiPage')).includes('v1.1')); await page.screenshot({ path: '/tmp/ui-ai.png', fullPage: true }); await page.click('#bRollback'); await page.click('#modalBox button.danger'); await sleep(500); chk('rollback ke v1.0', await page.evaluate(() => CAI.VersionManager.state.activeId === 'v1.0')); }
  else { await page.click('#modalBox button'); chk('kandidat ditolak tidak mengganti versi aktif', await page.evaluate(() => CAI.VersionManager.state.activeId === 'v1.0')); }
  chk('tidak ada error JavaScript' + (errs.length ? ': ' + errs.join(' | ') : ''), errs.length === 0);
  await browser.close(); console.log(fail ? 'ADA KEGAGALAN' : 'SEMUA LULUS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
