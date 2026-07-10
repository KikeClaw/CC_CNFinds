import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

// Esquema del catalogo.
// Nota clave: NO se guardan columnas de links. Los enlaces de afiliado se
// generan al vuelo desde (platform + item_id), asi cambiar de codigo o de
// agente no obliga a reimportar nada.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  platform      TEXT NOT NULL,
  item_id       TEXT NOT NULL,
  name          TEXT NOT NULL,
  brand         TEXT,
  category      TEXT,
  price_eur     REAL,
  image_url     TEXT,
  hot           INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active',
  source        TEXT,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  last_checked  TEXT,
  UNIQUE(platform, item_id)
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_hot ON products(hot);
`;

export function openDb(path) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec(SCHEMA);
  // Migraciones ligeras (ADD COLUMN es idempotente aqui via check).
  const cols = db.prepare("PRAGMA table_info(products)").all().map((c) => c.name);
  if (!cols.includes("images")) db.exec("ALTER TABLE products ADD COLUMN images TEXT"); // JSON array de URLs
  // Columnas de enriquecimiento con IA
  const aiCols = {
    clean_title: "TEXT", model_name: "TEXT", colorway: "TEXT", gender: "TEXT",
    tags: "TEXT", ai_description: "TEXT", qc_score: "INTEGER", qc_notes: "TEXT",
  };
  for (const [name, type] of Object.entries(aiCols)) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
  }
  // Ajustes de afiliación por agente (editables desde /admin)
  db.exec("CREATE TABLE IF NOT EXISTS agent_settings (id TEXT PRIMARY KEY, code TEXT, enabled INTEGER NOT NULL DEFAULT 1)");
  return db;
}

// Upsert por (platform, item_id): inserta si es nuevo; si ya existe, refresca
// datos volatiles. Usa COALESCE para NO pisar un dato bueno con un nulo (p.ej.
// un item que aparece en la pestana "HOT SALE" sin categoria no debe borrar la
// categoria real que ya tenia). `hot` es pegajoso (MAX): si alguna vez fue hot,
// se queda hot.
export function upsertProduct(db, p, source, now) {
  const stmt = db.prepare(`
    INSERT INTO products
      (platform, item_id, name, brand, category, price_eur, image_url, hot, status, source, first_seen, last_seen)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    ON CONFLICT(platform, item_id) DO UPDATE SET
      name       = excluded.name,
      brand      = COALESCE(excluded.brand, products.brand),
      category   = COALESCE(excluded.category, products.category),
      price_eur  = COALESCE(excluded.price_eur, products.price_eur),
      image_url  = COALESCE(excluded.image_url, products.image_url),
      hot        = MAX(products.hot, excluded.hot),
      status     = 'active',
      last_seen  = excluded.last_seen
  `);
  const info = stmt.run(
    p.platform, p.item_id, p.name, p.brand, p.category,
    p.price_eur, p.image_url, p.hot ? 1 : 0, source, now, now
  );
  return info.changes;
}

export function countProducts(db) {
  return db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
}
