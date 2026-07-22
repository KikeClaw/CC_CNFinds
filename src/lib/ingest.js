// Orquestador del importador universal.
import { detectHeaderBlocks, normalizeRow } from "./normalize.js";
import { harvestRows } from "./harvest.js";
import { extractBrand } from "./brands.js";
import { upsertProduct } from "./db.js";

export function sheetIdFromUrl(url) {
  const m = String(url || "").match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  const t = String(url || "").trim();
  return /^[a-zA-Z0-9_-]{25,}$/.test(t) ? t : null;
}

// Filas (2D) -> candidatos: 1) detección de bloques (hojas reps con columna ID),
// 2) cosecha de URLs (link dumps / celdas con enlaces reales).
export function rowsToCandidates(rows) {
  const cands = [];
  const { headerIndex, blocks } = detectHeaderBlocks(rows);
  if (headerIndex >= 0) {
    for (const cells of rows.slice(headerIndex + 1)) {
      if (cells.length === 1 && !String(cells[0]).trim()) continue;
      for (const cols of blocks) {
        const p = normalizeRow(cells, cols);
        if (p) cands.push({ platform: p.platform, itemId: p.item_id, name: p.name, price: p.price_eur, image: p.image_url, category: p.category });
      }
    }
  }
  cands.push(...harvestRows(rows));
  return cands;
}

// Puerta de calidad: un producto SIN nombre real es basura — no se puede buscar
// ni mostrar, acaba como "weidian-12345" y la IA lo "limpia" a "Artículo Weidian
// 12345". Las hojas traen filas así (cabeceras, navegación, celdas con JS…).
const CODEY = /switchToSheet|function\s*\(|\);|\{|\}|=>/;

// Contenido fuera de nicho: las hojas de la comunidad traen a veces pestañas de
// sex shop y de lencería sexy. No encaja en una web de moda/streetwear, desentona
// en la home y es un riesgo con Google/AdSense. Se bloquea en la ingesta.
// (La ropa interior normal —boxers, calcetines— NO se bloquea: solo lo explícito.)
const ADULT = /\b(sex[\s-]?toys?|adult[\s-]?toys?|sex[\s-]?products?|dildos?|vibrators?|masturbat\w*|butt[\s-]?plugs?|anal[\s-]?plugs?|condoms?|penis|vagina|lingerie|lencer[íi]a|babydoll|crotchless)\b/i;
export function isAdult(s) { return ADULT.test(String(s || "")); }

// Etiquetas de NAVEGACIÓN de la hoja ("Shoes", "Jackets", "Girl", "Accessories"…):
// son enlaces a otra pestaña o a una colección, no productos. Un producto de verdad
// trae marca o modelo ("Nike Air Max TN"), no una sola palabra genérica. Se cuelan
// en la fila de menú que casi todas las hojas ponen arriba.
const NAV_WORD = /^(girl|boy|kids?|child(ren)?|women|woman|men|man|unisex|toys?|socks?|hats?|caps?|bags?|shoes?|sneakers?|boots?|slides?|jackets?|jerseys?|pants?|trousers?|shorts?|tees?|t-?shirts?|shirts?|hoodies?|sweaters?|sweatshirts?|coats?|vests?|belts?|wallets?|watch(es)?|glasses|sunglasses|accessor(y|ies)|electronics?|perfumes?|jewel(le)?ry|underwear|lingerie|home|new|hot|sale|all|other|más|mas|nuevo|ropa|zapatos|zapatillas|gorras?|bolsos?|relojes?|cinturones?|ni[ñn][ao]s?|mujer|hombre)$/i;

export function usableName(s) {
  const t = String(s || "").trim();
  if (t.length < 4) return false;
  if (CODEY.test(t)) return false;                                  // JS de la hoja
  if (/^\d+$/.test(t)) return false;                                // solo números
  if (NAV_WORD.test(t)) return false;                               // menú de la hoja
  if (/^(weidian|taobao|1688)-\d+$/i.test(t)) return false;         // nuestro propio fallback
  if (/^(link|image|imagen|price|precio|name|nombre|qc|na|n\/a)$/i.test(t)) return false;
  return true;
}

// Dedup (dentro del lote + contra la DB) y clasifica new/existing.
export function dedupe(db, cands) {
  const seen = new Set(), res = [];
  const q = db.prepare("SELECT 1 FROM products WHERE platform=? AND item_id=?");
  for (const c of cands) {
    if (!c.platform || !c.itemId) continue;
    // Los volcados de links (noName) no traen nombre y lo pone el enriquecimiento
    // después; el resto sí exige nombre real (una fila de hoja sin nombre es basura).
    if (!c.noName && !usableName(c.name)) continue;
    if (isAdult(c.name)) continue;     // fuera el sex shop (no es nuestro nicho)
    const key = c.platform + "|" + c.itemId;
    if (seen.has(key)) continue;
    seen.add(key);
    res.push({ ...c, status: q.get(c.platform, c.itemId) ? "existing" : "new" });
  }
  return res;
}

// Inserta/actualiza con NUESTROS IDs (los links se generan al vuelo desde item_id).
export function apply(db, cands, source) {
  const now = new Date().toISOString();
  const q = db.prepare("SELECT 1 FROM products WHERE platform=? AND item_id=?");
  let added = 0, updated = 0;
  db.exec("BEGIN");
  try {
    for (const c of cands) {
      if (!c.platform || !c.itemId) continue;
      const before = q.get(c.platform, c.itemId);
      const name = (c.name || `${c.platform}-${c.itemId}`).replace(/\s+/g, " ").trim().slice(0, 140);
      upsertProduct(db, {
        platform: c.platform, item_id: c.itemId, name, brand: extractBrand(name),
        category: c.category || null, price_eur: c.price ?? null, image_url: c.image || null, hot: 0,
      }, source, now);
      before ? updated++ : added++;
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  return { added, updated };
}
