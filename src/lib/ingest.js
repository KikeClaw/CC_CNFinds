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
export function usableName(s) {
  const t = String(s || "").trim();
  if (t.length < 4) return false;
  if (CODEY.test(t)) return false;                                  // JS de la hoja
  if (/^\d+$/.test(t)) return false;                                // solo números
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
    if (!usableName(c.name)) continue; // fuera las filas sin nombre real
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
