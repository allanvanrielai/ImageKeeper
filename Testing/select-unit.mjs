// Unit tests for the <select-logic> block of app/index.html (multi-select rules and grid shape). Usage: node select-unit.mjs <path to index.html>
import fs from "node:fs";
import vm from "node:vm";
const html = fs.readFileSync(process.argv[2], "utf8").replace(/\r\n/g, "\n");
const m = html.match(/\/\/ ===== <select-logic>[\s\S]*?\/\/ ===== <\/select-logic> =====/);
if (!m) { console.log("FAIL: select-logic block not found"); process.exit(1); }
const S = vm.runInNewContext(m[0] + "\n({SELECT_MAX, applyClick, escReduce, gridShape, gridCandidates, bestGrid, gridOrder})");
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log("FAIL", name, "\n  got      ", JSON.stringify(a), "\n  expected ", JSON.stringify(b))); };
const order = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
const st = (sel, last, anchor) => { const l = last === undefined ? sel[sel.length - 1] : last; return { sel, last: l, anchor: anchor === undefined ? l : anchor }; };
const none = {}, ctrl = { ctrl: true }, shift = { shift: true };
const R = (sel, last, anchor, rejected = false) => ({ sel, last, anchor, rejected });

eq("limit is 6", S.SELECT_MAX, 6);
// plain click: selects one image, which is also the anchor
eq("plain: one image, it is the anchor", S.applyClick(st(["a", "b"]), order, "c", none), R(["c"], "c", "c"));
eq("plain on a selected image: just that one", S.applyClick(st(["a", "b", "c"]), order, "b", none).sel, ["b"]);
// ctrl
eq("ctrl adds, and the added image becomes the anchor", S.applyClick(st(["a"]), order, "c", ctrl), R(["a", "c"], "c", "c"));
eq("ctrl adds in click order (not list order)", S.applyClick(st(["d", "a"]), order, "b", ctrl).sel, ["d", "a", "b"]);
eq("ctrl removes a selected one", S.applyClick(st(["a", "c", "e"]), order, "c", ctrl).sel, ["a", "e"]);
eq("ctrl remove: last clicked and anchor are the last one still selected when the anchor was removed", S.applyClick(st(["a", "c", "e"], "c", "c"), order, "c", ctrl), R(["a", "e"], "e", "e"));
eq("ctrl remove of another image leaves the anchor where it was", S.applyClick(st(["a", "c", "e"], "e", "c"), order, "e", ctrl).anchor, "c");
eq("ctrl on the only selected image keeps it (and it is the anchor)", S.applyClick(st(["a"]), order, "a", ctrl), R(["a"], "a", "a"));
eq("ctrl leaves the selection input untouched (pure)", (() => { const s0 = st(["a", "b"]); S.applyClick(s0, order, "c", ctrl); return s0.sel; })(), ["a", "b"]);
// limit with ctrl
eq("ctrl: 6th image is added", S.applyClick(st(["a", "b", "c", "d", "e"]), order, "f", ctrl).sel.length, 6);
eq("ctrl: 7th image is rejected, nothing changes (anchor included)", S.applyClick(st(["a", "b", "c", "d", "e", "f"], "f", "d"), order, "g", ctrl), R(["a", "b", "c", "d", "e", "f"], "f", "d", true));
eq("ctrl: removing at 6 is allowed", S.applyClick(st(["a", "b", "c", "d", "e", "f"]), order, "c", ctrl).sel.length, 5);
// shift: fixed anchor
eq("shift: range down from the anchor; the anchor does not move", S.applyClick(st(["b"]), order, "e", shift), R(["b", "c", "d", "e"], "e", "b"));
eq("shift: range up ends with the clicked image", S.applyClick(st(["e"]), order, "b", shift).sel, ["e", "d", "c", "b"]);
eq("shift: replaces what was selected", S.applyClick(st(["a", "h", "c"], "c", "c"), order, "e", shift).sel, ["c", "d", "e"]);
eq("shift: the anchor is the last plain/Ctrl-clicked image, not the last in the selection", S.applyClick(st(["a", "g"], "g", "a"), order, "c", shift).sel, ["a", "b", "c"]);
eq("shift: on the anchor itself gives just that image", S.applyClick(st(["c"]), order, "c", shift).sel, ["c"]);
eq("shift: a range of exactly 6 is applied", S.applyClick(st(["a"]), order, "f", shift).sel.length, 6);
eq("shift: a range of 7 is rejected, selection and anchor unchanged", S.applyClick(st(["a", "b"], "a", "a"), order, "g", shift), R(["a", "b"], "a", "a", true));
eq("shift: follows the order given (a different sort)", S.applyClick(st(["i"]), ["i", "h", "g", "f", "e", "d", "c", "b", "a"], "f", shift).sel, ["i", "h", "g", "f"]);
eq("shift: nothing selected yet gives just the clicked image, which becomes the anchor", S.applyClick({ sel: [], last: null, anchor: null }, order, "d", shift), R(["d"], "d", "d"));
eq("shift: anchor no longer in the list falls back to the last selected one", S.applyClick(st(["a", "b"], "zz", "zz"), order, "d", shift).sel, ["b", "c", "d"]);
eq("shift on an image that is not in the list changes nothing", S.applyClick(st(["a", "b"]), order, "zz", shift).sel, ["a", "b"]);
// the Explorer example: click A, Shift+click D -> A-D; Shift+click B -> A-B (not D-B)
{
  let state = S.applyClick({ sel: [], last: null, anchor: null }, order, "a", none);
  state = S.applyClick(state, order, "d", shift);
  eq("example: click A, Shift+click D gives A-D", state.sel, ["a", "b", "c", "d"]);
  state = S.applyClick(state, order, "b", shift);
  eq("example: then Shift+click B gives A-B, not D-B", state.sel, ["a", "b"]);
  state = S.applyClick(state, order, "f", shift);
  eq("example: then Shift+click F gives A-F (still from A)", state.sel, ["a", "b", "c", "d", "e", "f"]);
  eq("example: the anchor is still A, the last clicked is F", [state.anchor, state.last], ["a", "f"]);
  state = S.applyClick(state, order, "i", shift);
  eq("example: a rejected Shift+click (A-I is 9) changes nothing", state.sel, ["a", "b", "c", "d", "e", "f"]);
  state = S.applyClick(S.applyClick(state, order, "h", ctrl), order, "i", ctrl);
  eq("Ctrl+click at the limit is rejected too", state.sel.length, 6);
  const s2 = S.applyClick(S.applyClick(S.applyClick({ sel: [], last: null, anchor: null }, order, "a", none), order, "c", ctrl), order, "e", shift);
  eq("Ctrl+click moves the anchor: click A, Ctrl+click C, Shift+click E gives C-E", s2.sel, ["c", "d", "e"]);
  eq("shifting backwards from the same anchor works", S.applyClick(S.applyClick(s2, order, "a", shift), order, "d", shift).sel, ["c", "d"]);
}
// esc: the image that stays selected is the anchor from then on
eq("esc: back to the last clicked image, which becomes the anchor", S.escReduce(st(["a", "b", "c"], "b", "a")), { sel: ["b"], last: "b", anchor: "b" });
eq("esc: last clicked gone, the last one added", S.escReduce(st(["a", "b", "c"], "zz")), { sel: ["c"], last: "c", anchor: "c" });
eq("esc: nothing selected", S.escReduce(st([], null)), { sel: [], last: null, anchor: null });
eq("esc then shift ranges from the image that stayed", S.applyClick(S.escReduce(st(["a", "b", "e"], "e", "a")), order, "g", shift).sel, ["e", "f", "g"]);
// grid
eq("grid shapes for 2..6", [2, 3, 4, 5, 6].map((n) => S.gridShape(n)), [{ cols: 2, rows: 1 }, { cols: 3, rows: 1 }, { cols: 2, rows: 2 }, { cols: 3, rows: 2 }, { cols: 3, rows: 2 }]);
eq("grid shape for one image", S.gridShape(1), { cols: 1, rows: 1 });
eq("grid order: oldest first whatever the input order", S.gridOrder([{ id: "x", added: 30 }, { id: "y", added: 10 }, { id: "z", added: 20 }]).map((i) => i.id), ["y", "z", "x"]);
eq("grid order: equal times are broken by id (stable)", S.gridOrder([{ id: "b", added: 5 }, { id: "a", added: 5 }]).map((i) => i.id), ["a", "b"]);
eq("grid order does not change its input", (() => { const l = [{ id: "x", added: 2 }, { id: "y", added: 1 }]; S.gridOrder(l); return l.map((i) => i.id); })(), ["x", "y"]);

// best-fit arrangement
const OPT = { gap: 6, chrome: 3, cap: 17 };
const sq = (n, w, h) => Array.from({ length: n }, () => ({ w, h }));
const pc = (x) => Math.round(x * 100);
eq("candidates for 2..6 (no empty column)", [2, 3, 4, 5, 6].map((n) => S.gridCandidates(n).map((c) => c.cols + "x" + c.rows)), [["1x2", "2x1"], ["1x3", "2x2", "3x1"], ["1x4", "2x2", "4x1"], ["1x5", "2x3", "3x2", "5x1"], ["1x6", "2x3", "3x2", "6x1"]]);
{ const r = S.bestGrid(sq(6, 780, 440), { w: 1276, h: 910 }, OPT);
  eq("six 780x440 images in a 1276x910 pane: 2 across, 3 down", [r.cols, r.rows], [2, 3]);
  eq("...every image at the same scale, about 63%", [r.scales.every((x) => Math.abs(x - r.scales[0]) < 1e-9), pc(r.score)], [true, 63]); }
{ const r = S.bestGrid(sq(6, 780, 440), { w: 786, h: 630 }, OPT); eq("six 780x440 in a 786x630 pane (1280 window)", [r.cols, r.rows, pc(r.score)], [2, 3, 42]); }
eq("the old fixed 3x2 would have given less in the same pane (53%)", (() => { const cw = (1276 - 12) / 3 - 6, ch = (910 - 6) / 2 - 6 - 17; return pc(Math.min(1, cw / 780, ch / 440)); })(), 53);
eq("two wide images in a squarish pane are stacked (1 across, 2 down)", (() => { const r = S.bestGrid(sq(2, 1000, 200), { w: 800, h: 600 }, OPT); return [r.cols, r.rows, pc(r.score)]; })(), [1, 2, 79]);
eq("four tall images in a wide short pane go side by side (4 across)", (() => { const r = S.bestGrid(sq(4, 300, 900), { w: 1200, h: 500 }, OPT); return [r.cols, r.rows]; })(), [4, 1]);
eq("mixed sizes: the smallest-scaled image decides (a huge image drives the choice)", (() => { const r = S.bestGrid([{ w: 50, h: 50 }, { w: 3000, h: 400 }, { w: 60, h: 40 }], { w: 900, h: 700 }, OPT); return [r.cols, r.rows, r.scales.map(pc)]; })(), [1, 3, [100, 30, 100]]);
for (const n of [2, 3, 4, 5, 6]) eq(`all images small enough to show at 100%: the default arrangement for ${n}`, (() => { const r = S.bestGrid(sq(n, 50, 50), { w: 1200, h: 800 }, OPT); return [r.cols, r.rows, r.score]; })(), [S.gridShape(n).cols, S.gridShape(n).rows, 1]);
eq("never upscaled: no scale above 1, even in a huge pane", S.bestGrid(sq(3, 10, 10), { w: 5000, h: 5000 }, OPT).scales.every((x) => x <= 1), true);
eq("the score is the smallest scale", (() => { const r = S.bestGrid([{ w: 100, h: 100 }, { w: 2000, h: 2000 }], { w: 1000, h: 600 }, OPT); return Math.abs(r.score - Math.min(...r.scales)) < 1e-12; })(), true);
eq("a pane too small for anything gives the default arrangement and score 0", (() => { const r = S.bestGrid(sq(4, 100, 100), { w: 10, h: 10 }, OPT); return [r.cols, r.rows, r.score]; })(), [2, 2, 0]);
eq("an empty (zero-size) pane does not throw", (() => { const r = S.bestGrid(sq(3, 100, 100), { w: 0, h: 0 }, OPT); return [r.cols, r.rows]; })(), [3, 1]);
eq("ties on the smallest scale go to the better average, then to the default arrangement", (() => { const r = S.bestGrid([{ w: 400, h: 400 }, { w: 400, h: 400 }, { w: 400, h: 400 }, { w: 40, h: 40 }], { w: 1000, h: 1000 }, OPT); return [r.cols, r.rows]; })(), [2, 2]);
eq("deterministic: same input, same answer", JSON.stringify(S.bestGrid(sq(5, 640, 480), { w: 1000, h: 700 }, OPT)), JSON.stringify(S.bestGrid(sq(5, 640, 480), { w: 1000, h: 700 }, OPT)));
eq("a larger pane never gives a smaller score", (() => { const a = S.bestGrid(sq(5, 640, 480), { w: 900, h: 600 }, OPT).score, b = S.bestGrid(sq(5, 640, 480), { w: 1200, h: 800 }, OPT).score; return b >= a; })(), true);

console.log(`select-unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
