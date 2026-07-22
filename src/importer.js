// =============================================================================
//  IMPORTADOR  (Fase 1)
//  Google Sheet (TODAS las pestanas) -> CSV por tab -> normaliza
//    -> DEDUP por (platform,itemId) -> SQLite
//    -> categoria = nombre de la pestana; "HOT SALE" = flag, no categoria
//    -> genera links de afiliado PROPIOS (muestra)
//
//  Uso:
//    npm run import                       (auto-descubre las 8 pestanas)
//    GID=343368508 npm run import          (solo una pestana)
//    CNFANS_REF=abc npm run import          (con tu codigo real)
// =============================================================================
import { fetchSheet } from "./lib/sheet.js";
import { parseCsv } from "./lib/csv.js";
import { discoverTabs, cleanCategory } from "./lib/tabs.js";
import { canonCat } from "./lib/categories.js";
import { detectHeaderBlocks, normalizeRow } from "./lib/normalize.js";
import { openDb, upsertProduct, countProducts } from "./lib/db.js";
import { buildLinks, AFFILIATE_CODES, isPlaceholder } from "../config/agents.js";

const SHEET_ID = process.env.SHEET_ID || "1tE8qFAUBzayN20TTW5iH_GWP20h8VJGiHDvN-iIZrWk";
const DB_PATH = process.env.DB_PATH || "data/catalog.db";

function banner(t) {
  console.log("\n" + "=".repeat(64) + "\n " + t + "\n" + "=".repeat(64));
}

// Procesa una pestana: descarga, detecta cabecera+bloques, normaliza y dedup.
async function processTab(tab) {
  const rawCat = cleanCategory(tab.name);
  // Pestaña -> categoría canónica. Si mapea a una real (no "Other"), es autoritativa
  // y se fija (cat_locked) para que la IA no la pise. Si no ("HOT SALE", una marca…),
  // se deja libre para la IA.
  const tabCat = rawCat ? canonCat(rawCat) : null;
  const locked = tabCat && tabCat !== "Other";
  const isHot = /hot\s*sale/i.test(rawCat) || /hot\s*sale/i.test(tab.name);

  const csv = await fetchSheet(SHEET_ID, tab.gid);
  const rows = parseCsv(csv);
  const { headerIndex, blocks } = detectHeaderBlocks(rows);
  if (headerIndex < 0) {
    return { tab, category, isHot, read: 0, skipped: 0, dupes: 0, products: [], noHeader: true };
  }

  const dataRows = rows.slice(headerIndex + 1);
  const unique = new Map(); // key = platform|itemId (dedup dentro de la pestana)
  let read = 0;
  let skipped = 0;
  let dupes = 0;

  for (const cells of dataRows) {
    if (cells.length === 1 && cells[0].trim() === "") continue; // fila vacia
    for (const cols of blocks) {
      read++;
      const p = normalizeRow(cells, cols);
      if (!p) { skipped++; continue; }
      // Categoria autoritaria = pestana. En HOT SALE dejamos la heuristica del
      // nombre (para items que solo viven ahi) y marcamos hot.
      // Solo la pestaña-categoría fija/bloquea; si no, se deja lo que trajo la fila
      // (o null -> la pone la IA). Así "HOT SALE"/marca no ensucian la categoría.
      if (!isHot && locked) { p.category = tabCat; p.cat_locked = 1; }
      p.hot = isHot ? 1 : 0;

      const key = `${p.platform}|${p.item_id}`;
      const prev = unique.get(key);
      if (prev) {
        dupes++;
        if (prev.price_eur == null && p.price_eur != null) unique.set(key, p);
      } else {
        unique.set(key, p);
      }
    }
  }

  return { tab, category, isHot, read, skipped, dupes, products: [...unique.values()] };
}

async function main() {
  banner("IMPORTADOR W2C  ·  Fase 1  ·  multi-pestana");
  console.log(` Sheet: ${SHEET_ID}`);
  console.log(` DB   : ${DB_PATH}`);

  // 1) Descubrir pestanas (o usar solo la GID indicada)
  let tabs;
  if (process.env.GID) {
    tabs = [{ gid: process.env.GID, name: process.env.TAB_NAME || "(manual)" }];
  } else {
    console.log("\n[1/3] Descubriendo pestanas...");
    tabs = await discoverTabs(SHEET_ID);
  }
  console.log(`       ${tabs.length} pestana(s):`);
  for (const t of tabs) console.log(`         - ${t.name}  (gid ${t.gid})`);

  // 2) Procesar cada pestana y volcar a SQLite
  console.log("\n[2/3] Importando pestanas...");
  const db = openDb(DB_PATH);
  const now = new Date().toISOString();

  const totals = { read: 0, skipped: 0, dupes: 0, upserts: 0 };
  const perTab = [];

  for (const tab of tabs) {
    const r = await processTab(tab);
    const source = `sheet:${SHEET_ID}#${tab.gid}`;
    db.exec("BEGIN");
    try {
      for (const p of r.products) upsertProduct(db, p, source, now);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
    totals.read += r.read;
    totals.skipped += r.skipped;
    totals.dupes += r.dupes;
    totals.upserts += r.products.length;
    perTab.push(r);
    const tag = r.isHot ? " [HOT]" : "";
    const warn = r.noHeader ? "  (sin cabecera detectada!)" : "";
    console.log(
      `   · ${r.tab.name}${tag}: ${r.products.length} unicos ` +
      `(leidas ${r.read}, dupes ${r.dupes}, sin-id ${r.skipped})${warn}`
    );
  }

  // 3) Informe
  banner("RESULTADO GLOBAL");
  console.log(` Filas x bloque leidas : ${totals.read}`);
  console.log(` Descartadas (sin ID)  : ${totals.skipped}`);
  console.log(` Duplicados en-pestana : ${totals.dupes}`);
  console.log(` Upserts enviados      : ${totals.upserts}`);
  console.log(` Productos unicos DB   : ${countProducts(db)}`);
  const hot = db.prepare("SELECT COUNT(*) c FROM products WHERE hot=1").get().c;
  console.log(` Marcados HOT          : ${hot}`);
  console.log("\n Por categoria:");
  const byCat = db.prepare(
    "SELECT COALESCE(category,'(sin categoria)') cat, COUNT(*) c FROM products GROUP BY cat ORDER BY c DESC"
  ).all();
  for (const row of byCat) console.log(`   ${String(row.c).padStart(4)}  ${row.cat}`);

  // Muestra de links generados
  const anyConfigured = Object.values(AFFILIATE_CODES).some((c) => !isPlaceholder(c));
  banner("MUESTRA DE LINKS GENERADOS (desde el itemId)");
  if (!anyConfigured) {
    console.log(" AVISO: codigos placeholder. Pon los tuyos en config/agents.js");
    console.log(" o via env (CNFANS_REF, MULEBUY_REF, KAKOBUY_REF, OOPBUY_REF).\n");
  }
  const sample = db.prepare("SELECT * FROM products ORDER BY RANDOM() LIMIT 3").all();
  for (const p of sample) {
    console.log(`\n • ${p.name}  [${p.category ?? "?"}]  ${p.platform} ${p.item_id}  ${p.price_eur ?? "?"} EUR`);
    const links = buildLinks(p.platform, p.item_id);
    for (const l of Object.values(links)) {
      console.log(`     ${l.name.padEnd(8)} ${l.url}`);
    }
  }

  db.close();
  console.log("\nListo. Explora la DB con:  npm run query -- --category Shoes\n");
}

main().catch((e) => {
  console.error("\nERROR:", e.message);
  process.exitCode = 1;
});
