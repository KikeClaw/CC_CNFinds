// Enriquecimiento de producto desde la FUENTE (Weidian), gratis.
//
// Weidian expone la misma API pública que usa su web para pintar la ficha:
//   thor.weidian.com/detail/getItemSkuInfo/1.0?param={"itemId":"..."}
// Devuelve en UNA llamada todo lo que necesitamos: fotos, PRECIO real, stock y —de
// paso— si el item sigue existiendo. Antes rascábamos el HTML (52 KB) solo para las
// fotos, y el precio ni estaba (la ficha lo pinta por JS).
//
// El precio de la hoja es orientativo y suele venir desantiguado o en otra moneda;
// este es el de verdad. Viene en FEN (céntimos de yuan): 1900 = ¥19,00.
//
// Señal de item CAÍDO: la API responde OK igual para un itemId inventado, pero el
// resultado llega sin stock y sin fotos. Eso es lo que miramos, no el código.
import { CNY_TO_EUR, sanePrice } from "./price.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const IMG_RE = /https:\/\/si\.geilicdn\.com\/pcitem[\w.-]+?\.(?:jpg|jpeg|png)/gi;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const apiUrl = (itemId) =>
  `https://thor.weidian.com/detail/getItemSkuInfo/1.0?param=${encodeURIComponent(JSON.stringify({ itemId: String(itemId) }))}`;

// FEN -> EUR (2 decimales). Guardamos el precio MÁS BAJO: estas fichas suelen tener
// varias variantes y el rango bajo es el "desde" que ve el comprador.
function fenToEur(fen) {
  if (fen == null || !Number.isFinite(Number(fen))) return null;
  const eur = (Number(fen) / 100) * CNY_TO_EUR;
  // Cordura: hay fichas con una variante "cebo" a ¥0,60 que daría €0,08.
  return sanePrice(Math.round(eur * 100) / 100);
}

async function fetchApi(itemId, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl(itemId), {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
    });
    if (!res.ok) return { retry: res.status >= 500 || res.status === 429, status: res.status };
    const j = await res.json();
    const r = j && j.result;
    if (!r) return { retry: true, status: res.status, error: j?.status?.message || "sin result" };

    const seen = new Set();
    const images = [];
    for (const u of [r.itemMainPic, ...(r.attrList || []).flatMap((a) => (a.attrValues || []).map((v) => v.img))]) {
      if (u && !seen.has(u)) { seen.add(u); images.push(u); }
    }
    const stock = r.itemStock == null ? null : Number(r.itemStock);
    const price = fenToEur(r.itemDiscountLowPrice ?? r.itemOriginalLowPrice);
    // Sin stock Y sin fotos = el item no existe (la API responde OK igualmente).
    const alive = images.length > 0 || stock != null;
    return { ok: true, status: res.status, alive, images, price, stock, title: r.itemTitle || null };
  } catch (e) {
    // Errores de red (fetch failed / reset / timeout) => reintentables: Weidian
    // throttlea cuando se le pide rapido.
    return { retry: true, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(t);
  }
}

// Respaldo: si la API no da fotos, seguimos rascando el HTML como antes. No trae
// precio ni stock, pero al menos recupera imágenes.
async function fetchHtml(itemId, timeoutMs) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`https://weidian.com/item.html?itemID=${itemId}`, {
      redirect: "follow", signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
    });
    if (!res.ok) return { retry: res.status >= 500 || res.status === 429, status: res.status };
    const html = await res.text();
    const seen = new Set();
    const images = [];
    for (const m of html.matchAll(IMG_RE)) if (!seen.has(m[0])) { seen.add(m[0]); images.push(m[0]); }
    return { ok: true, status: res.status, alive: images.length > 0, images, price: null, stock: null };
  } catch (e) {
    return { retry: true, error: e.name === "AbortError" ? "timeout" : e.message };
  } finally {
    clearTimeout(t);
  }
}

// Con reintentos y backoff exponencial (500ms, 1.5s, 4.5s...).
export async function enrichWeidian(itemId, { timeoutMs = 20000, retries = 3 } = {}) {
  let last = { images: [] };
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(500 * Math.pow(3, attempt - 1));
    const r = await fetchApi(itemId, timeoutMs);
    if (r.ok) {
      if (r.images.length) return r;
      // La API dice que existe pero no dio fotos: probamos el HTML antes de rendirnos.
      const h = await fetchHtml(itemId, timeoutMs);
      if (h.ok && h.images.length) return { ...r, images: h.images };
      return r; // sin fotos: alive/price/stock siguen siendo válidos
    }
    last = r;
    if (!r.retry) break; // error definitivo: no insistir
  }
  return { ok: false, alive: null, status: last.status, error: last.error || `HTTP ${last.status}`, images: [], price: null, stock: null };
}

// Enriquecedor por plataforma (por ahora solo weidian; taobao/1688 = futuro).
export async function enrichProduct(platform, itemId, opts) {
  if (platform === "weidian") return enrichWeidian(itemId, opts);
  return { ok: false, alive: null, error: `plataforma no soportada: ${platform}`, images: [], price: null, stock: null };
}
