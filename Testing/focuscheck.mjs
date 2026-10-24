import path from "node:path"; import { startServer, launchChrome, sleep } from "./cdp.mjs"; import { HELPERS } from "./helpers.mjs";
const srv = await startServer("python", "E:/Personal_Projects/ImageKeeper/Launcher/serve.py", 47693, path.resolve(process.argv[2]));
const page = await launchChrome({ debugPort: 9335, width: 1280, height: 800 });
await page.goto("http://127.0.0.1:47693/index.html"); await page.eval(HELPERS); await page.eval("T.wipe()");
await page.eval(`(async()=>{ const out=[]; for (let i=0;i<6;i++){ out.push({id:'s'+i,title:'T'+i,blob:await T.png(80,60,i*40),thumb:await T.png(40,30,i*40),type:'image/png',width:80,height:60,added:Date.now()-i*1000,saved:false,label:['Work','Home','Ideas','Work','Zed','General'][i]}); } await T.seed(out); })()`);
await page.reload(); await page.eval(HELPERS); await page.waitFor("document.querySelectorAll('#chips .chip').length>=3");
await page.eval("document.querySelector('#chips .chip').focus()"); await page.key("Tab"); await page.key("Tab"); await page.key("Tab"); await sleep(100);
console.log("focused chip:", await page.eval("document.activeElement.dataset.key"));
const r = await page.eval(`(()=>{const c=document.getElementById('chips').getBoundingClientRect(), a=document.activeElement.getBoundingClientRect(); return {x:c.x,y:c.y,w:c.width,h:c.height, ax:a.x, ay:a.y, aw:a.width, ah:a.height};})()`);
console.log(JSON.stringify(r));
const out = process.argv[3];
await page.eval("document.querySelector('#chips .chip').focus()");
const shot = await page.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 120, width: 440, height: 110, scale: 2 } });
(await import("node:fs")).writeFileSync(out, Buffer.from(shot.data, "base64"));
// widths
for (const w of [800, 860, 900]) { await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: false }); await sleep(250);
  console.log(w, JSON.stringify(await page.eval(`(()=>{const b=document.getElementById('chips').getBoundingClientRect(), s=document.getElementById('side').getBoundingClientRect(), l=document.querySelector('#list .item'); const t=l.querySelector('.title').getBoundingClientRect(), n=l.querySelector('.label-in').getBoundingClientRect(); return {chipsRight:Math.round(b.right), sideRight:Math.round(s.right), item:Math.round(l.getBoundingClientRect().width), label:Math.round(n.width), pageScroll: document.documentElement.scrollWidth>innerWidth};})()`))); }
await page.close(); srv.kill();
