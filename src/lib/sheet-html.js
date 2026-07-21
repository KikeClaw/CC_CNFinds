// Lector del GRID renderizado de Google Sheets (htmlview/sheet). A diferencia del
// CSV/gviz (que borran hipervínculos e imágenes), este endpoint público devuelve
// el grid con las <img> (fotos de producto) y los <a> (links) ya renderizados.
// Así sacamos foto + link + nombre + precio SIN API key y SIN scrapear Weidian.
import { parseAnyUrl } from "./parse.js";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
// Precio en celda. Las hojas de la comunidad lo escriben de todas las formas:
// "$6.92", "€ 6.92", pero también "6,92$" (símbolo DETRÁS y coma decimal, muy común
// en las hojas europeas/chinas) y "￥480" en yuanes. Aceptamos las tres.
const PRICE_RE = /[$€￥¥]\s?\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s?[$€￥¥]/;
// Los yuanes se guardan como EUR aproximado (el precio real lo fija el agente).
const CNY_TO_EUR = 0.13;
function parsePrice(text) {
  const m = PRICE_RE.exec(text || "");
  if (!m) return null;
  const num = (m[0].match(/\d{1,6}(?:[.,]\d{1,2})?/) || [])[0];
  if (!num) return null;
  const val = parseFloat(num.replace(",", "."));
  if (!Number.isFinite(val)) return null;
  return /[￥¥]/.test(m[0]) ? Math.round(val * CNY_TO_EUR) : val;
}
// Hosts de imagen inestables (imágenes "en celda" de Google que caducan → 403).
const BAD_IMG = /googleusercontent\.com|docsubipk/i;
// El htmlview trae <script> con JS de la propia hoja (switchToSheet(...), etc.).
// Si no lo quitamos, ese código acaba colándose como "nombre" del producto.
const looksLikeCode = (s) => /switchToSheet|function\s*\(|\);|\{|\}|=>/.test(s || "");
const isNoise = (s) => /^(link|image|imagen|price|precio|name|nombre|qc)$/i.test((s || "").trim());

// Índices vecinos ordenados por CERCANÍA (i, i+1, i-1, i+2, i-2…). Muchas hojas meten
// VARIOS productos por fila en bloques [nombre, link, precio, foto]; recorriendo la
// ventana de izquierda a derecha se cogía el precio/la foto del bloque ANTERIOR.
function nearIdx(i, len, span = 3) {
  const out = [];
  if (i >= 0 && i < len) out.push(i);
  for (let d = 1; d <= span; d++) {
    if (i + d < len) out.push(i + d);
    if (i - d >= 0) out.push(i - d);
  }
  return out;
}

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
  // Fuera el JS/CSS de la hoja: si no, su código acaba como "nombre" de producto.
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");

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
      // imagen del bloque, buscando por CERCANÍA al link (ver nearIdx).
      // Descartamos lh3.googleusercontent/docsubipk: son imágenes "en celda" que
      // caducan (403). Preferimos sheets-images-rt (docs.google.com), que es estable.
      let image = null;
      for (const j of nearIdx(i, cells.length)) {
        if (cells[j].img && !BAD_IMG.test(cells[j].img)) { image = cells[j].img.replace(/=w\d+-h\d+$/, "=w800"); break; }
      }
      // precio
      let price = null;
      for (const j of nearIdx(i, cells.length)) {
        const p = parsePrice(cells[j].text); if (p != null) { price = p; break; }
      }
      // nombre (texto no-ruido más cercano a la izquierda; nunca código)
      let name = null;
      for (let j = i; j >= Math.max(0, i - 4); j--) {
        const t = cells[j].text;
        if (t && t.length > 3 && !isNoise(t) && !PRICE_RE.test(t) && !looksLikeCode(t)) { name = t.slice(0, 140); break; }
      }
      out.push({ platform: p.platform, itemId: p.itemId, name, price, image });
    }
  }
  return out;
}

// --- Hojas PUBLICADAS (Archivo → Publicar en la web) ---------------------------
// Usan OTRA URL: /spreadsheets/d/e/<pubId>/pubhtml. El <pubId> (empieza por 2PACX-)
// NO es el id del /d/<id>/ normal, así que discoverTabs/fetchSheet no valen. El índice
// /pubhtml lista el gid de cada pestaña; el grid vive en /pubhtml/sheet?gid=<gid>.
// A diferencia del htmlview normal, aquí una FILA suele ser un producto con VARIOS
// links de agente (el mismo item en Weidian y en Taobao). Por eso sacamos nombre,
// precio e imagen a nivel de fila y emitimos un candidato por cada link reconocido.
export function pubIdFromUrl(url) {
  const m = /\/spreadsheets\/d\/e\/([a-zA-Z0-9_-]+)/.exec(String(url || ""));
  return m ? m[1] : null;
}

// Etiquetas de columna de link (Weidian/Taobao/Kakobuy…): son texto de celda, no el
// nombre del producto. Se ignoran al elegir el nombre de la fila.
const AGENT_LABEL = /^(weidian|taobao|1688|kakobuy|allchinabuy|oopbuy|superbuy|hipobuy|mycnbox|mulebuy|litbuy|cssbuy|sugargoo|hoobuy|acbuy|cnfans|joya(goo|buy)|orientdig|lovegobuy|basetao|pandabuy|link|buy|qc|photos?|review|yupoo)$/i;
export async function fetchPublishedGids(pubId, { timeoutMs = 30000 } = {}) {
  const url = `https://docs.google.com/spreadsheets/d/e/${pubId}/pubhtml`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`pubhtml HTTP ${res.status}`);
    const html = await res.text();
    return [...new Set((html.match(/gid=(\d+)/g) || []).map((s) => s.slice(4)))];
  } finally { clearTimeout(to); }
}

export async function fetchPublishedSheet(pubId, gid, { timeoutMs = 30000 } = {}) {
  const url = `https://docs.google.com/spreadsheets/d/e/${pubId}/pubhtml/sheet?headers=false&gid=${gid}`;
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  let html;
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`pubhtml sheet HTTP ${res.status}`);
    html = await res.text();
  } finally { clearTimeout(to); }
  html = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");

  const out = [];
  for (const row of html.split(/<tr\b/i).slice(1)) {
    const cells = row.split(/<td\b/i).slice(1).map((td) => ({
      href: (/href="([^"]+)"/i.exec(td) || [])[1],
      img: (/<img[^>]+src="([^"]+)"/i.exec(td) || [])[1],
      text: cellText(td),
    }));
    // nombre = el texto más largo de la fila que no sea precio, etiqueta de agente ni código
    let name = null;
    for (const c of cells) {
      const t = c.text;
      if (t && t.length >= 5 && !PRICE_RE.test(t) && !AGENT_LABEL.test(t) && !looksLikeCode(t)) {
        if (!name || t.length > name.length) name = t;
      }
    }
    if (name) name = name.slice(0, 140);
    let price = null;
    for (const c of cells) { const p = parsePrice(c.text); if (p != null) { price = p; break; } }
    // Imagen de la fila. En hojas publicadas las <img> docsubipk sí se pueden embeber
    // (CORP cross-origin) y son la ÚNICA foto de los items de Taobao (que no se
    // enriquecen), así que aquí NO aplicamos el filtro BAD_IMG.
    let image = null;
    for (const c of cells) { if (c.img) { image = c.img.replace(/&amp;/g, "&"); break; } }
    const seen = new Set();
    for (const c of cells) {
      if (!c.href) continue;
      const p = parseAnyUrl(unwrap(c.href.replace(/&amp;/g, "&")));
      if (!p) continue;
      const key = `${p.platform}:${p.itemId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ platform: p.platform, itemId: p.itemId, name, price, image });
    }
  }
  return out;
}
