// Consulta rapida del catalogo + genera los links de afiliado al vuelo.
// Uso:
//   npm run query                 (primeros 20)
//   npm run query -- --limit 50
//   npm run query -- --category hoodie
//   npm run query -- --brand "Ralph Lauren"
import { openDb } from "./lib/db.js";
import { buildLinks } from "../config/agents.js";

const DB_PATH = process.env.DB_PATH || "data/catalog.db";
const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const limit = parseInt(getArg("--limit") || "20", 10);
const category = getArg("--category");
const brand = getArg("--brand");

const db = openDb(DB_PATH);

let sql = "SELECT * FROM products WHERE status='active'";
const params = [];
if (category) { sql += " AND category = ?"; params.push(category); }
if (brand) { sql += " AND brand = ?"; params.push(brand); }
sql += " ORDER BY brand, name LIMIT ?";
params.push(limit);

const rows = db.prepare(sql).all(...params);
console.log(`\n${rows.length} producto(s):\n`);

for (const r of rows) {
  console.log(`• ${r.name}  [${r.brand ?? "?"} / ${r.category ?? "?"}]  ${r.price_eur ?? "?"} EUR  (${r.platform} ${r.item_id})`);
  const links = buildLinks(r.platform, r.item_id);
  for (const l of Object.values(links)) {
    console.log(`    ${l.name.padEnd(8)} ${l.url}`);
  }
  console.log();
}

db.close();
