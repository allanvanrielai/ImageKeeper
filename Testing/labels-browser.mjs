// Browser tests for labels + filter chips (real Chrome, throwaway profile, own server port).
// Usage: node labels-browser.mjs <app folder> [only]   e.g. node labels-browser.mjs ../app scope
import path from "node:path";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";

const appDir = path.resolve(process.argv[2]), only = process.argv[3] || "";
const PORT = 47691, DBG = 9333, URL = `http://127.0.0.1:${PORT}/index.html`;
const serveFile = process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py";
const srv = await startServer(process.env.IK_PY || "python", serveFile, PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: 1280, height: 800 });
let pass = 0, fail = 0; const failures = [];
function check(name, ok, detail) { if (ok) pass++; else { fail++; failures.push(name); console.log("FAIL:", name, detail === undefined ? "" : JSON.stringify(detail)); } }
const same = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, expected: b });
const want = (g) => !only || only === g;


async function load() { await page.goto(URL); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 2`); }
async function reload() { await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 2`); }
const BASE = Date.parse("2026-09-01T10:00:00Z");
async function legacyRecords(n = 8, titles) {
  const t = titles || ["Alpha", "bravo 2", "Bravo 10", "Charlie", "delta", "Echo", "Foxtrot", "Golf"];
  return page.eval(`(async()=>{ const out=[]; for (let i=0;i<${n};i++){ const b=await T.png(80+i*10,60+i*5,i*40), th=await T.png(40,30,i*40); out.push({id:'legacy-'+i, title:${JSON.stringify(t)}[i], blob:b, thumb:th, type:'image/png', width:80+i*10, height:60+i*5, added:${BASE}+i*60000, saved:i%3===0}); } await T.seed(out); return out.length; })()`);
}
async function fresh(n = 8, titles) { await load(); await page.eval(`T.wipe()`); await legacyRecords(n, titles); await reload(); }
async function labelOf(id, text, how = "Enter") {
  const sel = `.item[data-id="${id}"] .label-in`;
  await page.click(sel); await page.insert(text); await page.key(how); await sleep(120);
}
const ids = (rows) => rows.map((r) => r.id);
const chipBtn = (k) => `#chips .chip[data-key="${k}"]`;
const dialogOpen = (id) => page.eval(`document.getElementById('${id}').open`);

try {
  // ---------------------------------------------------------------- migration
  if (want("migration")) {
    console.log("== migration (populated legacy store)");
    await fresh();
    const s0 = await page.eval(`T.dump()`);
    check("migration: 8 legacy records present, none has a label key", s0.length === 8 && s0.every((r) => !r.keys.includes("label")));
    const order0 = [...s0].sort((a, b) => b.added - a.added).map((r) => r.id);
    const rows = await page.eval(`T.rows()`);
    same("migration: list shows all 8 in the same (date, newest first) order", ids(rows), order0);
    check("migration: every image shows label General", rows.every((r) => r.label === "General"), rows.map((r) => r.label));
    same("migration: chips are All:8 | General:8, All selected", await page.eval(`T.chipStr()`), "All:8* | General:8");
    same("migration: titles unchanged", rows.map((r) => r.title), order0.map((id) => s0.find((x) => x.id === id).title));
    same("migration: store untouched after load (same keys, same sizes, no label written)", await page.eval(`T.dump()`), s0);
    await page.click(chipBtn("general")); await page.click(chipBtn("all")); await page.eval(`(()=>{const s=document.getElementById('sortSel'); s.value='title-asc'; s.dispatchEvent(new Event('change'));})()`);
    same("migration: store still untouched after chip clicks and a re-sort", await page.eval(`T.dump()`), s0);
    await reload();
    same("migration: store untouched after a reload", await page.eval(`T.dump()`), s0);
    same("migration: blobs intact (sizes) after reload", (await page.eval(`T.dump()`)).map((r) => r.blob), s0.map((r) => r.blob));
    const only1 = ids(await page.eval(`T.rows()`));
    await page.eval(`localStorage.setItem('imagekeeper-sort','date-desc')`); await reload();
    same("migration: order after reset to default sort is the original order", ids(await page.eval(`T.rows()`)), order0);
    await labelOf(order0[2], "Work");
    const s1 = await page.eval(`T.dump()`);
    const changed = s1.filter((r, i) => JSON.stringify(r) !== JSON.stringify(s0[i]));
    same("migration: only the relabelled image changed in the store", changed.map((r) => [r.id, r.label]), [[order0[2], "Work"]]);
    same("migration: all 8 still present", s1.length, 8);
  }

  // ---------------------------------------------------------------- one label per image
  if (want("label")) {
    console.log("== one label per image");
    await fresh();
    const o = ids(await page.eval(`T.rows()`));
    await labelOf(o[0], "Work");
    same("label: typed label applied", (await page.eval(`T.rows()`))[0].label, "Work");
    same("label: chips now All:8 | General:7 | Work:1", await page.eval(`T.chipStr()`), "All:8* | General:7 | Work:1");
    await labelOf(o[1], "work");
    same("label: case-insensitive match keeps the first form 'Work'", (await page.eval(`T.rows()`))[1].label, "Work");
    same("label: still one Work chip with 2", await page.eval(`T.chipStr()`), "All:8* | General:6 | Work:2");
    await labelOf(o[2], "WORK  ");
    same("label: trimmed + case-insensitive", (await page.eval(`T.rows()`))[2].label, "Work");
    await labelOf(o[0], "general");
    same("label: 'general' in any case means General", (await page.eval(`T.rows()`))[0].label, "General");
    await labelOf(o[1], "gEnErAl");
    same("label: 'gEnErAl' means General", (await page.eval(`T.rows()`))[1].label, "General");
    await labelOf(o[2], "Home");
    await page.click(`.item[data-id="${o[2]}"] .label-in`); await page.key("Backspace"); await page.key("Enter"); await sleep(100);
    same("label: clearing the field sets General", (await page.eval(`T.rows()`))[2].label, "General");
    same("label: Home chip gone when its last image was relabelled", await page.eval(`T.chipStr()`), "All:8* | General:8");
    await labelOf(o[3], "All");
    check("label: 'All' rejected with a short message", /reserved/.test(await page.eval(`document.getElementById('msg').textContent`)) && await page.eval(`document.getElementById('msg').classList.contains('show')`));
    same("label: after rejecting 'All' the image keeps its label and the field shows it", (await page.eval(`T.rows()`))[3].label, "General");
    await labelOf(o[3], "aLL");
    same("label: 'aLL' rejected too", (await page.eval(`T.rows()`))[3].label, "General");
    same("label: no 'All' label chip created", await page.eval(`T.chipStr()`), "All:8* | General:8");
    // 30 character limit
    await page.click(`.item[data-id="${o[4]}"] .label-in`); await page.insert("x".repeat(45)); await page.key("Enter"); await sleep(100);
    same("label: limited to 30 characters", (await page.eval(`T.rows()`))[4].label.length, 30);
    same("label: input has maxlength 30", await page.eval(`document.querySelector('.label-in').maxLength`), 30);
    // persistence
    await labelOf(o[5], "Holiday"); await sleep(500);
    const d = await page.eval(`T.dump()`);
    check("label: stored on the record", d.find((r) => r.id === o[5]).label === "Holiday" && d.find((r) => r.id === o[4]).label === "x".repeat(30));
    await reload();
    same("label: survives reload", (await page.eval(`T.rows()`)).find((r) => r.id === o[5]).label, "Holiday");
    // label sits on the date line, to the right of the date (the title line is full width)
    const geo = await page.eval(`(()=>{const li=document.querySelector('#list .item'), t=li.querySelector('.title').getBoundingClientRect(), l=li.querySelector('.label-in').getBoundingClientRect(), w=li.querySelector('.when').getBoundingClientRect(); return {tw:t.width, lw:l.width, liw: li.getBoundingClientRect().width, sameRowAsDate:Math.abs((w.top+w.height/2)-(l.top+l.height/2))<4, rightOfDate:l.left>=w.right-0.5, belowTitle:w.top>=t.bottom-1};})()`);
    console.log("   (info) at 1280px wide: item width", Math.round(geo.liw), "title", Math.round(geo.tw), "label", Math.round(geo.lw));
    check("label: label field is usable width (>= 80px) in the list item", geo.lw >= 80, geo);
    check("label: on the date line, right of the date, below the title", geo.sameRowAsDate && geo.rightOfDate && geo.belowTitle, geo);
    // the same label on a second image renamed case: new image created after label
    await page.eval(`T.add('paste',1)`); await sleep(200);
    same("label: pasted image is General", (await page.eval(`T.rows()`))[0].label, "General");
  }

  // ---------------------------------------------------------------- chips
  if (want("chips")) {
    console.log("== chips, counts, filter, search, sort, memory");
    await fresh(8, ["Alpha", "bravo 2", "Bravo 10", "Charlie", "delta", "Echo", "Foxtrot", "Golf"]);
    const o = ids(await page.eval(`T.rows()`));             // newest first: Golf Foxtrot Echo delta Charlie Bravo10 bravo2 Alpha
    await labelOf(o[0], "zed"); await labelOf(o[1], "Beta"); await labelOf(o[2], "alpha"); await labelOf(o[3], "Beta"); await labelOf(o[4], "Item 10"); await labelOf(o[5], "Item 2");
    same("chips: All, General, then alphabetical", await page.eval(`T.chipStr()`), "All:8* | General:2 | alpha:1 | Beta:2 | Item 2:1 | Item 10:1 | zed:1");
    await page.click(chipBtn("beta"));
    same("chips: selecting a chip filters the list", (await page.eval(`T.vis()`)).map((r) => r.title), ["Foxtrot", "delta"]);
    check("chips: active chip has aria-pressed", await page.eval(`document.querySelector('.chip[data-key=beta]').getAttribute('aria-pressed')`) === "true");
    check("chips: active chip has a mark besides colour (check mark) and heavier weight", await page.eval(`(()=>{const b=document.querySelector('.chip[data-key=beta]'), n=b.querySelector('.cn'); const mark=getComputedStyle(n,'::before').content; const w=+getComputedStyle(b).fontWeight, w2=+getComputedStyle(document.querySelector('.chip[data-key=all]')).fontWeight; return mark.includes('\\u2713') && w>w2;})()`));
    check("chips: inactive chip has no mark", await page.eval(`!getComputedStyle(document.querySelector('.chip[data-key=all] .cn'),'::before').content.includes('\u2713')`));
    await page.click("#q"); await page.insert("fox");
    same("chips: search filters within the selected chip", (await page.eval(`T.vis()`)).map((r) => r.title), ["Foxtrot"]);
    await page.eval(`document.getElementById('q').value=''; document.getElementById('q').dispatchEvent(new Event('input'))`);
    await page.eval(`(()=>{const s=document.getElementById('sortSel'); s.value='title-asc'; s.dispatchEvent(new Event('change'));})()`);
    same("chips: sort applies within the filtered view (A-Z)", (await page.eval(`T.vis()`)).map((r) => r.title), ["delta", "Foxtrot"]);
    await page.eval(`(()=>{const s=document.getElementById('sortSel'); s.value='title-desc'; s.dispatchEvent(new Event('change'));})()`);
    same("chips: sort Z-A within chip", (await page.eval(`T.vis()`)).map((r) => r.title), ["Foxtrot", "delta"]);
    await page.eval(`(()=>{const s=document.getElementById('sortSel'); s.value='date-desc'; s.dispatchEvent(new Event('change'));})()`);
    await page.click(chipBtn("all"));
    same("chips: All shows everything", (await page.eval(`T.vis()`)).length, 8);
    await page.click(chipBtn("general"));
    same("chips: General shows the General ones", (await page.eval(`T.vis()`)).map((r) => r.title), ["bravo 2", "Alpha"]);
    same("chips: General has 2", (await page.eval(`T.vis()`)).length, 2);
    // remembered across reload
    await page.click(chipBtn("beta")); await reload();
    same("chips: selected chip remembered across reload", await page.eval(`T.chipStr()`), "All:8 | General:2 | alpha:1 | Beta:2* | Item 2:1 | Item 10:1 | zed:1");
    same("chips: list is filtered after reload", (await page.eval(`T.vis()`)).length, 2);
    check("chips: stored in localStorage like the sort order (key imagekeeper-label)", await page.eval(`localStorage.getItem('imagekeeper-label')`) === "beta");
    // unknown remembered chip -> All
    await page.eval(`localStorage.setItem('imagekeeper-label','ghost')`); await reload();
    check("chips: remembered label that no longer exists -> All", (await page.eval(`T.chips()`)).find((c) => c.on).key === "all");
    await page.eval(`localStorage.setItem('imagekeeper-label','<b>')`); await reload();
    check("chips: junk stored value -> All", (await page.eval(`T.chips()`)).find((c) => c.on).key === "all");
    // selected chip vanishes -> All
    await page.click(chipBtn("zed")); const zid = (await page.eval(`T.vis()`))[0].id;
    await labelOf(zid, "General");
    same("chips: selected chip disappears when its last image is relabelled -> falls back to All", (await page.eval(`T.chips()`)).find((c) => c.on).key, "all");
    check("chips: zed chip gone", !(await page.eval(`T.chips()`)).some((c) => c.key === "zed"));
    // General with zero
    for (const r of (await page.eval(`T.rows()`)).filter((r) => r.label === "General")) await labelOf(r.id, "Other");
    const cs = await page.eval(`T.chipStr()`);
    check("chips: General stays visible with 0", /General:0/.test(cs), cs);
    await page.click(chipBtn("general"));
    check("chips: empty General shows an empty list with a note", await page.eval(`document.querySelector('#list .nomatch') && /General/.test(document.querySelector('#list .nomatch').textContent)`));
    check("chips: Discard All disabled for an empty chip", await page.eval(`document.getElementById('discardAllBtn').disabled`));
    check("chips: Rename disabled for General", await page.eval(`document.getElementById('renameBtn').disabled`));
    await page.click(chipBtn("all"));
    check("chips: Rename disabled for All", await page.eval(`document.getElementById('renameBtn').disabled`));
    check("chips: General and All have no way to be deleted or renamed (no extra controls on them)", await page.eval(`document.querySelectorAll('#chips .chip button, #chips .chip input').length === 0`));
    // wrapping
    for (let i = 0; i < 14; i++) await page.eval(`(()=>{const it=[...items.values()][${i % 8}]; it.label='Wrap label number ' + ${i}; })()`);
    await page.eval(`renderChips()`);
    const wrap = await page.eval(`(()=>{const b=document.getElementById('chips'), r=b.getBoundingClientRect(), tops=new Set([...b.children].map(c=>Math.round(c.getBoundingClientRect().top))); const side=document.getElementById('side').getBoundingClientRect(); return {rows:tops.size, scroll:b.scrollWidth<=b.clientWidth+1, w:r.width, right:r.right, sideRight:side.right};})()`);
    check("chips: many labels wrap onto more lines and never overflow sideways", wrap.rows > 1 && wrap.scroll && wrap.right <= wrap.sideRight + 1, wrap);
  }

  // ---------------------------------------------------------------- new image resets view
  if (want("newimage")) {
    console.log("== a new image resets the view");
    await fresh();
    let o = ids(await page.eval(`T.rows()`));
    await labelOf(o[0], "Work"); await labelOf(o[1], "Work"); await page.click(chipBtn("work"));
    await page.click("#q"); await page.insert("zzz-nothing");
    same("newimage: precondition: search hides everything in Work", (await page.eval(`T.vis()`)).length, 0);
    const n = await page.eval(`T.add('paste',1)`);
    const st = await page.eval(`({chip:chipKey, sel:selectedId, q:document.getElementById('q').value, vis:T.vis().map(r=>r.id), rows:T.rows()})`);
    same("newimage: paste while 'Work' is selected switches to General", (await page.eval(`T.chips()`)).find((c) => c.on).key, "general");
    check("newimage: the new image is visible, selected and General", st.vis.includes(st.sel) && st.rows.find((r) => r.id === st.sel).label === "General", st);
    same("newimage: search is cleared as before", st.q, "");
    check("newimage: new image has General in its field", st.rows.find((r) => r.id === st.sel).label === "General");
    // drop of two
    await page.click(chipBtn("work"));
    await page.eval(`T.add('drop',2)`);
    const st2 = await page.eval(`({chip:chipKey, vis:T.vis().length, general:T.chips().find(c=>c.key==='general').count})`);
    same("newimage: drop of 2 switches to General too", st2.chip, "general");
    same("newimage: both new images are shown in General (6 General: 5 old + ... )", st2.vis, st2.general);
    // All stays All
    await page.click(chipBtn("all"));
    await page.eval(`T.add('paste',1)`);
    same("newimage: with All selected, All stays selected", (await page.eval(`T.chips()`)).find((c) => c.on).key, "all");
    check("newimage: and the new image is visible and selected", await page.eval(`(()=>{const r=T.rows().find(r=>r.id===selectedId); return !!r && !r.hidden && r.label==='General'})()`));
    // General stays General
    await page.click(chipBtn("general")); await page.eval(`T.add('paste',1)`);
    same("newimage: with General selected, stays General", (await page.eval(`T.chips()`)).find((c) => c.on).key, "general");
    // remembered
    await reload();
    same("newimage: the switched chip is the remembered one after reload", (await page.eval(`T.chips()`)).find((c) => c.on).key, "general");
    // search still cleared when All selected
    await page.click(chipBtn("all")); await page.click("#q"); await page.insert("zzz");
    await page.eval(`T.add('drop',1)`);
    same("newimage: search cleared on add with All selected", await page.eval(`document.getElementById('q').value`), "");
  }

  // ---------------------------------------------------------------- rename / merge
  if (want("rename")) {
    console.log("== rename and merge a label");
    await fresh();
    let o = ids(await page.eval(`T.rows()`));
    await labelOf(o[0], "Work"); await labelOf(o[1], "Work"); await labelOf(o[2], "Home"); await labelOf(o[3], "Misc");
    await page.click(chipBtn("work"));
    check("rename: button enabled for a custom label", !(await page.eval(`document.getElementById('renameBtn').disabled`)));
    await page.click("#renameBtn");
    check("rename: dialog opens with current name prefilled and selected", await dialogOpen("renameDlg") && await page.eval(`document.getElementById('rnInput').value`) === "Work" && await page.eval(`document.activeElement.id`) === "rnInput");
    await page.key("Escape"); await sleep(100);
    check("rename: Esc cancels, nothing changed", !(await dialogOpen("renameDlg")) && (await page.eval(`T.chipStr()`)).includes("Work:2"));
    await page.click("#renameBtn"); await page.insert("Projects"); await page.key("Enter"); await sleep(250);
    same("rename: renamed on every image with that label", await page.eval(`T.chipStr()`), "All:8 | General:4 | Home:1 | Misc:1 | Projects:2*");
    same("rename: the two images now say Projects", (await page.eval(`T.rows()`)).filter((r) => r.label === "Projects").length, 2);
    await sleep(300);
    const dd = await page.eval(`T.dump()`);
    same("rename: stored on both records", dd.filter((r) => r.label === "Projects").length, 2);
    await reload();
    same("rename: persisted; selected chip is the new name after reload", await page.eval(`T.chipStr()`), "All:8 | General:4 | Home:1 | Misc:1 | Projects:2*");
    // case only
    await page.click("#renameBtn"); await page.insert("PROJECTS"); await page.click("#rnOk"); await sleep(250);
    same("rename: case-only change is a rename, not a merge (no confirm)", await page.eval(`T.chipStr()`), "All:8 | General:4 | Home:1 | Misc:1 | PROJECTS:2*");
    check("rename: no merge dialog for case change", !(await dialogOpen("mergeDlg")));
    // errors
    await page.click("#renameBtn"); await page.insert("all"); await page.click("#rnOk"); await sleep(100);
    check("rename: 'All' rejected inside the dialog", await dialogOpen("renameDlg") && !(await page.eval(`document.getElementById('rnErr').hidden`)) && /reserved/.test(await page.eval(`document.getElementById('rnErr').textContent`)));
    await page.key("Backspace"); await page.eval(`(()=>{const i=document.getElementById('rnInput'); i.select();})()`); await page.key("Delete"); await page.click("#rnOk");
    check("rename: empty name rejected (not turned into General)", await dialogOpen("renameDlg") && !(await page.eval(`document.getElementById('rnErr').hidden`)));
    await page.click("#rnCancel"); await sleep(100);
    same("rename: cancel leaves labels alone", await page.eval(`T.chipStr()`), "All:8 | General:4 | Home:1 | Misc:1 | PROJECTS:2*");
    // merge, cancel
    await page.click("#renameBtn"); await page.insert("home"); await page.click("#rnOk"); await sleep(150);
    check("merge: asks for confirmation when the name matches another label (case-insensitive)", await dialogOpen("mergeDlg"));
    check("merge: dialog names both labels and counts", await page.eval(`(()=>{const t=document.getElementById('mgTitle').textContent+document.getElementById('mgBody').textContent; return t.includes('PROJECTS')&&t.includes('Home')&&t.includes('2 images')&&t.includes('1 image');})()`));
    check("merge: Cancel has the focus", await page.eval(`document.activeElement.id`) === "mgCancel");
    await page.click("#mgCancel"); await sleep(150);
    same("merge: cancelling changes nothing", await page.eval(`T.chipStr()`), "All:8 | General:4 | Home:1 | Misc:1 | PROJECTS:2*");
    await page.click("#renameBtn"); await page.insert("home"); await page.click("#rnOk"); await sleep(150); await page.click("#mgOk"); await sleep(300);
    same("merge: confirmed, images joined the existing label with its display form 'Home'", await page.eval(`T.chipStr()`), "All:8 | General:4 | Home:3* | Misc:1");
    check("merge: stored", (await page.eval(`T.dump()`)).filter((r) => r.label === "Home").length === 3);
    // merge into General
    await page.click(chipBtn("misc")); await page.click("#renameBtn"); await page.insert("GENERAL"); await page.click("#rnOk"); await sleep(150);
    check("merge into General asks first", await dialogOpen("mergeDlg"));
    await page.click("#mgOk"); await sleep(300);
    same("merge into General works and General is selected", await page.eval(`T.chipStr()`), "All:8 | General:5* | Home:3");
    check("merge: Misc is gone", !(await page.eval(`T.chips()`)).some((c) => c.key === "misc"));
    // Esc on merge dialog = cancel
    await page.click(chipBtn("home")); await page.click("#renameBtn"); await page.insert("general"); await page.click("#rnOk"); await sleep(150); await page.key("Escape"); await sleep(150);
    same("merge: Esc cancels", await page.eval(`T.chipStr()`), "All:8 | General:5 | Home:3*");
    // Single image label change is separate and always allowed (even General -> something)
    await page.click(chipBtn("all"));
    const g = (await page.eval(`T.rows()`)).find((r) => r.label === "General").id;
    await labelOf(g, "Fresh");
    same("rename: single-image relabel still allowed", (await page.eval(`T.rows()`)).find((r) => r.id === g).label, "Fresh");
  }

  // ---------------------------------------------------------------- discard all scope
  if (want("scope")) {
    console.log("== Discard All scope");
    await fresh();
    let o = ids(await page.eval(`T.rows()`));         // legacy: saved when index%3==0 -> legacy-0, 3, 6
    await labelOf(o[0], "Work"); await labelOf(o[1], "Work"); await labelOf(o[2], "Work"); await labelOf(o[3], "Home");
    const total = (await page.eval(`T.dump()`)).length;
    // chip Work: 3 images
    await page.click(chipBtn("work")); await page.click("#discardAllBtn"); await sleep(100);
    const dlg = await page.eval(`({open:document.getElementById('confirmAll').open, title:document.getElementById('caTitle').textContent, label:document.getElementById('caLabel').textContent, saved:document.getElementById('caSaved').textContent, ok:document.getElementById('caOk').textContent, focus:document.activeElement.id})`);
    check("scope: dialog names the label and the count", dlg.open && dlg.title === "Discard all 3 images labelled \u201cWork\u201d?" && dlg.label === "Label: Work" && dlg.ok === "Discard all 3", dlg);
    check("scope: Cancel has the focus", dlg.focus === "caCancel");
    await page.click("#caCancel"); await sleep(100);
    same("scope: Cancel removes nothing", (await page.eval(`T.dump()`)).length, total);
    await page.click("#discardAllBtn"); await sleep(100); await page.key("Escape"); await sleep(100);
    same("scope: Esc removes nothing", (await page.eval(`T.dump()`)).length, total);
    // search hides one in scope -> dialog mentions hidden
    await page.click("#q"); await page.insert(String(await page.eval(`T.rows().find(r=>r.id==='${o[0]}').title`)));
    await page.click("#discardAllBtn"); await sleep(100);
    check("scope: 'hidden by the current search' counts only images in the scope", await page.eval(`(()=>{const h=document.getElementById('caHidden'); return !h.hidden && /Including 2 hidden/.test(h.textContent)})()`));
    await page.click("#caCancel"); await sleep(100);
    await page.eval(`document.getElementById('q').value=''; document.getElementById('q').dispatchEvent(new Event('input'))`);
    await page.click("#discardAllBtn"); await sleep(100);
    const before = await page.eval(`T.dump()`);
    await page.click("#caOk"); await sleep(400);
    const after = await page.eval(`T.dump()`);
    same("scope: only the 3 Work images were discarded from the store", after.length, total - 3);
    check("scope: exactly the Work images are gone, the rest untouched", before.filter((r) => !o.slice(0, 3).includes(r.id)).every((r) => after.some((a) => JSON.stringify(a) === JSON.stringify(r))) && !after.some((a) => o.slice(0, 3).includes(a.id)));
    same("scope: chip Work gone, falls back to All, others intact", await page.eval(`T.chipStr()`), "All:5* | General:4 | Home:1");
    same("scope: list shows the 5 remaining", (await page.eval(`T.vis()`)).length, 5);
    await reload();
    same("scope: remaining 5 after reload", await page.eval(`T.chipStr()`), "All:5* | General:4 | Home:1");
    // General chip
    await page.click(chipBtn("general")); await page.click("#discardAllBtn"); await sleep(100);
    const t2 = await page.eval(`document.getElementById('caTitle').textContent`);
    same("scope: General dialog", t2, "Discard all 4 images labelled \u201cGeneral\u201d?");
    await page.click("#caOk"); await sleep(400);
    same("scope: only General discarded; Home remains", (await page.eval(`T.dump()`)).map((r) => r.label), ["Home"]);
    same("scope: General chip stays (0)", await page.eval(`T.chipStr()`), "All:1 | General:0* | Home:1");
    // single-image dialog wording
    await page.click(chipBtn("home")); await page.click("#discardAllBtn"); await sleep(100);
    same("scope: singular wording", await page.eval(`document.getElementById('caTitle').textContent`), "Discard 1 image labelled \u201cHome\u201d?");
    await page.click("#caCancel"); await sleep(100);
    // All = everything
    await fresh();
    o = ids(await page.eval(`T.rows()`)); await labelOf(o[0], "Work");
    await page.click("#discardAllBtn"); await sleep(100);
    const t3 = await page.eval(`({t:document.getElementById('caTitle').textContent, l:document.getElementById('caLabel').textContent, s:document.getElementById('caSaved').textContent})`);
    check("scope: with All selected the existing wording stays and says label All", t3.t === "Discard all 8 images?" && t3.l === "Label: All (every label)" && /not saved/.test(t3.s), t3);
    await page.click("#caOk"); await sleep(400);
    same("scope: All discards everything", [(await page.eval(`T.dump()`)).length, await page.eval(`T.chipStr()`)], [0, "All:0* | General:0"]);
    check("scope: Discard All disabled when nothing is left", await page.eval(`document.getElementById('discardAllBtn').disabled`));
  }

  // ---------------------------------------------------------------- keyboard combobox
  if (want("combo")) {
    console.log("== label field: suggestions and keyboard");
    await fresh();
    let o = ids(await page.eval(`T.rows()`));
    await labelOf(o[0], "Work"); await labelOf(o[1], "Wedding"); await labelOf(o[2], "Home");
    const sel = (id) => `.item[data-id="${id}"] .label-in`;
    const pop = () => page.eval(`({hidden:document.getElementById('labelPop').hidden, opts:[...document.querySelectorAll('#labelPop .opt')].map(o=>o.textContent), sel:[...document.querySelectorAll('#labelPop .opt')].findIndex(o=>o.getAttribute('aria-selected')==='true'), expanded:document.activeElement.getAttribute('aria-expanded')})`);
    await page.click(sel(o[5]));
    let p = await pop();
    check("combo: focusing shows the labels in use", !p.hidden && p.opts.join("|") === "General (5)|Home (1)|Wedding (1)|Work (1)", p);
    check("combo: aria-expanded true while open", p.expanded === "true");
    await page.key("ArrowDown"); p = await pop(); same("combo: ArrowDown highlights the first", p.sel, 0);
    await page.key("ArrowDown"); await page.key("ArrowDown"); p = await pop(); same("combo: ArrowDown moves on", p.sel, 2);
    check("combo: aria-activedescendant follows", await page.eval(`document.activeElement.getAttribute('aria-activedescendant')`) === "labelOpt2");
    await page.key("ArrowUp"); p = await pop(); same("combo: ArrowUp moves back", p.sel, 1);
    await page.key("ArrowUp"); await page.key("ArrowUp"); p = await pop(); same("combo: ArrowUp wraps to the last", p.sel, 3);
    await page.key("ArrowDown"); p = await pop(); same("combo: ArrowDown wraps to the first", p.sel, 0);
    await page.key("ArrowDown"); await page.key("Enter"); await sleep(120);
    same("combo: Enter chooses the highlighted suggestion (Home)", (await page.eval(`T.rows()`)).find((r) => r.id === o[5]).label, "Home");
    check("combo: popup closed after choosing", (await pop()).hidden);
    // typing filters
    await page.click(sel(o[6])); await page.insert("w"); p = await pop();
    same("combo: typing filters (substring, case-insensitive) and offers Create", p.opts, ["Wedding (1)", "Work (1)", "Create \u201cw\u201d"]);
    await page.key("Escape"); await sleep(100);
    same("combo: Esc cancels: label unchanged and field restored", (await page.eval(`T.rows()`)).find((r) => r.id === o[6]).label, "General");
    check("combo: Esc closed the popup and left the field", (await pop()).hidden && await page.eval(`document.activeElement.className !== 'label-in'`));
    // Enter with nothing highlighted and nothing matching creates
    await page.click(sel(o[6])); await page.insert("Zebra"); p = await pop();
    same("combo: nothing matches -> only the Create entry", p.opts, ["Create \u201cZebra\u201d"]);
    await page.key("Enter"); await sleep(120);
    same("combo: Enter creates a new label when nothing matches", (await page.eval(`T.rows()`)).find((r) => r.id === o[6]).label, "Zebra");
    same("combo: new label appears as a chip", (await page.eval(`T.chips()`)).some((c) => c.name === "Zebra" && c.count === 1), true);
    // Enter with partial text and nothing highlighted creates what was typed
    await page.click(sel(o[7])); await page.insert("Wor"); await page.key("Enter"); await sleep(120);
    same("combo: Enter on typed text with nothing highlighted uses the typed text", (await page.eval(`T.rows()`)).find((r) => r.id === o[7]).label, "Wor");
    // case-insensitive exact typed -> existing form
    await page.click(sel(o[3])); await page.insert("wedding"); await page.key("Enter"); await sleep(120);
    same("combo: typed case-variant resolves to existing 'Wedding'", (await page.eval(`T.rows()`)).find((r) => r.id === o[3]).label, "Wedding");
    // mouse choose
    await page.click(sel(o[4])); await page.insert("work");
    await page.click("#labelPop .opt"); await sleep(150);
    same("combo: clicking a suggestion chooses it", (await page.eval(`T.rows()`)).find((r) => r.id === o[4]).label, "Work");
    // typing 'all' shows nothing to create
    await page.click(sel(o[4])); await page.insert("all"); p = await pop();
    check("combo: typing 'all' offers no 'create All'", !p.opts.some((x) => /Create/.test(x)), p);
    await page.key("Enter"); await sleep(120);
    same("combo: Enter on 'all' keeps the label", (await page.eval(`T.rows()`)).find((r) => r.id === o[4]).label, "Work");
    check("combo: Tab leaves the field and keeps what was typed", await (async () => { await page.click(sel(o[0])); await page.insert("Tabbed"); await page.key("Tab"); await sleep(120); return (await page.eval(`T.rows()`)).find((r) => r.id === o[0]).label === "Tabbed"; })());
    // popup stays inside the viewport
    await page.click(sel(o[7]));
    const box = await page.eval(`(()=>{const r=document.getElementById('labelPop').getBoundingClientRect(); return {l:r.left,r:r.right,t:r.top,b:r.bottom,iw:innerWidth,ih:innerHeight}})()`);
    check("combo: popup inside the window", box.l >= 0 && box.r <= box.iw && box.t >= 0 && box.b <= box.ih, box);
    await page.key("Escape");
  }

  // ---------------------------------------------------------------- existing behaviour (regression)
  if (want("regress")) {
    console.log("== existing behaviour still works");
    await fresh(8, ["Alpha", "bravo 2", "Bravo 10", "Charlie", "delta", "Echo", "Foxtrot", "Golf"]);
    const sortTo = (v) => page.eval(`(()=>{const s=document.getElementById('sortSel'); s.value='${v}'; s.dispatchEvent(new Event('change'));})()`);
    same("regress: date newest first", (await page.eval(`T.vis()`)).map((r) => r.title), ["Golf", "Foxtrot", "Echo", "delta", "Charlie", "Bravo 10", "bravo 2", "Alpha"]);
    await sortTo("date-asc"); same("regress: date oldest first", (await page.eval(`T.vis()`)).map((r) => r.title), ["Alpha", "bravo 2", "Bravo 10", "Charlie", "delta", "Echo", "Foxtrot", "Golf"]);
    await sortTo("title-asc"); same("regress: title A-Z (numeric, case-insensitive)", (await page.eval(`T.vis()`)).map((r) => r.title), ["Alpha", "bravo 2", "Bravo 10", "Charlie", "delta", "Echo", "Foxtrot", "Golf"]);
    await sortTo("title-desc"); same("regress: title Z-A", (await page.eval(`T.vis()`)).map((r) => r.title), ["Golf", "Foxtrot", "Echo", "delta", "Charlie", "Bravo 10", "bravo 2", "Alpha"]);
    await sortTo("date-desc");
    await page.click("#q"); await page.insert("bra");
    same("regress: search by title", (await page.eval(`T.vis()`)).map((r) => r.title), ["Bravo 10", "bravo 2"]);
    await page.eval(`document.getElementById('q').value='nomatch'; document.getElementById('q').dispatchEvent(new Event('input'))`);
    check("regress: 'No images match.' text", await page.eval(`document.querySelector('#list .nomatch').textContent`) === "No images match.");
    await page.eval(`document.getElementById('q').value=''; document.getElementById('q').dispatchEvent(new Event('input'))`);
    // title rename persists
    const first = (await page.eval(`T.rows()`))[0].id;
    await page.click(`.item[data-id="${first}"] .title`); await page.eval(`document.querySelector('.item[data-id="${first}"] .title').select()`); await page.insert("Renamed Golf"); await page.key("Enter"); await sleep(600);
    same("regress: title edit saved", (await page.eval(`T.dump()`)).find((r) => r.id === first).title, "Renamed Golf");
    // per-image discard (unsaved asks)
    await page.click(`.item[data-id="${first}"]`); await page.click("#discardBtn"); await sleep(120);
    check("regress: single discard asks about unsaved image", await dialogOpen("confirm"));
    await page.eval(`document.querySelector('#confirm button[value=ok]').click()`); await sleep(300);
    same("regress: single discard removes it", (await page.eval(`T.dump()`)).length, 7);
    // theme + profile
    await page.click("#themeBtn"); check("regress: theme toggles", ["dark", "light"].includes(await page.eval(`document.documentElement.getAttribute('data-theme')`)));
    check("regress: profile choice offered (mint file present)", !(await page.eval(`document.getElementById('profileBox').hidden`)));
    await page.click(`#profileBox button[data-profile="mint"]`);
    check("regress: Mint applies", await page.eval(`document.documentElement.getAttribute('data-profile')`) === "mint");
    await page.click(`#profileBox button[data-profile="default"]`);
    // Mint file absent
    await page.send("Network.enable"); await page.send("Network.setBlockedURLs", { urls: ["*mint-profile.js"] });
    await page.eval(`localStorage.setItem('imagekeeper-profile','mint')`); await reload();
    check("regress: Mint file absent: app runs, no Mint profile, chips render", await page.eval(`!window.NoteTakerMint && !document.documentElement.getAttribute('data-profile') && document.querySelectorAll('#chips .chip').length>=2 && document.querySelectorAll('#list .item').length===7`));
    const ids2 = ids(await page.eval(`T.rows()`)); await labelOf(ids2[0], "NoMint");
    check("regress: Mint file absent: labels work", (await page.eval(`T.chipStr()`)).includes("NoMint:1"));
    await page.send("Network.setBlockedURLs", { urls: [] }); await page.eval(`localStorage.setItem('imagekeeper-profile','default')`);
  }

  // ---------------------------------------------------------------- failure safety
  if (want("safety")) {
    console.log("== failure safety");
    await fresh();
    const before = await page.eval(`T.dump()`);
    // make the rename write fail: patch dbPutMany to reject
    let o = ids(await page.eval(`T.rows()`)); await labelOf(o[0], "Work"); await labelOf(o[1], "Work"); await sleep(400);
    await page.eval(`window.__db = db; db = { transaction() { throw new Error('boom'); } }`);
    await page.click(chipBtn("work")); await page.click("#renameBtn"); await page.insert("Nope"); await page.click("#rnOk"); await sleep(300);
    same("safety: failed rename write leaves labels as they were", await page.eval(`T.chipStr()`), "All:8 | General:6 | Work:2*");
    check("safety: and shows an error banner", await page.eval(`!!document.querySelector('.banner.err')`));
    
    await page.eval(`document.querySelectorAll('.banner').forEach((b) => b.remove())`);
    await page.click("#discardAllBtn"); await sleep(100); await page.click("#caOk"); await sleep(300);
    
    same("safety: and the list still has 8", (await page.eval(`T.rows()`)).length, 8);
    check("safety: and shows an error banner (discard)", await page.eval(`!!document.querySelector('.banner.err')`));
    await page.eval(`db = window.__db`);
    same("safety: store unchanged by the failed operations", (await page.eval(`T.dump()`)).map((r) => r.id), before.map((r) => r.id));
  }
  // ---------------------------------------------------------------- layout: label beside the date, date format, label pill
  if (want("layout")) {
    console.log("== label beside the date, date format");
    await fresh();
    const o = ids(await page.eval(`T.rows()`));
    const LONG = "T".repeat(120), L30 = "Quarterly report drafts 2026xx".slice(0, 30);
    await page.eval(`(()=>{ const it = items.get(${JSON.stringify(o[0])}); it.title = ${JSON.stringify(LONG)}; })()`);
    await labelOf(o[0], L30);
    same("layout: the test label is 30 characters", L30.length, 30);
    await page.eval(`buildRows()`); await sleep(100);
    const sel = `.item[data-id="${o[0]}"]`;
    const measure = () => page.eval(`(()=>{ const li=document.querySelector(${JSON.stringify(sel)}), q=(s)=>li.querySelector(s), r=(e)=>e.getBoundingClientRect(), d=q('.when'), l=q('.label-in'), t=q('.title'), s=q('.s');
      return { item:r(li).width, title:r(t).width, date:r(d).width, dateClipped:d.scrollWidth>d.clientWidth+0.5, label:r(l).width, sameLine:Math.abs((r(d).top+r(d).height/2)-(r(l).top+r(l).height/2))<4, order:r(l).left>=r(d).right-0.5, inside:r(l).right<=r(s).right+0.5, overflow:s.scrollWidth>s.clientWidth+0.5, ellipsis:getComputedStyle(l).textOverflow, hscroll:document.documentElement.scrollWidth>innerWidth, titleFull:Math.abs(r(t).width-(r(li).width-14))<3, text:d.textContent }; })()`);
    // 1920 x 1080 is the real window; 1280 the laptop case; 821 the narrowest two-column layout; 820 and below one column; 340 the narrowest width without a sideways scrollbar (below ~336 the header theme button overflows, which is not part of the list item)
    for (const w of [1920, 1280, 1024, 821, 820, 600, 400, 340]) {
      await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: w >= 1920 ? 1080 : 800, deviceScaleFactor: 1, mobile: false }); await sleep(250);
      const g = await measure();
      console.log(`   (info) ${w}px: item ${Math.round(g.item)}, title ${Math.round(g.title)}, date ${Math.round(g.date)} ("${g.text}"), label field ${Math.round(g.label)}${g.label < 80 ? "  <-- under 80px" : ""}`);
      check(`layout ${w}: date never truncated`, !g.dateClipped, g);
      check(`layout ${w}: date and label on one line, label right of the date, nothing overflows the row`, g.sameLine && g.order && g.inside && !g.overflow, g);
      check(`layout ${w}: title line is full width`, g.titleFull, g);
      check(`layout ${w}: label field has an ellipsis; a 30-character label and a long title cause no horizontal scroll`, g.ellipsis === "ellipsis" && !g.hscroll, g);
      if (w >= 1280) check(`layout ${w}: label field is usable (>= 80px) next to the date`, g.label >= 80, g);
    }
    await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(200);
    // pill: no visible caption, accessible name and tooltip, no leftover wrapper/caption elements
    const a11y = await page.eval(`(()=>{ const l=document.querySelector(${JSON.stringify(sel + " .label-in")}); return { name:l.getAttribute('aria-label'), tip:l.title, radius:getComputedStyle(l).borderTopLeftRadius, caps:document.querySelectorAll('.cap, .lbl, .trow').length, labelWord:[...document.querySelectorAll('#list .item *')].filter(e=>e.children.length===0 && e.textContent.trim()==='Label').length }; })()`);
    same("pill: accessible name is Label", a11y.name, "Label");
    same("pill: tooltip carries the full label", a11y.tip, "Label: " + L30);
    check("pill: rounded like a pill", parseFloat(a11y.radius) >= 10, a11y);
    same("pill: no caption / wrapper / title-row elements left", a11y.caps, 0);
    same("pill: no visible 'Label' text in the list", a11y.labelWord, 0);
    await page.click(`${sel} .label-in`); await sleep(100);
    same("pill: on focus the 30-character label is fully selected in the field", await page.eval(`(()=>{const l=document.activeElement; return l.value.length + ':' + (l.selectionEnd - l.selectionStart)})()`), "30:30");
    await page.insert("Short"); await page.key("Enter"); await sleep(120);
    same("pill: tooltip updated after a change", await page.eval(`document.querySelector(${JSON.stringify(sel + " .label-in")}).title`), "Label: Short");
    await page.click(`${sel} .label-in`); await page.insert("Discarded"); await page.key("Escape"); await sleep(100);
    same("pill: Esc puts the old label back", await page.eval(`document.querySelector(${JSON.stringify(sel + " .label-in")}).value`), "Short");
    await page.click(`${sel} .label-in`); await page.insert("Brand new"); await sleep(120);
    check("pill: suggestion list shows the Create row", await page.eval(`[...document.querySelectorAll('#labelPop .opt')].some(e => e.textContent === 'Create “Brand new”')`));
    await page.key("Escape"); await sleep(100);
    same("pill: maxlength still 30", await page.eval(`document.querySelector(${JSON.stringify(sel + " .label-in")}).maxLength`), 30);
    // date format in the list; preview header keeps its previous format (option b); stored values untouched
    const year = new Date().getFullYear();
    const before = await page.eval(`T.dump()`);
    await page.eval(`(()=>{ const set=(id,d)=>{ items.get(id).added=d.getTime(); };
      set(${JSON.stringify(o[1])}, new Date(${year},9,21,7,51)); set(${JSON.stringify(o[2])}, new Date(${year - 1},9,21,7,51)); set(${JSON.stringify(o[3])}, new Date(${year},0,5,0,0)); set(${JSON.stringify(o[4])}, new Date(${year - 1},11,31,23,59)); buildRows(); })()`);
    const txt = (id) => page.eval(`document.querySelector('.item[data-id="${id}"] .when').textContent`);
    same("format: this year, no year, 24-hour", await txt(o[1]), "21 Oct 07:51");
    same("format: other year shows the year", await txt(o[2]), `21 Oct ${year - 1} 07:51`);
    same("format: midnight, single-digit day without leading zero", await txt(o[3]), "5 Jan 00:00");
    same("format: year boundary, last year's 31 Dec 23:59", await txt(o[4]), `31 Dec ${year - 1} 23:59`);
    same("format: stored records unchanged by displaying (ids, titles, timestamps as seeded)", (await page.eval(`T.dump()`)).filter((r) => r.id === o[5]).map((r) => r.added), before.filter((r) => r.id === o[5]).map((r) => r.added));
    await page.eval(`select(${JSON.stringify(o[1])})`);
    check("format: preview header keeps its previous format", await page.eval(`document.getElementById('pmeta').textContent.startsWith(fmtDate(items.get(${JSON.stringify(o[1])}).added))`));
    check("format: the file-name stamp is unchanged (yyyymmdd_hhmm)", await page.eval(`/ \\d{8}_\\d{4}\\.png$/.test(suggestedName(items.get(${JSON.stringify(o[1])})))`));
    await page.eval(`document.getElementById('sortSel').value='date-asc'; document.getElementById('sortSel').dispatchEvent(new Event('change'))`); await sleep(100);
    const addedOrder = await page.eval(`[...document.querySelectorAll('#list .item')].map(li => items.get(li.dataset.id).added)`);
    check("format: date sort follows the stored timestamps", addedOrder.every((v, i, a) => i === 0 || a[i - 1] <= v), addedOrder);
  }

  // ---------------------------------------------------------------- Rename label button state
  if (want("renamebtn")) {
    console.log("== Rename label button acts on the selected chip only");
    await fresh();
    const o = ids(await page.eval(`T.rows()`));
    await labelOf(o[0], "Work"); await labelOf(o[1], "Home");
    const dis = () => page.eval(`document.getElementById('renameBtn').disabled`);
    await page.click(chipBtn("all")); check("renamebtn: disabled with All selected", await dis());
    await page.click(chipBtn("general")); check("renamebtn: disabled with General selected", await dis());
    await page.click(chipBtn("work")); check("renamebtn: enabled with a custom label selected", !(await dis()));
    await page.click(chipBtn("home")); check("renamebtn: enabled for another custom label", !(await dis()));
    await page.click(chipBtn("all")); check("renamebtn: disabled again after returning to All", await dis());
    await page.click(chipBtn("work")); await page.click(chipBtn("general")); check("renamebtn: disabled again after custom -> General", await dis());
    await page.eval(`document.getElementById('renameBtn').click()`); await sleep(100);
    check("renamebtn: clicking it while disabled opens no dialog", !(await dialogOpen("renameDlg")));
    await page.click(chipBtn("work")); await page.click("#renameBtn");
    same("renamebtn: the dialog is for the selected chip", await page.eval(`document.getElementById('rnInput').value`), "Work");
    await page.key("Escape"); await sleep(100);
    await labelOf(o[0], "Home"); await sleep(150);
    same("renamebtn: selected chip gone -> falls back to All -> disabled", [(await page.eval(`T.chipStr()`)).startsWith("All:8*"), await dis()], [true, true]);
  }

} catch (e) {
  fail++; failures.push("EXCEPTION " + e.message); console.log("EXCEPTION:", e.stack);
}
await page.close(); srv.kill();
console.log(`labels-browser${only ? " [" + only + "]" : ""}: ${pass} passed, ${fail} failed`);
if (failures.length) console.log("failed:", failures.join("; "));
process.exit(fail ? 1 : 0);
