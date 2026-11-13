// Uji layout/UX: konsistensi 64 kotak, overflow, ukuran font, area sentuh, kontras. Pemakaian: node tests/ui-layout.js <url> [--shots]
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const URL = process.argv[2] || 'http://localhost:8765/index.html'; const SHOTS = process.argv.includes('--shots');
const VPS = [['ponsel kecil 360x640', 360, 640, true], ['ponsel 390x844', 390, 844, true], ['ponsel besar 412x915', 412, 915, true], ['ponsel lanskap 844x390', 844, 390, true], ['tablet potret 768x1024', 768, 1024, false], ['tablet lanskap 1024x768', 1024, 768, false], ['desktop 1280x800', 1280, 800, false], ['desktop 1920x1080', 1920, 1080, false]];
let fail = 0; const chk = (n, ok, extra) => { console.log(ok ? 'OK  ' : 'FAIL', n, ok ? '' : (extra || '')); if (!ok) fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const boardInfo = () => {
  const rs = [...document.querySelectorAll('#board .sq')].map(e => e.getBoundingClientRect()), b = document.getElementById('board').getBoundingClientRect();
  const w = rs.map(r => r.width), h = rs.map(r => r.height);
  return { n: rs.length, wMin: Math.min(...w), wMax: Math.max(...w), hMin: Math.min(...h), hMax: Math.max(...h), bw: b.width, bh: b.height };
};
const audit = () => {
  const out = { overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth, small: [], clipped: [], offscreen: [], contrast: [], tap: [] };
  const vw = document.documentElement.clientWidth;
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return [0, 0, 0, 1]; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const bgOf = el => { let layers = []; for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } } let base = [17, 19, 23]; for (const c of layers.reverse()) base = base.map((v, i) => i < 3 ? c[i] * c[3] + v * (1 - c[3]) : 1); return base; };
  const visible = e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el) || el.closest('svg') || el.closest('#modal[hidden]')) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const r = el.getBoundingClientRect(), s = getComputedStyle(el), tag = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    if (own && !(el.closest('.sq'))) {
      if (parseFloat(s.fontSize) < 13 - 0.01) out.small.push(tag + ' ' + s.fontSize + ' "' + el.textContent.trim().slice(0, 24) + '"');
      if (!el.disabled && !el.closest('button:disabled')) {
        const fg = parse(s.color), bg = bgOf(el), a = fg[3], mix = [0, 1, 2].map(i => fg[i] * a + bg[i] * (1 - a)), L1 = lum(mix), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
        const large = parseFloat(s.fontSize) >= 24 || (parseFloat(s.fontSize) >= 18.66 && +s.fontWeight >= 600);
        if (ratio < (large ? 3 : 4.5)) out.contrast.push(tag + ' ' + ratio.toFixed(2) + ' "' + el.textContent.trim().slice(0, 20) + '"');
      }
    }
    if ((el.scrollWidth > el.clientWidth + 1) && ['hidden', 'clip'].includes(s.overflowX) && !el.closest('#board') && el.clientWidth > 0 && el.tagName !== 'HTML') out.clipped.push(tag + ' ' + el.scrollWidth + '>' + el.clientWidth);
    if (r.right > vw + 1 && !el.closest('[style*="overflow:auto"]') && !el.closest('.moves')) { const p = el.closest('[style*="overflow"]'); if (!p) out.offscreen.push(tag + ' right=' + Math.round(r.right)); }
    if (['BUTTON', 'SELECT'].includes(el.tagName) || (el.tagName === 'INPUT' && el.type === 'number')) { if (r.height < 43.5) out.tap.push(tag + ' h=' + r.height.toFixed(1)); if (el.tagName === 'BUTTON' && r.width < 43.5) out.tap.push(tag + ' w=' + r.width.toFixed(1)); }
  }
  return out;
};
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', args: ['--no-sandbox'] });
  for (const [name, w, h, mobile] of VPS) {
    console.log('\n== ' + name);
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: mobile, isMobile: mobile, deviceScaleFactor: 2 }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(URL); await page.waitForSelector('#board .sq'); await sleep(500);
    const click = async sq => { await page.locator(`#board [data-sq="${sq}"]`).scrollIntoViewIfNeeded(); await page.locator(`#board [data-sq="${sq}"]`).click(); await sleep(60); };
    const move = async (a, b) => { await click(a); await click(b); };
    let ref = null;
    const sizes = async label => {
      const b = await page.evaluate(boardInfo); if (!ref) ref = b;
      const uniform = b.n === 64 && b.wMax - b.wMin < 0.05 && b.hMax - b.hMin < 0.05 && Math.abs(b.wMin - b.hMin) < 0.05 && Math.abs(b.bw - b.bh) < 0.05;
      chk(`${label}: 64 kotak identik (${b.wMin.toFixed(2)}×${b.hMin.toFixed(2)}), papan persegi ${b.bw.toFixed(0)}px`, uniform && Math.abs(b.bw - ref.bw) < 0.05, JSON.stringify(b));
    };
    await page.selectOption('#selMode', 'pvp'); await page.selectOption('#selColor', 'w'); await page.click('#bNew'); await sleep(300);
    await sizes('awal game');
    if (SHOTS) await page.screenshot({ path: `/tmp/shot-${w}x${h}-start.png`, fullPage: true });
    await click(52); chk('legal move indicator tampil', (await page.locator('#board .dot').count()) === 2); await sizes('bidak terpilih + indikator legal');
    await click(36); await move(12, 28); await sizes('setelah beberapa langkah + last move');
    if (SHOTS) await page.screenshot({ path: `/tmp/shot-${w}x${h}-moves.png`, fullPage: true });
    // check
    await page.click('#bNew'); await sleep(250);
    for (const [a, b] of [[52, 36], [13, 21], [59, 31]]) await move(a, b);
    chk('kondisi CHECK ditandai', (await page.locator('#board .sq.check').count()) === 1 && /Skak/.test(await page.textContent('#status'))); await sizes('check');
    if (SHOTS) await page.screenshot({ path: `/tmp/shot-${w}x${h}-check.png`, fullPage: true });
    // checkmate (fool's mate)
    await page.click('#bNew'); await sleep(250);
    for (const [a, b] of [[53, 45], [12, 28], [54, 38], [3, 39]]) await move(a, b);
    await sleep(300); chk('CHECKMATE: status hasil + raja yang di-skakmat ditandai', /Hitam menang.*checkmate/.test(await page.textContent('#status')) && (await page.locator('#board .sq.check').count()) === 1); await sizes('checkmate');
    if (SHOTS) await page.screenshot({ path: `/tmp/shot-${w}x${h}-mate.png`, fullPage: true });
    // draw (threefold)
    await page.click('#bNew'); await sleep(250);
    for (let i = 0; i < 2; i++) for (const [a, b] of [[62, 45], [6, 21], [45, 62], [21, 6]]) await move(a, b);
    await sleep(300); chk('DRAW: status hasil', /Remis/.test(await page.textContent('#status'))); await sizes('draw');
    // Cheat mode + overlay
    await page.click('#bNew'); await sleep(250); await page.click('#gmToggle'); await page.click('.gmset summary');
    await page.selectOption('#gmPreset', 'quick'); await page.fill('#gmTime', '2'); await page.locator('#gmTime').dispatchEvent('change');
    for (const [a, b] of [[52, 36], [12, 28], [59, 31], [1, 18], [61, 34]]) await move(a, b);
    await page.click('#gmAnalyze'); await page.waitForFunction(() => !CAI.GMUI.state.running && CAI.GMUI.state.lines.length > 0, null, { timeout: 30000 }); await sleep(200);
    chk('overlay Cheat Mode tampil (panah/outline)', (await page.locator('#gmArrows g').count()) >= 1 && (await page.locator('#board .gm-to').count()) === 1); await sizes('overlay Cheat Mode (panah, outline, ancaman)');
    if (SHOTS) { await page.screenshot({ path: `/tmp/shot-${w}x${h}-gm.png`, fullPage: true }); }
    // resize -> tetap konsisten
    const vh = h, vw = w; await page.setViewportSize({ width: vw - 40 > 320 ? vw - 40 : vw, height: vh }); await sleep(250);
    const b2 = await page.evaluate(boardInfo); chk('resize: kotak tetap identik', b2.wMax - b2.wMin < 0.05 && b2.hMax - b2.hMin < 0.05 && Math.abs(b2.bw - b2.bh) < 0.05, JSON.stringify(b2)); await page.setViewportSize({ width: vw, height: vh }); await sleep(250);
    // audit halaman: game (GM aktif), dashboard, versi AI
    const run = async (tab, label) => {
      if (tab) { await page.click(`[data-tab=${tab}]`); await sleep(400); }
      const a = await page.evaluate(audit);
      chk(`${label}: tanpa overflow horizontal (selisih ${a.overflowX}px)`, a.overflowX <= 0 && a.offscreen.length === 0, a.offscreen.slice(0, 4).join(' | '));
      chk(`${label}: tidak ada teks terpotong`, a.clipped.length === 0, a.clipped.slice(0, 4).join(' | '));
      chk(`${label}: semua teks ≥ 13px`, a.small.length === 0, a.small.slice(0, 5).join(' | '));
      chk(`${label}: kontras teks ≥ 4.5:1 (besar ≥ 3:1)`, a.contrast.length === 0, a.contrast.slice(0, 5).join(' | '));
      chk(`${label}: tombol/kontrol ≥ 44px`, a.tap.length === 0, a.tap.slice(0, 5).join(' | '));
    };
    await run(null, 'tab Game');
    await run('dash', 'Dashboard'); if (SHOTS) await page.screenshot({ path: `/tmp/shot-${w}x${h}-dash.png`, fullPage: true });
    await run('ai', 'Versi AI'); if (SHOTS) await page.screenshot({ path: `/tmp/shot-${w}x${h}-ai.png`, fullPage: true });
    chk('tidak ada error JavaScript', errs.length === 0, errs.join(' | '));
    await ctx.close();
  }
  await browser.close(); console.log(fail ? '\nADA KEGAGALAN: ' + fail : '\nSEMUA LULUS'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
