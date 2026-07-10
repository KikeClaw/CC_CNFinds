// Tier 2 — Limpieza/etiquetado del catalogo con IA (modelo rapido: Haiku).
// De un nombre sucio ("Dior X Stonel sland Jacket") saca titulo limpio, marca,
// modelo, colorway, genero, categoria y tags -> mejora busqueda y SEO.
//   npm run ai:tag -- --limit 20
import { openDb } from "./lib/db.js";
import { hasKey, MODELS } from "./lib/ai.js";
import { tagOne } from "./lib/aitag.js";

const DB_PATH = process.env.DB_PATH || "data/catalog.db";
const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i !== -1 ? args[i + 1] : d; };
const limit = parseInt(getArg("--limit", "20"), 10);

if (!hasKey()) {
  console.error("Falta ANTHROPIC_API_KEY. Exporta tu clave y reintenta.");
  process.exit(1);
}

const db = openDb(DB_PATH);
const rows = db.prepare(
  "SELECT id, name, brand, category, price_eur FROM products WHERE clean_title IS NULL ORDER BY hot DESC, id LIMIT ?"
).all(limit);

console.log(`Etiquetando ${rows.length} producto(s) con ${MODELS.fast}...\n`);
const upd = db.prepare(
  "UPDATE products SET clean_title=?, brand=COALESCE(?,brand), model_name=?, colorway=?, gender=?, category=?, tags=? WHERE id=?"
);

let ok = 0, fail = 0;
for (const r of rows) {
  try {
    const out = await tagOne({ name: r.name, category: r.category, price: r.price_eur });
    upd.run(out.clean_title, out.brand, out.model_name, out.colorway, out.gender, out.category || r.category, JSON.stringify(out.tags || []), r.id);
    ok++;
    console.log(`  ✓ ${r.name.slice(0, 26).padEnd(26)} -> ${out.clean_title}  [${out.brand ?? "?"} · ${out.gender}]`);
  } catch (e) {
    fail++;
    console.log(`  ✗ ${r.name.slice(0, 26).padEnd(26)}  ${e.message}`);
  }
}
console.log(`\n${ok} etiquetados · ${fail} errores`);
db.close();
