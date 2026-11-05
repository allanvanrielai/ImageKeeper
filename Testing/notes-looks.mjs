// Notes in all four looks (Default/Mint x light/dark): contrast measured from the rendered page, and screenshots of the icon (both states), the hover pop-up,
// the edit pop-up, a note near the limit, and the first and last item. Usage: node notes-looks.mjs <app folder> <screenshot folder>
import path from "node:path";
import fs from "node:fs";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";
import { MEASURE } from "./measure.mjs";

const appDir = path.resolve(process.argv[2]), outDir = path.resolve(process.argv[3]);
fs.mkdirSync(outDir, { recursive: true });
const PORT = 47699, DBG = 9341, URL = `http://127.0.0.1:${PORT}/index.html`;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: 1280, height: 800 });
const view = (w, h) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const NOTE = "Before: login button is blue.\nAfter: the button is green and the label reads 'Sign in'.\nCheck the focus ring too.";
const results = {};

async function setLook(profile, theme) {
  await page.eval(`localStorage.setItem('imagekeeper-profile','${profile}'); localStorage.setItem('imagekeeper-theme','${theme}')`);
  await page.reload(); await page.eval(HELPERS); await page.eval(MEASURE);
  await page.waitFor(`document.querySelectorAll('#list .item').length >= 12`);
}
await page.goto(URL); await page.eval(HELPERS); await page.eval(`T.wipe()`);
await page.eval(`(async()=>{ const out=[]; for (let i=0;i<30;i++){ const o={id:'n'+i,title:['Sunset over bay','Invoice scan','Team photo','Whiteboard','Beach day','Receipt'][i%6]+' '+i,blob:await T.png(220,150,i*31),thumb:await T.png(110,75,i*31),type:'image/png',width:220,height:150,added:${Date.now()}-(30-i)*3600000,saved:i%4===0,label:'General'}; if (i%3===2 || i===0) o.note=${JSON.stringify(NOTE)}; out.push(o);} await T.seed(out); })()`);
const hover = async (sel) => { await page.rect(sel); await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 30 }); await sleep(150); const r = await page.rect(sel); await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + r.w / 2, y: r.y + r.h / 2 }); await sleep(200); };
const away = async () => { await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 30 }); await sleep(500); };

// measures from the page: text colour against the background behind it; a border against whatever is behind the element (for a pop-up: the page or card beneath it)
const MEAS = `(() => { const M = window.M, out = [];
  const text = (name, el) => { const cs = getComputedStyle(el), bg = M.bgOf(el), fg = M.over(M.parse(cs.color), bg); out.push({ name, kind: 'text', ratio: M.ratio(fg, bg) }); };
  const borderAgainst = (name, el, behind) => { const cs = getComputedStyle(el), b = M.over(M.parse(cs.borderTopColor), behind); out.push({ name, kind: 'boundary', ratio: M.ratio(b, behind) }); };
  const behindPopup = (el) => { const r = el.getBoundingClientRect(); const pts = [[r.left - 3, r.top + r.height / 2], [r.right + 3, r.top + r.height / 2], [r.left + r.width / 2, r.top - 3], [r.left + r.width / 2, r.bottom + 3]].filter(([x, y]) => x >= 0 && y >= 0 && x < innerWidth && y < innerHeight);
    return pts.map(([x, y]) => M.bgOf(document.elementsFromPoint(x, y).find((e) => !el.contains(e)))); };
  return { M, out, text, borderAgainst, behindPopup }; })()`;

for (const [profile, theme] of [["default", "light"], ["default", "dark"], ["mint", "light"], ["mint", "dark"]]) {
  const tag = `${profile}-${theme}`, R = [];
  await setLook(profile, theme);
  await view(1920, 1080); await sleep(300);
  const order = await page.eval(`T.vis().map(r => r.id)`);
  const withNote = order.find((id) => { const n = +id.slice(1); return n % 3 === 2; }), without = order.find((id) => { const n = +id.slice(1); return n % 3 === 1 && n !== 0; });
  const m = (js) => page.eval(`(() => { const K = ${MEAS}; ${js}; return K.out; })()`);
  // icons, unselected row
  R.push(...await m(`
    const a = document.querySelector('.item[data-id="${without}"] .note-btn'), b = document.querySelector('.item[data-id="${withNote}"] .note-btn');
    K.text('icon, no note (outline) vs its background', a); K.text('icon, with a note (filled) vs its background', b);
    K.borderAgainst('icon button border (no note)', a, K.M.bgOf(a.parentElement)); K.borderAgainst('icon button border (with note)', b, K.M.bgOf(b.parentElement));`));
  await page.eval(`select(${JSON.stringify(withNote)}, true)`); await sleep(150);
  R.push(...await m(`
    const a = document.querySelector('.item[data-id="${withNote}"] .note-btn'); K.text('icon, with a note, on a selected row', a); K.borderAgainst('icon button border, selected row', a, K.M.bgOf(a.parentElement));`));
  await page.eval(`document.getElementById('list').scrollTop = 0`);
  await page.shot(path.join(outDir, `${tag}-1920-1-icons.png`));
  // hover pop-up
  await hover(`.item[data-id="${withNote}"] .note-btn`);
  await page.shot(path.join(outDir, `${tag}-1920-2-hover-popup.png`));
  R.push(...await m(`
    const p = document.getElementById('notePop'); K.text('pop-up text (read-only note)', document.getElementById('noteRead'));
    K.behindPopup(p).forEach((bg, i) => K.borderAgainst('pop-up border vs what is behind it (edge ' + i + ')', p, bg));`));
  await hover(`.item[data-id="${without}"] .note-btn`);
  R.push(...await m(`K.text('pop-up hint text ("Add a note")', document.getElementById('noteRead'));`));
  await page.shot(path.join(outDir, `${tag}-1920-3-hover-hint.png`));
  await away();
  // edit pop-up
  await page.click(`.item[data-id="${withNote}"] .note-btn`); await sleep(250);
  await page.shot(path.join(outDir, `${tag}-1920-4-edit-popup.png`));
  R.push(...await m(`
    const p = document.getElementById('notePop'), t = document.getElementById('noteText');
    K.text('edit box text', t); K.text('character counter', document.getElementById('noteCount'));
    K.behindPopup(p).forEach((bg, i) => K.borderAgainst('edit pop-up border vs what is behind it (edge ' + i + ')', p, bg));
    K.borderAgainst('edit box border vs the pop-up', t, K.M.bgOf(p));`));
  // near the limit, with a cut message
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.focus(); t.value = 'n'.repeat(470); t.dispatchEvent(new Event('input', { bubbles: true })); const dt = new DataTransfer(); dt.setData('text/plain', 'z'.repeat(60)); t.setSelectionRange(470, 470); t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`); await sleep(250);
  R.push(...await m(`K.text('cut message ("Pasted text was cut")', document.getElementById('noteMsg')); K.text('counter at the limit', document.getElementById('noteCount'));`));
  await page.shot(path.join(outDir, `${tag}-1920-5-near-limit.png`));
  await page.key("Escape"); await sleep(150);
  // first and last item at 1920 and 1280
  for (const [W, H] of [[1920, 1080], [1280, 800]]) {
    await view(W, H); await sleep(300);
    for (const which of ["first", "last"]) {
      await page.eval(`document.getElementById('list').scrollTop = ${which === "last" ? "1e7" : "0"}`); await sleep(200);
      const ids = await page.eval(`T.vis().map(r => r.id)`), id = which === "first" ? ids[0] : ids[ids.length - 1];
      await page.click(`.item[data-id="${id}"] .note-btn`); await sleep(250);
      await page.shot(path.join(outDir, `${tag}-${W}-6-${which}-item-edit.png`));
      await page.key("Escape"); await sleep(100);
    }
  }
  await view(1280, 800);
  results[tag] = R;
  const texts = R.filter((x) => x.kind === "text"), bounds = R.filter((x) => x.kind === "boundary");
  const low = (a) => a.reduce((x, y) => (x.ratio < y.ratio ? x : y));
  console.log(`\n=== ${tag}: lowest text ${low(texts).ratio.toFixed(2)} "${low(texts).name}"; lowest boundary ${low(bounds).ratio.toFixed(2)} "${low(bounds).name}"`);
  for (const x of R) console.log("  " + x.ratio.toFixed(2).padStart(6) + "  " + x.kind.padEnd(9) + x.name);
}
fs.writeFileSync(path.join(outDir, "notes-contrast-results.json"), JSON.stringify(results, null, 1));
await page.close(); srv.kill();
