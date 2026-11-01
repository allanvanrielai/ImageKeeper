// Unit tests for the <select-logic> block of app/index.html (multi-select rules and grid shape). Usage: node select-unit.mjs <path to index.html>
import fs from "node:fs";
import vm from "node:vm";
const html = fs.readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n");
const m = html.match(/\/\/ ===== <select-logic>[\s\S]*?\/\/ ===== <\/select-logic> =====/);
if (!m) { console.log("FAIL: select-logic block not found"); process.exit(1); }
const S = vm.runInNewContext(m[0] + "\n({SELECT_MAX, applyClick, escReduce, gridShape, gridOrder})");
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log("FAIL", name, "\n  got      ", JSON.stringify(a), "\n  expected ", JSON.stringify(b))); };
const order = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
const st = (sel, last) => ({ sel, last: last === undefined ? sel[sel.length - 1] : last });
const none = {}, ctrl = { ctrl: true }, shift = { shift: true };

eq("limit is 6", S.SELECT_MAX, 6);
// plain click
eq("plain: one image", S.applyClick(st(["a", "b"]), order, "c", none), { sel: ["c"], last: "c", rejected: false });
eq("plain on a selected image: just that one", S.applyClick(st(["a", "b", "c"]), order, "b", none).sel, ["b"]);
// ctrl
eq("ctrl adds", S.applyClick(st(["a"]), order, "c", ctrl), { sel: ["a", "c"], last: "c", rejected: false });
eq("ctrl adds in click order (not list order)", S.applyClick(st(["d", "a"]), order, "b", ctrl).sel, ["d", "a", "b"]);
eq("ctrl removes a selected one", S.applyClick(st(["a", "c", "e"]), order, "c", ctrl).sel, ["a", "e"]);
eq("ctrl remove: last clicked becomes the last one still selected", S.applyClick(st(["a", "c", "e"]), order, "c", ctrl).last, "e");
eq("ctrl on the only selected image keeps it", S.applyClick(st(["a"]), order, "a", ctrl).sel, ["a"]);
eq("ctrl leaves the selection input untouched (pure)", (() => { const s0 = st(["a", "b"]); S.applyClick(s0, order, "c", ctrl); return s0.sel; })(), ["a", "b"]);
// limit with ctrl
eq("ctrl: 6th image is added", S.applyClick(st(["a", "b", "c", "d", "e"]), order, "f", ctrl).sel.length, 6);
eq("ctrl: 7th image is rejected, selection unchanged", S.applyClick(st(["a", "b", "c", "d", "e", "f"]), order, "g", ctrl), { sel: ["a", "b", "c", "d", "e", "f"], last: "f", rejected: true });
eq("ctrl: removing at 6 is allowed", S.applyClick(st(["a", "b", "c", "d", "e", "f"]), order, "c", ctrl).sel.length, 5);
// shift
eq("shift: range down from the last clicked", S.applyClick(st(["b"]), order, "e", shift), { sel: ["b", "c", "d", "e"], last: "e", rejected: false });
eq("shift: range up ends with the clicked image", S.applyClick(st(["e"]), order, "b", shift).sel, ["e", "d", "c", "b"]);
eq("shift: replaces what was selected", S.applyClick(st(["a", "h", "c"], "c"), order, "e", shift).sel, ["c", "d", "e"]);
eq("shift: the anchor is the last clicked image, not the last in the selection", S.applyClick(st(["a", "g"], "a"), order, "c", shift).sel, ["a", "b", "c"]);
eq("shift: on the last clicked image itself gives just that image", S.applyClick(st(["c"]), order, "c", shift).sel, ["c"]);
eq("shift: a range of exactly 6 is applied", S.applyClick(st(["a"]), order, "f", shift).sel.length, 6);
eq("shift: a range of 7 is rejected, selection unchanged", S.applyClick(st(["a", "b"], "a"), order, "g", shift), { sel: ["a", "b"], last: "a", rejected: true });
eq("shift: follows the order given (a different sort)", S.applyClick(st(["i"]), ["i", "h", "g", "f", "e", "d", "c", "b", "a"], "f", shift).sel, ["i", "h", "g", "f"]);
eq("shift: nothing selected yet gives just the clicked image", S.applyClick(st([], null), order, "d", shift).sel, ["d"]);
eq("shift: last clicked image no longer in the list falls back to the last selected one", S.applyClick(st(["a", "b"], "zz"), order, "d", shift).sel, ["b", "c", "d"]);
eq("shift on an image that is not in the list changes nothing", S.applyClick(st(["a", "b"]), order, "zz", shift).sel, ["a", "b"]);
// esc
eq("esc: back to the last clicked image", S.escReduce(st(["a", "b", "c"], "b")), { sel: ["b"], last: "b" });
eq("esc: last clicked gone, the last one added", S.escReduce(st(["a", "b", "c"], "zz")), { sel: ["c"], last: "c" });
eq("esc: nothing selected", S.escReduce(st([], null)), { sel: [], last: null });
// grid
eq("grid shapes for 2..6", [2, 3, 4, 5, 6].map((n) => S.gridShape(n)), [{ cols: 2, rows: 1 }, { cols: 3, rows: 1 }, { cols: 2, rows: 2 }, { cols: 3, rows: 2 }, { cols: 3, rows: 2 }]);
eq("grid shape for one image", S.gridShape(1), { cols: 1, rows: 1 });
eq("grid order: oldest first whatever the input order", S.gridOrder([{ id: "x", added: 30 }, { id: "y", added: 10 }, { id: "z", added: 20 }]).map((i) => i.id), ["y", "z", "x"]);
eq("grid order: equal times are broken by id (stable)", S.gridOrder([{ id: "b", added: 5 }, { id: "a", added: 5 }]).map((i) => i.id), ["a", "b"]);
eq("grid order does not change its input", (() => { const l = [{ id: "x", added: 2 }, { id: "y", added: 1 }]; S.gridOrder(l); return l.map((i) => i.id); })(), ["x", "y"]);

console.log(`select-unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
