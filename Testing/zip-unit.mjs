// Unit tests for the <zip-logic> and <save-logic> blocks of app/index.html. Usage: node zip-unit.mjs <path to index.html>
// The zip is also read back here by an independent reader, with the CRC checked against node:zlib.
import fs from "node:fs";
import vm from "node:vm";
import zlib from "node:zlib";
const html = fs.readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n");
const blocks = ["zip-logic", "save-logic"].map((n) => { const m = html.match(new RegExp("// ===== <" + n + ">[\\s\\S]*?// ===== </" + n + "> =====")); if (!m) { console.log("FAIL: " + n + " block not found"); process.exit(1); } return m[0]; });
const Z = vm.runInNewContext(blocks.join("\n") + "\n({crc32, dosStamp, uniqueZipNames, zipFileName, zipParts, saveState, unsavedItems})", { TextEncoder, Uint8Array, Uint32Array, DataView, Date, Math, Error, String, Set });
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log("FAIL", name, "\n  got      ", JSON.stringify(a), "\n  expected ", JSON.stringify(b))); };
const at = (y, mo, d, h, mi, s = 0) => new Date(y, mo - 1, d, h, mi, s).getTime();
const bytes = (s) => new TextEncoder().encode(s);

// crc32
eq("crc32 of '123456789' (the standard check value)", Z.crc32(bytes("123456789")), 0xCBF43926);
eq("crc32 of nothing", Z.crc32(new Uint8Array(0)), 0);
{ const big = new Uint8Array(100000).map((_, i) => (i * 31 + 7) & 255); eq("crc32 matches node:zlib on 100 kB", Z.crc32(big), zlib.crc32(big)); }
{ const all = bytes("hello world"); eq("crc32 can continue from a previous value", Z.crc32(bytes(" world"), Z.crc32(bytes("hello"))), Z.crc32(all)); }
eq("crc32 result is an unsigned number", Z.crc32(new Uint8Array([255, 255, 255, 255])) >= 0, true);

// names
eq("unique: no repeats unchanged", Z.uniqueZipNames(["a.png", "b.png"]), ["a.png", "b.png"]);
eq("unique: repeat gets -2, -3 before the extension", Z.uniqueZipNames(["Untitled 20261024_1621.png", "Untitled 20261024_1621.png", "Untitled 20261024_1621.png"]), ["Untitled 20261024_1621.png", "Untitled 20261024_1621-2.png", "Untitled 20261024_1621-3.png"]);
eq("unique: compared case-insensitively", Z.uniqueZipNames(["Shot.PNG", "shot.png", "SHOT.png"]), ["Shot.PNG", "shot-2.png", "SHOT-3.png"]);
eq("unique: a generated name that is already taken is skipped", Z.uniqueZipNames(["a.png", "a-2.png", "a.png"]), ["a.png", "a-2.png", "a-3.png"]);
eq("unique: same base, different extension are different", Z.uniqueZipNames(["a.png", "a.jpg"]), ["a.png", "a.jpg"]);
eq("unique: non-ASCII names", Z.uniqueZipNames(["café 20261024_1621.png", "CAFÉ 20261024_1621.png"]), ["café 20261024_1621.png", "CAFÉ 20261024_1621-2.png"]);
eq("zip file name: yyyymmdd-hhmm, 24-hour, local", Z.zipFileName(at(2026, 10, 24, 16, 21)), "Image_Keeper_20261024-1621.zip");
eq("zip file name: zero padded, afternoon is 24-hour", [Z.zipFileName(at(2026, 1, 5, 7, 4)), Z.zipFileName(at(2026, 12, 31, 23, 59))], ["Image_Keeper_20260105-0704.zip", "Image_Keeper_20261231-2359.zip"]);

// DOS time
{ const d = Z.dosStamp(at(2026, 10, 24, 16, 21, 30)); eq("dos date", [(d.date >> 9) + 1980, (d.date >> 5) & 15, d.date & 31], [2026, 10, 24]); eq("dos time", [d.time >> 11, (d.time >> 5) & 63, (d.time & 31) * 2], [16, 21, 30]); }
eq("dos stamp clamps years before 1980", (Z.dosStamp(at(1970, 1, 1, 0, 0)).date >> 9) + 1980, 1980);

// build a zip, read it back independently
function build(files) { // files: [{ name, data: Uint8Array, ms }]
  const entries = files.map((f) => ({ name: f.name, data: f.data, size: f.data.length, crc: Z.crc32(f.data), ms: f.ms || at(2026, 10, 24, 16, 21) }));
  return Buffer.concat(Z.zipParts(entries).map((p) => Buffer.from(p)));
}
function readZip(buf) {
  const eocd = buf.length - 22; const out = { entries: [] };
  if (buf.readUInt32LE(eocd) !== 0x06054b50) throw new Error("no end record");
  const n = buf.readUInt16LE(eocd + 10), cdSize = buf.readUInt32LE(eocd + 12), cdOff = buf.readUInt32LE(eocd + 16);
  out.count = n; out.cdEndsAtEocd = cdOff + cdSize === eocd;
  let p = cdOff;
  for (let i = 0; i < n; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("bad central header");
    const flags = buf.readUInt16LE(p + 8), method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24), nl = buf.readUInt16LE(p + 28), el = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32), lo = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nl).toString("utf8");
    if (buf.readUInt32LE(lo) !== 0x04034b50) throw new Error("bad local header");
    const lnl = buf.readUInt16LE(lo + 26), lel = buf.readUInt16LE(lo + 28), lname = buf.slice(lo + 30, lo + 30 + lnl).toString("utf8"), data = buf.slice(lo + 30 + lnl + lel, lo + 30 + lnl + lel + csize);
    out.entries.push({ name, lname, utf8: !!(flags & 0x0800), method, crc, csize, usize, data, localCrc: buf.readUInt32LE(lo + 14) });
    p += 46 + nl + el + cl;
  }
  return out;
}
{
  const a = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 7) & 255)), b = Buffer.from("second file"), c = Buffer.alloc(0), d = Buffer.from([0, 255, 0, 255]);
  const z = readZip(build([{ name: "a.png", data: new Uint8Array(a) }, { name: "café 日本.png", data: new Uint8Array(b) }, { name: "empty.bin", data: new Uint8Array(c) }, { name: "d.bin", data: new Uint8Array(d) }]));
  eq("zip: entry count", z.count, 4);
  eq("zip: central directory runs right up to the end record", z.cdEndsAtEocd, true);
  eq("zip: names (UTF-8, local and central agree)", z.entries.map((e) => e.name), ["a.png", "café 日本.png", "empty.bin", "d.bin"]);
  eq("zip: local names equal central names", z.entries.every((e) => e.name === e.lname), true);
  eq("zip: every entry marked UTF-8", z.entries.every((e) => e.utf8), true);
  eq("zip: stored, not compressed", z.entries.every((e) => e.method === 0 && e.csize === e.usize), true);
  eq("zip: stored bytes are the original bytes", [a, b, c, d].map((x, i) => Buffer.compare(x, z.entries[i].data) === 0), [true, true, true, true]);
  eq("zip: CRC-32 equals node:zlib's, central and local", z.entries.map((e) => [e.crc, e.localCrc]), [a, b, c, d].map((x) => [zlib.crc32(x), zlib.crc32(x)]));
  eq("zip: no folders (no name contains a slash)", z.entries.some((e) => e.name.includes("/")), false);
}
eq("zip: empty list is a valid empty archive", (() => { const z = readZip(build([])); return [z.count, z.entries.length]; })(), [0, 0]);
{ // the entry's time stamp is the image's added time
  const buf = build([{ name: "x.png", data: new Uint8Array([1]), ms: at(2026, 3, 9, 8, 5, 6) }]), t = buf.readUInt16LE(10), d = buf.readUInt16LE(12);
  eq("zip: entry time is the image's added time", [t >> 11, (t >> 5) & 63, (d >> 9) + 1980, (d >> 5) & 15, d & 31], [8, 5, 2026, 3, 9]);
}
eq("zip: more than 65535 files is refused", (() => { try { Z.zipParts(new Array(65536).fill({ name: "a", data: new Uint8Array(0), size: 0, crc: 0, ms: 0 })); return "no error"; } catch (e) { return "error"; } })(), "error");
eq("zip: a file over 4 GB is refused", (() => { try { Z.zipParts([{ name: "a", data: null, size: 0x100000000, crc: 0, ms: 0 }]); return "no error"; } catch (e) { return "error"; } })(), "error");

// Save button state
eq("save: no image -> disabled", Z.saveState(null).enabled, false);
eq("save: pasted, unsaved -> enabled", Z.saveState({ saved: false, source: "paste" }).enabled, true);
eq("save: pasted, saved -> disabled, 'Already saved'", Z.saveState({ saved: true, source: "paste" }), { enabled: false, title: "Already saved" });
eq("save: dropped (stored saved) -> disabled, 'From a file on disk'", Z.saveState({ saved: true, source: "file" }), { enabled: false, title: "From a file on disk" });
eq("save: old record, unsaved, no source -> enabled (treated as pasted)", Z.saveState({ saved: false }).enabled, true);
eq("save: old record, saved, no source -> disabled, 'Already saved'", Z.saveState({ saved: true }), { enabled: false, title: "Already saved" });
eq("save: a dropped image that somehow reads unsaved is still enabled (the stored flag decides)", Z.saveState({ saved: false, source: "file" }).enabled, true);
eq("save all set: only unsaved, oldest first", Z.unsavedItems([{ id: "c", saved: false, added: 3 }, { id: "s", saved: true, source: "paste", added: 1 }, { id: "d", saved: true, source: "file", added: 2 }, { id: "a", saved: false, added: 0 }]).map((x) => x.id), ["a", "c"]);
eq("save all set: nothing unsaved -> empty", Z.unsavedItems([{ saved: true, added: 1 }]).length, 0);

console.log(`zip-unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
