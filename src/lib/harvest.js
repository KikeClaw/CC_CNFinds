// Cosecha "ciega al formato": de cualquier fila/texto saca identidades de
// producto (plataforma + itemID) buscando URLs reconocibles en TODAS las celdas.
import { parseAnyUrl } from "./parse.js";
import { parsePriceField } from "./price.js";

const URL_RE = /https?:\/\/[^\s"'<>)\]]+/gi;
const PRICE_RE = /(?:€|eur|\$|¥|cny|rmb)?\s?\d+[.,]\d{1,2}/i;

const extractUrls = (s) => { const out = []; let m; URL_RE.lastIndex = 0; while ((m = URL_RE.exec(s))) out.push(m[0]); return out; };
const isPrice = (s) => PRICE_RE.test(s);
// La celda ya pasó por isPrice(), así que aquí un número pelado sí es precio; el
// parseo central se encarga de la moneda ($ y ¥ se convierten a euros).
const parsePrice = (s) => parsePriceField(s);
const isImageUrl = (u) => /geilicdn|\.(jpe?g|png|webp)(\?|$)/i.test(u);

// Filas (array 2D) -> candidatos. Nombre/precio/imagen por heurística.
export function harvestRows(rows) {
  const out = [];
  for (const row of rows) {
    const cells = (row || []).map((c) => (c == null ? "" : String(c)));
    const urls = cells.flatMap(extractUrls);
    let ident = null;
    for (const u of urls) { const p = parseAnyUrl(u); if (p) { ident = p; break; } }
    if (!ident) continue;
    let name = null, nl = 0;
    for (const c of cells) {
      const t = c.trim();
      if (!t || /^https?:/i.test(t) || isPrice(t) || /^\d+$/.test(t)) continue;
      if (t.length > nl) { nl = t.length; name = t; }
    }
    const priceCell = cells.find(isPrice);
    const image = urls.find(isImageUrl) || null;
    out.push({ platform: ident.platform, itemId: ident.itemId, name, price: priceCell ? parsePrice(priceCell) : null, image });
  }
  return out;
}

// Texto libre (hilo de Reddit / volcado de Telegram / lista de links).
export function harvestText(text) {
  const out = [], seen = new Set();
  for (const u of extractUrls(String(text || ""))) {
    const p = parseAnyUrl(u);
    if (p) { const k = p.platform + "|" + p.itemId; if (!seen.has(k)) { seen.add(k); out.push({ platform: p.platform, itemId: p.itemId, name: null, price: null, image: null }); } }
  }
  return out;
}
