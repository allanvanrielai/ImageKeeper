// Browser tests for the per-image note (icon, hover/focus read pop-up, click-to-edit pop-up, 500-character limit, storage, Discard, Save, paste and drop).
// Real Chrome, throwaway profile, own server port; real mouse and keyboard events. The Save dialog is a native window, so showSaveFilePicker is replaced by a stand-in that
// returns a real file handle from the browser's private file system (as in save-browser.mjs). Usage: node notes-browser.mjs <app folder>
import path from "node:path";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";

const appDir = path.resolve(process.argv[2]);
const PORT = 47698, DBG = 9340, URL = `http://127.0.0.1:${PORT}/index.html`;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: 1280, height: 800 });
let pass = 0, fail = 0; const failures = [];
function check(name, ok, detail) { if (ok) pass++; else { fail++; failures.push(name); console.log("FAIL:", name, detail === undefined ? "" : JSON.stringify(detail)); } }
const same = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, expected: b });

async function load() { await page.goto(URL); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 2`); }
async function reload() { await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#list .item').length >= 1`); }
const BASE = new Date(2026, 9, 24, 9, 0).getTime();
// [id, title, minutes, note, source, saved]; a note of null = a record with no "note" key at all
const SEED = [["a", "Alpha", 1, null], ["b", "Bravo", 2, "Existing note on Bravo\nsecond line"], ["c", "Charlie", 3, null], ["d", "Delta", 4, "   \n  "], ["e", "Echo", 5, null]];
async function fresh(seed = SEED, extra = "") {
  await load(); await page.eval(`T.wipe()`);
  await page.eval(`(async()=>{ const S=${JSON.stringify(seed)}, out=[]; for (let i=0;i<S.length;i++){ const [id,title,m,note]=S[i]; const o={id,title,blob:await T.png(80+i*9,60+i*5,i*45),thumb:await T.png(40,30,i*45),type:'image/png',width:80+i*9,height:60+i*5,added:${BASE}+m*60000,saved:false,source:'paste',label:'General'}; if(note!==null) o.note=note; out.push(o);} await T.seed(out); })()`);
  await reload();
  await page.eval(`window.__persists = []; { const o = window.persist; window.persist = function (it) { window.__persists.push(it.id); return o(it); }; }
    window.PK = { n: 0 }; window.showSaveFilePicker = async (opts) => { const root = await navigator.storage.getDirectory(); return await root.getFileHandle('out' + (++PK.n) + '-' + opts.suggestedName, { create: true }); }; 0`);
}
const view = (w, h) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
const btn = (id) => `.item[data-id="${id}"] .note-btn`;
const rec = (id) => page.eval(`(async()=>{ const d = await T.idb(); const r = await new Promise((res) => { const q = d.transaction('items').objectStore('items').get(${JSON.stringify(id)}); q.onsuccess = () => res(q.result); }); d.close(); return r ? { id: r.id, keys: Object.keys(r), note: r.note } : undefined; })()`);
const resetPersists = () => page.eval(`window.__persists.length = 0; 0`);
const popState = () => page.eval(`(()=>{ const p = document.getElementById('notePop'); const vis = !p.hidden; return { vis, mode: note.mode, read: vis && !document.getElementById('noteRead').hidden ? document.getElementById('noteRead').textContent : null, hint: document.getElementById('noteRead').classList.contains('hint'), edit: vis && !document.getElementById('noteEdit').hidden, rect: vis ? (({ x, y, width, height }) => ({ x, y, w: width, h: height }))(p.getBoundingClientRect()) : null }; })()`);
const hover = async (sel) => { await page.rect(sel); await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 30 }); await sleep(120); const r = await page.rect(sel); await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x + r.w / 2, y: r.y + r.h / 2 }); await sleep(120); };
const away = async () => { await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 640, y: 30 }); };
const typeNote = async (text) => { await page.insert(text); await sleep(80); };
const pressKey = async (key, code, vk, text) => { for (const type of ["keyDown", "keyUp"]) await page.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, ...(type === "keyDown" && text ? { text } : {}) }); await sleep(120); };      // a full key press, so a button is activated as by a real keyboard
const persists = () => page.eval(`window.__persists.slice()`);
const inside = (r, W, H) => r && r.x >= 0 && r.y >= 0 && r.x + r.w <= W + 0.5 && r.y + r.h <= H + 0.5;

try {
  // ------------------------------------------------------------ records and the icon
  console.log("== data and icon");
  await fresh();
  same("a record with no note has no note key; a record with a note keeps it", (await page.eval(`T.dump()`)).map((r) => [r.id, r.keys.includes("note")]), [["a", false], ["b", true], ["c", false], ["d", true], ["e", false]]);
  const ic = await page.eval(`['a','b','d'].map(id => { const b = document.querySelector('.item[data-id="' + id + '"] .note-btn'); const sv = b.querySelector('svg'); return { id, tag: b.tagName, tab: b.tabIndex, has: b.classList.contains('has'), fill: getComputedStyle(sv).fill, paths: sv.querySelectorAll('path').length, rule: sv.querySelector('path').getAttribute('fill-rule'), label: b.getAttribute('aria-label'), expanded: b.getAttribute('aria-expanded'), haspopup: b.getAttribute('aria-haspopup') }; })`);
  check("icon is a focusable button for every image", ic.every((i) => i.tag === "BUTTON" && i.tab === 0), ic);
  check("no note: outline (no fill) with a plus; note: solid fill with text lines cut out (different shape, not only colour)", ic[0].fill === "none" && ic[0].paths === 2 && ic[0].rule === null && ic[1].fill !== "none" && ic[1].paths === 1 && ic[1].rule === "evenodd", ic);
  check("a whitespace-only stored note reads as no note (outline icon)", !ic[2].has && ic[2].fill === "none", ic[2]);
  check("accessible names say whether there is a note", /no note/.test(ic[0].label) && /has a note/.test(ic[1].label) && /no note/.test(ic[2].label), ic.map((i) => i.label));
  check("icon announces a pop-up and starts collapsed", ic.every((i) => i.haspopup === "dialog" && i.expanded === "false"), ic);
  same("loading the page rewrote no record", await persists(), []);
  const tl = await page.eval(`(()=>{ const li=document.querySelector('.item[data-id="a"]'), t=li.querySelector('.title').getBoundingClientRect(), n=li.querySelector('.note-btn').getBoundingClientRect(); return { titleW: Math.round(t.width), iconW: Math.round(n.width), iconH: Math.round(n.height), titleH: Math.round(t.height), beside: n.left >= t.right && Math.abs((n.top+n.height/2)-(t.top+t.height/2)) < 2 }; })()`);
  check("the icon sits beside the title, the title is shorter, same height", tl.beside && tl.iconW === 26 && tl.iconH === tl.titleH, tl);

  // ------------------------------------------------------------ hover
  console.log("== hover and keyboard read pop-up");
  await hover(btn("b"));
  let ps = await popState();
  same("hover on an icon with a note shows the note read-only (line breaks kept)", [ps.vis, ps.mode, ps.read, ps.edit], [true, "read", "Existing note on Bravo\nsecond line", false]);
  check("the read pop-up has no text box", await page.eval(`document.getElementById('noteRead').querySelector('textarea') === null && document.getElementById('noteText').offsetParent === null`));
  await away(); await sleep(100);
  check("it does not vanish at once when the mouse leaves (small delay, no flicker)", (await popState()).vis);
  await sleep(600);
  check("it closes after the mouse has left", !(await popState()).vis);
  await hover(btn("a")); ps = await popState();
  same("hover with no note shows the hint 'Add a note'", [ps.vis, ps.read, ps.hint], [true, "Add a note", true]);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ps.rect.x + 20, y: ps.rect.y + 8 }); await sleep(450);
  check("moving from the icon onto the pop-up keeps it open", (await popState()).vis);
  await away(); await sleep(700);
  check("and leaving the pop-up closes it", !(await popState()).vis);
  await page.eval(`document.querySelector('.item[data-id="a"] .title').focus()`); await page.key("Tab"); await sleep(120);
  same("Tab from the title reaches the icon and shows the same read-only pop-up", [await page.eval(`document.activeElement.classList.contains('note-btn') && document.activeElement.dataset.id`), (await popState()).read], ["a", "Add a note"]);
  await page.key("Escape"); await sleep(100);
  check("Esc closes the read-only pop-up", !(await popState()).vis);
  await page.eval(`document.querySelector('.item[data-id="b"] .title').focus()`); await page.key("Tab"); await sleep(120);
  same("keyboard focus on an icon with a note shows the note", (await popState()).read, "Existing note on Bravo\nsecond line");
  await page.eval(`document.body.focus(); document.activeElement.blur()`); await sleep(100);
  check("moving focus away closes it", !(await popState()).vis);
  await resetPersists();      // (leaving a title field stores that image: that is the title's own, existing behaviour)
  await hover(btn("a")); await away(); await sleep(500); await page.eval(`document.querySelector(${JSON.stringify(btn("b"))}).focus()`); await sleep(100); await page.eval(`document.activeElement.blur()`); await sleep(100);
  same("hover and keyboard focus on the icons rewrote no record", await persists(), []);

  // ------------------------------------------------------------ edit
  console.log("== edit pop-up");
  await resetPersists();
  await page.click(btn("c")); await sleep(150);
  ps = await popState();
  same("click opens the editable pop-up with the text box focused", [ps.vis, ps.mode, ps.edit, await page.eval(`document.activeElement.id`)], [true, "edit", true, "noteText"]);
  same("icon says it is expanded", await page.eval(`document.querySelector(${JSON.stringify(btn("c"))}).getAttribute('aria-expanded')`), "true");
  same("clicking the icon did not change which image is selected", await page.eval(`selectedId`), null);
  same("counter starts at 0 / 500", await page.eval(`document.getElementById('noteCount').textContent`), "0 / 500");
  await away(); await sleep(800);
  check("the edit pop-up does not close when the mouse leaves", (await popState()).edit);
  await typeNote("Check the 3rd step"); await sleep(700);
  same("saves as you type: stored in the record without any Save button", (await rec("c")).note, "Check the 3rd step");
  same("the counter follows the text", await page.eval(`document.getElementById('noteCount').textContent`), "18 / 500");
  check("the icon turned to the filled shape while typing", await page.eval(`document.querySelector(${JSON.stringify(btn("c"))}).classList.contains('has')`));
  check("only the edited image was written", JSON.stringify(await persists()) === JSON.stringify(["c"]), await persists());
  check("there is no Save/OK button in the pop-up", await page.eval(`document.querySelectorAll('#notePop button').length === 0`));
  await page.key("Escape"); await sleep(150);
  ps = await popState();
  same("Esc closes it and keeps what was typed", [ps.vis, (await rec("c")).note, await page.eval(`items.get('c').note`)], [false, "Check the 3rd step", "Check the 3rd step"]);
  same("focus returns to the icon, and the read pop-up does not pop up again", [await page.eval(`document.activeElement === document.querySelector(${JSON.stringify(btn("c"))})`), ps.vis], [true, false]);
  await pressKey("Enter", "Enter", 13, "\r"); await sleep(100);
  same("Enter on the focused icon opens the editor, with the earlier text", [(await popState()).edit, await page.eval(`document.getElementById('noteText').value`)], [true, "Check the 3rd step"]);
  await page.key("Escape"); await sleep(100);
  await pressKey(" ", "Space", 32, " "); await sleep(100);
  check("Space on the focused icon opens the editor too", (await popState()).edit);
  await page.click(btn("c")); await sleep(120);
  same("clicking the icon again closes it (and keeps the text)", [(await popState()).vis, (await rec("c")).note], [false, "Check the 3rd step"]);
  await page.click(btn("c")); await sleep(120); await typeNote(" and more"); await page.click("#q"); await sleep(700);
  same("a click outside closes it, and the text typed is kept", [(await popState()).vis, (await rec("c")).note], [false, "Check the 3rd step and more"]);
  // only one pop-up open at a time
  await page.click(btn("a")); await sleep(150);
  await hover(btn("b")); await sleep(150);
  same("hovering another icon while an editor is open changes nothing", [(await popState()).mode, await page.eval(`note.id`)], ["edit", "a"]);
  await page.click(btn("e")); await sleep(150);
  same("opening another editor closes the first: one pop-up, for the new image", [await page.eval(`document.querySelectorAll('#notePop:not([hidden])').length`), await page.eval(`note.id`), await page.eval(`document.querySelector(${JSON.stringify(btn("a"))}).getAttribute('aria-expanded')`)], [1, "e", "false"]);
  await page.key("Escape"); await sleep(100);
  await page.click(`.item[data-id="a"] .label-in`); await sleep(150);
  check("the label suggestions and the note pop-up are never open together", await page.eval(`!document.getElementById('labelPop').hidden && document.getElementById('notePop').hidden`));
  await page.key("Escape"); await sleep(100);
  await hover(btn("b")); await page.eval(`document.querySelector('.item[data-id="a"] .label-in').focus()`); await sleep(150);
  check("focusing a label field closes a read-only note pop-up", await page.eval(`document.getElementById('notePop').hidden`));
  await page.eval(`document.activeElement.blur()`);

  // ------------------------------------------------------------ whitespace, limit
  console.log("== whitespace only and the 500 limit");
  await resetPersists();
  await page.click(btn("a")); await sleep(120); await typeNote("   "); await page.key("Enter"); await typeNote("  "); await sleep(700);
  check("a note that is only spaces and a line break counts as no note: no note key stored, outline icon", !(await rec("a")).keys.includes("note") && !(await page.eval(`document.querySelector(${JSON.stringify(btn("a"))}).classList.contains('has')`)));
  same("...and it did not write a record that had nothing to change", await persists().then((p) => p.filter((x) => x === "a").length), 0);
  await page.key("Escape"); await sleep(100);
  await page.click(btn("c")); await sleep(120);
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.focus(); t.select(); })()`); await page.key("Delete"); await sleep(700);
  check("deleting the whole text removes the note (no note key, outline icon)", !(await rec("c")).keys.includes("note") && !(await page.eval(`items.get('c').hasOwnProperty('note')`)));
  await page.key("Escape"); await sleep(100);
  // typing a long chunk: stops at 500
  await page.click(btn("a")); await sleep(120);
  await typeNote("x".repeat(520)); await sleep(700);
  same("typing 520 characters stops at 500", [await page.eval(`document.getElementById('noteText').value.length`), (await rec("a")).note.length, await page.eval(`document.getElementById('noteCount').textContent`)], [500, 500, "500 / 500"]);
  await typeNote("y");
  same("one more typed character at the limit is refused", await page.eval(`document.getElementById('noteText').value.length`), 500);
  check("the counter is emphasised at the limit", await page.eval(`document.getElementById('noteCount').classList.contains('full')`));
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.setSelectionRange(10, 10); })()`); await typeNote("Z");
  same("typing in the middle at the limit is refused too (the end is not cut)", [await page.eval(`document.getElementById('noteText').value.length`), await page.eval(`document.getElementById('noteText').value.includes('Z')`)], [500, false]);
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.setSelectionRange(10, 20); })()`); await typeNote("Z");
  same("typing over a selection at the limit works (selection replaced)", [await page.eval(`document.getElementById('noteText').value.length`), await page.eval(`document.getElementById('noteText').value.includes('Z')`)], [491, true]);
  // paste: synthetic paste events carrying a clipboard, as the app handles clipboard data itself
  const paste = (text, extra = "") => page.eval(`(()=>{ const t = document.getElementById('noteText'); const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(text)}); ${extra} const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); t.dispatchEvent(ev); return ev.defaultPrevented; })()`);
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); t.focus(); })()`); await sleep(50);
  await paste("p".repeat(900));
  same("pasting 900 characters keeps 500", await page.eval(`document.getElementById('noteText').value.length`), 500);
  same("...and says the paste was cut", await page.eval(`document.getElementById('noteMsg').textContent`), "Pasted text was cut to 500 characters");
  await sleep(700);
  same("the cut text is what is stored", (await rec("a")).note.length, 500);
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.value = 'q'.repeat(450); t.dispatchEvent(new Event('input', { bubbles: true })); t.setSelectionRange(450, 450); })()`);
  await paste("r".repeat(100));
  same("pasting 100 onto 450 fits 50 and cuts the rest, with the message", [await page.eval(`document.getElementById('noteText').value.length`), await page.eval(`document.getElementById('noteMsg').textContent`)], [500, "Pasted text was cut to 500 characters"]);
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.value = ''; t.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await paste("short");
  same("a paste that fits shows no message", [await page.eval(`document.getElementById('noteText').value`), await page.eval(`document.getElementById('noteMsg').textContent`)], ["short", ""]);
  const prevented = await page.eval(`(()=>{ const t = document.getElementById('noteText'); const dt = new DataTransfer(); dt.setData('text/html', '<b>bold</b> <img src=x>'); dt.setData('text/plain', 'plain only'); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); t.dispatchEvent(ev); return [t.value, t.innerHTML === undefined || t.children.length === 0, ev.defaultPrevented]; })()`);
  same("a paste with HTML on the clipboard inserts the plain text only", [prevented[0], prevented[1]], ["shortplain only", true]);
  await page.eval(`(()=>{ const t = document.getElementById('noteText'); t.value = 'e'.repeat(499) + '\u{1F600}\u{1F600}'.slice(0, 0); t.dispatchEvent(new Event('input', { bubbles: true })); t.setSelectionRange(499, 499); })()`);
  await paste("\u{1F600}\u{1F600}");
  same("emoji count as one character each and are not split at the limit", await page.eval(`Array.from(document.getElementById('noteText').value).length`), 500);
  await page.key("Escape"); await sleep(100);

  // ------------------------------------------------------------ paste, drop and global handlers
  console.log("== paste and drop inside the note box");
  await fresh();
  await page.eval(`document.getElementById('q').value = 'ra'; document.getElementById('q').dispatchEvent(new Event('input'))`); await sleep(100);
  await page.eval(`chooseChip('general'); 0`);
  const before = await page.eval(`({ n: items.size, chip: chipKey, q: document.getElementById('q').value, sel: selectedId })`);
  await page.click(btn("c")); await sleep(150);
  const imgPaste = await page.eval(`(async()=>{ const t = document.getElementById('noteText'); const dt = new DataTransfer(); dt.items.add(new File([await T.png(40, 30, 10)], 'clip.png', { type: 'image/png' })); const ev = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }); t.dispatchEvent(ev); await new Promise(r => setTimeout(r, 400)); return { n: items.size, text: t.value, msg: document.getElementById('msg').classList.contains('show') ? document.getElementById('msg').textContent : '' }; })()`);
  same("pasting an image inside the note box adds no image and puts nothing in the box", [imgPaste.n, imgPaste.text, imgPaste.msg], [before.n, "", ""]);
  const after = await page.eval(`({ n: items.size, chip: chipKey, q: document.getElementById('q').value, sel: selectedId })`);
  same("...and does not change the chip, the search text or the selection", after, before);
  await paste("hello");
  same("a text paste lands in the box (and not as an image)", [await page.eval(`document.getElementById('noteText').value`), await page.eval(`items.size`)], ["hello", before.n]);
  // files dropped on the box
  const dropFile = await page.eval(`(async()=>{ const t = document.getElementById('noteText'); const dt = new DataTransfer(); dt.items.add(new File([await T.png(40, 30, 10)], 'dropped.png', { type: 'image/png' })); const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }); t.dispatchEvent(ev); await new Promise(r => setTimeout(r, 400)); return { n: items.size, prevented: ev.defaultPrevented, toast: document.getElementById('msg').textContent, text: t.value, overlay: document.body.classList.contains('dragging') }; })()`);
  same("a file dropped on the note box adds no image, says so, and leaves the text alone", [dropFile.n, dropFile.prevented, /cannot be dropped on a note/.test(dropFile.toast), dropFile.text, dropFile.overlay], [before.n, true, true, "hello", false]);
  const dropText = await page.eval(`(()=>{ const t = document.getElementById('noteText'); const dt = new DataTransfer(); dt.setData('text/plain', 'dragged words'); const ev = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }); const notPrevented = t.dispatchEvent(ev); return { notPrevented, n: items.size, toast: document.getElementById('msg').classList.contains('show') ? document.getElementById('msg').textContent : '' }; })()`);
  check("text dropped on the box is left to the box: not prevented, no 'not an image' message, no image", dropText.notPrevented && dropText.n === before.n && !/not an image/.test(dropText.toast), dropText);
  const overBox = await page.eval(`(async()=>{ const t = document.getElementById('noteText'); const dt = new DataTransfer(); dt.items.add(new File([await T.png(10, 10, 1)], 'x.png', { type: 'image/png' })); window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true })); const showsBefore = document.body.classList.contains('dragging'); t.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true })); const over = document.body.classList.contains('dragging'); window.dispatchEvent(new DragEvent('dragleave', { dataTransfer: dt, bubbles: true, cancelable: true })); return { showsBefore, over }; })()`);
  same("the 'Drop to add' overlay shows while dragging in, and is off while over the note box", [overBox.showsBefore, overBox.over], [true, false]);
  const dropOutside = await page.eval(`(async()=>{ const dt = new DataTransfer(); dt.items.add(new File([await T.png(40, 30, 10)], 'ok.png', { type: 'image/png' })); const n0 = items.size; window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 500)); return items.size - n0; })()`);
  same("dropping a file elsewhere still adds the image (unchanged)", dropOutside, 1);
  await page.click(btn("c")); await sleep(120);
  // Esc, Space and other keys while typing
  await fresh();
  const ids = await page.eval(`T.vis().map(r => r.id)`);
  await page.click(`.item[data-id="${ids[0]}"] .thumb`); await page.click(`.item[data-id="${ids[1]}"] .thumb`, { modifiers: 2 }); await page.click(`.item[data-id="${ids[2]}"] .thumb`, { modifiers: 2 });
  const selBefore = await page.eval(`sel.slice()`);
  await page.click(btn(ids[3])); await sleep(120); await typeNote("typing with several images selected "); await page.key("Enter"); await typeNote("more");
  same("typing in the note box (including Enter and Space) leaves the multi-selection and the grid alone", [await page.eval(`sel.slice()`), await page.eval(`!!document.querySelector('.pgrid')`)], [selBefore, true]);
  await page.key("Escape"); await sleep(100);
  same("Esc in the note box closes the note only: the multi-selection is kept", [await page.eval(`document.getElementById('notePop').hidden`), await page.eval(`sel.length`)], [true, 3]);
  await page.eval(`document.activeElement.blur()`); await page.key("Escape"); await sleep(100);
  same("...and the next Esc, with focus elsewhere, does what it did before (reduces the selection)", await page.eval(`sel.length`), 1);
  await page.click(btn(ids[0])); await sleep(100);
  check("opening a note on an image does not select it or change the preview", await page.eval(`selectedId === ${JSON.stringify(ids[2])} || selectedId !== ${JSON.stringify(ids[0])}`));
  await page.key("Escape"); await sleep(100);

  // ------------------------------------------------------------ nothing else changed
  console.log("== search, preview, sort unchanged");
  await fresh();
  await page.eval(`document.getElementById('q').value = 'Existing note'; document.getElementById('q').dispatchEvent(new Event('input'))`); await sleep(100);
  same("search matches titles only: a word that is only in a note finds nothing", await page.eval(`T.vis().length`), 0);
  await page.eval(`document.getElementById('q').value = 'Bravo'; document.getElementById('q').dispatchEvent(new Event('input'))`); await sleep(100);
  same("...and a title still matches", await page.eval(`T.vis().map(r => r.id)`), ["b"]);
  await page.eval(`document.getElementById('q').value = ''; document.getElementById('q').dispatchEvent(new Event('input'))`);
  await page.click(`.item[data-id="b"] .thumb`); await sleep(120);
  check("the preview header does not show the note", await page.eval(`!document.getElementById('phead').textContent.includes('Existing note')`));
  same("chips, counts and sort are as before", await page.eval(`T.chipStr()`), "All:5* | General:5");
  await page.eval(`(()=>{ const s=document.getElementById('sortSel'); s.value='title-asc'; s.dispatchEvent(new Event('change')); })()`); await sleep(100);
  same("sorting by title is unchanged", await page.eval(`T.vis().map(r => r.title)`), ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]);

  // ------------------------------------------------------------ reload, discard, discard all
  console.log("== reload, Discard, Discard All");
  await fresh();
  await page.click(btn("a")); await sleep(120); await typeNote("Survives a restart"); await sleep(700); await page.key("Escape");
  await reload();
  same("the note survives a page reload", [(await rec("a")).note, await page.eval(`items.get('a').note`), await page.eval(`document.querySelector(${JSON.stringify(btn("a"))}).classList.contains('has')`)], ["Survives a restart", "Survives a restart", true]);
  same("the untouched record with a note is as stored; one without still has no note key", [(await rec("b")).note, (await rec("c")).keys.includes("note")], ["Existing note on Bravo\nsecond line", false]);
  await page.click(btn("a")); await sleep(120); await typeNote("!"); await page.key("Escape"); await sleep(700);
  same("a note typed, then Esc at once, is stored (nothing waits for a Save)", (await rec("a")).note, "Survives a restart!");
  await page.eval(`select('a')`); await sleep(100);
  await page.eval(`document.getElementById('discardBtn').click()`); await sleep(150); await page.eval(`document.getElementById('confirm').close('ok')`); await sleep(400);
  same("Discard removes the image and its note", [await rec("a"), await page.eval(`items.has('a')`), await page.eval(`document.querySelectorAll('.note-btn').length`)], [undefined, false, 4]);
  await reload();
  same("...and it stays gone after a reload", [await rec("a"), (await page.eval(`T.dump()`)).length], [undefined, 4]);
  await page.click(btn("b")); await sleep(120);
  await page.eval(`document.getElementById('discardAllBtn').click()`); await sleep(200);
  check("Discard All asks while a note pop-up is open (the pop-up closed first)", await page.eval(`document.getElementById('confirmAll').open`));
  await page.eval(`document.getElementById('caOk').click()`); await sleep(400);
  same("Discard All removes every image and every note, and closes the pop-up", [await page.eval(`T.dump()`), await page.eval(`document.getElementById('notePop').hidden`)], [[], true]);
  await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 2`);
  same("...and after a reload nothing is left", await page.eval(`T.dump()`), []);

  // ------------------------------------------------------------ Save leaves the note alone and does not include it
  console.log("== Save and Save All");
  await fresh([["a", "Alpha", 1, "SECRETNOTE-single-save"], ["b", "Bravo", 2, "SECRETNOTE-zip-b"], ["c", "Charlie", 3, null]]);
  const bytesOf = (name) => page.eval(`(async()=>{ const root = await navigator.storage.getDirectory(); const f = await (await root.getFileHandle(${JSON.stringify(name)})).getFile(); const u = new Uint8Array(await f.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=8192) s+=String.fromCharCode(...u.subarray(i,i+8192)); return btoa(s); })()`);
  const blobBytes = (id) => page.eval(`(async()=>{ const u = new Uint8Array(await items.get(${JSON.stringify(id)}).blob.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=8192) s+=String.fromCharCode(...u.subarray(i,i+8192)); return btoa(s); })()`);
  await page.eval(`select('a')`); await sleep(100); await page.eval(`document.getElementById('saveBtn').click()`); await sleep(700);
  const saved = Buffer.from(await bytesOf(await page.eval(`(async()=>{ const root = await navigator.storage.getDirectory(); for await (const [n] of root.entries()) if (n.startsWith('out1-')) return n; })()`)), "base64");
  check("single Save: the file is exactly the image (byte for byte) and holds no note text", saved.equals(Buffer.from(await blobBytes("a"), "base64")) && !saved.includes("SECRETNOTE"), { len: saved.length });
  same("single Save: the image is saved and its note is untouched", [await page.eval(`items.get('a').saved`), (await rec("a")).note, await page.eval(`document.querySelector(${JSON.stringify(btn("a"))}).classList.contains('has')`)], [true, "SECRETNOTE-single-save", true]);
  await page.eval(`document.getElementById('saveAllBtn').click()`); await sleep(1200);
  const zipName = await page.eval(`(async()=>{ const root = await navigator.storage.getDirectory(); for await (const [n] of root.entries()) if (n.startsWith('out2-')) return n; })()`);
  const zip = Buffer.from(await bytesOf(zipName), "base64");
  check("Save All: the zip holds the images only (no note text anywhere in it)", zip.length > 100 && !zip.includes("SECRETNOTE"), { len: zip.length });
  same("Save All: the notes are untouched afterwards", [(await rec("b")).note, await page.eval(`items.get('b').saved`)], ["SECRETNOTE-zip-b", true]);

  // ------------------------------------------------------------ position inside the window
  console.log("== pop-up position");
  const many = Array.from({ length: 30 }, (_, i) => ["i" + i, "Image " + i, i + 1, i % 3 === 0 ? "A note for image " + i + ".\n" + "More text here. ".repeat(12) : null]);
  await fresh(many);
  for (const [W, H] of [[1920, 1080], [1280, 800], [340, 800], [1280, 400]]) {
    await view(W, H); await sleep(300);
    for (const which of ["first", "last"]) {
      await page.eval(`(()=>{ const l = document.getElementById('list'); l.scrollTop = ${which === "last" ? "1e7" : "0"}; })()`); await sleep(150);
      const vis = await page.eval(`T.vis().map(r => r.id)`);
      // the first/last row is the first/last item in the list's scroll order; at 340 the list is one column, otherwise two (take the right-hand one of the last row too)
      const targets = which === "first" ? [vis[0], vis[Math.min(1, vis.length - 1)]] : [vis[vis.length - 1], vis[vis.length - 2]];
      for (const id of targets) {
        await hover(btn(id)); await sleep(60);
        const r = await popState();
        check(`position ${W}x${H}, ${which} item (${id}): the read-only pop-up is fully inside the window`, r.vis && inside(r.rect, W, H), { r, W, H, dbg: await page.eval(`(()=>{ const b = document.querySelector(${JSON.stringify(btn(id))}).getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { b: [b.x, b.y, b.width, b.height], at: e && (e.tagName + '.' + e.className), top: document.getElementById('list').scrollTop, active: document.activeElement && document.activeElement.tagName, mode: note.mode }; })()`) });
        await away(); await sleep(450);
        await page.click(btn(id)); await sleep(120);
        const e = await popState();
        const top = await page.eval(`(()=>{ const p = document.getElementById('notePop'), b = p.getBoundingClientRect(); const el = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { overList: !!p.closest('#list'), hit: !!el && p.contains(el) }; })()`);
        check(`position ${W}x${H}, ${which} item (${id}): the editor is fully inside the window, not clipped by the list, and on top`, e.edit && inside(e.rect, W, H) && !top.overList && top.hit, { e, top });
        const iconRect = await page.eval(`(()=>{ const b = document.querySelector(${JSON.stringify(btn(id))}).getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
        check(`position ${W}x${H}, ${which} item (${id}): the editor does not cover its own icon`, e.rect.y >= iconRect.y + iconRect.h - 0.5 || e.rect.y + e.rect.h <= iconRect.y + 0.5 || e.rect.x + e.rect.w <= iconRect.x + 0.5 || e.rect.x >= iconRect.x + iconRect.w - 0.5, { e: e.rect, iconRect });
        await page.key("Escape"); await sleep(80);
      }
    }
  }
  await view(1280, 800); await sleep(200);
  await page.click(btn("i0")); await sleep(120);
  const r0 = await popState(); await view(900, 700); await sleep(250); const r1 = await popState();
  check("resizing the window keeps an open editor inside the window", r1.edit && inside(r1.rect, 900, 700), { r0, r1 });
  await page.eval(`document.getElementById('list').scrollTop = 300`); await sleep(150);
  check("scrolling the list while the editor is open keeps it inside the window", inside((await popState()).rect, 900, 700));
  await page.key("Escape");
} catch (e) {
  fail++; failures.push("EXCEPTION " + e.message); console.log("EXCEPTION:", e.stack);
}
await page.close(); srv.kill();
console.log(`notes-browser: ${pass} passed, ${fail} failed`);
if (failures.length) console.log("failed:", failures.join("; "));
process.exit(fail ? 1 : 0);
