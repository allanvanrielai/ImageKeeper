// Page-side helpers injected into the app page by the browser tests (window.T).
export const HELPERS = `window.T = {
  png(w, h, hue) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = 'hsl(' + hue + ',60%,50%)'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(5, 5, w / 3, h / 3); return new Promise((r) => c.toBlob(r, 'image/png')); },
  idb() { return new Promise((res, rej) => { const r = indexedDB.open('imagekeeper', 1); r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async seed(recs) { const d = await T.idb(); await new Promise((res, rej) => { const t = d.transaction('items', 'readwrite'); recs.forEach((x) => t.objectStore('items').put(x)); t.oncomplete = res; t.onerror = () => rej(t.error); }); d.close(); },
  async wipe() { const d = await T.idb(); await new Promise((res, rej) => { const t = d.transaction('items', 'readwrite'); t.objectStore('items').clear(); t.oncomplete = res; t.onerror = () => rej(t.error); }); d.close(); localStorage.clear(); },
  async dump() { const d = await T.idb(); const all = await new Promise((res, rej) => { const r = d.transaction('items').objectStore('items').getAll(); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); d.close();
    return all.sort((a, b) => a.id < b.id ? -1 : 1).map((x) => ({ id: x.id, keys: Object.keys(x).sort(), title: x.title, type: x.type, width: x.width, height: x.height, added: x.added, saved: x.saved, blob: x.blob.size, thumb: x.thumb ? x.thumb.size : null, label: x.label })); },
  rows() { return [...document.querySelectorAll('#list .item')].map((li) => ({ id: li.dataset.id, title: li.querySelector('.title').value, label: li.querySelector('.label-in').value, hidden: li.hidden })); },
  vis() { return T.rows().filter((r) => !r.hidden); },
  chips() { return [...document.querySelectorAll('#chips .chip')].map((b) => ({ key: b.dataset.key, name: b.querySelector('.cn').textContent, count: +b.querySelector('.cc').textContent, on: b.getAttribute('aria-pressed') === 'true' })); },
  chipStr() { return T.chips().map((c) => c.name + ':' + c.count + (c.on ? '*' : '')).join(' | '); },
  async add(kind, n) { document.activeElement && document.activeElement.blur(); const before = items.size; const dt = new DataTransfer();
    for (let i = 0; i < n; i++) dt.items.add(new File([await T.png(60 + i * 7, 40 + i * 5, 200 + i * 20)], 'new' + i + '.png', { type: 'image/png' }));
    if (kind === 'drop') window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); else document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    const t0 = Date.now(); while (items.size < before + n && Date.now() - t0 < 6000) await new Promise((r) => setTimeout(r, 30)); await new Promise((r) => setTimeout(r, 120)); return items.size - before; }
};`;
