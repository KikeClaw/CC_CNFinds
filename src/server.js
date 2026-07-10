// Servidor del catalogo (sin frameworks).
//   GET /                     -> public/index.html
//   GET /api/categories       -> categorias con conteo
//   GET /api/brands           -> marcas top con conteo + miniatura
//   GET /api/products?...     -> productos + links de afiliado al vuelo
//
//   npm run serve
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb } from "./lib/db.js";
import { buildLinks, originalUrl } from "../config/agents.js";
import { parseAnyUrl } from "./lib/parse.js";
import { hasKey } from "./lib/ai.js";
import { nlToFilters } from "./lib/aisearch.js";
import { buildFit } from "./lib/fit.js";
import { imageToQuery } from "./lib/visualsearch.js";
import { productPage, listPage, sitemapXml } from "./lib/render.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const PORT = parseInt(process.env.PORT || "5178", 10);
const DB_PATH = process.env.DB_PATH || "data/catalog.db";

const db = openDb(DB_PATH);

// Miniatura optimizada servida por el CDN de Weidian (webp + resize al vuelo).
function thumb(url, w = 500, h = 500) {
  if (!url) return null;
  return `${url}.webp?w=${w}&h=${h}&cp=1`;
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

const SORTS = {
  trending: "(image_url IS NOT NULL) DESC, hot DESC, price_eur DESC",
  newest: "(image_url IS NOT NULL) DESC, id DESC",
  price_asc: "(image_url IS NOT NULL) DESC, price_eur ASC",
  price_desc: "(image_url IS NOT NULL) DESC, price_eur DESC",
  name: "(image_url IS NOT NULL) DESC, name ASC",
};

function handleCategories(res) {
  const rows = db.prepare(`
    SELECT COALESCE(category,'(otros)') AS category, COUNT(*) AS count,
           SUM(CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) AS with_image
    FROM products GROUP BY category ORDER BY count DESC
  `).all();
  const total = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const withImg = db.prepare("SELECT COUNT(*) c FROM products WHERE image_url IS NOT NULL").get().c;
  json(res, 200, { total, withImage: withImg, categories: rows });
}

function handleBrands(res, params) {
  const limit = Math.min(parseInt(params.get("limit") || "12", 10), 60);
  const rows = db.prepare(`
    SELECT brand, COUNT(*) AS count,
           MAX(image_url) AS sample
    FROM products WHERE brand IS NOT NULL
    GROUP BY brand ORDER BY count DESC LIMIT ?
  `).all(limit);
  json(res, 200, {
    brands: rows.map((r) => ({ brand: r.brand, count: r.count, thumb: thumb(r.sample, 200, 200) })),
  });
}

function handleProducts(res, params) {
  const q = (params.get("q") || "").trim();
  const category = (params.get("category") || "").trim();
  const brand = (params.get("brand") || "").trim();
  const hot = params.get("hot") === "1";
  const onlyImg = params.get("withImage") !== "0"; // por defecto, solo con foto
  const sort = SORTS[params.get("sort")] || SORTS.trending;
  const limit = Math.min(parseInt(params.get("limit") || "48", 10), 200);
  const offset = Math.max(parseInt(params.get("offset") || "0", 10), 0);

  const where = [];
  const args = [];
  if (q) { where.push("(name LIKE ? OR brand LIKE ?)"); args.push(`%${q}%`, `%${q}%`); }
  if (category) { where.push("category = ?"); args.push(category); }
  if (brand) { where.push("brand = ?"); args.push(brand); }
  if (hot) where.push("hot = 1");
  if (onlyImg) where.push("image_url IS NOT NULL");
  const wsql = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = db.prepare(`SELECT COUNT(*) c FROM products ${wsql}`).get(...args).c;
  const rows = db.prepare(`
    SELECT id, platform, item_id, name, brand, category, price_eur, image_url, images, hot
    FROM products ${wsql} ORDER BY ${sort} LIMIT ? OFFSET ?
  `).all(...args, limit, offset);

  const items = rows.map((r) => {
    let gallery = [];
    try { gallery = r.images ? JSON.parse(r.images) : []; } catch { gallery = []; }
    return {
      id: r.id, name: r.name, brand: r.brand, category: r.category,
      price_eur: r.price_eur, hot: !!r.hot,
      thumb: thumb(r.image_url), image: r.image_url, images: gallery,
      links: buildLinks(r.platform, r.item_id),
    };
  });

  json(res, 200, { total, limit, offset, items });
}

// Conversor: cualquier URL (tienda o agente) -> tus links de afiliado.
function handleConvert(res, params) {
  const url = (params.get("url") || "").trim();
  if (!url) return json(res, 400, { error: "Falta el parametro url" });
  const parsed = parseAnyUrl(url);
  if (!parsed) return json(res, 200, { ok: false, message: "No pude reconocer un producto en ese enlace." });
  const { platform, itemId } = parsed;
  json(res, 200, {
    ok: true, platform, itemId,
    original: originalUrl(platform, itemId),
    links: buildLinks(platform, itemId),
  });
}

// Consulta reutilizable de productos (usada por /api/products y por la IA).
function selectProducts(f) {
  const where = [], argv = [];
  if (f.q) { where.push("(name LIKE ? OR brand LIKE ? OR clean_title LIKE ? OR tags LIKE ?)"); argv.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  if (f.category) { where.push("category = ?"); argv.push(f.category); }
  if (f.brand) { where.push("brand = ?"); argv.push(f.brand); }
  if (f.price_min != null) { where.push("price_eur >= ?"); argv.push(f.price_min); }
  if (f.price_max != null) { where.push("price_eur <= ?"); argv.push(f.price_max); }
  if (f.hot) where.push("hot = 1");
  if (f.onlyImg !== false) where.push("image_url IS NOT NULL");
  const wsql = where.length ? "WHERE " + where.join(" AND ") : "";
  const sort = SORTS[f.sort] || SORTS.trending;
  const total = db.prepare(`SELECT COUNT(*) c FROM products ${wsql}`).get(...argv).c;
  const rows = db.prepare(`
    SELECT id, platform, item_id, name, clean_title, brand, category, price_eur, image_url, images, hot
    FROM products ${wsql} ORDER BY ${sort} LIMIT ? OFFSET ?
  `).all(...argv, Math.min(f.limit || 48, 200), f.offset || 0);
  const items = rows.map((r) => {
    let gallery = []; try { gallery = r.images ? JSON.parse(r.images) : []; } catch {}
    return {
      id: r.id, name: r.clean_title || r.name, raw_name: r.name, brand: r.brand,
      category: r.category, price_eur: r.price_eur, hot: !!r.hot,
      thumb: thumb(r.image_url), image: r.image_url, images: gallery,
      links: buildLinks(r.platform, r.item_id),
    };
  });
  return { total, items };
}

// Buscador en lenguaje natural: NL -> filtros -> productos.
async function handleAiSearch(res, params) {
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  const q = (params.get("q") || "").trim();
  if (!q) return json(res, 400, { ok: false, error: "Falta q" });
  try {
    const cats = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL").all().map((r) => r.category);
    const brands = db.prepare("SELECT brand FROM products WHERE brand IS NOT NULL GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 25").all().map((r) => r.brand);
    const f = await nlToFilters(q, { categories: cats, brands });
    // La busqueda IA abarca TODO el catalogo (no solo lo enriquecido con foto).
    const { total, items } = selectProducts({
      q: f.keywords || "", category: f.category, brand: f.brand,
      price_min: f.price_min, price_max: f.price_max, hot: f.hot_only, sort: f.sort,
      onlyImg: false, limit: 48,
    });
    json(res, 200, { ok: true, explanation: f.explanation, filters: f, total, items });
  } catch (e) {
    json(res, 200, { ok: false, error: e.message });
  }
}

// Armador de "fit"/haul dentro de un presupuesto.
async function handleAiFit(res, params) {
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  const budget = parseFloat(params.get("budget") || "150");
  const style = (params.get("style") || "").trim();
  try {
    const { items } = selectProducts({ sort: "trending", limit: 80 });
    const out = await buildFit(budget, style, items);
    const byId = new Map(items.map((p) => [p.id, p]));
    const picks = (out.picks || []).map((p) => ({ ...byId.get(p.id), reason: p.reason })).filter((p) => p.id);
    json(res, 200, { ok: true, budget, summary: out.summary, total_estimate: out.total_estimate, picks });
  } catch (e) {
    json(res, 200, { ok: false, error: e.message });
  }
}

function readBody(req, maxBytes = 8_000_000) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > maxBytes) { req.destroy(); reject(new Error("cuerpo demasiado grande")); } });
    req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

// Busqueda visual: imagen (data URL o URL) -> atributos -> productos equivalentes.
async function handleVisualSearch(req, res) {
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const image = body.image || body.url;
  if (!image) return json(res, 400, { ok: false, error: "Falta 'image'." });
  try {
    const cats = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL").all().map((r) => r.category);
    const brands = db.prepare("SELECT brand FROM products WHERE brand IS NOT NULL GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 25").all().map((r) => r.brand);
    const det = await imageToQuery(image, { categories: cats, brands });
    // Si hay marca o categoria, esos son los "equivalentes"; las keywords
    // descriptivas no casan con los nombres terse del catalogo (todavia).
    const q = det.brand || det.category ? "" : (det.keywords || "");
    const { total, items } = selectProducts({
      q, category: det.category, brand: det.brand, onlyImg: false, sort: "trending", limit: 48,
    });
    json(res, 200, { ok: true, detected: det, total, items });
  } catch (e) {
    json(res, 200, { ok: false, error: e.message });
  }
}

// ---- Paginas SSR indexables (SEO) ----
function html(res, body, code = 200) { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" }); res.end(body); }
function baseUrl(req) { return process.env.SITE_URL || `http://${req.headers.host || "localhost:" + PORT}`; }

function getProductById(id) {
  const r = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  if (!r) return null;
  let images = []; try { images = r.images ? JSON.parse(r.images) : []; } catch {}
  let qc = {}; try { qc = r.qc_notes ? JSON.parse(r.qc_notes) : {}; } catch {}
  return {
    id: r.id, platform: r.platform, item_id: r.item_id,
    name: r.clean_title || r.name, brand: r.brand, category: r.category,
    price_eur: r.price_eur, image: r.image_url, images,
    ai_description: r.ai_description, qc_score: r.qc_score, qc_summary: qc.summary,
    links: buildLinks(r.platform, r.item_id),
  };
}
function relatedProducts(p) {
  return db.prepare(
    "SELECT id,name,clean_title,brand,price_eur,image_url FROM products WHERE id<>? AND image_url IS NOT NULL AND (brand=? OR category=?) ORDER BY (brand=?) DESC, hot DESC LIMIT 8"
  ).all(p.id, p.brand, p.category, p.brand)
    .map((r) => ({ id: r.id, name: r.clean_title || r.name, brand: r.brand, price_eur: r.price_eur, image: r.image_url }));
}
function handleProductPage(req, res, id) {
  const p = getProductById(id);
  if (!p) return html(res, "<h1>404 — producto no encontrado</h1>", 404);
  html(res, productPage(p, relatedProducts(p), baseUrl(req)));
}
function handleListPage(req, res, kind, name) {
  const col = kind === "marca" ? "brand" : "category";
  const rows = db.prepare(
    `SELECT id,name,clean_title,brand,price_eur,image_url FROM products WHERE ${col}=? ORDER BY (image_url IS NOT NULL) DESC, hot DESC, price_eur DESC LIMIT 120`
  ).all(name).map((r) => ({ id: r.id, name: r.clean_title || r.name, brand: r.brand, price_eur: r.price_eur, image: r.image_url }));
  if (!rows.length) return html(res, "<h1>404</h1>", 404);
  const topLinks = kind === "marca"
    ? db.prepare("SELECT DISTINCT category c FROM products WHERE brand=? AND category IS NOT NULL").all(name).map((x) => ({ href: `/categoria/${encodeURIComponent(x.c)}`, label: x.c }))
    : db.prepare("SELECT brand b FROM products WHERE category=? AND brand IS NOT NULL GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 10").all(name).map((x) => ({ href: `/marca/${encodeURIComponent(x.b)}`, label: x.b }));
  html(res, listPage({ kind, name, items: rows, base: baseUrl(req), topLinks, crumbs: [{ href: "/", label: "Inicio" }] }));
}
function handleSitemap(req, res) {
  const ids = db.prepare("SELECT id FROM products").all().map((r) => r.id);
  const cats = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL").all().map((r) => r.category);
  const brands = db.prepare("SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL").all().map((r) => r.brand);
  res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
  res.end(sitemapXml(baseUrl(req), { productIds: ids, categories: cats, brands }));
}

const server = createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "POST" && u.pathname === "/api/visual-search") return void handleVisualSearch(req, res);
    if (u.pathname === "/api/categories") return handleCategories(res);
    if (u.pathname === "/api/brands") return handleBrands(res, u.searchParams);
    if (u.pathname === "/api/convert") return handleConvert(res, u.searchParams);
    if (u.pathname === "/api/ai-search") return void handleAiSearch(res, u.searchParams);
    if (u.pathname === "/api/ai-fit") return void handleAiFit(res, u.searchParams);
    if (u.pathname === "/api/products") return handleProducts(res, u.searchParams);
    // --- Paginas SSR (SEO) ---
    if (u.pathname === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end(`User-agent: *\nAllow: /\nSitemap: ${baseUrl(req)}/sitemap.xml\n`); }
    if (u.pathname === "/sitemap.xml") return handleSitemap(req, res);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0] === "producto" && parts[1]) return handleProductPage(req, res, parseInt(parts[1], 10));
    if (parts[0] === "categoria" && parts[1]) return handleListPage(req, res, "categoria", decodeURIComponent(parts[1]));
    if (parts[0] === "marca" && parts[1]) return handleListPage(req, res, "marca", decodeURIComponent(parts[1]));
    if (u.pathname === "/" || u.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(readFileSync(join(ROOT, "public", "index.html")));
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => console.log(`Catalogo en http://localhost:${PORT}`));
