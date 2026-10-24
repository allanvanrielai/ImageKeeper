// Measures list-item geometry across widths for the date line (date + label pill [+ saved badge]) and prints a table. No assertions: it reports.
// Usage: node layout-measure.mjs <app folder>
import path from "node:path";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";
const appDir = path.resolve(process.argv[2]);
const PORT = 47693, DBG = 9335, URL = `http://127.0.0.1:${PORT}/index.html`;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: 1920, height: 1080 });
await page.goto(URL); await page.eval(HELPERS); await page.eval(`T.wipe()`);
const L30 = "Quarterly report drafts 2026xx".slice(0, 30), LONG = "T".repeat(120);
await page.eval(`(async()=>{ const out=[]; for (let i=0;i<4;i++){ const b=await T.png(220,150,i*40), th=await T.png(110,75,i*40); out.push({id:'m'+i, title:${JSON.stringify(LONG)}, blob:b, thumb:th, type:'image/png', width:220, height:150, added:new Date(new Date().getFullYear()-(i%2),9,21,7,51).getTime(), saved:i>=2, label:${JSON.stringify(L30)}}); } await T.seed(out); })()`);
await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#list .item').length === 4`);
const cases = [["plain date", "m0"], ["date with year", "m1"], ["plain date + saved badge", "m2"], ["date with year + saved badge", "m3"]];
console.log("width | item | " + cases.map((c) => c[0] + " (date/label px)").join(" | "));
for (const [w, h] of [[1920, 1080], [1280, 800], [1024, 800], [821, 800], [820, 800], [600, 800], [400, 800], [340, 800]]) {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await sleep(250);
  const row = [];
  let item = 0;
  for (const [, id] of cases) {
    const g = await page.eval(`(()=>{ const li=document.querySelector('.item[data-id="${id}"]'), r=(e)=>e.getBoundingClientRect(), d=li.querySelector('.when'); return { item:r(li).width, date:r(d).width, label:r(li.querySelector('.label-in')).width, clipped:d.scrollWidth>d.clientWidth+0.5 }; })()`);
    item = g.item; row.push(`${Math.round(g.date)}/${Math.round(g.label)}${g.label < 80 ? " !" : ""}${g.clipped ? " DATE CLIPPED" : ""}`);
  }
  console.log(`${w} | ${Math.round(item)} | ` + row.join(" | "));
}
await page.close(); srv.kill();
