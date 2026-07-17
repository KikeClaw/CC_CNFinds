// Tier 3 — Analisis QC con vision: Claude mira las fotos del producto y da una
// puntuacion de calidad (1-10) + notas. Rellena qc_score / qc_notes.
//   npm run ai:qc -- --limit 10
import { openDb } from "./lib/db.js";
import { structured, hasKey, MODELS } from "./lib/ai.js";

const DB_PATH = process.env.DB_PATH || "data/catalog.db";
const args = process.argv.slice(2);
const limit = parseInt((args[args.indexOf("--limit") + 1] || "10"), 10);

const SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    qc_score: { type: "integer" },
    qc_summary: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
  required: ["qc_score", "qc_summary", "flags"],
};
const SYSTEM =
  "Eres un revisor de control de calidad (QC) de productos. Analizas las fotos reales " +
  "del producto y evaluas su calidad aparente del 1 al 10 (nitidez de logos, costuras, " +
  "materiales, acabado). 'qc_summary' en espanol, 1-2 frases. 'flags' = posibles " +
  "defectos o senales de baja calidad (lista corta, vacia si todo ok).";

if (!hasKey()) { console.error("Falta ANTHROPIC_API_KEY."); process.exit(1); }

const db = openDb(DB_PATH);
const rows = db.prepare(
  "SELECT id, name, clean_title, images FROM products WHERE qc_score IS NULL AND images IS NOT NULL ORDER BY hot DESC, id LIMIT ?"
).all(limit);

console.log(`QC de ${rows.length} producto(s) con ${MODELS.fast} (vision)...\n`);
const upd = db.prepare("UPDATE products SET qc_score=?, qc_notes=? WHERE id=?");

for (const r of rows) {
  let imgs = [];
  try { imgs = JSON.parse(r.images).slice(0, 4).map((u) => `${u}.webp?w=700&h=700`); } catch {}
  if (!imgs.length) continue;
  try {
    const out = await structured({
      system: SYSTEM, model: MODELS.fast, schema: SCHEMA, images: imgs, maxTokens: 400,
      prompt: `Producto: ${r.clean_title || r.name}. Evalua la calidad segun estas fotos.`,
    });
    upd.run(out.qc_score, JSON.stringify({ summary: out.qc_summary, flags: out.flags }), r.id);
    console.log(`  ✓ ${(r.clean_title || r.name).slice(0, 34).padEnd(34)}  QC ${out.qc_score}/10`);
  } catch (e) {
    console.log(`  ✗ ${(r.clean_title || r.name).slice(0, 34)}  ${e.message}`);
  }
}
console.log("\nListo.");
db.close();
