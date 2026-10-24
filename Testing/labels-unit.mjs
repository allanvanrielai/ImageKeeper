// Unit tests for the <label-logic> block of app/index.html. Usage: node labels-unit.mjs <path to index.html>
import fs from "node:fs";
import vm from "node:vm";
const file = process.argv[2];
const html = fs.readFileSync(file, "utf8");
const m = html.match(/\/\/ ===== <label-logic>[\s\S]*?\/\/ ===== <\/label-logic> =====/);
if (!m) { console.log("FAIL: label-logic block not found"); process.exit(1); }
const L = vm.runInNewContext(m[0] + "\n({LABEL_GENERAL,LABEL_ALL,LABEL_MAX,KEY_GENERAL,KEY_ALL,labelKey,cleanLabel,resolveLabel,normalizeLoadedLabels,chipList,isCustomChip,pickChip,itemsInScope,suggestLabels,planRename,applyRename})");
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log("FAIL", name, "\n  got      ", JSON.stringify(a), "\n  expected ", JSON.stringify(b))); };
const mk = (...labels) => labels.map((l, i) => ({ id: "i" + i, added: i + 1, label: l }));

// cleanLabel
eq("trim", L.cleanLabel("  Work  "), "Work");
eq("collapse inner spaces", L.cleanLabel("a   b\t c"), "a b c");
eq("max 30 chars", L.cleanLabel("x".repeat(45)), "x".repeat(30));
eq("30 exactly kept", L.cleanLabel("y".repeat(30)).length, 30);
eq("trim after cut", L.cleanLabel("a".repeat(29) + " bbbb"), "a".repeat(29));
eq("null -> empty", L.cleanLabel(null), "");
eq("emoji counted as one char", Array.from(L.cleanLabel("\u{1F600}".repeat(40))).length, 30);

// resolveLabel
eq("empty -> General", L.resolveLabel("", []), { ok: true, label: "General" });
eq("blank -> General", L.resolveLabel("   ", ["Work"]), { ok: true, label: "General" });
eq("general lower -> General", L.resolveLabel("general", ["Work"]), { ok: true, label: "General" });
eq("GENERAL upper -> General", L.resolveLabel("GENERAL", []), { ok: true, label: "General" });
eq("gEnErAl -> General", L.resolveLabel(" gEnErAl ", []), { ok: true, label: "General" });
eq("All reserved", L.resolveLabel("All", []), { ok: false, reason: "reserved" });
eq("all reserved lower", L.resolveLabel("all", ["Work"]), { ok: false, reason: "reserved" });
eq("  ALL  reserved", L.resolveLabel("  ALL ", []), { ok: false, reason: "reserved" });
eq("new label keeps typed case", L.resolveLabel("Holiday", ["Work"]), { ok: true, label: "Holiday" });
eq("existing label other case -> first form", L.resolveLabel("work", ["Work"]), { ok: true, label: "Work" });
eq("existing label other case 2", L.resolveLabel("WORK", ["Work", "work2"]), { ok: true, label: "Work" });
eq("All-like but different is fine", L.resolveLabel("All good", []), { ok: true, label: "All good" });
eq("Allied is fine", L.resolveLabel("Allied", []), { ok: true, label: "Allied" });
eq("over-long typed text cut to 30", L.resolveLabel("z".repeat(40), []).label.length, 30);

// normalizeLoadedLabels
{
  const legacy = [{ id: "a", added: 3, title: "t" }, { id: "b", added: 1, title: "t", label: undefined }, { id: "c", added: 2, label: null }, { id: "d", added: 4, label: "" }, { id: "e", added: 5, label: 7 }];
  L.normalizeLoadedLabels(legacy);
  eq("legacy -> all General", legacy.map((x) => x.label), ["General", "General", "General", "General", "General"]);
  eq("legacy: nothing else touched", legacy.map((x) => Object.keys(x).filter((k) => k !== "label")), [["id", "added", "title"], ["id", "added", "title"], ["id", "added"], ["id", "added"], ["id", "added"]]);
  const mixed = [{ id: "x", added: 5, label: "work" }, { id: "y", added: 2, label: "Work" }, { id: "z", added: 9, label: "general" }, { id: "w", added: 1, label: "ALL" }, { id: "v", added: 3, label: "q".repeat(50) }];
  L.normalizeLoadedLabels(mixed);
  eq("normalize: case variants take earliest form, general/all fixed, long cut", mixed.map((x) => x.label), ["Work", "Work", "General", "General", "q".repeat(30)]);
  const order = [{ id: "p", added: 2 }, { id: "q", added: 1 }]; L.normalizeLoadedLabels(order);
  eq("normalize does not reorder the array", order.map((x) => x.id), ["p", "q"]);
}

// chipList
{
  const none = L.chipList([]);
  eq("empty: All(0), General(0)", none, [{ key: "all", label: "All", count: 0 }, { key: "general", label: "General", count: 0 }]);
  const list = mk("General", "zed", "Beta", "alpha", "Beta", "General", "Item 10", "Item 2");
  eq("chips: All, General, then alphabetical (case-insensitive, numeric)", L.chipList(list).map((c) => c.label + ":" + c.count), ["All:8", "General:2", "alpha:1", "Beta:2", "Item 2:1", "Item 10:1", "zed:1"]);
  eq("General visible with 0", L.chipList(mk("Work")).map((c) => c.label + ":" + c.count), ["All:1", "General:0", "Work:1"]);
  eq("chip disappears with its last image", L.chipList(mk("General")).map((c) => c.label), ["All", "General"]);
}
eq("isCustomChip", ["all", "general", "work"].map(L.isCustomChip), [false, false, true]);

// pickChip
{
  const list = mk("Work", "General");
  eq("pick: stored exists", L.pickChip("work", list), "work");
  eq("pick: stored missing -> all", L.pickChip("gone", list), "all");
  eq("pick: null -> all", L.pickChip(null, list), "all");
  eq("pick: general with 0 images stays", L.pickChip("general", mk("Work")), "general");
  eq("pick: all", L.pickChip("all", list), "all");
}

// itemsInScope
{
  const list = mk("Work", "General", "work", "Home");
  eq("scope all = everything", L.itemsInScope(list, "all").length, 4);
  eq("scope work (case-insensitive)", L.itemsInScope(list, "work").map((x) => x.id), ["i0", "i2"]);
  eq("scope general", L.itemsInScope(list, "general").map((x) => x.id), ["i1"]);
  eq("scope unknown = none", L.itemsInScope(list, "zzz").length, 0);
  eq("scope returns a copy for all", L.itemsInScope(list, "all") !== list, true);
}

// suggestLabels
{
  const list = mk("Work", "Wedding", "Home", "General");
  eq("suggest: no text -> all labels, chip order", L.suggestLabels(null, list).map((o) => o.label), ["General", "Home", "Wedding", "Work"]);
  eq("suggest: substring, case-insensitive", L.suggestLabels("W", list).map((o) => o.label + (o.create ? "+" : "")), ["Wedding", "Work", "W+"]);
  eq("suggest: exact existing has no create entry", L.suggestLabels("work", list).map((o) => o.label + (o.create ? "+" : "")), ["Work"]);
  eq("suggest: nothing matches -> create only", L.suggestLabels("Zzz", list), [{ label: "Zzz", count: 0, create: true }]);
  eq("suggest: All never offered or created", L.suggestLabels("all", list), []);
  eq("suggest: General typed is not created", L.suggestLabels("general", list).map((o) => o.label + (o.create ? "+" : "")), ["General"]);
}

// planRename
{
  const list = mk("Work", "Work", "Home", "General");
  eq("rename General refused", L.planRename(list, "general", "X").kind, "error");
  eq("rename All refused", L.planRename(list, "all", "X").kind, "error");
  eq("rename to empty", L.planRename(list, "work", "  ").kind, "error");
  eq("rename to All (any case)", L.planRename(list, "work", "aLL").kind, "error");
  eq("rename unknown label", L.planRename(list, "nope", "X").kind, "error");
  eq("rename to same name = noop", L.planRename(list, "work", " Work ").kind, "noop");
  eq("rename case only", L.planRename(list, "work", "WORK"), { kind: "case", label: "WORK" });
  eq("rename to new name", L.planRename(list, "work", "Projects"), { kind: "rename", label: "Projects" });
  eq("rename to existing (other case) = merge", L.planRename(list, "work", "home"), { kind: "merge", label: "Home", key: "home", count: 2, intoCount: 1, from: "Work" });
  eq("rename into General = merge", L.planRename(list, "work", "general"), { kind: "merge", label: "General", key: "general", count: 2, intoCount: 1, from: "Work" });
  eq("rename into General with 0 images = merge", L.planRename(mk("Work"), "work", "General").kind, "merge");
  eq("rename trims and cuts to 30", L.planRename(list, "work", "n".repeat(40)).label.length, 30);
  const l2 = mk("Work", "Work", "Home"); const changed = L.applyRename(l2, "work", "Projects");
  eq("applyRename relabels exactly the chip's images", [changed.length, l2.map((x) => x.label)], [2, ["Projects", "Projects", "Home"]]);
  const l3 = mk("Work", "Home", "Work"); L.applyRename(l3, "work", "Home");
  eq("merge result: one chip, shared form", L.chipList(l3).map((c) => c.label + ":" + c.count), ["All:3", "General:0", "Home:3"]);
}
console.log(`labels-unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
