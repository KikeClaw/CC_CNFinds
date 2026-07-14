// Lector del GRID renderizado de Google Sheets (htmlview/sheet). A diferencia del
// CSV/gviz (que borran hipervínculos e imágenes), este endpoint público devuelve
// el grid con las <img> (fotos de producto) y los <a> (links) ya renderizados.
// Así sacamos foto + link + nombre + precio SIN API key y SIN scrapear Weidian.
import { parseAnyUrl } from "./parse.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const PRICE_RE = /[$€]\s?(\d{1,5}(?:[.,]\d{1,2})?)/;
// Hosts de imagen inestables (imágenes "en celda" de Google que caducan → 403).
const BAD_IMG = /googleusercontent\.com|docsubipk/i;
const isNoise = (s) => /^(link|image|imagen|price|precio|name|nombre|qc)$/i.test((s || "").trim());

// Los <a> de Sheets envuelven la URL real en google.com/url?q=<ENCODED>.
function unwrap(href) {
  const m = /[?&]q=([^&]+)/.exec(href);
  return m ? decodeURIComponent(m[1]) : href;
}
function cellText(td) {
  return td.replace(/^[^>]*>/, "").replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#\d+;|&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

export async function fetchSheetHtml(sheetId, gid, { timeoutMs = 30000 } = {}) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview/sheet?headers=true&gid=${gid}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  let html;
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`htmlview HTTP ${res.status}`);
    html = await res.text();
  } finally { clearTimeout(to); }

  const out = [];
  const seen = new Set();
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const cells = row.split(/<td\b/i).slice(1).map((td) => {
      const h = /href="([^"]+)"/i.exec(td);
      const im = /<img[^>]+src="([^"]+)"/i.exec(td);
      return { href: h ? unwrap(h[1].replace(/&amp;/g, "&")) : null, img: im ? im[1] : null, text: cellText(td) };
    });
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i].href) continue;
      const p = parseAnyUrl(cells[i].href);
      if (!p) continue;
      const key = `${p.platform}:${p.itemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // imagen del bloque (ventana i-3..i+3); subimos la resolución del thumbnail.
      // Descartamos lh3.googleusercontent/docsubipk: son imágenes "en celda" que
      // caducan (403). Preferimos sheets-images-rt (docs.google.com), que es estable.
      let image = null;
      for (let j = Math.max(0, i - 3); j <= Math.min(cells.length - 1, i + 3); j++) {
        if (cells[j].img && !BAD_IMG.test(cells[j].img)) { image = cells[j].img.replace(/=w\d+-h\d+$/, "=w800"); break; }
      }
      // precio
      let price = null;
      for (let j = Math.max(0, i - 3); j <= Math.min(cells.length - 1, i + 3); j++) {
        const m = cells[j].text.match(PRICE_RE); if (m) { price = parseFloat(m[1].replace(",", ".")); break; }
      }
      // nombre (texto no-ruido más cercano a la izquierda)
      let name = null;
      for (let j = i; j >= Math.max(0, i - 4); j--) {
        const t = cells[j].text;
        if (t && t.length > 3 && !isNoise(t) && !PRICE_RE.test(t)) { name = t.slice(0, 140); break; }
      }
      out.push({ platform: p.platform, itemId: p.itemId, name, price, image });
    }
  }
  return out;
}
