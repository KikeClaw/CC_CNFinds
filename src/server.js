// Servidor del catalogo (sin frameworks).
//   GET /                     -> public/index.html
//   GET /api/categories       -> categorias con conteo
//   GET /api/brands           -> marcas top con conteo + miniatura
//   GET /api/products?...     -> productos + links de afiliado al vuelo
//
//   npm run serve
import { createServer } from "node:http";
import { timingSafeEqual, createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile, writeFile, mkdir, rename, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { openDb } from "./lib/db.js";
import { buildLinks, originalUrl, getAgentState, setAgentState, buildSearchLinks } from "../config/agents.js";
import { parseAnyUrl } from "./lib/parse.js";
import { hasKey, MODELS } from "./lib/ai.js";
import { nlToFilters } from "./lib/aisearch.js";
import { buildFit } from "./lib/fit.js";
import { imageToQuery } from "./lib/visualsearch.js";
import { productPage, listPage, sitemapXml, articlePage, guidesIndexPage, couponsPage, couponsBody, helpBody, agentLandingPage, agentsComparePage, helpPage, esc } from "./lib/render.js";
import { GUIDES, guideBySlug } from "./lib/guides.js";
import { canonCat, catLabel } from "./lib/categories.js";
import { agentMeta, signupUrl } from "../config/agents-meta.js";
import { COMMUNITY_SHEETS, sheetUrl } from "../config/sources.js";
import { fetchSheetLinks } from "./lib/sheet-api.js";
import { fetchSheetHtml, pubIdFromUrl, fetchPublishedGids, fetchPublishedSheet } from "./lib/sheet-html.js";
import { parseCsv } from "./lib/csv.js";
import { fetchSheet } from "./lib/sheet.js";
import { discoverTabs, cleanCategory } from "./lib/tabs.js";
import { rowsToCandidates, dedupe as dedupeCands, apply as applyCands, sheetIdFromUrl } from "./lib/ingest.js";
import { PRICE_MIN_EUR, PRICE_MAX_EUR } from "./lib/price.js";
import { harvestText } from "./lib/harvest.js";
import { mapColumnsAI, candidatesFromMap } from "./lib/aimap.js";
import { enrichProduct } from "./lib/enrich.js";
import { sizeAdvice } from "./lib/aisize.js";
import { tagOne } from "./lib/aitag.js";
import { qcOne } from "./lib/aiqc.js";

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
  for (const r of db.prepare("SELECT id, code, enabled, featured, is_default FROM agent_settings").all())
    setAgentState(r.id, { code: r.code || undefined, enabled: !!r.enabled, featured: !!r.featured, is_default: !!r.is_default });
} catch {}

// Fotos servidas por Google (hoja normal o publicada). Se piden SIEMPRE a este ancho
// para que cada foto tenga una única entrada en el caché de disco.
const IMG_PROXY_W = 800;
const isGoogleImg = (u) => /sheets-images-rt|googleusercontent\.com\/docsubipk/.test(u || "");
const googleImg = (u) => String(u).replace(/=[sw]\d+(?:-[wh]\d+)*$/, `=w${IMG_PROXY_W}`);

// Ruta base de una foto de geilicdn: sin query y sin el ".webp" del transform, para
// poder reconstruirlo sin duplicarlo.
const geiliBase = (u) => String(u).split("?")[0].replace(/\.webp$/i, "");

// Miniatura optimizada servida por el CDN de Weidian (webp + resize al vuelo).
function thumb(url, w = 500, h = 500) {
  if (!url) return null;
  // geilicdn/Weidian aceptan el transform .webp?w=..&h=..&cp=1, pero SOLO sobre la
  // ruta LIMPIA. Las hojas guardan la URL de muchas formas: unas tal cual, otras ya
  // con su propia query (?w=400&h=400) y otras con el transform entero puesto
  // (.jpg.webp?w=800...). Sin normalizar salían ".jpg?w=400&h=400.webp?..." o
  // ".jpg.webp.webp?..." -> 404 y tarjeta en blanco. Se reconstruye desde la ruta
  // base para que aplicarlo dos veces dé el mismo resultado.
  if (/geilicdn|weidian/.test(url)) return `${geiliBase(url)}.webp?w=${w}&h=${h}&cp=1`;
  // Google (sheets-images-rt) sirve las imágenes con Cross-Origin-Resource-Policy:
  // same-site, así que el NAVEGADOR se niega a embeberlas desde nuestro dominio
  // (aunque un fetch de servidor sí funcione → tarjetas en blanco). Las servimos
  // por nuestro proxy /img, que sí puede descargarlas y las reenvía desde nuestro
  // origen. Pedimos el ancho ya reducido para no mover megas de más.
  // Imágenes de Google (hoja normal o publicada): el navegador no las embebe
  // (CORP/Origin), así que van por /img. SIEMPRE al mismo ancho, ignorando el que
  // pida quien llama: la URL es la clave del caché en disco, y pedir la misma foto a
  // 500 y a 820 guardaría dos copias de lo mismo. 800 se ve bien en tarjeta y ficha.
  if (isGoogleImg(url)) return "/img?u=" + encodeURIComponent(googleImg(url));
  return url;
}

// Variante DIRECTA (sin pasar por /img): la usan los consumidores de servidor
// —sanador de fotos, QC con IA, email del boletín— que necesitan una URL absoluta
// y a los que la CORP del navegador no afecta.
function imgDirect(url, w = 500, h = 500) {
  if (!url) return null;
  if (/geilicdn|weidian/.test(url)) return `${geiliBase(url)}.webp?w=${w}&h=${h}&cp=1`;
  if (isGoogleImg(url)) return googleImg(url);
  return url;
}

// Proxy de imagen: SOLO para los hosts de la lista blanca (evita convertirnos en
// un proxy abierto/SSRF). Cachea fuerte: la imagen no cambia para una URL dada.
const IMG_ALLOW = /^https:\/\/(docs\.google\.com\/sheets-images-rt|lh\d+\.googleusercontent\.com\/docsubipk)\//;

// Caché EN DISCO de las fotos servidas por el proxy.
//
// Google rota las URLs de las imágenes incrustadas en una hoja: la misma foto pasa a
// otra dirección cada poco y la anterior devuelve 400. Sin copia propia, miles de
// fichas se quedaban en blanco a los pocos días de importarlas — y para los productos
// de Taobao esa era su ÚNICA foto posible (no se pueden enriquecer desde la fuente).
//
// Guardar la copia la primera vez que se pide desengancha el catálogo de esas URLs.
// Va en el volumen, junto a la base de datos, para sobrevivir a los redespliegues.
const IMG_CACHE_DIR = process.env.IMG_CACHE_DIR || join(dirname(DB_PATH), "imgcache");
const cacheName = (url) => createHash("sha1").update(url).digest("hex");
const EXT_OF = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

async function serveCached(res, file, ct) {
  const buf = await readFile(file);
  res.writeHead(200, { "Content-Type": ct, "Content-Length": buf.length, "Cache-Control": "public, max-age=31536000, immutable" });
  res.end(buf);
}

// ¿Está ya en disco? Devuelve {file, ct} o null.
async function cacheHit(url) {
  const base = join(IMG_CACHE_DIR, cacheName(url));
  for (const [ct, ext] of Object.entries(EXT_OF)) {
    try { await access(`${base}.${ext}`); return { file: `${base}.${ext}`, ct }; } catch {}
  }
  return null;
}

// Descarga y guarda. Devuelve {buf, ct} o null si el origen no dio una imagen.
async function cacheStore(url, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  let r;
  try { r = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": HEAL_UA } }); }
  finally { clearTimeout(to); }
  const ct = (r.headers.get("content-type") || "").split(";")[0].trim();
  if (!r.ok || !/^image\//.test(ct)) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  // Guardar es best-effort: si el disco falla, la imagen igual se sirve.
  try {
    await mkdir(IMG_CACHE_DIR, { recursive: true });
    const base = join(IMG_CACHE_DIR, cacheName(url));
    const tmp = `${base}.${process.pid}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, `${base}.${EXT_OF[ct] || "jpg"}`); // atómico: nunca se sirve un fichero a medias
  } catch (e) { console.error("imgcache:", e.message); }
  return { buf, ct };
}

async function handleImgProxy(req, res, u) {
  const target = u.searchParams.get("u") || "";
  if (!IMG_ALLOW.test(target)) { res.writeHead(400, { "Content-Type": "text/plain" }); return res.end("bad url"); }
  // 1) ¿ya la tenemos guardada? Entonces da igual que la URL de Google haya muerto.
  const hit = await cacheHit(target);
  if (hit) { try { return await serveCached(res, hit.file, hit.ct); } catch {} }
  // 2) Primera vez: descargar, guardar y servir.
  try {
    const got = await cacheStore(target);
    if (!got) { res.writeHead(502, { "Content-Type": "text/plain" }); return res.end("upstream"); }
    res.writeHead(200, { "Content-Type": got.ct, "Content-Length": got.buf.length, "Cache-Control": "public, max-age=31536000, immutable" });
    res.end(got.buf);
  } catch { res.writeHead(504, { "Content-Type": "text/plain" }); res.end("timeout"); }
}

// Limpieza ligera del nombre crudo (sin IA): colapsa espacios y quita ruido tipo
// "( 14 + styles)" / "(3 colors)". Solo se usa como fallback cuando no hay título
// limpio de IA; el etiquetado con IA corrige además erratas y normaliza de verdad.
function tidyName(s) {
  if (!s) return s;
  return String(s)
    .replace(/\s+/g, " ")
    .replace(/\(\s*\d+\s*\+?\s*(?:styles?|colou?rs?|options?|variants?|models?|pcs?)\s*\)/gi, "")
    .replace(/[\s·|,-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Enriquece los links de agente con su cashback y bono (bilingüe) para la
// comparativa de agentes en la ficha/modal.
// --- Badge "Recomendado / Más elegido" --------------------------------------
// Cold-start: el recomendado editorial (lo marca el admin). En cuanto un agente
// destacado acumula clics reales, el badge pasa solo a "Más elegido" con datos.
// Cacheado 5 min (es global, no por producto) para no consultar clicks en cada card.
const BADGE_CLICK_THRESHOLD = 15; // clics (60 días) para fiarnos del dato de comunidad
let _badge = undefined, _badgeTs = 0;
function resetBadge() { _badge = undefined; _badgeTs = 0; }
function getBadgeAgent() {
  const now = Date.now();
  if (_badge !== undefined && now - _badgeTs < 300000) return _badge;
  _badgeTs = now;
  // Solo compiten los destacados que además están activos y con tu código (te pagan).
  const feat = getAgentState().filter((a) => a.featured && a.enabled && a.configured);
  if (!feat.length) { _badge = null; return null; }
  const since = new Date(now - 60 * 864e5).toISOString();
  const counts = {};
  try { for (const r of db.prepare("SELECT agent, COUNT(*) c FROM clicks WHERE ts >= ? GROUP BY agent").all(since)) counts[r.agent] = r.c; } catch {}
  let top = null;
  for (const a of feat) { const c = counts[a.id] || 0; if (c >= BADGE_CLICK_THRESHOLD && (!top || c > top.c)) top = { id: a.id, c }; }
  if (top) { _badge = { id: top.id, kind: "chosen" }; return _badge; }
  const def = feat.find((a) => a.is_default) || feat[0];
  _badge = { id: def.id, kind: "recommended" };
  return _badge;
}

function enrichLinks(links) {
  const badge = getBadgeAgent();
  const out = {};
  for (const [id, l] of Object.entries(links)) {
    const m = agentMeta(id);
    out[id] = { ...l, cashback: (m && m.cashback) || null, bonus: (m && m.bonus) || null,
      badge: badge && badge.id === id ? badge.kind : null };
  }
  return out;
}

function json(res, code, data) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
}

// --- Rate limiting sencillo en memoria (ventana fija por IP + clave) ---
// Protege sobre todo los endpoints que cuestan dinero (IA) de spam/abuso.
const rlBuckets = new Map();
function clientIp(req) {
  // El valor ÚLTIMO de X-Forwarded-For es el que añade nuestro proxy (Railway) con
  // la IP real que vio — no es falsificable. El primero lo pone el cliente y puede
  // inventárselo en cada petición para saltarse los límites de las APIs de IA.
  const xff = req.headers["x-forwarded-for"];
  const parts = xff ? String(xff).split(",").map((s) => s.trim()).filter(Boolean) : [];
  return parts[parts.length - 1] || req.socket?.remoteAddress || "?";
}
function rateLimit(req, res, key, max, windowMs) {
  const now = Date.now();
  const id = key + "|" + clientIp(req);
  let b = rlBuckets.get(id);
  if (!b || now > b.reset) { b = { count: 0, reset: now + windowMs }; rlBuckets.set(id, b); }
  b.count++;
  if (rlBuckets.size > 5000) for (const [k, v] of rlBuckets) if (now > v.reset) rlBuckets.delete(k);
  if (b.count > max) {
    res.writeHead(429, { "Content-Type": "application/json; charset=utf-8", "Retry-After": String(Math.ceil((b.reset - now) / 1000)) });
    res.end(JSON.stringify({ ok: false, error: "Demasiadas peticiones, prueba en un momento." }));
    return false;
  }
  return true;
}

const SORTS = {
  trending: "(image_url IS NOT NULL) DESC, hot DESC, price_eur DESC",
  newest: "(image_url IS NOT NULL) DESC, id DESC",
  price_asc: "(image_url IS NOT NULL) DESC, price_eur ASC",
  price_desc: "(image_url IS NOT NULL) DESC, price_eur DESC",
  name: "(image_url IS NOT NULL) DESC, name ASC",
  // Más populares: por nº de clics en links de agente (intención de compra real).
  popular: "(image_url IS NOT NULL) DESC, (SELECT COUNT(*) FROM clicks WHERE clicks.product_id = products.id) DESC, hot DESC",
};

function handleCategories(res) {
  const rows = db.prepare(`
    SELECT COALESCE(category,'(otros)') AS category, COUNT(*) AS count,
           SUM(CASE WHEN image_url IS NOT NULL THEN 1 ELSE 0 END) AS with_image
    FROM products GROUP BY category ORDER BY count DESC
  `).all();
  const total = db.prepare("SELECT COUNT(*) c FROM products").get().c;
  const withImg = db.prepare("SELECT COUNT(*) c FROM products WHERE image_url IS NOT NULL AND status <> 'hidden'").get().c;
  const categories = rows.map((r) => ({
    ...r, label_en: catLabel(r.category, "en"), label_es: catLabel(r.category, "es"),
  }));
  json(res, 200, { total, withImage: withImg, categories });
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

// Parseo de filtros del catálogo (multi-categoría y multi-marca separadas por
// coma). Reutilizado por /api/products y /api/facets para que ambos filtren
// igual. Mantiene compatibilidad con los singulares category/brand (home).
function parseFilters(params) {
  const q = (params.get("q") || "").trim();
  const cats = (params.get("cats") || params.get("category") || "").split(",").map((s) => canonCat(s.trim())).filter(Boolean);
  const brands = (params.get("brands") || params.get("brand") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const gender = (params.get("gender") || "").trim();
  const pmin = parseFloat(params.get("price_min")); const pmax = parseFloat(params.get("price_max"));
  const onlyImg = params.get("withImage") !== "0"; // por defecto, solo con foto
  return { q, cats, brands, gender, pmin: isNaN(pmin) ? null : pmin, pmax: isNaN(pmax) ? null : pmax, onlyImg };
}
// Construye [where[], args[]] desde un filtro. `exclude` omite un eje para contar
// facetas: las categorías se cuentan ignorando la selección de categoría, y las
// marcas ignorando la de marca — así marcar una opción no vacía su propia lista.
function buildWhere(f, exclude = {}) {
  // 'hidden' = el barrido de salud lo dio por caído tras varios fallos seguidos. No
  // se borra: si vuelve a estar vivo (o reaparece en una hoja) se reactiva solo.
  const where = ["status <> 'hidden'"], args = [];
  if (f.q) { where.push("(name LIKE ? OR clean_title LIKE ? OR brand LIKE ? OR tags LIKE ?)"); args.push(`%${f.q}%`, `%${f.q}%`, `%${f.q}%`, `%${f.q}%`); }
  if (!exclude.cat && f.cats.length) { where.push(`category IN (${f.cats.map(() => "?").join(",")})`); args.push(...f.cats); }
  if (!exclude.brand && f.brands.length) { where.push(`brand IN (${f.brands.map(() => "?").join(",")})`); args.push(...f.brands); }
  if (f.gender === "men") where.push("gender IN ('men','unisex')");
  else if (f.gender === "women") where.push("gender IN ('women','unisex')");
  if (f.pmin != null) { where.push("price_eur >= ?"); args.push(f.pmin); }
  if (f.pmax != null) { where.push("price_eur <= ?"); args.push(f.pmax); }
  if (f.onlyImg) where.push("image_url IS NOT NULL");
  return { where, args };
}

function handleProducts(res, params) {
  const hot = params.get("hot") === "1";
  const sort = SORTS[params.get("sort")] || SORTS.trending;
  const limit = Math.min(parseInt(params.get("limit") || "48", 10), 200);
  const offset = Math.max(parseInt(params.get("offset") || "0", 10), 0);
  // Lista explícita de IDs (favoritos compartidos por URL). Máx 100.
  const ids = (params.get("ids") || "").split(",").map((x) => parseInt(x, 10)).filter(Boolean).slice(0, 100);

  const f = parseFilters(params);
  if (ids.length) f.onlyImg = false; // los favoritos por URL se muestran aunque no tengan foto
  const { where, args } = buildWhere(f);
  if (ids.length) { where.push(`id IN (${ids.map(() => "?").join(",")})`); args.push(...ids); }
  if (hot) where.push("hot = 1");
  const wsql = where.length ? "WHERE " + where.join(" AND ") : "";

  const total = db.prepare(`SELECT COUNT(*) c FROM products ${wsql}`).get(...args).c;
  const COLS = "id, platform, item_id, name, clean_title, clean_title_en, brand, category, price_eur, image_url, images, hot, qc_score, qc_notes";
  // diverse=1: como MUCHO 2 por categoría Y 2 por marca. Lo usa el escaparate
  // "Nuevos finds". Con solo la categoría no bastaba: una importación grande de una
  // marca colaba 5 variantes de color del mismo modelo (repartidas entre calzado,
  // sudaderas y camisetas), y el escaparate seguía pareciendo roto. Limitar también
  // por marca es lo que consigue que se vean productos de verdad distintos.
  const rows = params.get("diverse") === "1"
    ? db.prepare(`SELECT ${COLS} FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(category,'?') ORDER BY ${sort}) rnc,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(LOWER(brand),'?') ORDER BY ${sort}) rnb
        FROM products ${wsql}
      ) WHERE rnc <= 2 AND rnb <= 2 ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...args, limit, offset)
    : db.prepare(`SELECT ${COLS} FROM products ${wsql} ORDER BY ${sort} LIMIT ? OFFSET ?`).all(...args, limit, offset);

  const items = rows.map((r) => {
    let gallery = [];
    try { gallery = r.images ? JSON.parse(r.images) : []; } catch { gallery = []; }
    let qc = {}; try { qc = r.qc_notes ? JSON.parse(r.qc_notes) : {}; } catch {}
    return {
      id: r.id, name: r.clean_title || tidyName(r.name), title_en: r.clean_title_en, raw_name: r.name, brand: r.brand, category: r.category,
      price_eur: r.price_eur, hot: !!r.hot,
      thumb: thumb(r.image_url), image: r.image_url, images: gallery,
      qc_score: r.qc_score, qc_summary: qc.summary, qc_summary_en: qc.summary_en,
      links: enrichLinks(buildLinks(r.platform, r.item_id)),
    };
  });

  json(res, 200, { total, limit, offset, items });
}

// Facetas del explorador: categorías y marcas con conteo, respetando el resto de
// filtros (faceted search). Cada eje se cuenta ignorando su propia selección.
function handleFacets(res, params) {
  const f = parseFilters(params);
  const catQ = buildWhere(f, { cat: true }); catQ.where.push("category IS NOT NULL");
  const categories = db.prepare(`SELECT category, COUNT(*) c FROM products WHERE ${catQ.where.join(" AND ")} GROUP BY category ORDER BY c DESC`).all(...catQ.args)
    .map((r) => ({ category: r.category, count: r.c, label_es: catLabel(r.category, "es"), label_en: catLabel(r.category, "en") }));
  const brQ = buildWhere(f, { brand: true }); brQ.where.push("brand IS NOT NULL");
  const brands = db.prepare(`SELECT brand, COUNT(*) c FROM products WHERE ${brQ.where.join(" AND ")} GROUP BY brand ORDER BY c DESC LIMIT 400`).all(...brQ.args)
    .map((r) => ({ brand: r.brand, count: r.c }));
  const tQ = buildWhere(f);
  const total = tQ.where.length
    ? db.prepare(`SELECT COUNT(*) c FROM products WHERE ${tQ.where.join(" AND ")}`).get(...tQ.args).c
    : db.prepare("SELECT COUNT(*) c FROM products").get().c;
  json(res, 200, { total, categories, brands });
}

// Boletín: guarda el email del suscriptor (el envío lo conectas tú aparte).
async function handleSubscribe(req, res) {
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 120) return json(res, 400, { ok: false, error: "Email no válido" });
  try {
    db.prepare("INSERT OR IGNORE INTO subscribers (email, created_at, lang) VALUES (?, ?, ?)").run(email, new Date().toISOString(), reqLang(req));
  } catch { return json(res, 500, { ok: false, error: "Error" }); }
  json(res, 200, { ok: true });
}
// Admin: ver/exportar suscriptores.
function handleAdminSubscribers(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const rows = db.prepare("SELECT email, created_at, lang FROM subscribers ORDER BY created_at DESC").all();
  json(res, 200, { ok: true, count: rows.length, subscribers: rows });
}
// Admin: genera un "digest" HTML de los últimos finds, listo para pegar en tu
// proveedor de email (Mailchimp/Resend/…). No enviamos nosotros; te damos el
// contenido + la lista de suscriptores para que lo mandes con tu herramienta.
function handleAdminDigest(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const subs = db.prepare("SELECT COUNT(*) c FROM subscribers").get().c;
  const rows = db.prepare("SELECT id, clean_title, name, price_eur, image_url FROM products WHERE image_url IS NOT NULL AND status <> 'hidden' AND clean_title IS NOT NULL ORDER BY id DESC LIMIT 12").all();
  const base = baseUrl(req);
  const cell = (r) => {
    if (!r) return '<td style="width:50%"></td>';
    const nm = esc(r.clean_title || tidyName(r.name));
    const pr = r.price_eur != null ? "€" + Number(r.price_eur).toFixed(2) : "";
    const src = thumb(r.image_url, 400, 400); // relativa si va por /img → absolutiza para el email
    return `<td style="padding:8px;width:50%;vertical-align:top"><a href="${base}/producto/${r.id}" style="text-decoration:none;color:#111"><img src="${src.startsWith("/") ? base + src : src}" width="240" style="width:100%;max-width:240px;border-radius:10px" alt="${nm}"><div style="font-weight:600;font-size:14px;margin-top:6px">${nm}</div><div style="color:#777;font-size:13px">${pr}</div></a></td>`;
  };
  let table = "";
  for (let i = 0; i < rows.length; i += 2) table += `<tr>${cell(rows[i])}${cell(rows[i + 1])}</tr>`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:540px;margin:0 auto;color:#111">
  <h2 style="color:#ff4d2e;margin:0 0 6px">Nuevos finds en CNFinds ✨</h2>
  <p style="color:#555">Los últimos hallazgos con fotos QC reales y precios de fábrica:</p>
  <table style="width:100%;border-collapse:collapse">${table}</table>
  <p style="text-align:center;margin:20px 0"><a href="${base}/productos" style="background:#ff4d2e;color:#fff;padding:12px 24px;border-radius:10px;text-decoration:none;font-weight:700">Ver todo el catálogo →</a></p>
  <p style="color:#999;font-size:12px;text-align:center">Recibes esto porque te suscribiste en ${base}. Cancela cuando quieras.</p>
</div>`;
  json(res, 200, { ok: true, subscribers: subs, count: rows.length, html });
}

// Analítica: registra un clic en un agente (intención de compra).
async function handleTrack(req, res) {
  let body; try { body = await readBody(req); } catch { body = {}; }
  const pid = parseInt(body.product_id, 10) || null;
  const agent = String(body.agent || "").slice(0, 40).toLowerCase().replace(/[^a-z0-9_-]/g, "");
  if (agent) {
    try { db.prepare("INSERT INTO clicks (product_id, agent, ts) VALUES (?, ?, ?)").run(pid, agent, new Date().toISOString()); } catch {}
  }
  res.writeHead(204); res.end();
}

// Alerta de precio: avísame si un producto baja de X (captura).
async function handlePriceAlert(req, res) {
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const email = String(body.email || "").trim().toLowerCase();
  const pid = parseInt(body.product_id, 10);
  const target = parseFloat(body.target_eur);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { ok: false, error: "Email no válido" });
  if (!pid || !(target > 0)) return json(res, 400, { ok: false, error: "Datos no válidos" });
  try { db.prepare("INSERT INTO price_alerts (email, product_id, target_eur, created_at) VALUES (?, ?, ?, ?)").run(email, pid, target, new Date().toISOString()); }
  catch { return json(res, 500, { ok: false, error: "Error" }); }
  json(res, 200, { ok: true });
}

// Admin: analítica de clics (por agente, por día, top productos).
function handleAdminAnalytics(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const total = db.prepare("SELECT COUNT(*) c FROM clicks").get().c;
  const d7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const d30 = new Date(Date.now() - 30 * 864e5).toISOString();
  const last7 = db.prepare("SELECT COUNT(*) c FROM clicks WHERE ts >= ?").get(d7).c;
  const last30 = db.prepare("SELECT COUNT(*) c FROM clicks WHERE ts >= ?").get(d30).c;
  const byAgent = db.prepare("SELECT agent, COUNT(*) c FROM clicks GROUP BY agent ORDER BY c DESC").all();
  const byDay = db.prepare("SELECT substr(ts,1,10) d, COUNT(*) c FROM clicks WHERE ts >= ? GROUP BY d ORDER BY d").all(new Date(Date.now() - 14 * 864e5).toISOString());
  const topRows = db.prepare("SELECT product_id, COUNT(*) c FROM clicks WHERE product_id IS NOT NULL GROUP BY product_id ORDER BY c DESC LIMIT 10").all();
  const top = topRows.map((r) => {
    const p = db.prepare("SELECT clean_title, name FROM products WHERE id=?").get(r.product_id);
    return { product_id: r.product_id, name: p ? tidyName(p.clean_title || p.name) : `#${r.product_id}`, clicks: r.c };
  });
  json(res, 200, { ok: true, total, last7, last30, byAgent, byDay, top });
}

// Admin: alertas de precio capturadas.
function handleAdminAlerts(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const rows = db.prepare("SELECT email, product_id, target_eur, created_at FROM price_alerts ORDER BY created_at DESC LIMIT 500").all();
  json(res, 200, { ok: true, count: rows.length, alerts: rows });
}

// Fallback: si algo no está en nuestro catálogo, enlaces de búsqueda en los agentes
// activos (con tu código). El usuario sigue el funnel y tú conservas la comisión.
function handleSearchFallback(res, params) {
  const q = (params.get("q") || "").trim().slice(0, 120);
  json(res, 200, { ok: true, q, agents: buildSearchLinks(q) });
}
// Captura de demanda: qué busca la gente que no tenemos.
async function handleRequest(req, res) {
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const query = String(body.query || "").trim().slice(0, 160);
  const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
  if (!query) return json(res, 400, { ok: false, error: "Falta la búsqueda" });
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, 400, { ok: false, error: "Email no válido" });
  try { db.prepare("INSERT INTO requests (query, email, created_at, lang) VALUES (?, ?, ?, ?)").run(query, email || null, new Date().toISOString(), reqLang(req)); }
  catch { return json(res, 500, { ok: false, error: "Error" }); }
  json(res, 200, { ok: true });
}
// Admin: estado del catálogo (números en vivo para la guía de pasos).
function handleAdminStatus(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const one = (sql) => { try { return db.prepare(sql).get().c; } catch { return 0; } };
  const agents = getAgentState();
  json(res, 200, {
    ok: true,
    products: one("SELECT COUNT(*) c FROM products"),
    withImage: one("SELECT COUNT(*) c FROM products WHERE image_url IS NOT NULL"),
    noImage: one("SELECT COUNT(*) c FROM products WHERE image_url IS NULL"),
    tagged: one("SELECT COUNT(*) c FROM products WHERE clean_title IS NOT NULL"),
    untagged: one("SELECT COUNT(*) c FROM products WHERE clean_title IS NULL"),
    withQc: one("SELECT COUNT(*) c FROM products WHERE qc_score IS NOT NULL"),
    agentsActive: agents.filter((a) => a.enabled).length,
    agentsTotal: agents.length,
    subscribers: one("SELECT COUNT(*) c FROM subscribers"),
    alerts: one("SELECT COUNT(*) c FROM price_alerts"),
    requests: one("SELECT COUNT(*) c FROM requests"),
    clicks: one("SELECT COUNT(*) c FROM clicks"),
    lastIngest: metaGet("last_auto_ingest"),
    // Estado REAL de los automatismos. Se muestran en el panel porque las env vars
    // solo se apagan con el valor literal "off": puesto "false" o "0" el proceso
    // seguiría encendido y desde Railway (que oculta los valores) no se nota.
    autoIngest: AUTO_INGEST,
    autoQc: AUTO_QC,
    autoTag: AUTO_TAG,
    autoHealth: AUTO_HEALTH,
    hasGoogleKey: !!process.env.GOOGLE_API_KEY,
    hasAiKey: hasKey(),
  });
}

// Admin: reintentar fotos ahora (resetea intentos de los que siguen sin foto y
// relanza el enriquecimiento). Útil si Weidian throttleó y quieres reintentar ya.
function handleAdminRetryPhotos(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const r = db.prepare("UPDATE products SET enrich_tries=0, last_checked=NULL WHERE platform='weidian' AND image_url IS NULL").run();
  resumePhotos();
  json(res, 200, { ok: true, reset: r.changes });
}

// Admin: "sanador". Escanea la foto de cada producto y QUITA del catálogo
// (image_url=NULL) las que están realmente MUERTAS (HTTP 404/410). No toca los
// errores de red/403/timeout: podrían ser bloqueo temporal de IP y darían falsos
// positivos. Nulificar es reversible: si el producto sigue en alguna hoja, el
// próximo importador lo re-sana con la foto buena (upsert usa COALESCE).
const HEAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
function startHealJob() {
  const rows = db.prepare("SELECT id, image_url FROM products WHERE image_url IS NOT NULL").all();
  const id = "job_" + (++jobSeq);
  const job = { id, total: rows.length, done: 0, ok: 0, dead: 0, unknown: 0, removed: 0, phase: "scan", status: "running" };
  jobs.set(id, job);
  if (jobs.size > 40) jobs.delete(jobs.keys().next().value);
  const upd = db.prepare("UPDATE products SET image_url=NULL, images=NULL, enrich_tries=0, last_checked=NULL WHERE id=?");
  const ref = process.env.SITE_URL || "https://cnfinds.online";
  (async () => {
    let idx = 0;
    const worker = async () => {
      while (idx < rows.length) {
        const r = rows[idx++];
        // Imágenes "en celda" de Google (lh3.googleusercontent/docsubipk) caducan
        // y dan 403: son muertas de verdad (no es ban de IP), así que las tratamos
        // como tal. En geilicdn un 403 SÍ podría ser ban temporal → no se toca.
        const badHost = /googleusercontent\.com|docsubipk/i.test(r.image_url || "");
        let cls = "unknown";
        try {
          const ctrl = new AbortController();
          const to = setTimeout(() => ctrl.abort(), 9000);
          let res;
          try {
            res = await fetch(imgDirect(r.image_url), { signal: ctrl.signal, headers: { "User-Agent": HEAL_UA, "Referer": ref, "Range": "bytes=0-1" } });
          } finally { clearTimeout(to); }
          try { await res.body?.cancel?.(); } catch {}
          const good = (res.status === 200 || res.status === 206) && /image\//.test(res.headers.get("content-type") || "");
          if (res.status === 404 || res.status === 410) cls = "dead";
          else if (good) cls = "ok";
          else if (badHost) cls = "dead"; // Google doc-image caducada (403/redirección/…)
          else cls = "unknown";
        } catch { cls = badHost ? "dead" : "unknown"; }
        if (cls === "dead") { try { upd.run(r.id); job.removed++; } catch {} job.dead++; }
        else if (cls === "ok") job.ok++;
        else job.unknown++;
        job.done++;
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    job.phase = "done"; job.status = "done";
  })().catch((e) => { job.phase = "done"; job.status = "done"; job.error = e.message; });
  return job;
}

function handleAdminHealPhotos(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const job = startHealJob();
  json(res, 200, { ok: true, jobId: job.id, total: job.total });
}

// Admin: lanzar el importador automático ahora (opcional; también corre solo).
function handleAdminAutoIngest(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  if (!AUTO_INGEST) return json(res, 200, { ok: false, error: "Desactivado (AUTO_INGEST=off)." });
  if (autoIngestRunning) return json(res, 200, { ok: true, running: true, last: metaGet("last_auto_ingest") });
  autoIngestSources({ force: true }).catch((e) => console.error("Auto-ingest falló:", e.message));
  json(res, 200, { ok: true, started: true, sheets: listSources().filter((s) => s.enabled).length });
}

// --- Gestor de fuentes (hojas de la comunidad) editable desde /admin ---
// La primera vez siembra la tabla con las fuentes del config; a partir de ahí
// mandas tú desde el panel (añadir/activar/quitar), sin redeploy.
function ensureSourcesSeeded() {
  const n = db.prepare("SELECT COUNT(*) c FROM sources").get().c;
  if (n > 0) return;
  const ins = db.prepare("INSERT OR IGNORE INTO sources (id, name, url, enabled, added_at) VALUES (?, ?, ?, 1, ?)");
  const now = new Date().toISOString();
  for (const s of COMMUNITY_SHEETS) ins.run(s.id, s.name, sheetUrl(s.id), now);
}
function listSources() { try { return db.prepare("SELECT * FROM sources ORDER BY added_at").all(); } catch { return []; } }

function handleAdminSources(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  ensureSourcesSeeded();
  json(res, 200, { ok: true, sources: listSources() });
}
async function handleAdminSourceAdd(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const id = sheetIdFromUrl(body.url || "");
  if (!id) return json(res, 200, { ok: false, error: "URL de Google Sheet no válida." });
  const name = String(body.name || "").trim().slice(0, 80) || "Hoja " + id.slice(0, 6);
  db.prepare("INSERT INTO sources (id, name, url, enabled, added_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, url=excluded.url, enabled=1")
    .run(id, name, sheetUrl(id), new Date().toISOString());
  json(res, 200, { ok: true, sources: listSources() });
}
async function handleAdminSourceToggle(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  db.prepare("UPDATE sources SET enabled=? WHERE id=?").run(body.enabled ? 1 : 0, String(body.id || ""));
  json(res, 200, { ok: true, sources: listSources() });
}
async function handleAdminSourceDelete(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  db.prepare("DELETE FROM sources WHERE id=?").run(String(body.id || ""));
  json(res, 200, { ok: true, sources: listSources() });
}
// Admin: demanda agregada (qué añadir al catálogo).
function handleAdminRequests(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado" });
  const top = db.prepare("SELECT lower(query) q, COUNT(*) c, MAX(created_at) last FROM requests GROUP BY lower(query) ORDER BY c DESC, last DESC LIMIT 100").all();
  const total = db.prepare("SELECT COUNT(*) c FROM requests").get().c;
  const withEmail = db.prepare("SELECT query, email, created_at FROM requests WHERE email IS NOT NULL ORDER BY created_at DESC LIMIT 200").all();
  json(res, 200, { ok: true, total, top, withEmail });
}

// Sugerencias: productos PARECIDOS de nuestro catálogo (match por tokens contra
// nombre/título/marca/tags/categoría, ordenado por nº de coincidencias). Se usa en
// el estado vacío cuando no hay match exacto.
const SUGGEST_STOP = new Set(["con", "the", "and", "for", "por", "del", "los", "las", "una", "uno", "new", "style", "styles", "color", "colors", "colour", "size", "sizes"]);
function handleSuggest(res, params) {
  const raw = (params.get("q") || "").trim();
  const tokens = [...new Set(raw.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !SUGGEST_STOP.has(w)))].slice(0, 8);
  if (!tokens.length) return json(res, 200, { ok: true, items: [] });
  const scoreExpr = tokens.map(() => "(CASE WHEN (' '||name||' '||COALESCE(clean_title,'')||' '||COALESCE(brand,'')||' '||COALESCE(tags,'')||' '||COALESCE(category,'')) LIKE ? THEN 1 ELSE 0 END)").join("+");
  const likeArgs = tokens.map((t) => `%${t}%`);
  const rows = db.prepare(`
    SELECT id, platform, item_id, name, clean_title, clean_title_en, brand, category, price_eur, image_url, images, hot, qc_score, qc_notes, (${scoreExpr}) AS sc
    FROM products WHERE image_url IS NOT NULL AND status <> 'hidden' AND (${scoreExpr}) > 0
    ORDER BY sc DESC, hot DESC, price_eur DESC LIMIT 12
  `).all(...likeArgs, ...likeArgs);
  const items = rows.map((r) => {
    let gallery = []; try { gallery = r.images ? JSON.parse(r.images) : []; } catch {}
    let qc = {}; try { qc = r.qc_notes ? JSON.parse(r.qc_notes) : {}; } catch {}
    return {
      id: r.id, name: r.clean_title || tidyName(r.name), title_en: r.clean_title_en, raw_name: r.name, brand: r.brand,
      category: r.category, price_eur: r.price_eur, hot: !!r.hot,
      thumb: thumb(r.image_url), image: r.image_url, images: gallery,
      qc_score: r.qc_score, qc_summary: qc.summary, qc_summary_en: qc.summary_en,
      links: enrichLinks(buildLinks(r.platform, r.item_id)),
    };
  });
  json(res, 200, { ok: true, tokens, items });
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
    links: enrichLinks(buildLinks(platform, itemId)),
  });
}

// QC Checker con IA: pega un link -> fotos reales + puntuacion de calidad por vision.
// Cachea por (plataforma,item) para no repetir coste de IA. Usa el modelo rapido.
const qcCheckCache = new Map();
// Asesor de tallas: lee las tallas REALES de la ficha y recomienda sobre ellas.
async function handleSizeAdvice(req, res) {
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const id = parseInt(body.id, 10);
  const user = String(body.user || "").trim().slice(0, 300);
  if (!id) return json(res, 400, { ok: false, error: "Falta 'id'." });
  if (user.length < 2) return json(res, 200, { ok: false, error: "Dime tu talla habitual (y si quieres, altura y peso)." });

  const p = db.prepare("SELECT id, platform, item_id, name, clean_title, category FROM products WHERE id=?").get(id);
  if (!p) return json(res, 200, { ok: false, error: "Producto no encontrado." });
  // Solo Weidian expone los atributos de la ficha; en el resto no hay de dónde leerlas.
  if (p.platform !== "weidian") {
    return json(res, 200, { ok: false, kind: "unsupported", error: "Las tallas de este producto no se pueden leer automáticamente (solo Weidian). Mira la tabla de medidas en las fotos del anuncio." });
  }
  let en; try { en = await enrichProduct(p.platform, p.item_id, {}); } catch { en = null; }
  if (!en || !en.ok) return json(res, 200, { ok: false, error: "No pude leer la ficha ahora mismo. Prueba en un minuto." });
  const sz = en.sizes;
  if (!sz) return json(res, 200, { ok: false, kind: "none", error: "Este producto no indica tallas en la ficha. Comprueba la tabla de medidas en las fotos." });
  if (sz.kind === "one") return json(res, 200, { ok: true, kind: "one", sizes: sz.values, advice: "Este producto es de talla única." });

  try {
    const out = await sizeAdvice({
      name: p.clean_title || p.name, category: p.category,
      kind: sz.kind, sizes: sz.values, user,
    });
    json(res, 200, { ok: true, kind: sz.kind, sizes: sz.values, ...out });
  } catch (e) { json(res, 200, { ok: false, error: "La IA no respondió. Inténtalo otra vez." }); }
}

async function handleQcCheck(req, res) {
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const url = (body.url || "").trim();
  if (!url) return json(res, 400, { ok: false, error: "Falta 'url'." });
  const parsed = parseAnyUrl(url);
  if (!parsed) return json(res, 200, { ok: false, error: "No pude reconocer un producto en ese enlace." });
  const { platform, itemId } = parsed;
  const key = `${platform}:${itemId}`;
  if (qcCheckCache.has(key)) return json(res, 200, qcCheckCache.get(key));
  try {
    // 1) Fotos: primero desde nuestro catalogo (gratis); si no, se scrapean.
    let images = [], name = "";
    const row = db.prepare("SELECT clean_title, name, images, image_url FROM products WHERE platform=? AND item_id=?").get(platform, itemId);
    if (row) {
      name = row.clean_title || row.name || "";
      try { images = row.images ? JSON.parse(row.images) : []; } catch {}
      if (!images.length && row.image_url) images = [row.image_url];
    }
    if (!images.length) {
      const en = await enrichProduct(platform, itemId, {});
      if (en.ok && en.images && en.images.length) images = en.images;
    }
    if (!images.length) {
      return json(res, 200, { ok: false, platform, itemId, error: "No pude obtener fotos de este producto (plataforma no soportada aun, o item caido).", links: enrichLinks(buildLinks(platform, itemId)) });
    }
    // 2) Puntuacion QC por vision (modelo rapido para controlar coste). Max 4 fotos.
    //    El CDN de Weidian redimensiona con el sufijo .webp: fotos ligeras y rapidas.
    const wp = (u, w) => (/geilicdn|weidian/.test(u) ? `${u}.webp?w=${w}&h=${w}` : u);
    const qc = await qcOne(images.slice(0, 4).map((u) => wp(u, 700)), name, { model: MODELS.fast });
    const result = { ok: true, platform, itemId, name, images: images.slice(0, 8).map((u) => wp(u, 300)), qc, links: enrichLinks(buildLinks(platform, itemId)) };
    qcCheckCache.set(key, result);
    if (qcCheckCache.size > 300) qcCheckCache.delete(qcCheckCache.keys().next().value);
    json(res, 200, result);
  } catch (e) {
    json(res, 200, { ok: false, error: e.message });
  }
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
    SELECT id, platform, item_id, name, clean_title, clean_title_en, brand, category, price_eur, image_url, images, hot, qc_score, qc_notes
    FROM products ${wsql} ORDER BY ${sort} LIMIT ? OFFSET ?
  `).all(...argv, Math.min(f.limit || 48, 200), f.offset || 0);
  const items = rows.map((r) => {
    let gallery = []; try { gallery = r.images ? JSON.parse(r.images) : []; } catch {}
    let qc = {}; try { qc = r.qc_notes ? JSON.parse(r.qc_notes) : {}; } catch {}
    return {
      id: r.id, name: r.clean_title || tidyName(r.name), title_en: r.clean_title_en, raw_name: r.name, brand: r.brand,
      category: r.category, price_eur: r.price_eur, hot: !!r.hot,
      thumb: thumb(r.image_url), image: r.image_url, images: gallery,
      qc_score: r.qc_score, qc_summary: qc.summary, qc_summary_en: qc.summary_en,
      links: enrichLinks(buildLinks(r.platform, r.item_id)),
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
    // El total lo calculamos NOSOTROS con los precios reales del catálogo. La IA da
    // un total que a veces se inventa (y prometía "dentro de presupuesto" con picks
    // que lo triplicaban). over_budget avisa al usuario en vez de mentirle.
    const total = Math.round(picks.reduce((s, p) => s + (p.price_eur || 0), 0) * 100) / 100;
    json(res, 200, { ok: true, budget, summary: out.summary, total_estimate: total, over_budget: budget ? total > budget : false, picks });
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
const visCache = new Map(); // hash(imagen) -> detección (evita repetir la visión IA)
async function handleVisualSearch(req, res) {
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  let body;
  try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const image = body.image || body.url;
  if (!image) return json(res, 400, { ok: false, error: "Falta 'image'." });
  try {
    const cats = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL").all().map((r) => r.category);
    const brands = db.prepare("SELECT brand FROM products WHERE brand IS NOT NULL GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 25").all().map((r) => r.brand);
    const hash = createHash("sha1").update(String(image)).digest("hex");
    let det = visCache.get(hash);
    if (!det) {
      det = await imageToQuery(image, { categories: cats, brands });
      visCache.set(hash, det);
      if (visCache.size > 300) visCache.delete(visCache.keys().next().value);
    }
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
  if (!setAgentState(body.id, { code: body.code, enabled: body.enabled, featured: body.featured, is_default: body.is_default }))
    return json(res, 200, { ok: false, error: "Agente desconocido." });
  // Persistimos TODOS: marcar un recomendado limpia el de los demás, y eso debe quedar en la DB.
  const all = getAgentState();
  const up = db.prepare("INSERT INTO agent_settings(id,code,enabled,featured,is_default) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET code=excluded.code, enabled=excluded.enabled, featured=excluded.featured, is_default=excluded.is_default");
  for (const a of all) up.run(a.id, a.code || null, a.enabled ? 1 : 0, a.featured ? 1 : 0, a.is_default ? 1 : 0);
  resetBadge();
  json(res, 200, { ok: true, agents: all });
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

// Idioma para SSR: ?lang=  ->  cookie cnf_lang  ->  Accept-Language  (por defecto es)
function reqLang(req) {
  try {
    const q = new URL(req.url, "http://x").searchParams.get("lang");
    if (q === "en" || q === "es") return q;
  } catch {}
  const c = String(req.headers.cookie || "").match(/(?:^|;\s*)cnf_lang=(en|es)/);
  if (c) return c[1];
  return String(req.headers["accept-language"] || "").toLowerCase().startsWith("en") ? "en" : "es";
}

// SSR de una tarjeta (para que los crawlers indexen /productos sin ejecutar JS).
function ssrCard(r, lang) {
  const name = esc((lang === "en" ? (r.clean_title_en || r.clean_title || r.name) : (r.clean_title || r.name)) || "");
  const img = thumb(r.image_url);
  const price = r.price_eur != null ? "€" + Number(r.price_eur).toFixed(2) : "—";
  return `<a class="card" href="/producto/${r.id}"><div class="ph">${img ? `<img loading="lazy" src="${esc(img)}" alt="${name}">` : ""}</div>`
    + `<div class="cbody"><div class="cbrand">${r.brand ? esc(r.brand) : "&nbsp;"}</div><div class="cname">${name}</div>`
    + `<div class="cfoot"><span class="price">${price}</span></div></div></a>`;
}

// Inyecta en index.html el SEO específico de /productos según los filtros de la URL:
// título/descripción/canónica/OG dinámicos, H1, grid pre-renderizado y migas
// (BreadcrumbList). La SPA sustituye el grid al cargar; los crawlers ven contenido.
function injectExploreSeo(page, u, base, lang) {
  const params = u.searchParams;
  const f = parseFilters(params);
  const sort = SORTS[params.get("sort")] || SORTS.trending;
  const { where, args } = buildWhere(f);
  const wsql = where.length ? "WHERE " + where.join(" AND ") : "";
  let total = 0, rows = [];
  try {
    total = db.prepare(`SELECT COUNT(*) c FROM products ${wsql}`).get(...args).c;
    rows = db.prepare(`SELECT id, name, clean_title, clean_title_en, brand, price_eur, image_url FROM products ${wsql} ORDER BY ${sort} LIMIT 48`).all(...args);
  } catch {}
  const catLabels = f.cats.map((c) => catLabel(c, lang));
  const bits = [];
  if (f.q) bits.push(`“${f.q}”`);
  bits.push(...f.brands, ...catLabels);
  const brandCat = bits.join(" · ");
  const suffix = lang === "en" ? "Catalog — CNFinds" : "Catálogo — CNFinds";
  const title = (brandCat ? `${brandCat} — ` : "") + suffix;
  const desc = brandCat
    ? (lang === "en" ? `${total} W2C products for ${brandCat} — QC photos, factory prices, buy via your agent on CNFinds.`
                     : `${total} productos W2C de ${brandCat} — fotos QC, precios de fábrica, compra vía tu agente en CNFinds.`)
    : (lang === "en" ? `Browse ${total}+ W2C products with cross-filters by category and brand. QC photos, factory prices, agent comparison.`
                     : `Explora ${total}+ productos W2C con filtros cruzables por categoría y marca. Fotos QC, precios de fábrica y comparativa de agentes.`);
  const h1 = brandCat || (lang === "en" ? "Explore the catalog" : "Explorar catálogo");
  const canonical = base + "/productos" + (u.search || "");
  const grid = rows.map((r) => ssrCard(r, lang)).join("");
  const crumbs = [{ n: lang === "en" ? "Home" : "Inicio", u: base + "/" }, { n: lang === "en" ? "Catalog" : "Catálogo", u: base + "/productos" }];
  catLabels.forEach((c, i) => crumbs.push({ n: c, u: base + "/productos?cats=" + encodeURIComponent(f.cats[i]) }));
  f.brands.forEach((b) => crumbs.push({ n: b, u: base + "/productos?brands=" + encodeURIComponent(b) }));
  const ld = JSON.stringify({ "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.n, item: c.u })) });
  return page
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(canonical)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${esc(canonical)}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace('<h1 data-i18n="ex_title">Explorar catálogo</h1>', `<h1 data-i18n="ex_title">${esc(h1)}</h1>`)
    .replace('<div class="grid" id="exGrid"></div>', `<div class="grid" id="exGrid">${grid}</div>`)
    .replace("</head>", `<script type="application/ld+json">${ld}</script>\n</head>`);
}

// Hub SEO crawlable para el footer de la home: enlaza las categorías y marcas
// populares a sus páginas SSR (/categoria, /marca). Así la home (nuestra página
// con más autoridad) reparte enlace interno a las ~170 páginas programáticas.
function seoHubHtml(lang) {
  const en = lang === "en";
  const cats = db.prepare("SELECT category, COUNT(*) c FROM products WHERE category IS NOT NULL AND image_url IS NOT NULL GROUP BY category HAVING c>=3 ORDER BY c DESC LIMIT 14").all();
  const brands = db.prepare("SELECT brand, COUNT(*) c FROM products WHERE brand IS NOT NULL AND image_url IS NOT NULL GROUP BY brand HAVING c>=3 ORDER BY c DESC LIMIT 24").all();
  if (!cats.length && !brands.length) return "";
  const link = (href, label) => `<a href="${href}" style="color:var(--muted);text-decoration:none;font-size:13px">${esc(label)}</a>`;
  const catLinks = cats.map((r) => link(`/categoria/${encodeURIComponent(r.category)}`, catLabel(r.category, lang))).join("");
  const brandLinks = brands.map((r) => link(`/marca/${encodeURIComponent(r.brand)}`, r.brand)).join("");
  const col = (h, links) => `<div><h4 style="font-size:13px;font-weight:700;margin:0 0 10px">${esc(h)}</h4><div style="display:flex;flex-wrap:wrap;gap:6px 16px">${links}</div></div>`;
  return `<div class="wrap" style="display:grid;gap:22px;padding:26px 0;border-top:1px solid var(--line)">
    ${col(en ? "Popular categories" : "Categorías populares", catLinks)}
    ${col(en ? "Popular brands" : "Marcas populares", brandLinks)}
  </div>`;
}

// Agentes con metadatos (bono, descripción, ventajas, cupones, registro) en el idioma dado.
function agentsForLang(lang) {
  const pick = (o) => (o ? (lang === "en" ? o.en : o.es) : "");
  return getAgentState().map((a) => {
    const m = agentMeta(a.id);
    if (!m) return null;
    return {
      id: a.id, name: a.name, enabled: a.enabled,
      bonus: pick(m.bonus), desc: pick(m.desc), cashback: m.cashback || null,
      pros: m.pros ? (lang === "en" ? m.pros.en : m.pros.es) : [],
      coupons: (m.coupons || []).map((c) => ({ code: c.code, text: pick(c.text) })),
      signup: signupUrl(a.id),
    };
  }).filter(Boolean);
}
// Sirve la SPA (index.html) con un cuerpo inyectado en #pageView + título/meta.
// Así páginas como /cupones y /ayuda mantienen EXACTAMENTE el mismo navbar y footer
// que el resto del sitio (son vistas de la misma página), en vez de documentos
// aparte. El contenido va en el HTML servido, así que sigue siendo indexable.
function serveSpaWithBody(req, res, { body, title, desc, path }) {
  let page = readFileSync(join(ROOT, "public", "index.html"), "utf8");
  page = page.replace("<!--PAGEVIEW-->", () => body)
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(baseUrl(req) + path)}$2`)
    .replace("<!--SEOHUB-->", () => seoHubHtml(reqLang(req)));
  if (process.env.ANALYTICS_SNIPPET) page = page.replace("</head>", process.env.ANALYTICS_SNIPPET + "\n</head>");
  html(res, page);
}
function handleCoupons(req, res) {
  const lang = reqLang(req), en = lang === "en";
  serveSpaWithBody(req, res, {
    body: couponsBody(agentsForLang(lang), baseUrl(req), lang),
    title: en ? "Agent coupons & bonuses — Kakobuy, ACBuy & more | CNFinds" : "Cupones y bonos de agentes — Kakobuy, ACBuy y más | CNFinds",
    desc: en ? "Sign-up bonuses and shipping coupons for the shopping agents we support." : "Bonos de registro y cupones de envío de los agentes de compra que soportamos.",
    path: "/cupones",
  });
}
function handleAgentsCompare(req, res) {
  const lang = reqLang(req);
  html(res, agentsComparePage({ agents: agentsForLang(lang), base: baseUrl(req), lang }));
}
function handleAgentLanding(req, res, id) {
  const lang = reqLang(req);
  const a = agentsForLang(lang).find((x) => x.id === id);
  if (!a) return html(res, "<h1>404</h1>", 404);
  html(res, agentLandingPage({ agent: a, base: baseUrl(req), lang }));
}
function handleHelp(req, res) {
  const lang = reqLang(req), en = lang === "en";
  serveSpaWithBody(req, res, {
    body: helpBody(GUIDES, baseUrl(req), lang),
    title: en ? "Help center — how to buy reps step by step | CNFinds" : "Centro de ayuda — cómo comprar reps paso a paso | CNFinds",
    desc: en ? "Tools, guides, coupons and FAQ to buy from Taobao/Weidian/1688 through a shopping agent." : "Herramientas, guías, cupones y FAQ para comprar en Taobao/Weidian/1688 a través de un agente.",
    path: "/ayuda",
  });
}

function getProductById(id) {
  const r = db.prepare("SELECT * FROM products WHERE id=?").get(id);
  if (!r) return null;
  let images = []; try { images = r.images ? JSON.parse(r.images) : []; } catch {}
  let qc = {}; try { qc = r.qc_notes ? JSON.parse(r.qc_notes) : {}; } catch {}
  return {
    id: r.id, platform: r.platform, item_id: r.item_id,
    name: r.clean_title || tidyName(r.name), name_en: r.clean_title_en, brand: r.brand, category: r.category,
    price_eur: r.price_eur, image: r.image_url, images,
    ai_description: r.ai_description, ai_description_en: r.ai_description_en,
    qc_score: r.qc_score, qc_summary: qc.summary, qc_summary_en: qc.summary_en,
    links: enrichLinks(buildLinks(r.platform, r.item_id)),
  };
}
// Comparador de vendedores del MISMO modelo. Agrupa por marca+model_name (el
// diagnóstico dio 74% de grupos con precio ajustado, mediana ratio 1.05). El 3% de
// grupos "línea" que mezclan productos (p.ej. "Air Force 1" con la colab de LV) se
// neutraliza con una banda de precio alrededor del producto que se está viendo: solo
// entran listings a ±40% de su precio, así se comparan cosas realmente equivalentes.
const SIMILAR_BAND = 0.4;
function handleSimilar(res, params) {
  const id = parseInt(params.get("id"), 10);
  if (!id) return json(res, 400, { ok: false, error: "falta id" });
  const p = db.prepare("SELECT id, brand, model_name, price_eur FROM products WHERE id=?").get(id);
  // Sin marca+modelo o sin precio no se puede comparar de forma fiable.
  if (!p || !p.brand || !p.model_name || !String(p.model_name).trim() || p.price_eur == null) {
    return json(res, 200, { ok: true, count: 0, items: [] });
  }
  const lo = p.price_eur * (1 - SIMILAR_BAND), hi = p.price_eur * (1 + SIMILAR_BAND);
  const rows = db.prepare(`
    SELECT id, platform, item_id, name, clean_title, clean_title_en, brand, price_eur, image_url, qc_score
    FROM products
    WHERE id <> ? AND status <> 'hidden' AND image_url IS NOT NULL
      AND price_eur IS NOT NULL AND price_eur BETWEEN ? AND ?
      AND LOWER(TRIM(brand)) = LOWER(TRIM(?)) AND LOWER(TRIM(model_name)) = LOWER(TRIM(?))
    ORDER BY price_eur ASC LIMIT 8`).all(id, lo, hi, p.brand, p.model_name);
  const items = rows.map((r) => ({
    id: r.id, name: r.clean_title || tidyName(r.name), title_en: r.clean_title_en,
    price_eur: r.price_eur, thumb: thumb(r.image_url), qc_score: r.qc_score,
    links: enrichLinks(buildLinks(r.platform, r.item_id)),
  }));
  const prices = [p.price_eur, ...items.map((i) => i.price_eur)];
  json(res, 200, {
    ok: true, count: items.length,
    min: Math.min(...prices), max: Math.max(...prices),
    current: p.price_eur, items,
  });
}

function relatedProducts(p) {
  return db.prepare(
    "SELECT id,name,clean_title,brand,price_eur,image_url FROM products WHERE id<>? AND image_url IS NOT NULL AND status <> 'hidden' AND (brand=? OR category=?) ORDER BY (brand=?) DESC, hot DESC LIMIT 8"
  ).all(p.id, p.brand, p.category, p.brand)
    .map((r) => ({ id: r.id, name: r.clean_title || tidyName(r.name), brand: r.brand, price_eur: r.price_eur, image: r.image_url }));
}
function handleProductPage(req, res, id) {
  const p = getProductById(id);
  if (!p) return html(res, "<h1>404 — producto no encontrado</h1>", 404);
  html(res, productPage(p, relatedProducts(p), baseUrl(req), reqLang(req)));
}
function handleListPage(req, res, kind, name) {
  if (kind === "categoria") {
    const canon = canonCat(name);
    // canonCat mapea CUALQUIER texto no reconocido a "Other" (categoría poblada), así
    // que /categoria/basura devolvía un 200 (soft-404). Solo servimos la categoría si
    // el nombre era de verdad una categoría; si cayó en "Other" por descarte, 404.
    if (canon === "Other" && !/^(other|otros?)$/i.test(name.trim())) return html(res, "<h1>404</h1>", 404);
    name = canon;
  }
  const col = kind === "marca" ? "brand" : "category";
  const rows = db.prepare(
    `SELECT id,name,clean_title,brand,price_eur,image_url FROM products WHERE ${col}=? ORDER BY (image_url IS NOT NULL) DESC, hot DESC, price_eur DESC LIMIT 120`
  ).all(name).map((r) => ({ id: r.id, name: r.clean_title || tidyName(r.name), brand: r.brand, price_eur: r.price_eur, image: r.image_url }));
  if (!rows.length) return html(res, "<h1>404</h1>", 404);
  const lang = reqLang(req);
  const lp = lang === "en" ? "?lang=en" : "";
  const topLinks = kind === "marca"
    ? db.prepare("SELECT DISTINCT category c FROM products WHERE brand=? AND category IS NOT NULL").all(name).map((x) => ({ href: `/categoria/${encodeURIComponent(x.c)}`, label: catLabel(x.c, lang) }))
    : db.prepare("SELECT brand b FROM products WHERE category=? AND brand IS NOT NULL GROUP BY brand ORDER BY COUNT(*) DESC LIMIT 10").all(name).map((x) => ({ href: `/marca/${encodeURIComponent(x.b)}`, label: x.b }));
  const displayLabel = kind === "categoria" ? catLabel(name, lang) : name;
  html(res, listPage({ kind, name, displayLabel, items: rows, base: baseUrl(req), topLinks, crumbs: [{ href: "/" + lp, label: lang === "en" ? "Home" : "Inicio" }], lang }));
}
function handleSitemap(req, res) {
  const ids = db.prepare("SELECT id FROM products WHERE image_url IS NOT NULL").all().map((r) => r.id);
  // Solo categorías/marcas con suficientes productos: evita páginas "thin" (con
  // 1-2 items) que Google penaliza. Umbral: 3+.
  const cats = db.prepare("SELECT category FROM products WHERE category IS NOT NULL GROUP BY category HAVING COUNT(*) >= 3").all().map((r) => r.category);
  const brands = db.prepare("SELECT brand FROM products WHERE brand IS NOT NULL GROUP BY brand HAVING COUNT(*) >= 3").all().map((r) => r.brand);
  const agents = getAgentState().filter((a) => agentMeta(a.id)).map((a) => a.id);
  res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
  res.end(sitemapXml(baseUrl(req), { productIds: ids, categories: cats, brands, guides: GUIDES.map((g) => g.slug), agents, pages: ["/ayuda", "/cupones", "/agentes", "/productos", "/herramientas"] }));
}

// ---- Admin: importador universal ----
function adminAuth(req) {
  const a = Buffer.from(String(req.headers["x-admin-token"] || ""));
  const b = Buffer.from(String(ADMIN_TOKEN));
  return a.length === b.length && timingSafeEqual(a, b); // comparación de tiempo constante
}

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
    // Hoja PUBLICADA (/d/e/<pubId>/pubhtml): otra API, se lee entera del grid público
    // (nombre + precio + foto + links por fila). No pasa por gviz/API/htmlview normal.
    const pubId = pubIdFromUrl(content);
    if (pubId) {
      const gids = await fetchPublishedGids(pubId).catch(() => []);
      const all = [];
      for (const gid of (gids.length ? gids : [""])) {
        let rows; try { rows = await fetchPublishedSheet(pubId, gid); } catch { continue; }
        all.push(...rows);
      }
      return all;
    }
    const id = sheetIdFromUrl(content);
    if (!id) throw new Error("URL de Google Sheet no válida.");
    let tabs; try { tabs = await discoverTabs(id); } catch { tabs = [{ gid: "0", name: "" }]; }
    if (!tabs.length) tabs = [{ gid: "0", name: "" }];
    const all = [];
    // 1) URLs en TEXTO (export CSV por pestaña)
    for (const t of tabs) {
      let csv; try { csv = await fetchSheet(id, t.gid); } catch { continue; }
      const cands = rowsToCandidates(parseCsv(csv));
      // La PESTAÑA como categoría: si su nombre mapea a una categoría real
      // (canonCat != "Other" — "Shoes","Bolsos","Sneakers"…), es autoritativa y se
      // fija (cat_locked) para que la IA no la pise. Si es "HOT SALE"/una marca/etc.,
      // no mapea → la dejamos libre para que la deduzca la IA/visión.
      const tabCat = canonCat(cleanCategory(t.name || ""));
      const locked = tabCat && tabCat !== "Other";
      // Solo fijamos categoría cuando la pestaña ES una categoría real. Las pestañas
      // "HOT SALE"/marca NO ensucian con su nombre crudo (dejaría "HOT SALE" de
      // categoría y pisaría la buena al re-importar); esas las resuelve la IA.
      if (locked) for (const c of cands) { c.category = tabCat; c.catLocked = true; }
      all.push(...cands);
    }
    // 2) HIPERVÍNCULOS (hojas tipo cnnewfinds) vía Sheets API, si hay clave.
    if (process.env.GOOGLE_API_KEY) {
      try { all.push(...await fetchSheetLinks(id, process.env.GOOGLE_API_KEY)); }
      catch (e) { console.error(`Sheets API (${id}): ${e.message}`); }
    }
    // 3) FOTOS del grid renderizado (htmlview). Las hojas cnnewfinds no exponen
    // las imágenes por API, pero SÍ salen en el grid HTML público. Mapeamos
    // itemId -> imagen y rellenamos las que faltan. Así evitamos scrapear Weidian.
    try {
      const imgMap = new Map();
      for (const t of tabs) {
        let rows; try { rows = await fetchSheetHtml(id, t.gid); } catch { continue; }
        for (const r of rows) if (r.image) imgMap.set(`${r.platform}:${r.itemId}`, r.image);
      }
      if (imgMap.size) for (const c of all) {
        if (!c.image) { const u = imgMap.get(`${c.platform}:${c.itemId}`); if (u) c.image = u; }
      }
    } catch (e) { console.error(`htmlview (${id}): ${e.message}`); }
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
    const conFoto = deduped.filter((c) => c.image).length; // señal de calidad de la fuente
    const conPrecio = deduped.filter((c) => c.price != null).length;
    json(res, 200, {
      ok: true,
      stats: {
        encontrados: cands.length, unicos: deduped.length, nuevos, existentes: deduped.length - nuevos,
        conFoto, pctFoto: deduped.length ? Math.round(conFoto / deduped.length * 100) : 0,
        // Señal de calidad de precio: si baja mucho, la hoja cotiza raro (o no trae
        // precio) y sus productos saldrán con "—" en la tarjeta.
        conPrecio, pctPrecio: deduped.length ? Math.round(conPrecio / deduped.length * 100) : 0,
      },
      sample: deduped.slice(0, 40).map((c) => ({ platform: c.platform, itemId: c.itemId, name: c.name, price: c.price, status: c.status, image: !!c.image })),
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
    // Fase 1: fotos (Weidian). En bloques de 3 en paralelo (más rápido sin
    // saturar). Los que fallan por throttling (res.ok=false) NO se marcan, así
    // el re-chequeo periódico los reintenta luego.
    const weid = items.filter((it) => it.platform === "weidian");
    job.done += items.length - weid.length;
    const CONC = 2; // suave para no mantener vivo el throttle de Weidian
    for (let i = 0; i < weid.length; i += CONC) {
      await Promise.all(weid.slice(i, i + CONC).map(async (it) => {
        try {
          const res = await enrichProduct(it.platform, it.item_id, {});
          const now = new Date().toISOString();
          if (res.ok && res.images.length) {
            // Si el producto entró sin nombre real (volcado de links -> "weidian-123"),
            // le ponemos el título de la ficha; el etiquetado IA lo limpia después.
            const t = (res.title || "").replace(/\s+/g, " ").trim().slice(0, 140);
            db.prepare(
              "UPDATE products SET image_url=?, images=?, last_checked=?, enrich_tries=COALESCE(enrich_tries,0)+1, " +
              "name = CASE WHEN ?<>'' AND (name LIKE 'weidian-%' OR name LIKE 'taobao-%' OR name LIKE '1688-%') AND name GLOB '*-[0-9]*' THEN ? ELSE name END WHERE id=?"
            ).run(res.images[0], JSON.stringify(res.images.slice(0, 12)), now, t, t, it.id);
            job.withImage++;
          } else {
            // marca el intento (fallo o 200 sin fotos). El contador evita clavarse:
            // se reintenta luego y solo se abandona tras varios intentos.
            db.prepare("UPDATE products SET last_checked=?, enrich_tries=COALESCE(enrich_tries,0)+1 WHERE id=?").run(now, it.id);
            res.ok ? job.dead++ : job.failed++;
          }
          // Precio real de Weidian (verdad de campo): corrige parseos raros de la hoja
          // —p.ej. un yuan leído como euro (€672 en vez de €87)— y lo mantiene fresco.
          // fenToEur ya sanea el valor (null si es absurdo), así que null = no tocar.
          if (res.ok && res.price != null) {
            db.prepare("UPDATE products SET price_eur=? WHERE id=?").run(res.price, it.id);
            job.priced = (job.priced || 0) + 1;
          }
        } catch { job.failed++; }
        job.done++;
      }));
      await sleepMs(1000 + Math.floor(Math.random() * 1200)); // pausa con jitter
    }
    if (opts.tag !== false && hasKey()) { // Fase 2: etiquetado IA
      job.phase = "etiquetado"; job.done = 0;
      for (const it of items) {
        try {
          const r = db.prepare("SELECT name, category, price_eur, cat_locked FROM products WHERE id=? AND clean_title IS NULL").get(it.id);
          if (r) {
            const out = await tagOne({ name: r.name, category: r.category, price: r.price_eur });
            db.prepare("UPDATE products SET clean_title=?, clean_title_en=?, brand=COALESCE(?,brand), model_name=?, colorway=?, gender=?, category=?, tags=? WHERE id=?")
              .run(out.clean_title, out.clean_title_en, out.brand, out.model_name, out.colorway, out.gender === "unknown" ? "unisex" : out.gender, r.cat_locked ? r.category : canonCat(out.category), JSON.stringify(out.tags || []), it.id);
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
  const sel = db.prepare("SELECT name, category, price_eur, cat_locked FROM products WHERE id=? AND clean_title IS NULL");
  const upd = db.prepare("UPDATE products SET clean_title=?, clean_title_en=?, brand=COALESCE(?,brand), model_name=?, colorway=?, gender=?, category=?, tags=? WHERE id=?");
  // Un reintento tras una breve espera absorbe límites de tasa puntuales sin
  // saltarse el producto (si aun así falla, queda sin etiquetar y se reintenta
  // al re-pulsar, ya que solo cogemos clean_title IS NULL).
  const tagRetry = async (input) => { try { return await tagOne(input); } catch { await sleepMs(1500); return await tagOne(input); } };
  (async () => {
    // Pool de workers en paralelo (antes era secuencial → ~5× más rápido). Mismo
    // nº de llamadas y mismo coste; solo aprovecha la espera de red.
    let idx = 0;
    const worker = async () => {
      while (idx < ids.length) {
        const pid = ids[idx++];
        try {
          const r = sel.get(pid);
          if (r) {
            const out = await tagRetry({ name: r.name, category: r.category, price: r.price_eur });
            upd.run(out.clean_title, out.clean_title_en, out.brand, out.model_name, out.colorway, out.gender === "unknown" ? "unisex" : out.gender, r.cat_locked ? r.category : canonCat(out.category), JSON.stringify(out.tags || []), pid);
            job.tagged++;
          }
        } catch {}
        job.done++;
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
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

// Re-etiquetado de MUESTRA (forzado): re-procesa productos YA etiquetados para validar
// el prompt nuevo antes de gastar en el catálogo entero. Síncrono y capado (coste
// controlado). Devuelve el antes/después para poder juzgar la mejora de un vistazo.
async function handleAdminRetagSample(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  let body; try { body = await readBody(req); } catch { body = {}; }
  const q = String(body.q || "").trim().slice(0, 60);
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 30, 1), 60); // tope 60: es una muestra
  const rows = q
    ? db.prepare("SELECT id, name, category, price_eur, model_name, cat_locked FROM products WHERE clean_title IS NOT NULL AND (name LIKE ? OR clean_title LIKE ?) ORDER BY id LIMIT ?").all(`%${q}%`, `%${q}%`, limit)
    : db.prepare("SELECT id, name, category, price_eur, model_name, cat_locked FROM products WHERE clean_title IS NOT NULL ORDER BY RANDOM() LIMIT ?").all(limit);
  if (!rows.length) return json(res, 200, { ok: true, retagged: 0, failed: 0, cost_est_usd: 0, samples: [] });
  const upd = db.prepare("UPDATE products SET clean_title=?, clean_title_en=?, brand=COALESCE(?,brand), model_name=?, colorway=?, gender=?, category=?, tags=? WHERE id=?");
  const samples = []; let done = 0, failed = 0, idx = 0;
  const worker = async () => {
    while (idx < rows.length) {
      const r = rows[idx++];
      try {
        const out = await tagOne({ name: r.name, category: r.category, price: r.price_eur });
        const cat = r.cat_locked ? r.category : canonCat(out.category); // no pisar la categoría de pestaña
        upd.run(out.clean_title, out.clean_title_en, out.brand, out.model_name, out.colorway, out.gender === "unknown" ? "unisex" : out.gender, cat, JSON.stringify(out.tags || []), r.id);
        samples.push({ id: r.id, name: (out.clean_title || r.name).slice(0, 50),
          before: { model: r.model_name || "—", cat: r.category || "—" }, after: { model: out.model_name || "—", cat } });
        done++;
      } catch { failed++; }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  json(res, 200, { ok: true, retagged: done, failed, cost_est_usd: Math.round(rows.length * 0.0016 * 1e4) / 1e4, samples });
}

function startQcJob(ids) {
  const id = "job_" + (++jobSeq);
  const job = { id, total: ids.length, done: 0, scored: 0, tagged: 0, withImage: 0, dead: 0, phase: "qc", status: "running" };
  jobs.set(id, job);
  if (jobs.size > 40) jobs.delete(jobs.keys().next().value);
  const sel = db.prepare("SELECT clean_title, name, images FROM products WHERE id=? AND qc_score IS NULL AND images IS NOT NULL");
  const upd = db.prepare("UPDATE products SET qc_score=?, qc_notes=? WHERE id=?");
  const qcRetry = async (imgs, name) => { try { return await qcOne(imgs, name); } catch { await sleepMs(2000); return await qcOne(imgs, name); } };
  (async () => {
    // Pool de workers (antes secuencial). Concurrencia baja: son llamadas de
    // VISIÓN (varias imágenes por producto), más pesadas que el etiquetado.
    let idx = 0;
    const worker = async () => {
      while (idx < ids.length) {
        const pid = ids[idx++];
        try {
          const r = sel.get(pid);
          if (r) {
            // thumb() aplica el transform correcto según el host (geilicdn .webp,
            // Google =wNNN, otros tal cual). Antes se añadía .webp a todo.
            let imgs = []; try { imgs = JSON.parse(r.images).slice(0, 4).map((u) => imgDirect(u, 700, 700)).filter(Boolean); } catch {}
            if (imgs.length) {
              const out = await qcRetry(imgs, r.clean_title || tidyName(r.name));
              upd.run(out.qc_score, JSON.stringify({ summary: out.qc_summary, summary_en: out.qc_summary_en, flags: out.flags }), pid);
              job.scored++;
            }
          }
        } catch {}
        job.done++;
      }
    };
    await Promise.all(Array.from({ length: 3 }, worker));
    job.phase = "listo"; job.status = "done";
  })().catch(() => { job.status = "error"; });
  return id;
}

// Candidatos a QC: con fotos y sin puntuar todavía.
const QC_PENDING = "qc_score IS NULL AND images IS NOT NULL AND image_url IS NOT NULL";

async function handleAdminQcAll(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  const ids = db.prepare(`SELECT id FROM products WHERE ${QC_PENDING}`).all().map((r) => r.id);
  const jobId = ids.length ? startQcJob(ids) : null;
  json(res, 200, { ok: true, count: ids.length, jobId });
}

// QC SOLO a los productos que la gente mira de verdad.
//
// El QC es con visión (4 fotos por producto), así que puntuar el catálogo entero
// cuesta bastante y la mayoría de fichas casi nadie las visita. Aquí ordenamos por
// intención de compra real —clics en links de agente— y en segundo lugar por los
// destacados y los más recientes, para que el presupuesto vaya a las fichas que
// generan tráfico y comisión (y que son las que enseñan estrellas en Google).
async function handleAdminQcPopular(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  if (!hasKey()) return json(res, 200, { ok: false, error: "IA no configurada (falta ANTHROPIC_API_KEY)." });
  let body = {}; try { body = await readBody(req); } catch {}
  const limit = Math.min(Math.max(parseInt(body.limit || "300", 10) || 300, 1), 5000);
  const rows = db.prepare(`
    SELECT p.id, (SELECT COUNT(*) FROM clicks c WHERE c.product_id = p.id) AS clicks
    FROM products p
    WHERE ${QC_PENDING}
    ORDER BY clicks DESC, p.hot DESC, p.id DESC
    LIMIT ?`).all(limit);
  const ids = rows.map((r) => r.id);
  const jobId = ids.length ? startQcJob(ids) : null;
  json(res, 200, {
    ok: true, count: ids.length, jobId,
    conClics: rows.filter((r) => r.clicks > 0).length,
    pendientes: db.prepare(`SELECT COUNT(*) c FROM products WHERE ${QC_PENDING}`).get().c,
  });
}

async function handleAdminDelete(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  let body; try { body = await readBody(req); } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
  const id = parseInt(body.id, 10);
  if (!id) return json(res, 400, { ok: false, error: "id inválido" });
  const info = db.prepare("DELETE FROM products WHERE id=?").run(id);
  json(res, 200, { ok: true, deleted: info.changes, total: db.prepare("SELECT COUNT(*) c FROM products").get().c });
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
    // Red de seguridad: si la hoja colaba algún precio imposible, se limpia ya —
    // sin esperar a un reinicio. Se informa para que se vea en la vista previa.
    const saneados = sanitizePrices();
    json(res, 200, { ok: true, ...r, total: db.prepare("SELECT COUNT(*) c FROM products").get().c, jobId, enriching: toEnrich.length, saneados });
  } catch (e) { json(res, 200, { ok: false, error: e.message }); }
}

// --- Precarga del caché de imágenes ------------------------------------------
// El caché del proxy guarda la foto la primera vez que ALGUIEN la mira. Con un
// catálogo de decenas de miles de fichas y poco tráfico, la mayoría no se mira nunca
// — y las URLs de Google caducan en horas. Así que hay que bajarlas nosotros: si no,
// la foto se pierde antes de que nadie la pida (y en los productos de Taobao se
// pierde para siempre, porque no hay otra fuente).
//
// Va en tandas, con poca concurrencia, para no castigar a Google ni al disco.
const IMGCACHE_BATCH = parseInt(process.env.IMGCACHE_BATCH || "300", 10);
let imgCacheRunning = false;

async function cacheImagesBatch(limit = IMGCACHE_BATCH) {
  if (imgCacheRunning) return { skipped: true };
  imgCacheRunning = true;
  const stats = { seen: 0, cached: 0, already: 0, dead: 0 };
  try {
    const rows = db.prepare(`
      SELECT image_url FROM products
      WHERE image_url IS NOT NULL
        AND (image_url LIKE '%sheets-images-rt%' OR image_url LIKE '%docsubipk%')
      LIMIT ?`).all(limit * 3); // de más: muchas ya estarán cacheadas
    // Clave de caché = la MISMA url que pedirá el navegador (ancho unificado).
    const urls = [...new Set(rows.map((r) => googleImg(r.image_url)))];
    let idx = 0;
    const worker = async () => {
      while (idx < urls.length && stats.cached < limit) {
        const url = urls[idx++];
        stats.seen++;
        if (await cacheHit(url)) { stats.already++; continue; }
        try { (await cacheStore(url)) ? stats.cached++ : stats.dead++; }
        catch { stats.dead++; }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
  } catch (e) { console.error("cacheImagesBatch:", e.message); }
  finally { imgCacheRunning = false; }
  if (stats.cached || stats.dead) console.log(`Caché de fotos: +${stats.cached} guardadas, ${stats.already} ya estaban, ${stats.dead} caídas.`);
  return stats;
}

async function handleAdminCacheImages(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  const pend = db.prepare(`
    SELECT COUNT(*) c FROM products WHERE image_url IS NOT NULL
      AND (image_url LIKE '%sheets-images-rt%' OR image_url LIKE '%docsubipk%')`).get().c;
  const stats = await cacheImagesBatch();
  json(res, 200, { ok: true, ...stats, totalGoogle: pend });
}

// Diagnóstico (solo lectura): ¿es fiable agrupar por marca+modelo para un comparador
// de vendedores? Mide cuántos productos comparten clave y, sobre todo, la DISPERSIÓN
// de precio dentro de cada grupo. Un grupo del MISMO modelo tiene precios parecidos;
// si el rango es enorme (€17–€104), la clave está mezclando modelos distintos y el
// comparador engañaría. Devuelve también ejemplos para juzgar a ojo.
function handleAdminModelStats(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  const rows = db.prepare(`
    SELECT LOWER(TRIM(brand)) b, LOWER(TRIM(model_name)) m, price_eur, clean_title
    FROM products
    WHERE brand IS NOT NULL AND model_name IS NOT NULL AND TRIM(model_name) <> '' AND price_eur IS NOT NULL`).all();
  const groups = new Map();
  for (const r of rows) {
    const k = r.b + "|" + r.m;
    (groups.get(k) || groups.set(k, []).get(k)).push(r);
  }
  const multi = [...groups.values()].filter((g) => g.length > 1);
  // ratio max/min por grupo: 1 = precios idénticos (fiable); alto = mezcla modelos.
  const ratios = multi.map((g) => { const p = g.map((x) => x.price_eur); return Math.max(...p) / Math.max(0.01, Math.min(...p)); }).sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : null;
  const tight = ratios.filter((r) => r <= 1.3).length;   // <=30% de diferencia: mismo producto
  const wild = ratios.filter((r) => r >= 3).length;       // >=3x: casi seguro mezcla
  // ejemplos: un grupo "sano" y uno "sospechoso"
  const sample = (pred) => { const g = multi.find(pred); return g ? { modelo: g[0].b + " / " + g[0].m, n: g.length, precios: g.map((x) => x.price_eur).sort((a, b) => a - b), titulos: [...new Set(g.map((x) => x.clean_title))].slice(0, 4) } : null; };
  json(res, 200, {
    ok: true,
    con_modelo: rows.length,
    grupos_totales: groups.size,
    grupos_con_2plus: multi.length,
    dispersion_precio: {
      mediana_ratio: median ? Math.round(median * 100) / 100 : null,
      grupos_precio_ajustado: tight,            // fiables
      grupos_precio_disparatado: wild,          // mezclan modelos
      pct_fiables: multi.length ? Math.round(tight / multi.length * 100) : 0,
    },
    ejemplo_sano: sample((g) => { const p = g.map((x) => x.price_eur); return Math.max(...p) / Math.max(0.01, Math.min(...p)) <= 1.15 && g.length >= 3; }),
    ejemplo_sospechoso: sample((g) => { const p = g.map((x) => x.price_eur); return Math.max(...p) / Math.max(0.01, Math.min(...p)) >= 3; }),
  });
}

function handleAdminJob(req, res, id) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  const job = jobs.get(id);
  if (!job) return json(res, 200, { ok: false, error: "Job no encontrado." });
  json(res, 200, { ok: true, job });
}

// --- Barrido de salud del catálogo -------------------------------------------
// ROTATORIO: cada pasada revisa los N productos con last_checked más antiguo, así el
// catálogo entero se recicla cada X días y el coste NO crece aunque el catálogo sí.
//
// Nunca borra. Un fallo puede ser throttling de Weidian, no un producto caído, así
// que se necesitan varios fallos SEGUIDOS para ocultar; y basta una respuesta buena
// para revivirlo. Borrar es decisión tuya, desde el panel.
//
// De paso aprovecha la misma llamada para traer el PRECIO REAL y la foto que falte.
const HEALTH_BATCH = parseInt(process.env.HEALTH_BATCH || "120", 10);
const HEALTH_MAX_FAILS = parseInt(process.env.HEALTH_MAX_FAILS || "3", 10);

function startHealthJob(limit = HEALTH_BATCH) {
  const rows = db.prepare(`
    SELECT id, platform, item_id, image_url, price_eur, status, health_fails
    FROM products
    ORDER BY
      (platform='weidian' AND price_eur > 300) DESC,  -- outliers de precio (yuan mal leído) primero
      last_checked IS NOT NULL, last_checked ASC
    LIMIT ?`).all(limit);
  const id = "job_" + (++jobSeq);
  const job = {
    id, total: rows.length, done: 0, phase: "health", status: "running",
    alive: 0, suspect: 0, hidden: 0, revived: 0, priced: 0, photo: 0, skipped: 0,
  };
  jobs.set(id, job);
  if (jobs.size > 40) jobs.delete(jobs.keys().next().value);

  const okStmt = db.prepare("UPDATE products SET status='active', health_fails=0, last_checked=? WHERE id=?");
  const failStmt = db.prepare("UPDATE products SET status=?, health_fails=?, last_checked=? WHERE id=?");
  const touchStmt = db.prepare("UPDATE products SET last_checked=? WHERE id=?");
  const priceStmt = db.prepare("UPDATE products SET price_eur=?, price_source='weidian' WHERE id=?");
  const imgStmt = db.prepare("UPDATE products SET image_url=?, images=? WHERE id=?");

  (async () => {
    let idx = 0;
    const worker = async () => {
      while (idx < rows.length) {
        const r = rows[idx++];
        const now = new Date().toISOString();
        try {
          // Solo Weidian sabe decirnos si el ITEM sigue vivo. Para el resto, las
          // fotos rotas ya las cubre "Quitar fotos rotas"; aquí solo rotamos.
          if (r.platform !== "weidian") { touchStmt.run(now, r.id); job.skipped++; job.done++; continue; }
          const en = await enrichProduct("weidian", r.item_id, {});
          if (!en.ok) {
            // Throttling / red: NO cuenta como fallo del producto. Se marca revisado
            // para que la rotación siga y le toque otra vez en la próxima vuelta.
            touchStmt.run(now, r.id); job.skipped++; job.done++; continue;
          }
          if (en.alive) {
            if (r.status !== "active") job.revived++;
            okStmt.run(now, r.id);
            job.alive++;
            // Precio real de la fuente: pisa al de la hoja (que suele ir desfasado).
            if (en.price != null && en.price !== r.price_eur) { priceStmt.run(en.price, r.id); job.priced++; }
            if (!r.image_url && en.images.length) { imgStmt.run(en.images[0], JSON.stringify(en.images.slice(0, 12)), r.id); job.photo++; }
          } else {
            const fails = (r.health_fails || 0) + 1;
            const st = fails >= HEALTH_MAX_FAILS ? "hidden" : "suspect";
            failStmt.run(st, fails, now, r.id);
            st === "hidden" ? job.hidden++ : job.suspect++;
          }
        } catch { job.skipped++; }
        job.done++;
      }
    };
    // Concurrencia baja y pausa con jitter: Weidian throttlea si se le aprieta.
    await Promise.all([worker(), worker()]);
    job.status = "done";
  })().catch((e) => { job.status = "error"; job.error = e.message; });
  return id;
}

function handleAdminHealth(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  const jobId = startHealthJob();
  const c = (q) => { try { return db.prepare(q).get().c; } catch { return 0; } };
  json(res, 200, {
    ok: true, jobId,
    counts: {
      total: c("SELECT COUNT(*) c FROM products"),
      active: c("SELECT COUNT(*) c FROM products WHERE status='active'"),
      suspect: c("SELECT COUNT(*) c FROM products WHERE status='suspect'"),
      hidden: c("SELECT COUNT(*) c FROM products WHERE status='hidden'"),
      nunca: c("SELECT COUNT(*) c FROM products WHERE last_checked IS NULL"),
    },
  });
}

// Purga manual: borra DEFINITIVAMENTE los ocultos. Solo a petición tuya.
function handleAdminPurgeHidden(req, res) {
  if (!adminAuth(req)) return json(res, 401, { ok: false, error: "No autorizado." });
  let removed = 0;
  try { removed = db.prepare("DELETE FROM products WHERE status='hidden'").run().changes || 0; } catch {}
  json(res, 200, { ok: true, removed });
}

const server = createServer((req, res) => {
  try {
    const u = new URL(req.url, `http://localhost:${PORT}`);
    // Cabeceras de seguridad en TODA respuesta (se fijan antes de writeHead).
    // La CSP permite inline (la SPA usa scripts/estilos inline), Google Fonts,
    // imágenes https de cualquier CDN (productos) y la API de divisas.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(self)");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Content-Security-Policy", [
      "default-src 'self'", "base-uri 'self'", "object-src 'none'",
      "frame-ancestors 'self'", "form-action 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "script-src 'self' 'unsafe-inline'", // nota: si añades ANALYTICS_SNIPPET externo, amplía aquí
      "connect-src 'self' https://api.frankfurter.app",
    ].join("; "));
    // Rate-limit en endpoints que cuestan IA (evita spam/coste) y de captura.
    if (req.method === "POST" && u.pathname === "/api/visual-search") { if (!rateLimit(req, res, "vis", 15, 3600e3)) return; return void handleVisualSearch(req, res); }
    if (req.method === "POST" && u.pathname === "/api/size-advice") { if (!rateLimit(req, res, "size", 60, 3600e3)) return; return void handleSizeAdvice(req, res); }
    if (req.method === "POST" && u.pathname === "/api/qc-check") { if (!rateLimit(req, res, "qc", 40, 3600e3)) return; return void handleQcCheck(req, res); }
    if (req.method === "POST" && u.pathname === "/api/subscribe") { if (!rateLimit(req, res, "sub", 10, 60e3)) return; return void handleSubscribe(req, res); }
    if (req.method === "POST" && u.pathname === "/api/track") return void handleTrack(req, res);
    if (req.method === "POST" && u.pathname === "/api/price-alert") { if (!rateLimit(req, res, "pa", 10, 60e3)) return; return void handlePriceAlert(req, res); }
    if (u.pathname === "/api/admin/subscribers") return void handleAdminSubscribers(req, res);
    if (u.pathname === "/api/admin/digest") return void handleAdminDigest(req, res);
    if (u.pathname === "/api/admin/analytics") return void handleAdminAnalytics(req, res);
    if (u.pathname === "/api/admin/alerts") return void handleAdminAlerts(req, res);
    if (u.pathname === "/api/search-fallback") return void handleSearchFallback(res, u.searchParams);
    if (u.pathname === "/api/suggest") return void handleSuggest(res, u.searchParams);
    if (req.method === "POST" && u.pathname === "/api/request") { if (!rateLimit(req, res, "req", 15, 60e3)) return; return void handleRequest(req, res); }
    if (u.pathname === "/api/admin/requests") return void handleAdminRequests(req, res);
    if (u.pathname === "/api/admin/status") return void handleAdminStatus(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/auto-ingest") return void handleAdminAutoIngest(req, res);
    if (u.pathname === "/api/admin/sources" && req.method === "GET") return void handleAdminSources(req, res);
    if (u.pathname === "/api/admin/sources/add" && req.method === "POST") return void handleAdminSourceAdd(req, res);
    if (u.pathname === "/api/admin/sources/toggle" && req.method === "POST") return void handleAdminSourceToggle(req, res);
    if (u.pathname === "/api/admin/sources/delete" && req.method === "POST") return void handleAdminSourceDelete(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/retry-photos") return void handleAdminRetryPhotos(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/heal-photos") return void handleAdminHealPhotos(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/cache-images") return void handleAdminCacheImages(req, res);
    if (u.pathname === "/api/admin/model-stats") return void handleAdminModelStats(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/health") return void handleAdminHealth(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/purge-hidden") return void handleAdminPurgeHidden(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/preview") return void handleAdminPreview(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/apply") return void handleAdminApply(req, res);
    if (u.pathname === "/api/admin/agents" && req.method === "GET") return void handleAdminAgentsGet(req, res);
    if (u.pathname === "/api/admin/agents" && req.method === "POST") return void handleAdminAgentsSet(req, res);
    if (u.pathname === "/api/admin/job") return void handleAdminJob(req, res, u.searchParams.get("id"));
    if (req.method === "POST" && u.pathname === "/api/admin/tag-all") return void handleAdminTagAll(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/retag-sample") return void handleAdminRetagSample(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/qc-all") return void handleAdminQcAll(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/qc-popular") return void handleAdminQcPopular(req, res);
    if (req.method === "POST" && u.pathname === "/api/admin/product-delete") return void handleAdminDelete(req, res);
    if (u.pathname === "/admin") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" }); return res.end(readFileSync(join(ROOT, "public", "admin.html"))); }
    if (u.pathname === "/favicon.svg" || u.pathname === "/favicon.ico") return void serveStatic(res, "favicon.svg", "image/svg+xml");
    if (u.pathname === "/og.svg") return void serveStatic(res, "og.svg", "image/svg+xml");
    // PNG rasterizados: og:image (WhatsApp/iMessage no renderizan SVG) e iconos PWA.
    if (u.pathname === "/og.png") return void serveStatic(res, "og.png", "image/png");
    if (u.pathname === "/apple-touch-icon.png") return void serveStatic(res, "apple-touch-icon.png", "image/png");
    if (u.pathname === "/icon-192.png") return void serveStatic(res, "icon-192.png", "image/png");
    if (u.pathname === "/icon-512.png") return void serveStatic(res, "icon-512.png", "image/png");
    if (u.pathname === "/manifest.webmanifest") return void serveStatic(res, "manifest.webmanifest", "application/manifest+json");
    if (u.pathname === "/sw.js") return void serveStatic(res, "sw.js", "application/javascript; charset=utf-8");
    if (u.pathname === "/api/categories") return handleCategories(res);
    if (u.pathname === "/api/brands") return handleBrands(res, u.searchParams);
    if (u.pathname === "/api/convert") return handleConvert(res, u.searchParams);
    if (u.pathname === "/api/ai-search") { if (!rateLimit(req, res, "ais", 30, 3600e3)) return; return void handleAiSearch(res, u.searchParams); }
    if (u.pathname === "/api/ai-fit") { if (!rateLimit(req, res, "fit", 20, 3600e3)) return; return void handleAiFit(res, u.searchParams); }
    if (u.pathname === "/img") return void handleImgProxy(req, res, u);
    if (u.pathname === "/api/products") return handleProducts(res, u.searchParams);
    if (u.pathname === "/api/similar") return void handleSimilar(res, u.searchParams);
    if (u.pathname === "/api/facets") return handleFacets(res, u.searchParams);
    // --- Paginas SSR (SEO) ---
    if (u.pathname === "/robots.txt") { res.writeHead(200, { "Content-Type": "text/plain" }); return res.end(`User-agent: *\nAllow: /\nSitemap: ${baseUrl(req)}/sitemap.xml\n`); }
    if (u.pathname === "/sitemap.xml") return handleSitemap(req, res);
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.pathname === "/guias") return html(res, guidesIndexPage(GUIDES, baseUrl(req), reqLang(req)));
    if (parts[0] === "guia" && parts[1]) { const g = guideBySlug(decodeURIComponent(parts[1])); return g ? html(res, articlePage(g, baseUrl(req), reqLang(req))) : html(res, "<h1>404</h1>", 404); }
    if (u.pathname === "/cupones" || u.pathname === "/coupons") return handleCoupons(req, res);
    if (u.pathname === "/agentes" || u.pathname === "/agents") return handleAgentsCompare(req, res);
    if (u.pathname === "/ayuda" || u.pathname === "/help") return handleHelp(req, res);
    if ((parts[0] === "agente" || parts[0] === "agent") && parts[1]) return handleAgentLanding(req, res, decodeURIComponent(parts[1]));
    if (parts[0] === "producto" && parts[1]) return handleProductPage(req, res, parseInt(parts[1], 10));
    if (parts[0] === "categoria" && parts[1]) return handleListPage(req, res, "categoria", decodeURIComponent(parts[1]));
    if (parts[0] === "marca" && parts[1]) return handleListPage(req, res, "marca", decodeURIComponent(parts[1]));
    if (u.pathname === "/" || u.pathname === "/index.html" || u.pathname === "/productos" || u.pathname === "/herramientas" || u.pathname === "/favoritos") {
      let page = readFileSync(join(ROOT, "public", "index.html"), "utf8");
      if (u.pathname === "/favoritos") { // página personal (localStorage): no indexar
        const en = reqLang(req) === "en";
        page = page.replace(/<title>[\s\S]*?<\/title>/, `<title>${en ? "Favorites" : "Favoritos"} — CNFinds</title>`)
          .replace("</head>", `<meta name="robots" content="noindex">\n</head>`);
      }
      if (u.pathname === "/herramientas") {
        const en = reqLang(req) === "en";
        const tt = en ? "AI Tools — link converter, AI QC, shipping calculator | CNFinds" : "Herramientas IA — conversor de enlaces, QC con IA, calculadora de envío | CNFinds";
        const td = en ? "Free tools to buy reps smarter: agent link converter, AI QC photo checker, AI outfit builder, visual search and a shipping cost calculator." : "Herramientas gratis para comprar reps mejor: conversor de enlaces de agente, QC de fotos con IA, armador de outfits, búsqueda visual y calculadora de envío.";
        page = page.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(tt)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(td)}$2`)
          .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${esc(baseUrl(req))}/herramientas$2`);
      }
      // SEO real para /productos: título/descr/canónica dinámicos según filtros,
      // grid pre-renderizado (los crawlers ven productos + enlaces internos) y
      // migas de pan (BreadcrumbList). La SPA reemplaza el grid al cargar.
      if (u.pathname === "/productos") page = injectExploreSeo(page, u, baseUrl(req), reqLang(req));
      page = page.replace("<!--SEOHUB-->", () => seoHubHtml(reqLang(req))); // hub de enlaces internos crawlable
      // Analítica opcional: define ANALYTICS_SNIPPET (Plausible/GA/Umami…) y se inyecta.
      if (process.env.ANALYTICS_SNIPPET) page = page.replace("</head>", process.env.ANALYTICS_SNIPPET + "\n</head>");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page);
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  } catch (e) {
    console.error("500:", e.message); // el detalle al log, no al cliente (evita filtrar rutas/SQL)
    json(res, 500, { error: "internal error" });
  }
});

// Auto-siembra: si el catálogo está vacío (primer arranque en un volumen nuevo),
// importa desde la Sheet y enriquece fotos en segundo plano. No bloquea el listen.
// Normaliza categorías al conjunto canónico (idempotente). Fusiona duplicados por
// mayúsculas/idioma. Se ejecuta en cada arranque (local y Railway) y es un no-op
// una vez normalizado.
function normalizeCategories() {
  const rows = db.prepare("SELECT DISTINCT category FROM products WHERE category IS NOT NULL").all();
  const upd = db.prepare("UPDATE products SET category=? WHERE category=?");
  let changed = 0;
  for (const { category } of rows) {
    const canon = canonCat(category);
    if (canon !== category) { const r = upd.run(canon, category); changed += r.changes; }
  }
  if (changed) console.log(`Categorías normalizadas: ${changed} productos reasignados.`);
}

// Rellena el género de los productos sin etiquetar (para que el filtro Hombre/Mujer
// funcione ya, antes del etiquetado con IA). Heurística por nombre/tags; por defecto
// "unisex" (la mayoría del streetwear reps lo es), así aparece en ambos filtros.
// El etiquetado con IA lo refina después. Idempotente: solo toca los vacíos.
const RE_WOMEN = /\b(women'?s?|woman|female|ladies|mujer|chica|femenin\w*|dress|vestido|skirt|falda|heels|tacones|bikini|blouse|blusa|leggings)\b/i;
const RE_MEN = /\b(men'?s?|male|hombre|masculin\w*|boxers|calzoncillo)\b/i;
function inferGenders() {
  const rows = db.prepare("SELECT id, name, clean_title, tags FROM products WHERE gender IS NULL OR gender='' OR gender='unknown'").all();
  const upd = db.prepare("UPDATE products SET gender=? WHERE id=?");
  let n = 0;
  for (const r of rows) {
    const s = `${r.name || ""} ${r.clean_title || ""} ${r.tags || ""}`;
    let g = "unisex";
    if (RE_WOMEN.test(s)) g = "women";
    else if (RE_MEN.test(s)) g = "men";
    upd.run(g, r.id); n++;
  }
  if (n) console.log(`Género inferido para ${n} productos (por defecto: unisex).`);
}

// --- Importador automático (sin admin): ingiere la lista curada de hojas de la
// comunidad de forma periódica. Dedup por (plataforma,itemId) + tus códigos.
// Solo enriquece FOTOS (sin IA = sin coste). Se controla con env vars:
//   AUTO_INGEST=off  -> desactiva
//   AUTO_INGEST_INTERVAL_HOURS=168  -> cada cuánto (por defecto semanal)
const AUTO_INGEST = String(process.env.AUTO_INGEST ?? "on").toLowerCase() !== "off";
const AUTO_INGEST_INTERVAL_H = parseInt(process.env.AUTO_INGEST_INTERVAL_HOURS || "168", 10);
// Etiquetado automático con IA por lotes (limpia nombre/marca/género/tags → más
// filtros y marcas en el explorador). Usa Haiku (barato). AUTO_TAG=off lo apaga.
const AUTO_TAG = String(process.env.AUTO_TAG ?? "on").toLowerCase() !== "off";
// QC automático con IA (visión): puntúa la calidad de las fotos → insignia
// "★ QC x/10", nuestro diferenciador visible. Más caro que el etiquetado (varias
// imágenes por producto), así que va en tandas pequeñas. AUTO_QC=off lo apaga.
const AUTO_QC = String(process.env.AUTO_QC ?? "on").toLowerCase() !== "off";
// Barrido de salud automático: comprueba que los productos siguen vivos en la fuente
// y de paso corrige precios y fotos que falten. Es rotatorio (una tanda por vuelta),
// así que el coste es constante. AUTO_HEALTH=off lo apaga.
const AUTO_HEALTH = String(process.env.AUTO_HEALTH ?? "on").toLowerCase() !== "off";
const AUTO_HEALTH_INTERVAL_H = parseFloat(process.env.AUTO_HEALTH_INTERVAL_HOURS || "6");
const metaGet = (k) => { try { return db.prepare("SELECT val FROM app_meta WHERE key=?").get(k)?.val || null; } catch { return null; } };
const metaSet = (k, v) => { try { db.prepare("INSERT INTO app_meta (key,val) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET val=excluded.val").run(k, v); } catch {} };
let autoIngestRunning = false;
async function autoIngestSources({ force = false } = {}) {
  if (!AUTO_INGEST || autoIngestRunning) return;
  const last = metaGet("last_auto_ingest");
  if (!force && last && (Date.now() - Date.parse(last)) / 36e5 < AUTO_INGEST_INTERVAL_H) return; // aún no toca
  autoIngestRunning = true;
  metaSet("last_auto_ingest", new Date().toISOString());
  // try/finally CRÍTICO: si algo peta a mitad, el flag DEBE resetearse; si no,
  // se queda "running" para siempre y bloquea todos los importadores futuros.
  try {
    ensureSourcesSeeded();
    const srcs = listSources().filter((s) => s.enabled);
    console.log(`Importador automático: ingiriendo ${srcs.length} fuentes activas…`);
    const getRow = db.prepare("SELECT id FROM products WHERE platform=? AND item_id=? AND image_url IS NULL");
    const setStats = db.prepare("UPDATE sources SET last_ingest=?, last_added=?, last_photos=?, total_items=? WHERE id=?");
    const newItems = [];
    let added = 0, updated = 0;
    for (const s of srcs) {
      try {
        const deduped = dedupeCands(db, await gatherCandidates("sheet", sheetUrl(s.id)));
        const r = applyCands(db, deduped, `auto:${s.name}`);
        added += r.added; updated += r.updated;
        const photos = deduped.filter((c) => c.image).length;
        setStats.run(new Date().toISOString(), r.added, photos, deduped.length, s.id);
        for (const c of deduped) {
          if (c.status === "new" && c.platform === "weidian") { const row = getRow.get(c.platform, c.itemId); if (row) newItems.push({ id: row.id, platform: c.platform, item_id: c.itemId }); }
        }
        console.log(`  ${s.name}: +${r.added} nuevos · ${r.updated} act. · ${photos}/${deduped.length} con foto`);
      } catch (e) { console.error(`  ${s.name} falló: ${e.message}`); }
      await new Promise((r) => setTimeout(r, 1500)); // cortesía entre hojas
    }
    const total = db.prepare("SELECT COUNT(*) c FROM products").get().c;
    console.log(`Importador automático: total +${added} nuevos · ${updated} actualizados · catálogo: ${total}`);
    normalizeCategories(); inferGenders();
    if (newItems.length) { startEnrichTagJob(newItems, { tag: false }); console.log(`Enriqueciendo fotos de ${newItems.length} productos nuevos…`); }
  } finally {
    autoIngestRunning = false;
  }
}

// Re-chequeo periódico de fotos: reintenta en tandas los productos que siguen
// sin foto (throttling de Weidian) hasta completarlos. Sin esto, los fallidos
// solo se reintentaban al reiniciar el servidor y se quedaban clavados.
let photoJobRunning = false;
function resumePhotos() {
  if (photoJobRunning) return;
  // Reintenta los que siguen sin foto: ventana corta (30 min entre intentos) y
  // tope de 6 intentos. Recupera los throttled sin re-machacar los sin-foto-real.
  const cutoff = new Date(Date.now() - 30 * 60e3).toISOString();
  const items = db.prepare(
    "SELECT id, platform, item_id FROM products WHERE platform='weidian' AND image_url IS NULL AND COALESCE(enrich_tries,0) < 12 AND (last_checked IS NULL OR last_checked < ?) ORDER BY COALESCE(enrich_tries,0), id LIMIT 120"
  ).all(cutoff).map((x) => ({ id: x.id, platform: x.platform, item_id: x.item_id }));
  if (!items.length) return;
  photoJobRunning = true;
  const jobId = startEnrichTagJob(items, { tag: false });
  const poll = setInterval(() => {
    const j = jobs.get(jobId);
    if (!j || j.status !== "running") { photoJobRunning = false; clearInterval(poll); }
  }, 5000);
}

// Etiquetado automático por lotes: coge productos CON foto pero sin título limpio
// y los pasa por la IA (marca, género, color, tags ES/EN). En tandas de 250 para
// no disparar coste ni límites de tasa; el resto se hace en la siguiente ronda.
let tagJobRunning = false;
function resumeTagging() {
  if (tagJobRunning || !AUTO_TAG || !hasKey()) return;
  const ids = db.prepare("SELECT id FROM products WHERE clean_title IS NULL AND image_url IS NOT NULL ORDER BY id LIMIT 250").all().map((r) => r.id);
  if (!ids.length) return;
  tagJobRunning = true;
  const jobId = startTagJob(ids);
  const poll = setInterval(() => {
    const j = jobs.get(jobId);
    if (!j || j.status !== "running") { tagJobRunning = false; clearInterval(poll); }
  }, 5000);
}

// QC automático por lotes: puntúa con visión los productos VISIBLES (con foto)
// que tengan galería y aún no tengan nota. Tandas pequeñas: es lo más caro.
let qcJobRunning = false;
function resumeQc() {
  if (qcJobRunning || !AUTO_QC || !hasKey()) return;
  const ids = db.prepare("SELECT id FROM products WHERE qc_score IS NULL AND images IS NOT NULL AND image_url IS NOT NULL ORDER BY id LIMIT 80").all().map((r) => r.id);
  if (!ids.length) return;
  qcJobRunning = true;
  const jobId = startQcJob(ids);
  const poll = setInterval(() => {
    const j = jobs.get(jobId);
    if (!j || j.status !== "running") { qcJobRunning = false; clearInterval(poll); }
  }, 5000);
}

// Purga los productos que entraron SIN nombre real: nuestro fallback los llamó
// "weidian-<itemId>" y el etiquetado los "limpió" a "Artículo Weidian <id>".
// No se pueden buscar ni mostrar (además suelen traer foto muerta). La puerta de
// calidad de la ingesta ya impide que vuelvan a entrar; esto limpia los previos.
function purgeJunkProducts() {
  try {
    const r = db.prepare(
      "DELETE FROM products WHERE (name LIKE 'weidian-%' OR name LIKE 'taobao-%' OR name LIKE '1688-%') AND name GLOB '*-[0-9]*'"
    ).run();
    if (r.changes) console.log(`Limpieza: ${r.changes} productos sin nombre real eliminados.`);
    // Categorías no-canónicas heredadas (p.ej. "HOT SALE" o nombres de pestaña crudos):
    // se mapean a la lista canónica. Si el mapeo directo da "Other", se intenta deducir
    // del nombre (recupera las que llevan el tipo dentro). Gratis; deja los filtros limpios.
    try {
      const upc = db.prepare("UPDATE products SET category=? WHERE id=?");
      let fixedCat = 0;
      for (const p of db.prepare("SELECT id, name, clean_title, category FROM products WHERE category IS NOT NULL").all()) {
        const direct = canonCat(p.category);
        if (direct === p.category) continue; // ya canónica (incluye "Other")
        let c = direct;
        if (c === "Other") { const byName = canonCat(p.clean_title || p.name || ""); if (byName !== "Other") c = byName; }
        upc.run(c, p.id); fixedCat++;
      }
      if (fixedCat) console.log(`Limpieza: ${fixedCat} categorías no-canónicas normalizadas.`);
    } catch (e) { console.error("Normalización de categorías falló:", e.message); }
    // Sex shop y lencería sexy: fuera del nicho (moda/streetwear). Se filtra en la
    // ingesta; esto quita los que ya entraron. Mira el nombre CRUDO de la hoja (inglés).
    const a = db.prepare(
      "DELETE FROM products WHERE name LIKE '%sex toy%' OR name LIKE '%adult toy%' OR name LIKE '%sex product%' OR name LIKE '%dildo%' OR name LIKE '%vibrator%' OR name LIKE '%masturbat%' OR name LIKE '%butt plug%' OR name LIKE '%lingerie%' OR name LIKE '%babydoll%' OR name LIKE '%crotchless%'"
    ).run();
    if (a.changes) console.log(`Limpieza: ${a.changes} productos fuera de nicho (adulto/lencería) eliminados.`);
    // Productos FANTASMA: enlaces de tienda/colección que el parser antiguo tomaba
    // por fichas (cogía cualquier número largo de la URL). Se reconocen por la foto
    // de banner de tienda (vshop…) o por llevar un nombre que es la etiqueta de un
    // menú de la hoja ("Girl", "Hats", "Accessories") y ningún precio. El enlace de
    // esos no lleva a ningún sitio, así que se borran en vez de ocultarse.
    const NAV = ["girl","boy","boys","kid","kids","children","women","woman","men","man","unisex","toy","toys",
      "sock","socks","hat","hats","cap","caps","bag","bags","shoe","shoes","sneaker","sneakers","boot","boots",
      "jacket","jackets","jersey","jerseys","pant","pants","trousers","short","shorts","tee","tees","tshirt",
      "t-shirt","tshirts","t-shirts","shirt","shirts","hoodie","hoodies","sweater","sweaters","coat","coats",
      "vest","vests","belt","belts","wallet","wallets","watch","watches","glasses","sunglasses","accessory",
      "accessories","electronic","electronics","perfume","perfumes","jewelry","jewellery","underwear","home",
      "new","hot","sale","all","other","zapatos","zapatillas","gorras","bolsos","relojes","ropa","mujer","hombre"];
    const ph = NAV.map(() => "?").join(",");
    const g = db.prepare(
      `DELETE FROM products WHERE image_url LIKE '%vshop%'
         OR (price_eur IS NULL AND LOWER(TRIM(name)) IN (${ph}))`
    ).run(...NAV);
    if (g.changes) console.log(`Limpieza: ${g.changes} productos fantasma (enlaces de tienda/menú) eliminados.`);
  } catch (e) { console.error("purgeJunkProducts:", e.message); }
}

// Precios imposibles que ya están guardados. Los límites de cordura filtran lo que
// ENTRA, así que no tocan las filas escritas antes de existir (o por una versión
// anterior del parser): un ¥ leído como €, un "EUR 0.00" de la hoja, o la variante
// "cebo" de ¥0,60 que Weidian usa de reclamo.
//
// Se ponen a NULL en vez de borrar el producto: un precio absurdo engaña al comprador
// y ensucia el filtro, pero la ficha en sí es buena. Sin precio muestra "—", y el
// barrido de salud le pone el precio real de la fuente cuando le toque el turno.
function sanitizePrices() {
  try {
    const r = db.prepare(
      "UPDATE products SET price_eur=NULL WHERE price_eur IS NOT NULL AND (price_eur < ? OR price_eur > ?)"
    ).run(PRICE_MIN_EUR, PRICE_MAX_EUR);
    if (r.changes) console.log(`Limpieza: ${r.changes} precios fuera de rango puestos a NULL.`);
    return r.changes || 0;
  } catch (e) { console.error("sanitizePrices:", e.message); return 0; }
}

async function bootstrap() {
  try {
    const count = db.prepare("SELECT COUNT(*) c FROM products").get().c;
    if (count === 0 && SEED_SHEET_URL) { // primer arranque: siembra
      console.log("Catálogo vacío — importando semilla...");
      const deduped = dedupeCands(db, await gatherCandidates("sheet", SEED_SHEET_URL));
      const r = applyCands(db, deduped, "seed:boot");
      console.log(`Semilla importada: ${r.added} productos.`);
    }
    normalizeCategories();
    purgeJunkProducts();
    sanitizePrices();
    inferGenders();
    ensureSourcesSeeded(); // siembra la tabla de fuentes con el config la 1ª vez
    // Fotos pendientes: arranca ya y sigue reintentando cada pocos minutos
    // (recupera los que falla Weidian por throttling, sin depender de reinicios).
    resumePhotos();
    setInterval(resumePhotos, 6 * 60e3).unref?.();
    // Etiquetado automático por lotes: el explorador gana marcas/filtros solo.
    if (AUTO_TAG) { resumeTagging(); setInterval(resumeTagging, 8 * 60e3).unref?.(); }
    // QC automático por lotes: enciende las insignias "★ QC x/10" poco a poco.
    if (AUTO_QC) { resumeQc(); setInterval(resumeQc, 15 * 60e3).unref?.(); }
    // Caché de fotos: baja las imágenes de Google a disco. Es carrera contra reloj
    // (sus URLs caducan en horas), así que arranca ya y sigue en tandas cortas.
    cacheImagesBatch().catch(() => {});
    setInterval(() => cacheImagesBatch().catch(() => {}), 4 * 60e3).unref?.();
    // Barrido de salud rotatorio: cada vuelta revisa una tanda de los productos
    // menos comprobados, oculta los que ya no existen y corrige precios/fotos.
    if (AUTO_HEALTH) {
      const runHealth = () => {
        const last = metaGet("last_health_sweep");
        if (last && (Date.now() - Date.parse(last)) / 36e5 < AUTO_HEALTH_INTERVAL_H) return;
        metaSet("last_health_sweep", new Date().toISOString());
        try { startHealthJob(); } catch (e) { console.error("Barrido de salud falló:", e.message); }
      };
      setTimeout(runHealth, 90e3).unref?.(); // deja arrancar antes las fotos
      setInterval(runHealth, 30 * 60e3).unref?.();
    }
    // Importador automático (si toca): crece el catálogo solo, sin admin.
    if (AUTO_INGEST) {
      autoIngestSources().catch((e) => console.error("Auto-ingest falló:", e.message));
      // Reintenta periódicamente en procesos de larga vida (el guardado de
      // last_auto_ingest evita repetir antes del intervalo).
      setInterval(() => autoIngestSources().catch(() => {}), 6 * 3600e3).unref?.();
    }
  } catch (e) { console.error("Bootstrap falló:", e.message); }
}

server.listen(PORT, () => {
  console.log(`CNFinds en http://localhost:${PORT}`);
  bootstrap();
});
