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
import { buildLinks, originalUrl, getAgentState, setAgentState } from "../config/agents.js";
import { parseAnyUrl } from "./lib/parse.js";
import { hasKey } from "./lib/ai.js";
import { nlToFilters } from "./lib/aisearch.js";
import { buildFit } from "./lib/fit.js";
import { imageToQuery } from "./lib/visualsearch.js";
import { productPage, listPage, sitemapXml } from "./lib/render.js";
import { parseCsv } from "./lib/csv.js";
import { fetchSheet } from "./lib/sheet.js";
import { discoverTabs, cleanCategory } from "./lib/tabs.js";
import { rowsToCandidates, dedupe as dedupeCands, apply as applyCands, sheetIdFromUrl } from "./lib/ingest.js";
import { harvestText } from "./lib/harvest.js";
import { mapColumnsAI, candidatesFromMap } from "./lib/aimap.js";
import { enrichProduct } from "./lib/enrich.js";
import { tagOne } from "./lib/aitag.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const PORT = parseInt(process.env.PORT || "5178", 10);
const DB_PATH = process.env.DB_PATH || "data/catalog.db";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "cnfinds-admin"; // ⚠️ cámbialo en producción
// Si la DB arranca vacía (primer deploy), se auto-siembra desde esta Sheet.
// Pon SEED_SHEET_URL="" para desactivarlo.
const SEED_SHEET_URL = process.env.SEED_SHEET_URL ??
  "https://docs.google.com/spreadsheets/d/1tE8qFAUBzayN20TTW5iH_GWP20h8VJGiHDvN-iIZrWk/edit";

const db = openDb(DB_PATH);

// Aplica los códigos/estado de afiliado persistidos en la DB.
try {
  for (const r of db.prepare("SELECT id, code, enabled FROM agent_settings").all())
    setAgentState(r.id, { code: r.code || undefined, enabled: !!r.enabled });
} catch {}

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

// ---- Admin: gestor de afiliación por agente ----
function handleAdminAgentsGet(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  json(res, 200, { ok: true, agents: getAgentState() });
}
async function handleAdminAgentsSet(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  if (!setAgentState(body.id, { code: body.code, enabled: body.enabled }))
    return json(res, 200, { ok: false, error: "Agente desconocido." });
  const cur = getAgentState().find((a) => a.id === body.id);
  db.prepare("INSERT INTO agent_settings(id,code,enabled) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, enabled=excluded.enabled")
    .run(body.id, cur.code || null, cur.enabled ? 1 : 0);
  json(res, 200, { ok: true, agents: getAgentState() });
}

// ---- Paginas SSR indexables (SEO) ----
function html(res, body, code = 200) { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" }); res.end(body); }
function serveStatic(res, name, type) {
  try {
    const b = readFileSync(join(ROOT, "public", name));
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "public, max-age=86400" });
    res.end(b);
  } catch { res.writeHead(404); res.end("not found"); }
}
function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL;
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  return `${proto}://${req.headers.host || "localhost:" + PORT}`;
}

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

// ---- Admin: importador universal ----
function adminAuth(req) { return (req.headers["x-admin-token"] || "") === ADMIN_TOKEN; }

async function gatherCandidates(mode, content) {
  if (mode === "text") return harvestText(content);
  if (mode === "csv") {
    const rows = parseCsv(content);
    let c = rowsToCandidates(rows);
    if (!c.length && hasKey()) { // fallback IA para hojas estructuradas raras
      try { c = candidatesFromMap(rows, await mapColumnsAI(rows)); } catch {}
    }
    return c;
  }
  if (mode === "sheet") {
    const id = sheetIdFromUrl(content);
    if (!id) throw new Error("URL de Google Sheet no válida.");
    let tabs; try { tabs = await discoverTabs(id); } catch { tabs = [{ gid: "0", name: "" }]; }
    if (!tabs.length) tabs = [{ gid: "0", name: "" }];
    const all = [];
    for (const t of tabs) {
      let csv; try { csv = await fetchSheet(id, t.gid); } catch { continue; }
      const cands = rowsToCandidates(parseCsv(csv));
      const cat = cleanCategory(t.name || "");
      for (const c of cands) if (!c.category && cat) c.category = cat;
      all.push(...cands);
    }
    return all;
  }
  throw new Error("modo desconocido");
}

async function handleAdminPreview(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  try {
    const cands = await gatherCandidates(body.mode, body.content || "");
    const deduped = dedupeCands(db, cands);
    const nuevos = deduped.filter((c) => c.status === "new").length;
    json(res, 200, {
      ok: true,
      stats: { encontrados: cands.length, unicos: deduped.length, nuevos, existentes: deduped.length - nuevos },
      sample: deduped.slice(0, 40).map((c) => ({ platform: c.platform, itemId: c.itemId, name: c.name, price: c.price, status: c.status })),
    });
  } catch (e) { json(res, 200, { ok: false, error: e.message }); }
}

// --- Jobs en segundo plano (auto-encadenado: enriquecer fotos + etiquetar IA) ---
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const jobs = new Map();
let jobSeq = 0;

function startEnrichTagJob(items, opts = {}) {
  const id = "job_" + (++jobSeq);
  const job = { id, total: items.length, done: 0, withImage: 0, dead: 0, failed: 0, tagged: 0, phase: "fotos", status: "running" };
  jobs.set(id, job);
  if (jobs.size > 40) jobs.delete(jobs.keys().next().value); // GC básico
  (async () => {
    for (const it of items) { // Fase 1: fotos (Weidian)
      if (it.platform !== "weidian") { job.done++; continue; }
      try {
        const res = await enrichProduct(it.platform, it.item_id, {});
        const now = new Date().toISOString();
        if (res.ok && res.images.length) {
          db.prepare("UPDATE products SET image_url=?, images=?, last_checked=? WHERE id=?")
            .run(res.images[0], JSON.stringify(res.images.slice(0, 12)), now, it.id);
          job.withImage++;
        } else if (res.ok) { db.prepare("UPDATE products SET last_checked=? WHERE id=?").run(now, it.id); job.dead++; }
        else job.failed++;
      } catch { job.failed++; }
      job.done++;
      await sleepMs(1200);
    }
    if (opts.tag !== false && hasKey()) { // Fase 2: etiquetado IA
      job.phase = "etiquetado"; job.done = 0;
      for (const it of items) {
        try {
          const r = db.prepare("SELECT name, category, price_eur FROM products WHERE id=? AND clean_title IS NULL").get(it.id);
          if (r) {
            const out = await tagOne({ name: r.name, category: r.category, price: r.price_eur });
            db.prepare("UPDATE products SET clean_title=?, brand=COALESCE(?,brand), model_name=?, colorway=?, gender=?, category=?, tags=? WHERE id=?")
              .run(out.clean_title, out.brand, out.model_name, out.colorway, out.gender, out.category, JSON.stringify(out.tags || []), it.id);
            job.tagged++;
          }
        } catch {}
        job.done++;
      }
    }
    job.phase = "listo"; job.status = "done";
  })().catch(() => { job.status = "error"; });
  return id;
}

function startTagJob(ids) {
  const id = "job_" + (++jobSeq);
  const job = { id, total: ids.length, done: 0, tagged: 0, withImage: 0, dead: 0, phase: "etiquetado", status: "running" };
  jobs.set(id, job);
  if (jobs.size > 40) jobs.delete(jobs.keys().next().value);
  (async () => {
    for (const pid of ids) {
      try {
        const r = db.prepare("SELECT name, category, price_eur FROM products WHERE id=? AND clean_title IS NULL").get(pid);
        if (r) {
          const out = await tagOne({ name: r.name, category: r.category, price: r.price_eur });
          db.prepare("UPDATE products SET clean_title=?, brand=COALESCE(?,brand), model_name=?, colorway=?, gender=?, category=?, tags=? WHERE id=?")
            .run(out.clean_title, out.brand, out.model_name, out.colorway, out.gender, out.category, JSON.stringify(out.tags || []), pid);
          job.tagged++;
        }
      } catch {}
      job.done++;
    }
    job.phase = "listo"; job.status = "done";
  })().catch(() => { job.status = "error"; });
  return id;
}

async function handleAdminTagAll(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  const ids = db.prepare("SELECT id FROM products WHERE clean_title IS NULL").all().map((r) => r.id);
  const jobId = ids.length ? startTagJob(ids) : null;
  json(res, 200, { ok: true, count: ids.length, jobId });
}

async function handleAdminApply(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  try {
    const cands = await gatherCandidates(body.mode, body.content || "");
    const deduped = dedupeCands(db, cands);
    const src = `admin:${body.mode}:${(body.content || "").slice(0, 60)}`;
    const r = applyCands(db, deduped, src);
    // Auto-encadenar: enriquecer + etiquetar los NUEVOS (weidian, sin foto).
    const getRow = db.prepare("SELECT id FROM products WHERE platform=? AND item_id=? AND image_url IS NULL");
    const toEnrich = [];
    for (const c of deduped) {
      if (c.status !== "new" || c.platform !== "weidian") continue;
      const row = getRow.get(c.platform, c.itemId);
      if (row) toEnrich.push({ id: row.id, platform: c.platform, item_id: c.itemId });
    }
    const jobId = toEnrich.length ? startEnrichTagJob(toEnrich) : null;
    json(res, 200, { ok: true, ...r, total: db.prepare("SELECT COUNT(*) c FROM products").get().c, jobId, enriching: toEnrich.length });
  } catch (e) { json(res, 200, { ok: false, error: e.message }); }
}

function handleAdminJob(req, res, id) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  const job = jobs.get(id);
  if (!job) return json(res, 200, { ok: false, error: "Job no encontrado." });
  json(res, 200, { ok: true, job });
}

const server = createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "POST" && u.pathname === "/api/visual-search") return void handleVisualSearch(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/preview") return void handleAdminPreview(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/apply") return void handleAdminApply(req, res);
    if (u.pathname === "/api/admin/agents" && req.method === "GET") return void handleAdminAgentsGet(req, res);
    if (u.pathname === "/api/admin/agents" && req.method === "POST") return void handleAdminAgentsSet(req, res);
    if (u.pathname === "/api/admin/job") return void handleAdminJob(req, res, u.searchParams.get("id"));
    if (req.method === "POST" && u.pathname === "/api/admin/tag-all") return void handleAdminTagAll(req, res);
    if (u.pathname === "/admin") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(readFileSync(join(ROOT, "public", "admin.html"))); }
    if (u.pathname === "/favicon.svg" || u.pathname === "/favicon.ico") return void serveStatic(res, "favicon.svg", "image/svg+xml");
    if (u.pathname === "/og.svg") return void serveStatic(res, "og.svg", "image/svg+xml");
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

// Auto-siembra: si el catálogo está vacío (primer arranque en un volumen nuevo),
// importa desde la Sheet y enriquece fotos en segundo plano. No bloquea el listen.
async function bootstrap() {
  try {
    const count = db.prepare("SELECT COUNT(*) c FROM products").get().c;
    if (count === 0 && SEED_SHEET_URL) { // primer arranque: siembra
      console.log("Catálogo vacío — importando semilla...");
      const deduped = dedupeCands(db, await gatherCandidates("sheet", SEED_SHEET_URL));
      const r = applyCands(db, deduped, "seed:boot");
      console.log(`Semilla importada: ${r.added} productos.`);
    }
    // Continúa fotos pendientes (self-healing tras reinicios); salta los caídos
    // revisados hace menos de 7 días para no re-machacarlos.
    const cutoff = new Date(Date.now() - 7 * 864e5).toISOString();
    const items = db.prepare(
      "SELECT id, platform, item_id FROM products WHERE platform='weidian' AND image_url IS NULL AND (last_checked IS NULL OR last_checked < ?)"
    ).all(cutoff).map((x) => ({ id: x.id, platform: x.platform, item_id: x.item_id }));
    if (items.length) { startEnrichTagJob(items, { tag: false }); console.log(`Enriqueciendo ${items.length} fotos pendientes en segundo plano...`); }
  } catch (e) { console.error("Bootstrap falló:", e.message); }
}

server.listen(PORT, () => {
  console.log(`CNFinds en http://localhost:${PORT}`);
  bootstrap();
});
