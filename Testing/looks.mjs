// Four looks (Default/Mint x light/dark): screenshots + contrast measured from the rendered page (computed colours, translucent layers composited).
// Usage: node looks.mjs <app folder> <screenshot folder>
import path from "node:path";
import fs from "node:fs";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";

const appDir = path.resolve(process.argv[2]), outDir = path.resolve(process.argv[3]);
fs.mkdirSync(outDir, { recursive: true });
const PORT = 47692, DBG = 9334, URL = `http://127.0.0.1:${PORT}/index.html`;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: 1280, height: 800 });

const MEASURE = `window.M = (() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return [0,0,0,0]; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, under) => { const a = top[3]; return [top[0]*a + under[0]*(1-a), top[1]*a + under[1]*(1-a), top[2]*a + under[2]*(1-a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
  // effective background behind an element: its own and its ancestors' background colours composited (document default white at the bottom)
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) layers.push(parse(getComputedStyle(e).backgroundColor)); let c = [255,255,255,1]; for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c); return c; };
  const bgBehind = (el) => (el.parentElement ? bgOf(el.parentElement) : [255,255,255,1]);
  const q = (s) => document.querySelector(s);
  const out = [];
  const text = (name, el) => { const cs = getComputedStyle(el); const bg = bgOf(el); const fg = over(parse(cs.color), bg); out.push({ name, kind: 'text', ratio: ratio(fg, bg), size: cs.fontSize, weight: cs.fontWeight }); };
  const border = (name, el) => { const cs = getComputedStyle(el); const bw = parseFloat(cs.borderTopWidth); if (!bw) { out.push({ name, kind: 'boundary', ratio: null, note: 'no border' }); return; } const sur = bgBehind(el); const b = over(parse(cs.borderTopColor), sur); out.push({ name, kind: 'boundary', ratio: ratio(b, sur) }); };
  const fill = (name, el) => { out.push({ name, kind: 'boundary', ratio: ratio(bgOf(el), bgBehind(el)) }); };
  const ring = (name, el) => { const c = parse(getComputedStyle(document.documentElement).getPropertyValue('--focus').trim().startsWith('#') ? hex(getComputedStyle(document.documentElement).getPropertyValue('--focus').trim()) : 'rgb(0,0,0)'); out.push({ name, kind: 'boundary', ratio: ratio(c, bgBehind(el)) }); };
  const hex = (h) => { h = h.replace('#',''); if (h.length === 3) h = h.split('').map(x=>x+x).join(''); return 'rgb(' + parseInt(h.slice(0,2),16) + ',' + parseInt(h.slice(2,4),16) + ',' + parseInt(h.slice(4,6),16) + ')'; };
  return { parse, over, ratio, bgOf, bgBehind, q, out, text, border, fill, ring };
})();`;

const looks = [["default", "light"], ["default", "dark"], ["mint", "light"], ["mint", "dark"]];
const results = {};
const wait = (ms) => sleep(ms);

async function setLook(profile, theme) {
  await page.eval(`localStorage.setItem('imagekeeper-profile','${profile}'); localStorage.setItem('imagekeeper-theme','${theme}'); localStorage.setItem('imagekeeper-label','work')`);
  await page.reload(); await page.eval(HELPERS); await page.eval(MEASURE);
  await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 3`);
  const got = await page.eval(`({p: document.documentElement.getAttribute('data-profile') || 'default', t: document.documentElement.getAttribute('data-theme')})`);
  if (got.p !== profile || got.t !== theme) throw new Error("look not applied " + JSON.stringify(got));
}

// seed once
await page.goto(URL); await page.eval(HELPERS);
await page.eval(`T.wipe()`);
const titles = ["Sunset over bay", "Invoice scan", "Team photo", "Whiteboard", "Beach day", "Receipt", "Sketch", "Logo draft", "Map", "Screenshot", "Poster", "Floorplan"];
const labels = ["Work", "Work", "Work", "Work", "Holiday", "Holiday", "Ideas", "Ideas", "Work", "General", "General", "Reference notes"];
await page.eval(`(async()=>{ const out=[]; for (let i=0;i<${titles.length};i++){ const b=await T.png(220,150,i*31), th=await T.png(110,75,i*31); out.push({id:'s'+i, title:${JSON.stringify(titles)}[i], blob:b, thumb:th, type:'image/png', width:220, height:150, added:Date.now()-i*3600000, saved:i%4===0, label:${JSON.stringify(labels)}[i]}); } await T.seed(out); })()`);

for (const [profile, theme] of looks) {
  const tag = `${profile}-${theme}`;
  await setLook(profile, theme);
  await page.eval(`(()=>{ const first = T.vis()[0]; if (first) select(first.id); })()`);
  await sleep(300);
  const M = [];                    // [name, kind, ratio]
  const run = async (js) => { const r = await page.eval(`(()=>{ M.out.length = 0; ${js}; return M.out.slice(); })()`); M.push(...r); };

  // --- state A: Work chip selected, chips + label fields + rename button + sort
  await page.shot(path.join(outDir, `${tag}-1-main.png`));
  await run(`
    const act = M.q('.chip[aria-pressed=true]'), inact = M.q('.chip[aria-pressed=false]');
    M.text('chip (inactive) text', inact); M.border('chip (inactive) border', inact);
    M.text('chip (active) text', act); M.border('chip (active) border', act); M.fill('chip (active) fill vs card', act);
    M.text('chip (active) count', act.querySelector('.cc')); M.text('chip (inactive) count', inact.querySelector('.cc'));
    const li = M.q('#list .item:not(.active)'), lin = li.querySelector('.label-in');
    M.text('label pill text', lin); M.border('label pill border', lin);
    M.text('date text (list item)', li.querySelector('.when'));
    const ali = M.q('#list .item.active'); if (ali) { M.text('label pill text (selected row)', ali.querySelector('.label-in')); M.border('label pill border (selected row)', ali.querySelector('.label-in')); M.text('date text (selected row)', ali.querySelector('.when')); }
    const sv = M.q('#list .item .badge'); if (sv) M.text('saved badge text', sv);
    const rn = M.q('#renameBtn'); M.text('Rename label button text', rn); M.border('Rename label button border', rn);
    M.ring('focus ring vs surroundings (label field)', lin); M.ring('focus ring vs surroundings (chip)', act); M.ring('focus ring vs surroundings (inactive chip)', inact); M.ring('focus ring vs surroundings (Rename button)', rn);
  `);
  // header (Mint dark: the Mint blue band): text and borders against what is behind them
  await run(`
    M.text('header title', M.q('h1')); M.text('header Profile label', M.q('#profileLabel'));
    const segOff = M.q('.segbtns button[aria-pressed=false]'), segOn = M.q('.segbtns button[aria-pressed=true]');
    M.text('header segment (inactive) text', segOff); M.text('header segment (active) text', segOn);
    M.border('header segment group border', M.q('.segbtns')); M.fill('header active segment fill vs band', segOn);
    M.text('header theme button text', M.q('#themeBtn')); M.border('header theme button border', M.q('#themeBtn'));
  `);
  // --- state B: popup open, one highlighted
  await page.click("#list .item .label-in"); await page.key("ArrowDown"); await sleep(150);
  await page.shot(path.join(outDir, `${tag}-2-suggestions.png`));
  await run(`
    const pop = M.q('#labelPop'), sel = M.q('#labelPop .opt[aria-selected=true]'), norm = [...document.querySelectorAll('#labelPop .opt')].find(o => o.getAttribute('aria-selected') !== 'true');
    M.text('suggestion text', norm); M.text('suggestion highlighted text', sel); M.fill('suggestion highlighted fill vs list', sel); M.border('suggestion list border', pop);
  `);
  await page.key("Escape");
  // --- state C: empty-state note
  await page.click("#q"); await page.insert("zzzz"); await sleep(100);
  await run(`M.text('"No images match" note', M.q('#list .nomatch'))`);
  await page.eval(`document.getElementById('q').value=''; document.getElementById('q').dispatchEvent(new Event('input'))`);
  // --- state D: rename dialog with error, then merge dialog
  await page.click("#renameBtn"); await page.insert("all"); await page.click("#rnOk"); await sleep(150);
  await page.shot(path.join(outDir, `${tag}-3-rename-dialog.png`));
  await run(`
    M.text('rename dialog title', M.q('#rnTitle')); M.text('rename dialog input text', M.q('#rnInput')); M.border('rename dialog input border', M.q('#rnInput'));
    M.text('rename dialog error text', M.q('#rnErr')); M.border('rename dialog error border', M.q('#rnErr'));
    M.text('Cancel button', M.q('#rnCancel')); M.border('Cancel button border', M.q('#rnCancel')); M.text('Rename (primary) button', M.q('#rnOk'));
  `);
  await page.click("#rnInput"); await page.eval(`document.getElementById('rnInput').select()`); await page.insert("Holiday"); await page.click("#rnOk"); await sleep(200);
  await page.shot(path.join(outDir, `${tag}-4-merge-dialog.png`));
  await run(`M.text('merge dialog title', M.q('#mgTitle')); M.text('merge dialog body', M.q('#mgBody')); M.text('Merge (primary) button', M.q('#mgOk')); M.border('merge Cancel border', M.q('#mgCancel'));`);
  await page.click("#mgCancel"); await sleep(100);
  // --- state E: Discard All dialog (chip scope)
  await page.click("#discardAllBtn"); await sleep(150);
  await page.shot(path.join(outDir, `${tag}-5-discard-all-dialog.png`));
  await run(`M.text('discard dialog title', M.q('#caTitle')); M.text('discard dialog label line', M.q('#caLabel')); M.text('discard dialog count line', M.q('#caSaved'));`);
  await page.click("#caCancel"); await sleep(100);

  results[tag] = M;
  const texts = M.filter((x) => x.kind === "text" && x.ratio != null), bounds = M.filter((x) => x.kind === "boundary" && x.ratio != null);
  const lowT = texts.reduce((a, b) => (a.ratio < b.ratio ? a : b)), lowB = bounds.reduce((a, b) => (a.ratio < b.ratio ? a : b));
  console.log(`\n=== ${tag}: ${texts.length} text measures (lowest ${lowT.ratio.toFixed(2)} "${lowT.name}"), ${bounds.length} boundary measures (lowest ${lowB.ratio.toFixed(2)} "${lowB.name}")`);
  for (const x of M) console.log("  " + (x.ratio == null ? "  n/a " : x.ratio.toFixed(2).padStart(6)) + "  " + x.kind.padEnd(8) + x.name + (x.note ? " (" + x.note + ")" : ""));
}
fs.writeFileSync(path.join(outDir, "contrast-results.json"), JSON.stringify(results, null, 1));

// ---- screenshots of all four looks at 1920 x 1080 (the real window), 1280 and 340 (narrowest without a sideways scrollbar), with a 30-character label, a long title and a date from last year
for (const [profile, theme] of looks) {
  await setLook(profile, theme);
  await page.eval(`(()=>{ const a = sorted(); a[0].title = "A very long title that does not fit on one line of a list item at any width"; a[0].label = "Quarterly report drafts 2026xx".slice(0, 30); a[1].added = new Date(new Date().getFullYear() - 1, 9, 21, 7, 51).getTime(); buildRows(); select(a[0].id); })()`);
  for (const [w, h] of [[1920, 1080], [1280, 800], [340, 800]]) {
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(300);
    const g = await page.eval(`(()=>{ const li = document.querySelector('#list .item:not([hidden])'), r = (e) => e.getBoundingClientRect(), d = li.querySelector('.when'); return { item: Math.round(r(li).width), date: Math.round(r(d).width), clipped: d.scrollWidth > d.clientWidth + 0.5, label: Math.round(r(li.querySelector('.label-in')).width) }; })()`);
    console.log(`${profile}-${theme} ${w}x${h}: list item ${g.item}px; date ${g.date}px${g.clipped ? " CLIPPED" : ""}; label field ${g.label}px`);
    await page.shot(path.join(outDir, `${profile}-${theme}-${w}w.png`));
  }
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
}
await setLook("default", "light");
await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await page.eval(`(async()=>{ for (let i = 0; i < 14; i++) { const it = [...items.values()][i % items.size]; it.label = ['Quarterly report drafts 2026', 'Holiday', 'Receipts', 'Ideas', 'Whiteboard', 'Reference notes', 'Travel', 'Tax', 'Memes', 'Screenshots of errors', 'Garden', 'Kitchen', 'Car', 'Pets'][i]; } renderChips(); applyFilter(); })()`);
await sleep(200); await page.shot(path.join(outDir, `chips-many-labels-wrap-default-light.png`));
await page.close(); srv.kill();
