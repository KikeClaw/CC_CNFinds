// Tier 2 — Motor de contenido SEO: genera descripcion + mini guia de compra por
// producto (rellena ai_description). Modelo inteligente (Opus por defecto).
//   npm run ai:content -- --limit 10
import { openDb } from "./lib/db.js";
import { text, hasKey, MODELS } from "./lib/ai.js";

const DB_PATH = process.env.DB_PATH || "data/catalog.db";
const args = process.argv.slice(2);
const limit = parseInt((args[args.indexOf("--limit") + 1] || "10"), 10);

if (!hasKey()) { console.error("Falta ANTHROPIC_API_KEY."); process.exit(1); }

const db = openDb(DB_PATH);
const rows = db.prepare(
  "SELECT id, name, clean_title, brand, category, price_eur FROM products WHERE ai_description IS NULL AND image_url IS NOT NULL ORDER BY hot DESC, id LIMIT ?"
).all(limit);

console.log(`Generando contenido para ${rows.length} producto(s) con ${MODELS.smart}...\n`);
const upd = db.prepare("UPDATE products SET ai_description=? WHERE id=?");
const SYSTEM =
  "Redactor SEO de e-commerce de moda. Escribe en espanol una descripcion atractiva " +
  "y honesta (2-3 frases) + 2 bullets de 'por que comprarlo'. Sin inventar materiales " +
  "concretos si no se saben. Tono cercano, orientado a la comunidad de reps/finds.";

for (const r of rows) {
  const body = await text({
    system: SYSTEM, model: MODELS.smart, maxTokens: 400,
    prompt: `Producto: ${r.clean_title || r.name}\nMarca: ${r.brand ?? "?"}\nCategoria: ${r.category ?? "?"}\nPrecio: ${r.price_eur ?? "?"} EUR\n\nEscribe la descripcion + bullets.`,
  });
  upd.run(body.trim(), r.id);
  console.log(`  ✓ ${(r.clean_title || r.name).slice(0, 40)}`);
}
console.log("\nListo.");
db.close();
