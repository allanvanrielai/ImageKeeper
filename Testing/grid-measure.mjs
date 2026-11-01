// Reports how the grid view arranges a set of images and at what scale each is shown. No assertions: it prints.
// Usage: node grid-measure.mjs <app folder> [window WxH, default 1920x1080] [image sizes, e.g. 780x440,780x440,... default six of 780x440]
import path from "node:path";
import { startServer, launchChrome, sleep } from "./cdp.mjs";
import { HELPERS } from "./helpers.mjs";
const appDir = path.resolve(process.argv[2]);
const [W, H] = (process.argv[3] || "1920x1080").split("x").map(Number);
const sizes = (process.argv[4] || Array(6).fill("780x440").join(",")).split(",").map((s) => s.split("x").map(Number));
const PORT = 47697, DBG = 9339;
const srv = await startServer(process.env.IK_PY || "python", process.env.IK_SERVE || "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", PORT, appDir);
const page = await launchChrome({ debugPort: DBG, width: W, height: H });
await page.goto(`http://127.0.0.1:${PORT}/index.html`); await page.eval(HELPERS); await page.eval(`T.wipe()`);
const BASE = new Date(2026, 9, 24, 9, 0).getTime();
await page.eval(`(async()=>{ const S=${JSON.stringify(sizes)}, out=[]; for (let i=0;i<S.length;i++){ out.push({id:'m'+i,title:'Image '+(i+1),blob:await T.png(S[i][0],S[i][1],i*50),thumb:await T.png(Math.round(S[i][0]/8),Math.round(S[i][1]/8),i*50),type:'image/png',width:S[i][0],height:S[i][1],added:${BASE}+i*60000,saved:false,source:'paste',label:'General'}); } await T.seed(out); })()`);
await page.reload(); await page.eval(HELPERS); await page.waitFor(`document.querySelectorAll('#list .item').length === ${sizes.length}`);
await page.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false }); await sleep(300);
const ids = await page.eval(`T.vis().map(r => r.id)`);
await page.click(`.item[data-id="${ids[0]}"] .thumb`);
for (const id of ids.slice(1)) await page.click(`.item[data-id="${id}"] .thumb`, { modifiers: 2 });
await sleep(400);
const r = await page.eval(`(()=>{ const g = document.querySelector('.pgrid').getBoundingClientRect(), cells = [...document.querySelectorAll('.pgrid .gcell')];
  return { pane: [Math.round(g.width), Math.round(g.height)], cols: new Set(cells.map(c => Math.round(c.getBoundingClientRect().x))).size, rows: new Set(cells.map(c => Math.round(c.getBoundingClientRect().y))).size,
    scales: cells.map(c => { const i = c.querySelector('img'), b = i.getBoundingClientRect(); return Math.round(100 * Math.min(b.width / i.naturalWidth, b.height / i.naturalHeight)); }),
    cell: (() => { const b = cells[0].getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })() }; })()`);
console.log(`${sizes.length} images, window ${W}x${H}: pane ${r.pane[0]}x${r.pane[1]}, arrangement ${r.cols} across x ${r.rows} down, cell ${r.cell[0]}x${r.cell[1]}, display scale % of each image: ${r.scales.join(", ")} (smallest ${Math.min(...r.scales)}%)`);
await page.close(); srv.kill();
