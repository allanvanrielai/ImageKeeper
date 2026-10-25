// Minimal Chrome DevTools Protocol driver (Node 22+ built-in WebSocket; no packages). Throwaway profile, own server on its own port.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
const get = (url) => new Promise((res, rej) => { http.get(url, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res({ ok: r.statusCode === 200, text: () => b, json: () => JSON.parse(b) })); }).on("error", rej); });

export const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export { sleep };

export async function startServer(py, serveFile, port, folder) {
  const p = spawn(py, [serveFile, String(port), folder], { stdio: "ignore" });
  for (let i = 0; i < 50; i++) { try { const r = await get(`http://127.0.0.1:${port}/index.html`); if (r.ok) return p; } catch (e) {} await sleep(100); }
  throw new Error("server did not start");
}

export async function launchChrome({ debugPort, width = 1280, height = 800, headless = true }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ik-chrome-"));
  const proc = spawn(CHROME, [`--user-data-dir=${dir}`, `--remote-debugging-port=${debugPort}`, ...(headless ? ["--headless=new"] : []), "--no-first-run", "--no-default-browser-check",
    `--window-size=${width},${height}`, "--disable-extensions", "--force-device-scale-factor=1", "about:blank"], { stdio: "ignore" });
  for (let i = 0; i < 100; i++) { try { const r = await get(`http://127.0.0.1:${debugPort}/json/version`); if (r.ok) break; } catch (e) {} await sleep(100); }
  const targets = (await get(`http://127.0.0.1:${debugPort}/json/list`)).json();
  const t = targets.find((x) => x.type === "page");
  const page = new Page(t.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable"); await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
  page.close = async () => { try { page.ws.close(); } catch (e) {} proc.kill(); await sleep(500); try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch (e) {} };
  return page;
}

class Page {
  constructor(url) {
    this.id = 0; this.pending = new Map(); this.listeners = [];
    this.ws = new WebSocket(url);
    this.ready = new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id && this.pending.has(d.id)) { const { res, rej } = this.pending.get(d.id); this.pending.delete(d.id); d.error ? rej(new Error(d.error.message)) : res(d.result); }
      else if (d.method) this.listeners.forEach((l) => l(d));
    };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
  async eval(expr) {
    const r = await this.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error("page error: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async goto(url) {
    const loaded = new Promise((res) => { const l = (d) => { if (d.method === "Page.loadEventFired") { this.listeners = this.listeners.filter((x) => x !== l); res(); } }; this.listeners.push(l); });
    await this.send("Page.navigate", { url }); await loaded;
  }
  async reload() {
    const loaded = new Promise((res) => { const l = (d) => { if (d.method === "Page.loadEventFired") { this.listeners = this.listeners.filter((x) => x !== l); res(); } }; this.listeners.push(l); });
    await this.send("Page.reload", { ignoreCache: true }); await loaded;
  }
  async waitFor(expr, ms = 8000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await this.eval(expr)) return true; } catch (e) {} await sleep(50); } throw new Error("timeout waiting for: " + expr); }
  async rect(sel) { const r = await this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'nearest',inline:'nearest'});const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height}})()`); if (!r) throw new Error("no element " + sel); return r; }
  async click(sel, { dx, dy } = {}) {
    const r = await this.rect(sel), x = r.x + (dx ?? r.w / 2), y = r.y + (dy ?? r.h / 2);
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await sleep(60);
  }
  async key(name) {
    const map = { ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27, Tab: 9, Backspace: 8, Delete: 46 };
    const vk = map[name]; const base = { key: name, code: name, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await this.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...base, ...(name === "Enter" ? { text: "\r" } : {}) });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
    await sleep(60);
  }
  async type(text) { for (const ch of text) { await this.send("Input.insertText", { text: ch }); } await sleep(40); }
  async insert(text) { await this.send("Input.insertText", { text }); await sleep(40); }
  async shot(file) { const r = await this.send("Page.captureScreenshot", { format: "png" }); fs.writeFileSync(file, Buffer.from(r.data, "base64")); }
}
