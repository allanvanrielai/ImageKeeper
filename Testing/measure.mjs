// Page-side contrast helpers (window.M), injected into the app page by looks.mjs and notes-looks.mjs: computed colours, translucent layers composited.
export const MEASURE = `window.M = (() => {
  const parse = (c) => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return [0,0,0,0]; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const over = (top, under) => { const a = top[3]; return [top[0]*a + under[0]*(1-a), top[1]*a + under[1]*(1-a), top[2]*a + under[2]*(1-a), 1]; };
  const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }; return 0.2126*f(c[0]) + 0.7152*f(c[1]) + 0.0722*f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
  // effective background behind an element: its own and its ancestors' background colours composited (document default white at the bottom)
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) layers.push(parse(getComputedStyle(e).backgroundColor)); let c = [255,255,255,1]; for (let i = layers.length - 1; i >= 0; i--) c = over(layers[i], c); return c; };
  const bgBehind = (el) => (el.parentElement ? bgOf(el.parentElement) : [255,255,255,1]);
  const q = (s) => document.querySelector(s);
  const out = [];
  const text = (name, el) => { const cs = getComputedStyle(el); const bg = bgOf(el); const fg = over(parse(cs.color), bg); out.push({ name, kind: 'text', ratio: ratio(fg, bg), size: cs.fontSize, weight: cs.fontWeight }); };
  const border = (name, el) => { const cs = getComputedStyle(el); const bw = parseFloat(cs.borderTopWidth); if (!bw) { out.push({ name, kind: 'boundary', ratio: null, note: 'no border' }); return; } const sur = bgBehind(el); const b = over(parse(cs.borderTopColor), sur); out.push({ name, kind: 'boundary', ratio: ratio(b, sur) }); };
  const fill = (name, el) => { out.push({ name, kind: 'boundary', ratio: ratio(bgOf(el), bgBehind(el)) }); };
  const ring = (name, el) => { const c = parse(getComputedStyle(document.documentElement).getPropertyValue('--focus').trim().startsWith('#') ? hex(getComputedStyle(document.documentElement).getPropertyValue('--focus').trim()) : 'rgb(0,0,0)'); out.push({ name, kind: 'boundary', ratio: ratio(c, bgBehind(el)) }); };
  const hex = (h) => { h = h.replace('#',''); if (h.length === 3) h = h.split('').map(x=>x+x).join(''); return 'rgb(' + parseInt(h.slice(0,2),16) + ',' + parseInt(h.slice(2,4),16) + ',' + parseInt(h.slice(4,6),16) + ')'; };
  return { parse, over, ratio, bgOf, bgBehind, q, out, text, border, fill, ring };
})();`;
