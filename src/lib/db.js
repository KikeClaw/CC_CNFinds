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
    clean_title: "TEXT", clean_title_en: "TEXT", model_name: "TEXT", colorway: "TEXT", gender: "TEXT",
    tags: "TEXT", ai_description: "TEXT", ai_description_en: "TEXT", qc_score: "INTEGER", qc_notes: "TEXT",
  };
  for (const [name, type] of Object.entries(aiCols)) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE products ADD COLUMN ${name} ${type}`);
  }
  // Ajustes de afiliación por agente (editables desde /admin)
  db.exec("CREATE TABLE IF NOT EXISTS agent_settings (id TEXT PRIMARY KEY, code TEXT, enabled INTEGER NOT NULL DEFAULT 1)");
  // Suscriptores al boletín de "nuevos finds" (captura de email; el envío lo
  // conectas tú con tu proveedor). Solo se guarda el email + fecha + idioma.
  db.exec("CREATE TABLE IF NOT EXISTS subscribers (email TEXT PRIMARY KEY, created_at TEXT, lang TEXT)");
  // Analítica: clic en un link de agente = intención de compra (= tu ingreso).
  db.exec("CREATE TABLE IF NOT EXISTS clicks (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER, agent TEXT, ts TEXT)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_clicks_agent ON clicks(agent)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_clicks_ts ON clicks(ts)");
  // Alertas de precio: avísame si un producto baja de X (captura; el aviso lo
  // conectas tú con tu email/proveedor).
  db.exec("CREATE TABLE IF NOT EXISTS price_alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, product_id INTEGER, target_eur REAL, created_at TEXT, notified INTEGER DEFAULT 0)");
  // Historial de precios (se registra al importar cuando el precio cambia).
  db.exec("CREATE TABLE IF NOT EXISTS price_history (product_id INTEGER, price_eur REAL, ts TEXT)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_ph_pid ON price_history(product_id)");
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
  // Historial de precios: precio anterior antes del upsert (si existía).
  let prevPrice = null;
  try { const r = db.prepare("SELECT price_eur FROM products WHERE platform=? AND item_id=?").get(p.platform, p.item_id); if (r) prevPrice = r.price_eur; } catch {}
  const info = stmt.run(
    p.platform, p.item_id, p.name, p.brand, p.category,
    p.price_eur, p.image_url, p.hot ? 1 : 0, source, now, now
  );
  // Registra un punto de historial si es nuevo o si el precio cambió.
  try {
    if (p.price_eur != null && p.price_eur !== prevPrice) {
      const row = db.prepare("SELECT id FROM products WHERE platform=? AND item_id=?").get(p.platform, p.item_id);
      if (row) db.prepare("INSERT INTO price_history (product_id, price_eur, ts) VALUES (?, ?, ?)").run(row.id, p.price_eur, now);
    }
  } catch {}
  return info.changes;
}

export function countProducts(db) {
  return db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
}
