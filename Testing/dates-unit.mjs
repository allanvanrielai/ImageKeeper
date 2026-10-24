// Unit tests for the <date-logic> block of app/index.html (list-item date format). Usage: node dates-unit.mjs <path to index.html>
// Dates are built from local-time parts, so the tests give the same answer in any time zone.
import fs from "node:fs";
import vm from "node:vm";
const html = fs.readFileSync(process.argv[2], "utf8");
const m = html.match(/\/\/ ===== <date-logic>[\s\S]*?\/\/ ===== <\/date-logic> =====/);
if (!m) { console.log("FAIL: date-logic block not found"); process.exit(1); }
const D = vm.runInNewContext(m[0] + "\n({fmtItemDate, MONTHS_EN})");
let pass = 0, fail = 0;
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log("FAIL", name, "\n  got      ", JSON.stringify(a), "\n  expected ", JSON.stringify(b))); };
const at = (y, mo, d, h, mi, s = 0, ms = 0) => new Date(y, mo - 1, d, h, mi, s, ms).getTime();
const NOW = at(2026, 10, 24, 12, 0);

// the example from the brief, and the year rule
eq("example: 21 Oct 07:51 (this year, no year)", D.fmtItemDate(at(2026, 10, 21, 7, 51), NOW), "21 Oct 07:51");
eq("example: other year shows the year", D.fmtItemDate(at(2025, 10, 21, 7, 51), NOW), "21 Oct 2025 07:51");
eq("next year shows the year too", D.fmtItemDate(at(2027, 1, 5, 9, 5), NOW), "5 Jan 2027 09:05");
// day: no leading zero; hours and minutes: leading zeros; 24-hour, no AM/PM
eq("single-digit day has no leading zero", D.fmtItemDate(at(2026, 3, 5, 14, 30), NOW), "5 Mar 14:30");
eq("hour and minute zero-padded", D.fmtItemDate(at(2026, 3, 5, 3, 4), NOW), "5 Mar 03:04");
eq("afternoon is 24-hour (13:07, not 1:07 PM)", D.fmtItemDate(at(2026, 6, 15, 13, 7), NOW), "15 Jun 13:07");
eq("no AM/PM anywhere", /AM|PM/i.test(D.fmtItemDate(at(2026, 6, 15, 13, 7), NOW)), false);
eq("two-digit day", D.fmtItemDate(at(2026, 12, 31, 18, 45), NOW), "31 Dec 18:45");
// near midnight
eq("00:00 shows 00:00 (not 24:00, not 12:00)", D.fmtItemDate(at(2026, 4, 9, 0, 0), NOW), "9 Apr 00:00");
eq("00:01", D.fmtItemDate(at(2026, 4, 9, 0, 1), NOW), "9 Apr 00:01");
eq("23:59", D.fmtItemDate(at(2026, 4, 9, 23, 59), NOW), "9 Apr 23:59");
eq("23:59:59.999 stays 23:59 on the same day", D.fmtItemDate(at(2026, 4, 9, 23, 59, 59, 999), NOW), "9 Apr 23:59");
eq("one minute apart across midnight: day changes", [D.fmtItemDate(at(2026, 4, 9, 23, 59), NOW), D.fmtItemDate(at(2026, 4, 10, 0, 0), NOW)], ["9 Apr 23:59", "10 Apr 00:00"]);
// year boundary (item year versus the current year)
eq("31 Dec 23:59 last year, now 1 Jan 00:00 -> year shown", D.fmtItemDate(at(2025, 12, 31, 23, 59), at(2026, 1, 1, 0, 0)), "31 Dec 2025 23:59");
eq("1 Jan 00:00 this year, now 1 Jan 00:00 -> no year", D.fmtItemDate(at(2026, 1, 1, 0, 0), at(2026, 1, 1, 0, 0)), "1 Jan 00:00");
eq("31 Dec 23:59 this year, now 31 Dec 23:59 -> no year", D.fmtItemDate(at(2026, 12, 31, 23, 59), at(2026, 12, 31, 23, 59)), "31 Dec 23:59");
eq("same instant, a minute later is the new year: old image gains its year", [D.fmtItemDate(at(2026, 12, 31, 23, 59), at(2026, 12, 31, 23, 59)), D.fmtItemDate(at(2026, 12, 31, 23, 59), at(2027, 1, 1, 0, 0))], ["31 Dec 23:59", "31 Dec 2026 23:59"]);
// all twelve month names, English short forms
eq("month names", Array.from({ length: 12 }, (_, i) => D.fmtItemDate(at(2026, i + 1, 2, 10, 0), NOW).split(" ")[1]), ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]);
eq("leap day", D.fmtItemDate(at(2028, 2, 29, 8, 0), at(2028, 6, 1, 0, 0)), "29 Feb 08:00");
// the current time is used when no 'now' is given
eq("default now = current year", D.fmtItemDate(Date.now()).split(" ").length, 3);
eq("default now: an old year shows it", D.fmtItemDate(at(2001, 9, 9, 1, 2)), "9 Sep 2001 01:02");
// display only: the function does not touch its input
{ const t = at(2026, 5, 5, 5, 5); D.fmtItemDate(t, NOW); eq("input timestamp unchanged", t, at(2026, 5, 5, 5, 5)); }

console.log(`dates-unit: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
