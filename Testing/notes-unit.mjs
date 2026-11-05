// Unit tests for the <note-logic> block of app/index.html (the 500-character note). Usage: node notes-unit.mjs <path to index.html>
import fs from "node:fs";
import vm from "node:vm";
const html = fs.readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n");
const m = html.match(/\/\/ ===== <note-logic>[\s\S]*?\/\/ ===== <\/note-logic> =====/);
if (!m) { console.log("FAIL: note-logic block not found"); process.exit(1); }
const N = vm.runInNewContext(m[0] + "\n({NOTE_MAX, cpLen, cpHead, hasNote, noteOf, noteInsert, noteClamp})", { Array, String, Math });
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log("FAIL", name, "\n  got      ", JSON.stringify(a), "\n  expected ", JSON.stringify(b))); };
const x = (n, c = "a") => c.repeat(n);

eq("limit is 500", N.NOTE_MAX, 500);
eq("characters are counted, not UTF-16 units (an emoji is one)", [N.cpLen("a\u{1F600}b"), "a\u{1F600}b".length], [3, 4]);
// hasNote / noteOf: whitespace only is no note
eq("hasNote: text", N.hasNote("hi"), true);
eq("hasNote: empty", N.hasNote(""), false);
eq("hasNote: spaces, tabs, newlines only", [N.hasNote("   "), N.hasNote("\t\n \r"), N.hasNote(" ")], [false, false, false]);
eq("hasNote: text with surrounding whitespace is a note", N.hasNote("  hi  "), true);
eq("hasNote: not a string (missing, null, number)", [N.hasNote(undefined), N.hasNote(null), N.hasNote(5)], [false, false, false]);
eq("noteOf: an image with no note key reads as no note", N.noteOf({ id: "a" }), "");
eq("noteOf: whitespace only reads as no note", N.noteOf({ note: "  \n " }), "");
eq("noteOf: the note as stored (not trimmed)", N.noteOf({ note: "  hello\nworld " }), "  hello\nworld ");
eq("noteOf: no item", N.noteOf(null), "");
// noteInsert: typing and pasting stop at the limit
eq("insert into an empty note", N.noteInsert("", 0, 0, "hello"), { text: "hello", caret: 5, cut: false });
eq("insert in the middle", N.noteInsert("held", 2, 2, "llo wor"), { text: "hello world", caret: 9, cut: false });
eq("typing one character at exactly 500 is refused", N.noteInsert(x(500), 500, 500, "b"), { text: x(500), caret: 500, cut: true });
eq("typing one character at 499 fills to 500", N.noteInsert(x(499), 499, 499, "b"), { text: x(499) + "b", caret: 500, cut: false });
eq("paste that fits exactly is not cut", N.noteInsert(x(400), 400, 400, x(100, "b")).cut, false);
eq("paste of 200 over 400 existing characters is cut to 100", (() => { const r = N.noteInsert(x(400), 400, 400, x(200, "b")); return [N.cpLen(r.text), r.cut, r.caret]; })(), [500, true, 500]);
eq("paste into an empty note of 900 characters keeps the first 500", (() => { const r = N.noteInsert("", 0, 0, x(900, "z")); return [r.text.length, r.cut]; })(), [500, true]);
eq("paste over a selection frees room: replacing 50 selected characters with 60", (() => { const cur = x(500); const r = N.noteInsert(cur, 100, 150, x(60, "b")); return [N.cpLen(r.text), r.cut, r.text.slice(100, 150) === x(50, "b")]; })(), [500, true, true]);
eq("a selection replaced by the same length is not cut", N.noteInsert(x(500), 10, 20, x(10, "b")).cut, false);
eq("the cut keeps the start of the pasted text", N.noteInsert(x(495), 495, 495, "123456789").text.slice(495), "12345");
eq("emoji are not split at the limit", (() => { const r = N.noteInsert(x(499), 499, 499, "\u{1F600}\u{1F600}"); return [N.cpLen(r.text), r.text.endsWith("\u{1F600}"), r.cut]; })(), [500, true, true]);
eq("500 emoji fit (500 characters, 1000 UTF-16 units)", N.noteInsert("", 0, 0, "\u{1F600}".repeat(500)).cut, false);
eq("501 emoji are cut to 500", N.cpLen(N.noteInsert("", 0, 0, "\u{1F600}".repeat(501)).text), 500);
eq("caret is after the inserted text", N.noteInsert("ab", 1, 1, "XY").caret, 3);
eq("room is never negative even if the note is already too long", N.noteInsert(x(520), 520, 520, "z"), { text: x(520), caret: 520, cut: true });
// noteClamp
eq("clamp: short value unchanged", N.noteClamp("hi"), { text: "hi", cut: false });
eq("clamp: 500 unchanged", N.noteClamp(x(500)).cut, false);
eq("clamp: 501 cut to 500", (() => { const r = N.noteClamp(x(501)); return [r.text.length, r.cut]; })(), [500, true]);
eq("clamp: line ends become \\n", N.noteClamp("a\r\nb\rc").text, "a\nb\nc");
eq("clamp: null is empty", N.noteClamp(null), { text: "", cut: false });

console.log(`notes-unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
