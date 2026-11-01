// Browser tests for multi-select (Ctrl/Shift+click, limit of 6, Esc, filters) and the grid view of the preview pane.
// Real Chrome, throwaway profile, own server port. Mouse clicks carry real modifier keys. Usage: node select-browser.mjs <app folder>
import path from "node:path";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";

const appDir = path.resolve(process.argv[2]);
const PORT = 47696, DBG = 9338, URL = `http://127.0.0.1:${PORT}/index.html`;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: 1280, height: 800 });
let pass = 0, fail = 0; const failures = [];
function check(name, ok, detail) { if (ok) pass++; else { fail++; failures.push(name); console.log("FAIL:", name, detail === undefined ? "" : JSON.stringify(detail)); } }
const same = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, expected: b });

async function load() { await page.goto(URL); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 2`); }
async function reload() { await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#list .item').length >= 1`); }
const BASE = new Date(2026, 9, 24, 9, 0).getTime();
// id: [title, added step (minutes), width, height, label]. Date order (newest first): e b g d h a f c. Title order (A-Z): b d f a h g e c.
const SEED = { a: ["Delta", 3, 60, 40, "Work"], b: ["Alpha", 7, 1000, 700, "Work"], c: ["Hotel", 1, 400, 300, "Work"], d: ["Bravo", 5, 300, 600, ""], e: ["Golf", 8, 50, 50, ""], f: ["Charlie", 2, 800, 200, ""], g: ["Foxtrot", 6, 120, 90, ""], h: ["Echo", 4, 1200, 900, ""] };
const DATE_DESC = ["e", "b", "g", "d", "h", "a", "f", "c"], DATE_ASC = [...DATE_DESC].reverse(), TITLE_ASC = ["b", "d", "f", "a", "h", "g", "e", "c"];
async function fresh() {
  await load(); await page.eval(`T.wipe()`);
  await page.eval(`(async()=>{ const S=${JSON.stringify(SEED)}, out=[]; let i=0; for (const [id,[title,step,w,h,label]] of Object.entries(S)) { const b=await T.png(w,h,i*40), th=await T.png(Math.max(1,Math.round(w/8)),Math.max(1,Math.round(h/8)),i*40); i++; out.push({id,title,blob:b,thumb:th,type:'image/png',width:w,height:h,added:${BASE}+step*60000,saved:false,source:'paste',label:label||'General'}); } await T.seed(out); })()`);
  await reload();
  await page.eval(`localStorage.setItem('imagekeeper-sort','date-desc'); sortMode='date-desc'; document.getElementById('sortSel').value='date-desc'; reorderRows(); 0`);
}
const MOD = { ctrl: 2, shift: 8 };
const thumb = (id) => `.item[data-id="${id}"] .thumb`;
const press = (id, modifiers = 0, part = "thumb") => page.click(part === "thumb" ? thumb(id) : `.item[data-id="${id}"] .${part}`, { modifiers });
const ctrl = (id, part) => press(id, MOD.ctrl, part), shift = (id, part) => press(id, MOD.shift, part), plain = (id, part) => press(id, 0, part);
const selIds = () => page.eval(`sel.slice()`);
const lit = () => page.eval(`[...document.querySelectorAll('#list .item.active')].map(li => li.dataset.id)`);
const sortBy = async (mode) => { await page.eval(`(()=>{ const s=document.getElementById('sortSel'); s.value=${JSON.stringify(mode)}; s.dispatchEvent(new Event('change')); })()`); await sleep(150); };
const toastText = () => page.eval(`[document.getElementById('msg').textContent, document.getElementById('msg').classList.contains('show')]`);
const hdr = () => page.eval(`(()=>{ const vis = (id) => document.getElementById(id).offsetParent !== null; const d = (id) => document.getElementById(id).disabled; return { count: document.getElementById('pcount').textContent, countShown: vis('pcount'), titleShown: vis('ptitle'), metaShown: vis('pmeta'), save: d('saveBtn'), discard: d('discardBtn'), fit: d('fitBtn'), saveAll: d('saveAllBtn'), discardAll: d('discardAllBtn') }; })()`);

try {
  // ------------------------------------------------------------ plain, Ctrl
  console.log("== plain click and Ctrl+click");
  await fresh();
  await plain("b"); same("plain click selects one image", [await selIds(), await lit()], [["b"], ["b"]]);
  await ctrl("g"); same("Ctrl+click adds an image", await selIds(), ["b", "g"]);
  await ctrl("d"); same("Ctrl+click adds another", await selIds(), ["b", "g", "d"]);
  same("every selected image is highlighted in the list, and only those", (await lit()).sort(), ["b", "d", "g"]);
  same("highlighted rows say aria-selected=true, the others false", await page.eval(`[...document.querySelectorAll('#list .item')].map(li => li.getAttribute('aria-selected') + ':' + li.classList.contains('active')).every(v => v === 'true:true' || v === 'false:false')`), true);
  same("the list is marked multi-selectable", await page.eval(`document.getElementById('list').getAttribute('aria-multiselectable')`), "true");
  await ctrl("g"); same("Ctrl+click on a selected image removes it", [await selIds(), (await lit()).sort()], [["b", "d"], ["b", "d"]]);
  await ctrl("d"); same("down to one image: single view again", [await selIds(), await page.eval(`!!document.querySelector('#stage > img') && !document.querySelector('.pgrid')`)], [["b"], true]);
  await ctrl("b"); same("Ctrl+click on the only selected image keeps it selected", await selIds(), ["b"]);
  // Ctrl/Shift on the title and label fields select, they do not edit
  await plain("e"); await ctrl("a", "title");
  same("Ctrl+click on a title field adds the image and does not focus the field", [await selIds(), await page.eval(`document.activeElement.tagName === 'INPUT'`)], [["e", "a"], false]);
  await shift("g", "label-in");
  same("Shift+click on a label field selects the range and does not focus the field", [(await selIds()).length > 1, await page.eval(`document.activeElement.tagName === 'INPUT'`)], [true, false]);
  await plain("c", "title");
  same("a plain click on a title field still edits it (as before)", [await selIds(), await page.eval(`document.activeElement.classList.contains('title')`)], [["c"], true]);
  await page.eval(`document.querySelector('.item[data-id="d"] .title').focus()`); await ctrl("f");
  check("Ctrl+click while editing a title leaves the field (so Esc works)", await page.eval(`document.activeElement.tagName !== 'INPUT'`));

  // ------------------------------------------------------------ Shift ranges in different sort orders
  console.log("== Shift+click ranges");
  for (const [mode, order] of [["date-desc", DATE_DESC], ["date-asc", DATE_ASC], ["title-asc", TITLE_ASC]]) {
    await fresh(); await sortBy(mode);
    same(`shift: list order is as expected for ${mode}`, await page.eval(`T.vis().map(r => r.id)`), order);
    await plain(order[1]); await shift(order[4]);
    same(`shift ${mode}: range from the last clicked to this one, in list order`, (await selIds()).slice().sort(), order.slice(1, 5).sort());
    same(`shift ${mode}: the clicked image is the one shown/last`, (await selIds()).at(-1), order[4]);
    await shift(order[0]);
    same(`shift ${mode}: a second Shift+click gives the range from the same anchor (the plain-clicked image), replacing the selection`, (await selIds()).slice().sort(), order.slice(0, 2).sort());
    same(`shift ${mode}: all in the range are highlighted`, (await lit()).sort(), order.slice(0, 2).sort());
    await shift(order[6]);
    same(`shift ${mode}: and a third one, still from the anchor`, (await selIds()).slice().sort(), order.slice(1, 7).sort());
    same(`shift ${mode}: Shift+click does not move the anchor`, await page.eval(`anchorId`), order[1]);
  }
  await fresh(); await plain("e"); await ctrl("a"); await ctrl("c"); await shift("g");
  same("shift after Ctrl clicks: the range starts at the last Ctrl-clicked image (c) and replaces the selection", (await selIds()).slice().sort(), ["a", "c", "d", "f", "g", "h"]);
  // the Explorer example, in the list: click A, Shift+click D, then Shift+click B
  await fresh(); await plain("e"); await shift("d");
  same("anchor example: click e, Shift+click d gives e..d", (await selIds()).slice().sort(), ["b", "d", "e", "g"]);
  await shift("b");
  same("anchor example: then Shift+click b gives e..b (not d..b)", (await selIds()).slice().sort(), ["b", "e"]);
  await ctrl("a"); await shift("c");
  same("Ctrl+click moves the anchor: ...then Ctrl+click a, Shift+click c gives a..c", (await selIds()).slice().sort(), ["a", "c", "f"]);

  // ------------------------------------------------------------ limit
  console.log("== limit of 6");
  await fresh();
  await plain("e"); for (const id of ["b", "g", "d", "h"]) await ctrl(id);
  same("five selected", (await selIds()).length, 5);
  await ctrl("a"); same("the 6th is accepted", (await selIds()).length, 6);
  await ctrl("f");
  same("Ctrl+click for a 7th is not applied", [(await selIds()).length, (await selIds()).includes("f")], [6, false]);
  same("...and says 'Up to 6 images at a time'", await toastText(), ["Up to 6 images at a time", true]);
  same("...and the highlight is unchanged", (await lit()).length, 6);
  await ctrl("a"); same("removing one at the limit works", (await selIds()).length, 5);
  await plain("e"); await shift("c");
  same("Shift+click over 6 (range of 8) is not applied; the selection stays as it was", await selIds(), ["e"]);
  same("...and says 'Up to 6 images at a time'", (await toastText())[0], "Up to 6 images at a time");
  await plain("e"); await shift("a");
  same("Shift+click of exactly 6 is applied", (await selIds()).length, 6);
  await fresh(); await plain("b"); for (const id of ["g", "d", "h", "a", "e"]) await ctrl(id);      // six selected, the last clicked is the top one (e)
  same("six selected by Ctrl+click", (await selIds()).length, 6);
  await shift("c");
  same("a rejected Shift+click (range of 8) keeps the six that were selected, unchanged", await selIds(), ["b", "g", "d", "h", "a", "e"]);

  // ------------------------------------------------------------ Esc
  console.log("== Esc");
  await fresh(); await plain("b"); await ctrl("g"); await ctrl("d");
  await page.key("Escape"); await sleep(100);
  same("Esc reduces the selection to the last clicked image", [await selIds(), await lit()], [["d"], ["d"]]);
  same("after Esc the anchor is the image that stays", await page.eval(`anchorId`), "d");
  await shift("a");
  same("after Esc, Shift+click ranges from the image that stayed (d..a)", (await selIds()).slice().sort(), ["a", "d", "h"]);
  await page.key("Escape"); await sleep(100); await plain("b"); await ctrl("g"); await ctrl("d");
  await page.key("Escape"); await sleep(100);
  await page.key("Escape"); same("Esc with one image selected changes nothing", await selIds(), ["d"]);
  await plain("b"); await ctrl("g"); await ctrl("d"); await ctrl("g");
  await page.key("Escape"); await sleep(100);
  same("Esc after removing the last clicked image goes to the last one still selected", await selIds(), ["d"]);
  // title being edited: Esc is not taken
  await plain("b"); await ctrl("g"); await ctrl("d");
  await page.eval(`document.querySelector('.item[data-id="b"] .title').focus()`); await page.key("Escape"); await sleep(80);
  same("Esc in a title field leaves the multi-selection alone", (await selIds()).length, 3);
  await page.eval(`document.activeElement.blur()`);
  // label suggestions
  await page.eval(`document.querySelector('.item[data-id="b"] .label-in').focus()`); await sleep(120);
  check("suggestions open for the label field", await page.eval(`!document.getElementById('labelPop').hidden`));
  await page.key("Escape"); await sleep(120);
  same("Esc with the label suggestions open closes them and keeps the multi-selection", [await page.eval(`document.getElementById('labelPop').hidden`), (await selIds()).length], [true, 3]);
  // dialog
  await page.eval(`document.activeElement.blur()`); await page.eval(`document.getElementById('discardAllBtn').click()`); await sleep(150);
  check("Discard All dialog is open", await page.eval(`document.getElementById('confirmAll').open`));
  await page.key("Escape"); await sleep(150);
  same("Esc closes the dialog and keeps the multi-selection", [await page.eval(`document.getElementById('confirmAll').open`), (await selIds()).length], [false, 3]);
  await page.eval(`document.body.focus()`); await page.key("Escape"); await sleep(100);
  same("with nothing else using Esc it reduces the selection", (await selIds()).length, 1);

  // ------------------------------------------------------------ search, filter, sort, paste/drop, restart
  console.log("== search, label filter, sort, paste/drop, restart");
  await fresh(); await plain("c"); await ctrl("g"); await ctrl("e");           // last clicked: e (Golf)
  await page.click("#q"); await page.insert("ot"); await sleep(150);          // shows Hotel (c) and Foxtrot (g), not Golf
  same("search that hides the last clicked image: multi-selection ends, the first image shown is selected", [await selIds(), await page.eval(`T.vis().map(r => r.id)`)], [["g"], ["g", "c"]]);
  await page.eval(`document.getElementById('q').value=''; document.getElementById('q').dispatchEvent(new Event('input'))`);
  await plain("c"); await ctrl("g"); await ctrl("e");
  await page.click("#q"); await page.insert("o"); await sleep(150);          // Golf, Foxtrot, Hotel, Echo, Bravo all contain an o
  same("search that still shows the last clicked image: it stays selected, alone", await selIds(), ["e"]);
  same("after the search the anchor is the image that stays", await page.eval(`anchorId`), "e");
  await shift("c"); same("after the search, Shift+click ranges from the image that stayed (e..c in the filtered list: e g d h c)", (await selIds()).slice().sort(), ["c", "d", "e", "g", "h"]);
  await page.eval(`document.getElementById('q').value=''; document.getElementById('q').dispatchEvent(new Event('input'))`);
  await plain("b"); await ctrl("g"); await ctrl("e");                         // b is Work; g and e are General
  await page.click(`#chips .chip[data-key="work"]`); await sleep(150);
  same("label filter that hides the last clicked image: multi-selection ends, first image shown is selected", await selIds(), ["b"]);
  same("...and that image is the anchor", await page.eval(`anchorId`), "b");
  await page.click(`#chips .chip[data-key="all"]`); await sleep(100);
  await plain("b"); await ctrl("g"); await ctrl("a");                         // a is Work and last clicked
  await page.click(`#chips .chip[data-key="work"]`); await sleep(150);
  same("label filter that still shows the last clicked image: it stays selected, alone", await selIds(), ["a"]);
  same("after the label filter the anchor is the image that stays", await page.eval(`anchorId`), "a");
  await page.click(`#chips .chip[data-key="all"]`); await sleep(100);
  await plain("e"); await ctrl("g"); await ctrl("b"); await sortBy("title-asc");
  same("changing the sort order keeps the multi-selection", [(await selIds()).slice().sort(), await page.eval(`!!document.querySelector('.pgrid')`)], [["b", "e", "g"], true]);
  const before = JSON.stringify(await page.eval(`T.dump()`));
  await page.eval(`T.add('paste',1)`); await sleep(300);
  const pastedId = await page.eval(`selectedId`);
  same("paste while several are selected: the new image becomes the single selection", [(await selIds()).length, !["a", "b", "c", "d", "e", "f", "g", "h"].includes(pastedId)], [1, true]);
  await plain("e"); await ctrl("g");
  await page.eval(`T.add('drop',1)`); await sleep(300);
  same("drop while several are selected: the new image becomes the single selection", [(await selIds()).length, await page.eval(`items.get(selectedId).source`)], [1, "file"]);
  await plain("e"); await ctrl("g"); await ctrl("b");
  await reload();
  same("the selection is not remembered across a restart", [await selIds(), await page.eval(`!!document.querySelector('.pgrid')`)], [[], false]);
  const dumpAfter = JSON.stringify(await page.eval(`T.dump()`));
  check("selecting and viewing changed nothing that is stored (the original records, compared before and after)", JSON.parse(dumpAfter).filter((r) => SEED[r.id]).map((r) => [r.id, r.title, r.saved, r.label, r.added]).join() === JSON.parse(before).map((r) => [r.id, r.title, r.saved, r.label, r.added]).join());

  // ------------------------------------------------------------ grid
  console.log("== grid view");
  const pick = { 2: ["e", "b"], 3: ["g", "d", "h"], 4: ["a", "f", "c", "e"], 5: ["b", "d", "h", "g", "a"], 6: ["e", "b", "g", "d", "h", "a"] };
  const SHAPE = { 2: [2, 1], 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2] };
  await fresh();
  for (const n of [2, 3, 4, 5, 6]) {
    await plain(pick[n][0]); for (const id of pick[n].slice(1)) await ctrl(id);
    await sleep(150);
    const g = await page.eval(`(()=>{ const cells=[...document.querySelectorAll('.pgrid .gcell')], r=(e)=>e.getBoundingClientRect(); const rect=cells.map(c=>({id:c.dataset.id,x:Math.round(r(c).x),y:Math.round(r(c).y),w:r(c).width,h:r(c).height}));
      return { ids: cells.map(c=>c.dataset.id), cols:new Set(rect.map(c=>c.x)).size, rows:new Set(rect.map(c=>c.y)).size, sameSize: rect.every(c=>Math.abs(c.w-rect[0].w)<1.5 && Math.abs(c.h-rect[0].h)<1.5), w:rect[0].w, h:rect[0].h, stage: r(document.getElementById('stage')).width }; })()`);
    const expectIds = pick[n].slice().sort((p, q) => SEED[p][1] - SEED[q][1]);
    same(`grid ${n}: oldest first (by date added), whatever the list order`, g.ids, expectIds);
    same(`grid ${n}: ${SHAPE[n][0]} across, ${SHAPE[n][1]} down`, [g.cols, g.rows], SHAPE[n]);
    check(`grid ${n}: all cells the same size`, g.sameSize, g);
    const im = await page.eval(`[...document.querySelectorAll('.pgrid .gcell')].map(c => { const i = c.querySelector('img'), b = i.getBoundingClientRect(), box = c.querySelector('.gframe').getBoundingClientRect(), blk = c.querySelector('.gblock').getBoundingClientRect(), cp = c.querySelector('.gcap').getBoundingClientRect(), id = c.dataset.id; return { id, w: b.width, h: b.height, nw: i.naturalWidth, nh: i.naturalHeight, cx: b.x + b.width / 2 - (box.x + box.width / 2), cy: blk.y + blk.height / 2 - (box.y + box.height / 2), fits: blk.width <= box.width + 0.5 && blk.height <= box.height + 0.5 && cp.bottom <= box.bottom + 0.5, gap: cp.top - b.bottom, capCx: cp.x + cp.width / 2 - (b.x + b.width / 2) }; })`);
    check(`grid ${n}: no image is shown larger than its real size`, im.every((i) => i.w <= i.nw + 0.5 && i.h <= i.nh + 0.5), im);
    check(`grid ${n}: every image and its caption fit inside the cell; the image-plus-caption block is centred`, im.every((i) => i.fits && Math.abs(i.cx) < 1.5 && Math.abs(i.cy) < 1.5), im);
    check(`grid ${n}: the caption is directly under its image (gap of a few pixels) and centred on it`, im.every((i) => i.gap >= 0 && i.gap <= 8 && Math.abs(i.capCx) < 1.5), im);
    check(`grid ${n}: images that fit are at real size; larger ones are scaled down keeping their proportions`, im.every((i) => (Math.abs(i.w - i.nw) < 1 && Math.abs(i.h - i.nh) < 1) || (i.w < i.nw && Math.abs(i.w / i.h - i.nw / i.nh) < 0.03)), im);
    const cap = await page.eval(`[...document.querySelectorAll('.pgrid .gcell')].map(c => ({ id: c.dataset.id, t: c.querySelector('.gt').textContent, d: c.querySelector('.gd').textContent, name: c.getAttribute('aria-label'), expect: fmtItemDate(items.get(c.dataset.id).added) }))`);
    check(`grid ${n}: each cell shows its title and date in the list format; accessible name "title, date"`, cap.every((c) => c.t === SEED[c.id][0] && c.d === c.expect && c.name === c.t + ", " + c.expect), cap);
    const h = await hdr();
    same(`grid ${n}: header says "${n} selected"; title and metadata hidden`, [h.count, h.countShown, h.titleShown, h.metaShown], [n + " selected", true, false, false]);
  }
  // mixed sizes: one small, one big, check the exact numbers for the 2-up case
  await plain("e"); await ctrl("b"); await sleep(150);
  const mixed = await page.eval(`[...document.querySelectorAll('.pgrid .gcell img')].map(i => [Math.round(i.getBoundingClientRect().width), Math.round(i.getBoundingClientRect().height), i.naturalWidth, i.naturalHeight])`);
  same("mixed sizes (oldest first: Alpha 1000x700, then Golf 50x50): the 50x50 image stays 50x50", [mixed[1][0], mixed[1][1]], [50, 50]);
  check("mixed sizes: the big one is smaller than 1000 and keeps its 10:7 proportions", mixed[0][0] < 1000 && Math.abs(mixed[0][0] / mixed[0][1] - 10 / 7) < 0.03, mixed);
  // a small image in a large cell: the caption stays right under the image, the block is centred in the cell
  await plain("e"); await ctrl("g"); await sleep(150);
  const small = await page.eval(`[...document.querySelectorAll('.pgrid .gcell')].map(c => { const i = c.querySelector('img').getBoundingClientRect(), cp = c.querySelector('.gcap').getBoundingClientRect(), f = c.querySelector('.gframe').getBoundingClientRect(), blk = c.querySelector('.gblock').getBoundingClientRect(); return { w: Math.round(i.width), h: Math.round(i.height), gap: Math.round(cp.top - i.bottom), cellH: Math.round(f.height), cellW: Math.round(f.width), above: Math.round(blk.top - f.top), below: Math.round(f.bottom - blk.bottom), capLeft: Math.round(cp.left - i.left) }; })`);
  check("small image, large cell: cell is much bigger than the image", small.every((c) => c.cellH > 300 && c.cellW > 300), small);
  same("small image, large cell: shown at its real size (120x90 and 50x50, oldest first: Foxtrot, then Golf)", small.map((c) => [c.w, c.h]), [[120, 90], [50, 50]]);
  check("small image, large cell: the caption is right under the image (gap <= 8px), not at the bottom of the cell", small.every((c) => c.gap >= 0 && c.gap <= 8 && c.below > 100), small);
  check("small image, large cell: the image-plus-caption block is centred (space above equals space below)", small.every((c) => Math.abs(c.above - c.below) <= 2), small);
  await plain("e"); await ctrl("b"); await sleep(150);      // back to the Golf + Alpha grid used below
  // header state
  const hm = await hdr();
  same("header with 2+ selected: Save, Discard and the 100% toggle disabled; Save All and Discard All still enabled", [hm.save, hm.discard, hm.fit, hm.saveAll, hm.discardAll], [true, true, true, false, false]);
  check("the disabled buttons are still shown (not hidden) and say why", await page.eval(`['saveBtn','discardBtn','fitBtn'].every(id => document.getElementById(id).offsetParent !== null && /Select one image/.test(document.getElementById(id).title))`));
  await page.eval(`document.getElementById('discardBtn').click(); document.getElementById('saveBtn').click()`); await sleep(150);
  check("a click on the disabled Save/Discard does nothing (no dialog, nothing discarded)", !(await page.eval(`document.getElementById('confirm').open`)) && (await page.eval(`items.size`)) === 8);
  // click a cell
  await page.click(`.pgrid .gcell[data-id="b"]`); await sleep(200);
  same("clicking a cell shows that image alone and makes it the single selection", [await selIds(), await page.eval(`!!document.querySelector('#stage > img') && !document.querySelector('.pgrid')`), (await lit())], [["b"], true, ["b"]]);
  const h1 = await hdr();
  same("single view again: title and metadata shown, 'N selected' hidden, buttons enabled (Save enabled for an unsaved pasted image)", [h1.countShown, h1.titleShown, h1.metaShown, h1.save, h1.discard, h1.fit], [false, true, true, false, false, false]);
  same("the title field shows the clicked image's title", await page.eval(`document.getElementById('ptitle').value`), "Alpha");
  // keyboard
  await plain("e"); await ctrl("b"); await ctrl("g"); await sleep(150);
  const cellNames = await page.eval(`[...document.querySelectorAll('.pgrid .gcell')].map(c => [c.tagName, c.tabIndex >= 0, c.getAttribute('aria-label')])`);
  check("cells are buttons in the tab order, each with an accessible name", cellNames.length === 3 && cellNames.every(([t, ok, n]) => t === "BUTTON" && ok && /, \d+ \w{3}( \d{4})? \d\d:\d\d/.test(n)), cellNames);
  check("the grid is a labelled group", await page.eval(`document.querySelector('.pgrid').getAttribute('aria-label') === '3 selected images'`));
  await page.eval(`document.querySelector('.pgrid .gcell').focus()`); await page.key("Tab"); await sleep(80);
  check("Tab moves from one cell to the next", await page.eval(`document.activeElement.classList.contains('gcell') && document.activeElement !== document.querySelector('.pgrid .gcell')`));
  const focusedId = await page.eval(`document.activeElement.dataset.id`);
  for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, ...(type === "keyDown" ? { text: "\r" } : {}) });      // a full key press, so the button is activated as by a real keyboard
  await sleep(200);
  same("Enter on a focused cell shows that image alone", [await selIds(), await page.eval(`!document.querySelector('.pgrid')`)], [[focusedId], true]);
  // the grid is not rebuilt for no reason
  await plain("e"); await ctrl("b"); await sleep(150);
  await page.eval(`document.querySelector('.pgrid .gcell img').__m = 1; renderPreview(); refreshButtons(); 0`);
  check("re-rendering the same selection keeps the same grid images (no flicker)", await page.eval(`document.querySelector('.pgrid .gcell img').__m === 1`));
  // object URLs are released when leaving the grid
  const urls = await page.eval(`gridUrls.length`);
  await plain("e"); same("leaving the grid releases its image URLs", [urls, await page.eval(`gridUrls.length`)], [2, 0]);
  // discard all with a multi-selection works and clears it
  await plain("e"); await ctrl("b");
  await page.eval(`document.getElementById('discardAllBtn').click()`); await sleep(150);
  await page.eval(`document.getElementById('caOk').click()`); await sleep(300);
  same("Discard All with several selected: everything gone, selection and grid cleared, empty note shown", [await page.eval(`items.size`), await selIds(), await page.eval(`!!document.getElementById('emptyMsg') && !document.querySelector('.pgrid')`)], [0, [], true]);
} catch (e) {
  fail++; failures.push("EXCEPTION " + e.message); console.log("EXCEPTION:", e.stack);
}
await page.close(); srv.kill();
console.log(`select-browser: ${pass} passed, ${fail} failed`);
if (failures.length) console.log("failed:", failures.join("; "));
process.exit(fail ? 1 : 0);
