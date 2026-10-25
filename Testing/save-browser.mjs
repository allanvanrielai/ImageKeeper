// Browser tests for the Save button rules, Discard rules and Save All (zip). Real Chrome, throwaway profile, own server port.
// The Save dialog itself is a native window, so showSaveFilePicker is replaced by a stand-in that records its options and hands back a REAL file handle
// (from the browser's private file system), so createWritable/write/close run for real. The zip is then read back and unpacked by Windows
// (Expand-Archive and Explorer's own zip folder, in a throwaway folder under the temp directory, removed at the end). Nothing is written to Downloads.
// Usage: node save-browser.mjs <app folder>
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";

const appDir = path.resolve(process.argv[2]);
const PORT = 47694, DBG = 9336, URL = `http://127.0.0.1:${PORT}/index.html`;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: 1280, height: 800 });
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ik-zip-test-"));
let pass = 0, fail = 0; const failures = [];
function check(name, ok, detail) { if (ok) pass++; else { fail++; failures.push(name); console.log("FAIL:", name, detail === undefined ? "" : JSON.stringify(detail)); } }
const same = (name, a, b) => check(name, JSON.stringify(a) === JSON.stringify(b), { got: a, expected: b });
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const ps = (script) => execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; " + script], { encoding: "utf8", timeout: 120000 });

async function load() { await page.goto(URL); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 2`); }
async function reload() { await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#chips .chip').length >= 2`); }
const MIN = new Date(2026, 9, 24, 16, 21).getTime();      // one minute, so same-title images get the same file name
// pasted = no flags (source "paste"); file = dropped; legacy = a record from before sources existed (no source key)
const SEED = [
  { id: "p1", title: "Alpha", saved: false, source: "paste", added: MIN },
  { id: "p2", title: "Untitled", saved: false, source: "paste", added: MIN + 1000 },
  { id: "p3", title: "untitled", saved: false, source: "paste", added: MIN + 2000 },
  { id: "p4", title: "café ☕ 日本", saved: false, source: "paste", added: MIN + 3000 },
  { id: "ps", title: "Pasted and saved", saved: true, source: "paste", added: MIN + 4000 },
  { id: "d1", title: "Dropped file", saved: true, source: "file", added: MIN + 5000 },
  { id: "l1", title: "Old unsaved", saved: false, added: MIN + 6000, nosource: true },
  { id: "l2", title: "Old saved", saved: true, added: MIN + 7000, nosource: true },
];
async function fresh(extra = {}) {
  await load(); await page.eval(`T.wipe()`);
  await page.eval(`(async()=>{ const out=[]; const recs=${JSON.stringify(SEED)}; for (let i=0;i<recs.length;i++){ const r=recs[i]; const b=await T.png(60+i*13,40+i*9,i*45), th=await T.png(30,20,i*45); const o={id:r.id,title:r.title,blob:b,thumb:th,type:'image/png',width:60+i*13,height:40+i*9,added:r.added,saved:r.saved,label:i%2?'Work':'General'}; if(!r.nosource) o.source=r.source; out.push(o);} await T.seed(out); })()`);
  await reload();
  await page.eval(`window.PK = { calls: [], mode: 'ok', hold: null, n: 0 };
    window.showSaveFilePicker = async (opts) => { PK.calls.push(JSON.parse(JSON.stringify(opts))); if (PK.hold) await PK.hold;
      if (PK.mode === 'cancel') throw new DOMException('The user aborted a request.', 'AbortError');
      if (PK.mode === 'fail') return { name: opts.suggestedName, createWritable: async () => ({ write: async () => { throw new Error('disk full'); }, close: async () => {} }) };
      const root = await navigator.storage.getDirectory(); const h = await root.getFileHandle('out' + (++PK.n) + '-' + opts.suggestedName, { create: true }); return h; };`);
}
const click = (sel) => page.eval(`document.querySelector(${JSON.stringify(sel)}).click()`);
const recs = () => page.eval(`T.dump()`);
const saveBtn = () => page.eval(`(()=>{ const b=document.getElementById('saveBtn'); return { disabled:b.disabled, title:b.title, shown: b.offsetParent !== null }; })()`);
const selectId = async (id) => { await page.eval(`select(${JSON.stringify(id)})`); await sleep(80); };
const saveAllBtn = () => page.eval(`(()=>{ const b=document.getElementById('saveAllBtn'); return { disabled:b.disabled, text:b.textContent, title:b.title, shown: b.offsetParent !== null }; })()`);
const blobB64 = (id) => page.eval(`(async()=>{ const u = new Uint8Array(await items.get(${JSON.stringify(id)}).blob.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=8192) s+=String.fromCharCode(...u.subarray(i,i+8192)); return btoa(s); })()`);
const fileB64 = (name) => page.eval(`(async()=>{ const root = await navigator.storage.getDirectory(); const f = await (await root.getFileHandle(${JSON.stringify(name)})).getFile(); const u = new Uint8Array(await f.arrayBuffer()); let s=''; for (let i=0;i<u.length;i+=8192) s+=String.fromCharCode(...u.subarray(i,i+8192)); return btoa(s); })()`);
const dialogOpen = (id) => page.eval(`document.getElementById('${id}').open`);

try {
  // ------------------------------------------------------------ what existing records store
  console.log("== records");
  await fresh();
  let d = await recs();
  same("records: legacy records have no source key (left exactly as stored)", d.filter((r) => r.id.startsWith("l")).map((r) => r.keys.includes("source")), [false, false]);
  same("records: the seeded new-style records keep their source", d.filter((r) => !r.id.startsWith("l")).map((r) => r.keys.includes("source")), [true, true, true, true, true, true]);

  // ------------------------------------------------------------ Save button state
  console.log("== Save button state");
  await selectId("p1"); let b = await saveBtn();
  check("save: pasted, unsaved -> enabled and visible", !b.disabled && b.shown, b);
  await selectId("ps"); b = await saveBtn();
  check("save: pasted, saved -> disabled (not hidden), 'Already saved'", b.disabled && b.shown && b.title === "Already saved", b);
  await selectId("d1"); b = await saveBtn();
  check("save: dropped file -> disabled (not hidden), 'From a file on disk'", b.disabled && b.shown && b.title === "From a file on disk", b);
  await selectId("l1"); b = await saveBtn();
  check("save: old record, unsaved -> enabled (treated as pasted)", !b.disabled && b.shown, b);
  await selectId("l2"); b = await saveBtn();
  check("save: old record, saved -> disabled, 'Already saved'", b.disabled && b.title === "Already saved", b);
  await page.eval(`PK.mode = 'cancel'`); await selectId("p1"); await click("#saveBtn"); await sleep(150);
  same("save: single Save still opens the dialog for an unsaved pasted image (same options as before: id, suggested name)", await page.eval(`[PK.calls.length, PK.calls[0].id, /^Alpha 20261024_1621\\.png$/.test(PK.calls[0].suggestedName)]`), [1, "imagekeeper", true]);
  await page.eval(`PK.mode = 'ok'`); await click("#saveBtn"); await sleep(400);
  check("save: after a single Save the image is saved, badge shown, button disabled 'Already saved'", await page.eval(`items.get('p1').saved === true && !!document.querySelector('.item[data-id="p1"] .badge')`) && (await saveBtn()).disabled && (await saveBtn()).title === "Already saved");
  await click("#discardBtn"); await sleep(150);
  check("discard: a saved pasted image is discarded without a confirmation", !(await dialogOpen("confirm")) && !(await page.eval(`items.has('p1')`)));
  await selectId("d1"); await click("#discardBtn"); await sleep(150);
  check("discard: a dropped image is discarded without a confirmation", !(await dialogOpen("confirm")) && !(await page.eval(`items.has('d1')`)));
  await selectId("p2"); await click("#discardBtn"); await sleep(150);
  check("discard: a pasted unsaved image asks first", await dialogOpen("confirm"));
  await page.eval(`document.getElementById('confirm').close('cancel')`); await sleep(100);
  await selectId("l1"); await click("#discardBtn"); await sleep(150);
  check("discard: an old unsaved record asks first (as before)", await dialogOpen("confirm"));
  await page.eval(`document.getElementById('confirm').close('cancel')`); await sleep(100);

  // ------------------------------------------------------------ real paste and drop
  console.log("== paste and drop");
  await fresh();
  await page.eval(`T.add('paste',1)`); await sleep(250);
  let all = await recs(); let pasted = all.find((r) => r.id !== undefined && !SEED.some((s) => s.id === r.id) && r.source === undefined);
  const newOnes = async () => (await recs()).filter((r) => !SEED.some((s) => s.id === r.id));
  let n1 = await newOnes();
  same("paste: stored with source 'paste' and unsaved", [n1.length, n1[0].keys.includes("source"), n1[0].saved], [1, true, false]);
  same("paste: source value", await page.eval(`[...items.values()].filter(x => !${JSON.stringify(SEED.map((s) => s.id))}.includes(x.id)).map(x => x.source)`), ["paste"]);
  await page.eval(`T.add('drop',2)`); await sleep(300);
  same("drop: two dropped images stored with source 'file' and saved", await page.eval(`[...items.values()].filter(x => !${JSON.stringify(SEED.map((s) => s.id))}.includes(x.id) && x.source === 'file').map(x => [x.saved, x.title])`), [[true, "new0"], [true, "new1"]]);
  check("drop: dropped images show the 'saved' badge", await page.eval(`[...items.values()].filter(x => x.source === 'file' && x.title.startsWith('new')).every(x => !!document.querySelector('.item[data-id="' + x.id + '"] .badge'))`));
  const dropId = await page.eval(`[...items.values()].find(x => x.title === 'new0').id`);
  await selectId(dropId); b = await saveBtn();
  check("drop: a freshly dropped image has Save disabled, 'From a file on disk'", b.disabled && b.title === "From a file on disk", b);
  const sa0 = await saveAllBtn();
  // Discard All counts: unsaved = pasted unsaved + old unsaved only
  const expectedUnsaved = await page.eval(`[...items.values()].filter(x => !x.saved).length`);
  await click("#discardAllBtn"); await sleep(200);
  const caTxt = await page.eval(`document.getElementById('caSaved').textContent`);
  check("discard all: the 'not saved' count covers unsaved pasted/old images only (dropped and saved excluded)", caTxt.startsWith(expectedUnsaved + " are not saved") && expectedUnsaved === 6, { caTxt, expectedUnsaved });
  await page.eval(`document.getElementById('confirmAll').close('cancel')`); await sleep(100);
  check("discard all: always confirms (the dialog was open even with saved and dropped images present)", caTxt.length > 0);
  // Discard All when everything is saved/dropped still confirms
  await page.eval(`items.forEach(x => { x.saved = true; }); buildRows()`); await click("#discardAllBtn"); await sleep(150);
  check("discard all: still asks when every image is saved", await dialogOpen("confirmAll") && /All are saved\./.test(await page.eval(`document.getElementById('caSaved').textContent`)));
  await page.eval(`document.getElementById('confirmAll').close('cancel')`);

  // ------------------------------------------------------------ Save All
  console.log("== Save All");
  await fresh();
  let sa = await saveAllBtn();
  check("saveall: button sits in the left panel next to Discard All", await page.eval(`document.getElementById('saveAllBtn').parentElement === document.getElementById('discardAllBtn').parentElement && document.getElementById('saveAllBtn').closest('#side') !== null`));
  same("saveall: shows the unsaved count (4 pasted + 1 old unsaved)", [sa.text, sa.disabled], ["Save All (5)", false]);
  // a search and a label filter are active: scope is unchanged
  await page.eval(`document.getElementById('q').value = 'zzz-no-match'; document.getElementById('q').dispatchEvent(new Event('input'))`);
  await page.eval(`chooseChip('work')`); await sleep(100);
  same("saveall: search and label filter active, all rows hidden or filtered; count unchanged", (await saveAllBtn()).text, "Save All (5)");
  const expectNames = await page.eval(`uniqueZipNames(unsavedItems(allItems()).map(suggestedName))`);
  const expectIds = await page.eval(`unsavedItems(allItems()).map(x => x.id)`);
  same("saveall: the file names (title, added stamp, extension; duplicates numbered case-insensitively; non-ASCII kept)", expectNames, ["Alpha 20261024_1621.png", "Untitled 20261024_1621.png", "untitled 20261024_1621-2.png", "café ☕ 日本 20261024_1621.png", "Old unsaved 20261024_1621.png"]);
  const before = await recs();
  const stampAt = () => { const t = new Date(), p = (n) => String(n).padStart(2, "0"); return "Image_Keeper_" + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) + "-" + p(t.getHours()) + p(t.getMinutes()) + ".zip"; };
  const stampBefore = stampAt();
  await click("#saveAllBtn"); await sleep(1200);
  const stampAfter = stampAt();
  const call = await page.eval(`PK.calls[PK.calls.length - 1]`);
  same("saveall: picker options: startIn downloads, zip type, no id (so it always starts in Downloads)", [call.startIn, call.id, call.types[0].accept["application/zip"]], ["downloads", undefined, [".zip"]]);
  check("saveall: suggested name Image_Keeper_yyyymmdd-hhmm.zip, local 24-hour time of the click", [stampBefore, stampAfter].includes(call.suggestedName), { call, stampBefore, stampAfter });
  const after = await recs();
  same("saveall: every snapshot image is now saved; dropped/saved ones unchanged", after.map((r) => [r.id, r.saved]), [["d1", true], ["l1", true], ["l2", true], ["p1", true], ["p2", true], ["p3", true], ["p4", true], ["ps", true]]);
  same("saveall: the images stay in the tray", after.length, 8);
  same("saveall: records otherwise unchanged (title, size, label, added; no source added to old records)", after.map((r) => [r.id, r.title, r.blob, r.label, r.added, r.keys.includes("source")]), before.map((r) => [r.id, r.title, r.blob, r.label, r.added, r.keys.includes("source")]));
  const msg = await page.eval(`document.getElementById('msg').textContent`);
  same("saveall: message", msg, "Saved 5 images to out1-" + call.suggestedName);
  sa = await saveAllBtn();
  check("saveall: nothing unsaved now -> disabled, plain label", sa.disabled && sa.text === "Save All", sa);
  const zipB64 = await fileB64("out1-" + call.suggestedName);
  const zipFile = path.join(work, "t1.zip"); fs.writeFileSync(zipFile, Buffer.from(zipB64, "base64"));
  // expected content: original bytes of the snapshot images
  const origBytes = {}; for (const id of expectIds) origBytes[id] = Buffer.from(await blobB64(id), "base64");
  // unpack with Expand-Archive
  const outA = path.join(work, "expand"), outB = path.join(work, "explorer"); fs.mkdirSync(outA); fs.mkdirSync(outB);
  ps(`Expand-Archive -LiteralPath '${zipFile}' -DestinationPath '${outA}' -Force`);
  const gotA = fs.readdirSync(outA).sort(), want = [...expectNames].sort();
  same("saveall: Expand-Archive: exactly the expected files, one level, no folders", [gotA.length, gotA], [want.length, want]);
  check("saveall: Expand-Archive: every file is byte-identical to its stored original", expectIds.every((id, i) => { const f = path.join(outA, expectNames[i]); return fs.existsSync(f) && Buffer.compare(fs.readFileSync(f), origBytes[id]) === 0; }));
  // unpack with Windows Explorer's zip folder (Shell.Application)
  ps(`$s = New-Object -ComObject Shell.Application; $z = $s.NameSpace('${zipFile}'); $dst = $s.NameSpace('${outB}'); $dst.CopyHere($z.Items(), 0x14); $t = 0; while ((Get-ChildItem -LiteralPath '${outB}').Count -lt ${expectNames.length} -and $t -lt 100) { Start-Sleep -Milliseconds 200; $t++ }; Start-Sleep -Milliseconds 800`);
  const gotB = fs.readdirSync(outB).sort();
  same("saveall: Windows Explorer unpack: exactly the expected files", [gotB.length, gotB], [want.length, want]);
  check("saveall: Windows Explorer unpack: every file is byte-identical", expectIds.every((id, i) => { const f = path.join(outB, expectNames[i]); return fs.existsSync(f) && Buffer.compare(fs.readFileSync(f), origBytes[id]) === 0; }));
  const opens = ps(`Add-Type -AssemblyName System.Drawing; Get-ChildItem -LiteralPath '${outA}' | ForEach-Object { $i = [System.Drawing.Image]::FromFile($_.FullName); '{0}x{1}' -f $i.Width, $i.Height; $i.Dispose() }`).trim().split(/\r?\n/);
  same("saveall: every extracted file opens as an image (dimensions read by Windows)", opens.length, expectNames.length);
  const listing = ps(`Add-Type -AssemblyName System.IO.Compression.FileSystem; $a = [System.IO.Compression.ZipFile]::OpenRead('${zipFile}'); $a.Entries | ForEach-Object { $_.FullName + '|' + $_.Length + '|' + $_.CompressedLength }; $a.Dispose()`).trim().split(/\r?\n/);
  check("saveall: .NET zip reader: all entries stored (compressed length = length), names as expected", listing.length === expectNames.length && listing.every((l) => { const [n, a, c] = l.split("|"); return want.includes(n) && a === c; }), listing);

  // ------------------------------------------------------------ cancel, failure, empty
  console.log("== Save All: cancel, failure, nothing to save");
  await fresh();
  const rec0 = JSON.stringify(await recs());
  await page.eval(`PK.mode = 'cancel'`); await click("#saveAllBtn"); await sleep(400);
  same("saveall cancel: nothing changed in storage", JSON.stringify(await recs()), rec0);
  check("saveall cancel: no error banner, no 'Saved' message, button usable again", !(await page.eval(`!!document.querySelector('.banner.err')`)) && !(await page.eval(`document.getElementById('msg').classList.contains('show')`)) && !(await saveAllBtn()).disabled);
  same("saveall cancel: counts unchanged", (await saveAllBtn()).text, "Save All (5)");
  await page.eval(`PK.mode = 'fail'`); await click("#saveAllBtn"); await sleep(600);
  same("saveall write failure: nothing marked saved", (await recs()).filter((r) => r.saved).map((r) => r.id), ["d1", "l2", "ps"]);
  check("saveall write failure: error shown and says nothing was marked saved", await page.eval(`[...document.querySelectorAll('.banner.err')].some(b => /not written/.test(b.textContent) && /No image was marked as saved/.test(b.textContent))`));
  check("saveall write failure: no 'Saved' message; button usable again with the same count", (await saveAllBtn()).text === "Save All (5)" && !(await saveAllBtn()).disabled);
  await page.eval(`items.forEach(x => { x.saved = true; }); buildRows()`);
  const e = await saveAllBtn();
  check("saveall: disabled, with an explanatory tooltip, when nothing is unsaved", e.disabled && /Nothing to save/.test(e.title), e);
  await page.eval(`PK.calls.length = 0`); await page.eval(`saveAll()`); await sleep(200);
  same("saveall: called with nothing to save -> no dialog", await page.eval(`PK.calls.length`), 0);

  // ------------------------------------------------------------ an image pasted while the dialog is open
  console.log("== Save All: image added while the dialog is open");
  await fresh();
  await page.eval(`PK.mode = 'ok'; PK.hold = new Promise((r) => { PK.release = r; }); 0`);
  const idsBefore = await page.eval(`[...items.keys()]`);
  await click("#saveAllBtn"); await sleep(200);
  check("saveall open dialog: busy while the dialog is open (button disabled)", (await saveAllBtn()).disabled);
  await page.eval(`T.add('paste',1)`); await sleep(300);
  const newId = await page.eval(`[...items.keys()].find(k => !${JSON.stringify(idsBefore)}.includes(k))`);
  check("saveall open dialog: the new pasted image exists and is unsaved", !!newId && await page.eval(`items.get(${JSON.stringify(newId)}).saved === false`));
  await page.eval(`PK.release()`); await sleep(1500);
  same("saveall open dialog: the new image is not marked saved; the snapshot images are", await page.eval(`[items.get(${JSON.stringify(newId)}).saved, ['p1','p2','p3','p4','l1'].every(i => items.get(i).saved)]`), [false, true]);
  same("saveall open dialog: the button now counts only the new image", (await saveAllBtn()).text, "Save All (1)");
  const zip2 = Buffer.from(await fileB64("out1-" + (await page.eval(`PK.calls[0].suggestedName`))), "base64");
  fs.writeFileSync(path.join(work, "t2.zip"), zip2);
  const names2 = ps(`Add-Type -AssemblyName System.IO.Compression.FileSystem; $a = [System.IO.Compression.ZipFile]::OpenRead('${path.join(work, "t2.zip")}'); $a.Entries | ForEach-Object { $_.FullName }; $a.Dispose()`).trim().split(/\r?\n/);
  same("saveall open dialog: the zip holds only the 5 snapshot images (no new image)", names2.length, 5);
  same("saveall: one at a time while busy (a second click is ignored)", await page.eval(`(async()=>{ PK.hold = new Promise((r) => { PK.release = r; }); PK.calls.length = 0; saveAll(); saveAll(); await new Promise(r => setTimeout(r, 100)); const n = PK.calls.length; PK.release(); await new Promise(r => setTimeout(r, 800)); return n; })()`), 1);
} catch (e) {
  fail++; failures.push("EXCEPTION " + e.message); console.log("EXCEPTION:", e.stack);
}
await page.close(); srv.kill();
try { fs.rmSync(work, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {}
console.log(`save-browser: ${pass} passed, ${fail} failed`);
if (failures.length) console.log("failed:", failures.join("; "));
process.exit(fail ? 1 : 0);
