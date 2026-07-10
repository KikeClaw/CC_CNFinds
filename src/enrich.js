// Runner de enriquecimiento (Fase 2).
// Coge productos sin imagen y les rellena image_url desde la fuente (Weidian).
//   npm run enrich -- --limit 10        (spike: 10 productos)
//   npm run enrich -- --limit 10 --dry  (sin escribir en la DB)
import { openDb } from "./lib/db.js";
import { enrichProduct } from "./lib/enrich.js";

const DB_PATH = process.env.DB_PATH || "data/catalog.db";
const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : d; };
const limit = parseInt(getArg("--limit", "10"), 10);
const dry = args.includes("--dry");
const delayMs = parseInt(getArg("--delay", "1200"), 10); // Weidian throttlea: ir despacio

// Pausa con jitter (+-30%) para no hacer un patron perfecto de peticiones.
const sleep = (base) =>
  new Promise((r) => setTimeout(r, base + Math.floor((Math.random() - 0.5) * base * 0.6)));

// Que un fallo de red suelto no tumbe todo el proceso.
process.on("unhandledRejection", (e) => console.error("[warn] unhandledRejection:", e?.message || e));

const db = openDb(DB_PATH);
const rows = db.prepare(
  "SELECT id, platform, item_id, name FROM products WHERE (image_url IS NULL OR images IS NULL) AND platform='weidian' ORDER BY hot DESC, id LIMIT ?"
).all(limit);

console.log(`Enriqueciendo ${rows.length} producto(s)${dry ? " (DRY RUN)" : ""}...\n`);

const upd = db.prepare("UPDATE products SET image_url=?, images=?, last_checked=? WHERE id=?");
const markChecked = db.prepare("UPDATE products SET last_checked=? WHERE id=?");

let withImg = 0, dead = 0, failed = 0, totalImgs = 0;

for (const r of rows) {
  const res = await enrichProduct(r.platform, r.item_id, {});
  const now = new Date().toISOString();
  if (!res.ok) {
    failed++;
    console.log(`  ✗ ${r.name.padEnd(24)} ${r.item_id}  ERROR ${res.error || res.status}`);
  } else if (res.images.length === 0) {
    dead++;
    if (!dry) markChecked.run(now, r.id);
    console.log(`  ? ${r.name.padEnd(24)} ${r.item_id}  0 imagenes (posible caido)`);
  } else {
    withImg++;
    totalImgs += res.images.length;
    if (!dry) upd.run(res.images[0], JSON.stringify(res.images.slice(0, 12)), now, r.id);
    console.log(`  ✓ ${r.name.padEnd(24)} ${r.item_id}  ${res.images.length} img  ${res.images[0]}`);
  }
  await sleep(delayMs);
}

console.log(`\nResumen: ${withImg} con imagen · ${dead} sin imagen · ${failed} error`);
console.log(`Tasa de exito imagenes: ${rows.length ? Math.round((withImg / rows.length) * 100) : 0}%`);
if (withImg) console.log(`Media de imagenes/producto: ${(totalImgs / withImg).toFixed(1)}`);
db.close();
