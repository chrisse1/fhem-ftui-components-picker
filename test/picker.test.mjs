/*
* Browser tests for the ftui-picker component.
*
* They drive the demo page in a headless Chromium and check the selected
* values, the delayed write back, the endless wheels, the day/month/leap
* year logic, the size-x scaling and the 3D rendering.
*
* Usage:
*   npm install playwright
*   npx playwright install chromium     # not needed if CHROMIUM_PATH is set
*   node test/picker.test.mjs
*
* Exits with code 1 if a check fails.
*/

import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8321;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let name = decodeURIComponent(req.url.split('?')[0]);
  if (name.endsWith('/')) {
    name += 'index.html';
  }
  const file = path.join(ROOT, name);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(resolve => server.listen(PORT, resolve));

const launchOptions = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const errors = [];
page.on('pageerror', error => errors.push('PAGEERROR: ' + error.message));
page.on('console', message => {
  if (message.type() === 'error' && !/404/.test(message.text())) {
    errors.push(message.text());
  }
});
await page.goto(`http://localhost:${PORT}/demo/`, { waitUntil: 'load' });
await page.waitForTimeout(700);

let failed = 0;
const t = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) {
    failed++;
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}: got=${got} want=${want}`);
};

// 1) middle-block parking for cyclic wheels
const park = await page.evaluate(() => {
  const p = document.getElementById('p1');
  const [hh, mm] = [...p.shadowRoot.querySelectorAll('.wheel')];
  return { hhIdx: Math.round(hh.scrollTop / p.itemPx), mmIdx: Math.round(mm.scrollTop / p.itemPx), n: 60 };
});
t('p1 hh parked in middle block (7+48=55)', park.hhIdx, 55);
t('p1 mm parked in middle block (30+120=150)', park.mmIdx, 150);

// 2) user scroll -> select event -> delayed commit
const res = await page.evaluate(async () => {
  const p = document.getElementById('p1');
  const events = [];
  p.addEventListener('select', e => events.push(['select', e.detail, Date.now()]));
  p.addEventListener('valueChange', e => events.push(['commit', e.detail, Date.now()]));
  const hh = p.shadowRoot.querySelector('.wheel');
  const start = Date.now();
  hh.dispatchEvent(new Event('pointerdown'));
  hh.scrollTop = hh.scrollTop + 3 * p.itemPx;      // three hours further
  hh.dispatchEvent(new Event('pointerup'));
  await new Promise(r => setTimeout(r, 300));
  const afterSettle = { events: events.map(e => [e[0], e[1], e[2] - start]), attr: p.getAttribute('value') };
  await new Promise(r => setTimeout(r, 500));
  return { afterSettle, events: events.map(e => [e[0], e[1], e[2] - start]), attr: p.getAttribute('value') };
});
t('select fired with new value', res.afterSettle.events[0] && res.afterSettle.events[0][1], '10:30');
t('attribute NOT yet written after 300ms (delay 500)', res.afterSettle.attr, '07:30');
t('attribute written after delay', res.attr, '10:30');
t('valueChange event fired once', res.events.filter(e => e[0] === 'commit').length, 1);
console.log('   timeline:', JSON.stringify(res.events));

// 3) debounce=0 commits immediately
const imm = await page.evaluate(async () => {
  const p = document.getElementById('p12');
  const hh = p.shadowRoot.querySelector('.wheel');
  hh.dispatchEvent(new Event('pointerdown'));
  hh.scrollTop = hh.scrollTop + 2 * p.itemPx;
  hh.dispatchEvent(new Event('pointerup'));
  await new Promise(r => setTimeout(r, 260));
  return p.getAttribute('value');
});
t('debounce=0 immediate commit', imm, '11:00');

// 4) endless wrap: scroll hh below zero region -> recenter keeps working
const wrap = await page.evaluate(async () => {
  const p = document.getElementById('p2');
  const hh = p.shadowRoot.querySelector('.wheel');
  hh.dispatchEvent(new Event('pointerdown'));
  hh.scrollTop = 0;                                  // top of the repeated list
  hh.dispatchEvent(new Event('pointerup'));
  await new Promise(r => setTimeout(r, 300));
  return { idx: Math.round(hh.scrollTop / p.itemPx), value: p.composeValue() };
});
t('recentered into middle block after hitting the top', wrap.idx, 48);
t('value after wrap', wrap.value, '00:45:10');

// 5) day wheel adapts to month / leap year
const days = await page.evaluate(async () => {
  const p = document.getElementById('p4');
  p.setAttribute('value', '31.01.2026');
  await new Promise(r => setTimeout(r, 50));
  const before = p.composeValue();
  const mo = p.shadowRoot.querySelectorAll('.wheel')[1];
  mo.dispatchEvent(new Event('pointerdown'));
  mo.scrollTop = mo.scrollTop + p.itemPx;            // Jan -> Feb
  mo.dispatchEvent(new Event('pointerup'));
  await new Promise(r => setTimeout(r, 900));
  const dd = p.shadowRoot.querySelectorAll('.wheel')[0];
  const feb = { value: p.composeValue(), dayCount: p.wheel('dd').count };
  p.setAttribute('value', '01.02.2028');
  await new Promise(r => setTimeout(r, 60));
  return { before, feb, leap: p.wheel('dd').count, leapValue: p.composeValue() };
});
t('date value applied from outside', days.before, '31.01.2026');
t('Feb 2026 has 28 days', days.feb.dayCount, 28);
t('day clamped when switching to Feb', days.feb.value, '28.02.2026');
t('Feb 2028 has 29 days (leap)', days.leap, 29);
t('value kept in leap year', days.leapValue, '01.02.2028');

// 6) size scaling
const sizes = await page.evaluate(() => {
  const r = {};
  ['p1', 'p9', 'p10'].forEach(id => {
    const p = document.getElementById(id);
    r[id] = { itemPx: Math.round(p.itemPx * 10) / 10, h: Math.round(p.shadowRoot.querySelector('.picker').getBoundingClientRect().height) };
  });
  return r;
});
console.log('   sizes:', JSON.stringify(sizes));
t('size-2 is 1.5x of size-0', Math.round(sizes.p9.itemPx / sizes.p1.itemPx * 100) / 100, 1.5);
t('size-4 is 2x of size-0', Math.round(sizes.p10.itemPx / sizes.p1.itemPx * 100) / 100, 2);
t('rows=5 -> height = 5 * itemPx', sizes.p1.h, Math.round(sizes.p1.itemPx * 5));

// 7) rows=3
const rows3 = await page.evaluate(() => {
  const p = document.getElementById('p3');
  return { h: Math.round(p.shadowRoot.querySelector('.picker').getBoundingClientRect().height / p.itemPx), items: p.wheel('mm').count };
});
t('rows=3', rows3.h, 3);
t('minute-step=5 -> 12 items', rows3.items, 12);

// 8) number mode nearest match + unit, list mode
const misc = await page.evaluate(async () => {
  const p6 = document.getElementById('p6');
  p6.setAttribute('value', '23.4');
  await new Promise(r => setTimeout(r, 50));
  const nearest = p6.composeValue();
  const p8 = document.getElementById('p8');
  p8.setAttribute('value', 'Urlaub');
  await new Promise(r => setTimeout(r, 50));
  return { nearest, unit: p6.shadowRoot.querySelector('.unit').textContent, list: p8.composeValue(), count: p6.wheel('num').count };
});
t('number mode snaps to nearest step', misc.nearest, '23.5');
t('unit rendered', misc.unit, '°C');
t('list mode value', misc.list, 'Urlaub');
t('number items 5..30 step .5', misc.count, 51);

// 9) keyboard
const kb = await page.evaluate(async () => {
  const p = document.getElementById('p7');
  const w = p.shadowRoot.querySelector('.wheel');
  w.focus();
  w.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await new Promise(r => setTimeout(r, 900));
  return p.getAttribute('value');
});
t('ArrowDown moves one step (40 -> 45)', kb, '45');

// 9b) a scroll the user did not cause must not change the value
const guard = await page.evaluate(async () => {
  const p = document.getElementById('p11');
  const before = p.getAttribute('value');
  const events = [];
  p.addEventListener('valueChange', e => events.push(e.detail));
  p.addEventListener('select', e => events.push('select:' + e.detail));
  const hh = p.shadowRoot.querySelector('.wheel');
  hh.scrollTop = hh.scrollTop + 4 * p.itemPx;        // e.g. caused by a re-layout
  await new Promise(r => setTimeout(r, 400));
  return { before, after: p.getAttribute('value'), value: p.composeValue(),
           idx: Math.round(hh.scrollTop / p.itemPx), events: events.join('|') };
});
t('re-layout scroll does not change the value', guard.value, guard.before);
t('re-layout scroll writes nothing', guard.after, guard.before);
t('re-layout scroll emits no events', guard.events, '');
t('wheel put back to its position (9+48)', guard.idx, 57);

// 10) 3D transforms applied
const tilt = await page.evaluate(() => {
  const p = document.getElementById('p1');
  const items = [...p.shadowRoot.querySelectorAll('.wheel')[0].children];
  const sel = items.find(i => i.classList.contains('selected'));
  const idx = items.indexOf(sel);
  return { selected: sel && sel.textContent, selTransform: sel.style.transform, neighbour: items[idx + 1].style.transform, flatItem: [...document.getElementById('p10').shadowRoot.querySelectorAll('.item')].find(i => i.classList.contains('selected')).style.transform };
});
console.log('   tilt:', JSON.stringify(tilt));
t('center item is not rotated', Math.abs(parseFloat(tilt.selTransform.match(/rotateX\((-?[\d.]+)deg/)[1])) < 1, true);
t('neighbour item is rotated ~18deg', Math.abs(parseFloat(tilt.neighbour.match(/rotateX\((-?[\d.]+)deg/)[1]) + 18) < 1, true);
t('flat mode has no transform', tilt.flatItem, '');

// 12) tight tiles: the picker has to fit and keep the selection centred
const measureTile = () => {
  const read = (id) => {
    const picker = document.getElementById(id);
    const box = picker.shadowRoot.querySelector('.picker').getBoundingClientRect();
    const tile = picker.parentElement.getBoundingClientRect();
    const selected = [...picker.shadowRoot.querySelectorAll('.item')]
      .find(item => item.classList.contains('selected'));
    const selectedBox = selected.getBoundingClientRect();
    const top = Math.max(box.top, tile.top);
    const bottom = Math.min(box.bottom, tile.bottom);
    return {
      rows: Number(picker.effectiveRows.toFixed(2)),
      cutOff: Number((box.height - (bottom - top)).toFixed(1)),
      offCentre: Math.abs((selectedBox.top + selectedBox.height / 2) - (top + bottom) / 2),
      rowsHigh: Math.round(box.height / picker.itemPx),
    };
  };
  return { three: read('p13'), two: read('p14'), auto: read('p15'), one: read('p16') };
};
const tight = await page.evaluate(measureTile);
t('rows=3 does not fit into the tile (the reported problem)', tight.three.cutOff > 10, true);
t('... and pushes the selection below the centre', tight.three.offCentre > 5, true);
t('rows=2 fits into the tile', tight.two.cutOff, 0);
t('rows=2 is two rows high', tight.two.rowsHigh, 2);
t('rows=2 keeps the selection centred', tight.two.offCentre < 1, true);
t('rows=auto fits into the tile', tight.auto.cutOff, 0);
t('rows=auto took less than max-rows', tight.auto.rows < 5, true);
t('rows=auto keeps the selection centred', tight.auto.offCentre < 1, true);
t('rows=1 is one row high', tight.one.rowsHigh, 1);
t('rows=1 keeps the selection centred', tight.one.offCentre < 1, true);

// 13) rows=auto has to settle and to follow a resized container
const settled = await page.evaluate(async () => {
  const picker = document.getElementById('p15');
  const first = picker.effectiveRows;
  await new Promise(resolve => setTimeout(resolve, 600));
  return { first: Number(first.toFixed(2)), later: Number(picker.effectiveRows.toFixed(2)) };
});
t('rows=auto settles instead of oscillating', settled.later, settled.first);

const resized = await page.evaluate(async () => {
  const picker = document.getElementById('p15');
  const tile = picker.parentElement;
  tile.style.height = '6rem';
  await new Promise(resolve => setTimeout(resolve, 500));
  const grown = Number(picker.effectiveRows.toFixed(2));
  tile.style.height = '3.2rem';
  await new Promise(resolve => setTimeout(resolve, 500));
  return { grown, back: Number(picker.effectiveRows.toFixed(2)) };
});
t('rows=auto grows with the container', resized.grown > 3, true);
t('rows=auto shrinks again', resized.back < 2.5, true);

// 11) a picker created at runtime (e.g. by ftui-content) with zero padding
const dynamic = await page.evaluate(async () => {
  // like ftui-content does it: the element comes from parsed HTML
  document.querySelector('.tiles').insertAdjacentHTML('beforeend',
    '<ftui-picker id="dyn" mode="number" min="1" max="12" pad="2" value="03"></ftui-picker>');
  const picker = document.getElementById('dyn');
  await new Promise(resolve => setTimeout(resolve, 300));
  const wheel = picker.wheel('num');
  return {
    value: picker.composeValue(),
    label: wheel.items[wheel.index].label,
    count: wheel.count,
    upgraded: !!picker.shadowRoot,
  };
});
t('picker created at runtime is upgraded', dynamic.upgraded, true);
t('pad=2 delivers a padded value', dynamic.value, '03');
t('pad=2 shows a padded label', dynamic.label, '03');
t('number items 1..12', dynamic.count, 12);

if (errors.length) {
  failed++;
  console.log('FAIL  no console/page errors:', errors);
} else {
  console.log('PASS  no console/page errors');
}

await browser.close();
server.close();
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
