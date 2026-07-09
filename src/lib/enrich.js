// Enriquecimiento de producto desde la FUENTE (Weidian), gratis.
// La pagina del item precarga las fotos reales del producto como
//   https://si.geilicdn.com/pcitem<shop>-<hash>_<W>_<H>.jpg
// Titulo y precio ya vienen de la spreadsheet, asi que aqui solo necesitamos
// las imagenes (y de paso detectar productos caidos: 0 imagenes = sospechoso).

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const IMG_RE = /https:\/\/si\.geilicdn\.com\/pcitem[\w.-]+?\.(?:jpg|jpeg|png)/gi;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchOnce(itemId, timeoutMs) {
  const url = `https://weidian.com/item.html?itemID=${itemId}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8" },
    });
    if (!res.ok) return { retry: res.status >= 500 || res.status === 429, status: res.status };
    const html = await res.text();
    const seen = new Set();
    const images = [];
    for (const m of html.matchAll(IMG_RE)) {
      if (!seen.has(m[0])) { seen.add(m[0]); images.push(m[0]); }
    }
    const finalUrl = res.url || url;
    return {
      ok: true, status: res.status, finalUrl,
      resolvedToShop: /\.v\.weidian\.com/.test(finalUrl), images,
    };
  } catch (e) {
    // Errores de red (fetch failed / reset / timeout) => reintentables: Weidian
    // throttlea cuando se le pide rapido.
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
    const r = await fetchOnce(itemId, timeoutMs);
    if (r.ok) return r;
    last = r;
    if (!r.retry) break; // 404 u otro error definitivo: no insistir
  }
  return { ok: false, status: last.status, error: last.error || `HTTP ${last.status}`, images: [] };
}

// Enriquecedor por plataforma (por ahora solo weidian; taobao/1688 = futuro).
export async function enrichProduct(platform, itemId, opts) {
  if (platform === "weidian") return enrichWeidian(itemId, opts);
  return { ok: false, error: `plataforma no soportada: ${platform}`, images: [] };
}
