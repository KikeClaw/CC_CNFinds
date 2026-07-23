// =============================================================================
//  CONFIGURACION DE AGENTES Y CODIGOS DE AFILIADO
// =============================================================================
//
//  IMPORTANTE (donde ganas el dinero):
//  Los links NO se copian de la Sheet. Se GENERAN aqui a partir de
//  (plataforma + itemId) usando TUS codigos de afiliado. Asi cada compra
//  te paga a ti, no al autor de la hoja original.
//
//  1. Cambia los codigos de abajo por los tuyos (o define variables de entorno).
//  2. VERIFICA el formato de cada URL en el panel de afiliado de cada agente:
//     estos formatos son los habituales del sector pero los agentes los
//     cambian de vez en cuando. Si uno cambia, solo tocas este fichero.
//
// =============================================================================

// --- Tus codigos de afiliado ------------------------------------------------
// La env var gana; si no existe, se usa el placeholder (marcado como "sin configurar").
export const AFFILIATE_CODES = {
  cnfans:  process.env.CNFANS_REF  || "YOUR_CNFANS_CODE",
  mulebuy: process.env.MULEBUY_REF || "YOUR_MULEBUY_CODE",
  kakobuy: process.env.KAKOBUY_REF || "4mqkq", // affcode de KikeClaw (invite: ikako.vip/r/4mqkq)
  oopbuy:  process.env.OOPBUY_REF  || "YOUR_OOPBUY_CODE",
  hoobuy:  process.env.HOOBUY_REF  || "YOUR_HOOBUY_CODE",
  superbuy: process.env.SUPERBUY_REF || "YOUR_SUPERBUY_CODE",
  sugargoo: process.env.SUGARGOO_REF || "YOUR_SUGARGOO_CODE",
  acbuy:    process.env.ACBUY_REF    || "YOUR_ACBUY_CODE",
  cssbuy:   process.env.CSSBUY_REF   || "YOUR_CSSBUY_CODE",
  lovegobuy: process.env.LOVEGOBUY_REF || "YOUR_LOVEGOBUY_CODE",
  joyagoo:  process.env.JOYAGOO_REF  || "YOUR_JOYAGOO_CODE",
  allchinabuy: process.env.ALLCHINABUY_REF || "YOUR_ALLCHINABUY_CODE",
  orientdig: process.env.ORIENTDIG_REF || "YOUR_ORIENTDIG_CODE",
  hipobuy:  process.env.HIPOBUY_REF  || "YOUR_HIPOBUY_CODE",
  usfans:   process.env.USFANS_REF   || "YOUR_USFANS_CODE",
};

export function isPlaceholder(code) {
  const c = String(code || "").trim();
  // Vacío, plantilla, o un marcador que no es un código real (p.ej. "ERROR" cuando
  // un agente no deja registrarse). Sin esto, un valor así pasaba por código válido
  // y el enlace salía como "agente que paga" con un id basura → cero comisión.
  return !c || c.startsWith("YOUR_") || /^(error|n\/?a|none|null|todo|pending|x+)$/i.test(c);
}

// --- Plataforma canonica -----------------------------------------------------
// Valores internos unicos: "taobao" | "weidian" | "1688".
// La Sheet de ejemplo no trae columna de plataforma, asi que se asume esta
// por defecto (los items Ralph Lauren de esa hoja son de Weidian).
// Cambiala aqui o con la env var DEFAULT_PLATFORM.
export const DEFAULT_PLATFORM = process.env.DEFAULT_PLATFORM || "weidian";

// URL "original" de la tienda china, reconstruida desde el itemId.
// Es la base para los agentes que necesitan la URL completa (p.ej. Kakobuy).
export function originalUrl(platform, itemId) {
  switch (platform) {
    case "taobao":  return `https://item.taobao.com/item.htm?id=${itemId}`;
    case "weidian": return `https://weidian.com/item.html?itemID=${itemId}`;
    case "1688":    return `https://detail.1688.com/offer/${itemId}.html`;
    default:        return `https://item.taobao.com/item.htm?id=${itemId}`;
  }
}

// Como nombra cada agente a cada plataforma (difieren entre si).
const SHOP_TYPE = {
  // familia CNFans / Mulebuy (mismo backend/plantilla)
  family: { taobao: "taobao", weidian: "weidian", "1688": "ali_1688" },
  // OOPBuy usa slug en la ruta (VERIFICAR)
  oopbuy: { taobao: "taobao", weidian: "weidian", "1688": "1688" },
  // Hoobuy usa número de plataforma en la ruta (VERIFICAR)
  hoobuy: { taobao: "1", weidian: "2", "1688": "3" },
  // ACBuy usa códigos cortos de fuente (VERIFICAR)
  acbuy: { taobao: "TB", weidian: "WD", "1688": "AL" },
  // CSSBuy incrusta el tipo en el slug del item (VERIFICAR)
  cssbuy: { taobao: "", weidian: "micro-", "1688": "1688-" },
  // USFans usa número de plataforma en la ruta, estilo Hoobuy (VERIFICAR: en su hoja
  // solo se vio "3" = 1688; confirmar 1=taobao / 2=weidian con un link real al activar).
  usfans: { taobao: "1", weidian: "2", "1688": "3" },
};

// --- Generadores de link por agente -----------------------------------------
// Cada uno recibe (platform, itemId, code) y devuelve la URL de afiliado.
// NOTA: CNFans se retiró el 22-ene-2026 (dejó de pagar afiliados y de soportar
// Weidian). Lo quitamos de la GENERACIÓN de links. El parser (parse.js) sí sigue
// aceptando URLs de CNFans como ENTRADA para convertirlas a nuestros agentes.
export const AGENTS = [
  {
    id: "mulebuy",
    name: "Mulebuy",
    // VERIFICAR: https://mulebuy.com/product?shop_type=weidian&id=XXXX&ref=CODE
    buildUrl: (platform, itemId, code) => {
      const t = SHOP_TYPE.family[platform] || "taobao";
      return `https://mulebuy.com/product?shop_type=${t}&id=${itemId}&ref=${code}`;
    },
  },
  {
    id: "kakobuy",
    name: "Kakobuy",
    // VERIFICAR: https://www.kakobuy.com/item/details?url=<URL_ORIGINAL_ENCODED>&affcode=CODE
    buildUrl: (platform, itemId, code) => {
      const orig = encodeURIComponent(originalUrl(platform, itemId));
      return `https://www.kakobuy.com/item/details?url=${orig}&affcode=${code}`;
    },
  },
  {
    id: "oopbuy",
    name: "OOPBuy",
    // VERIFICAR: https://oopbuy.com/product/weidian/XXXX?inviteCode=CODE
    buildUrl: (platform, itemId, code) => {
      const slug = SHOP_TYPE.oopbuy[platform] || "taobao";
      return `https://oopbuy.com/product/${slug}/${itemId}?inviteCode=${code}`;
    },
  },
  {
    id: "hoobuy",
    name: "Hoobuy",
    // VERIFICAR al activar: https://hoobuy.com/product/2/XXXX?inviteCode=CODE (2=weidian)
    buildUrl: (platform, itemId, code) => {
      const n = SHOP_TYPE.hoobuy[platform] || "1";
      return `https://hoobuy.com/product/${n}/${itemId}?inviteCode=${code}`;
    },
  },
  {
    id: "superbuy",
    name: "Superbuy",
    // VERIFICAR al activar: https://www.superbuy.com/en/page/buy?url=<URL_ENCODED>&partnercode=CODE
    buildUrl: (platform, itemId, code) => {
      const orig = encodeURIComponent(originalUrl(platform, itemId));
      return `https://www.superbuy.com/en/page/buy?url=${orig}&partnercode=${code}`;
    },
  },
  {
    id: "sugargoo",
    name: "Sugargoo",
    // VERIFICAR al activar: https://www.sugargoo.com/#/home/productDetail?productLink=<URL_ENCODED>&memberId=CODE
    buildUrl: (platform, itemId, code) => {
      const orig = encodeURIComponent(originalUrl(platform, itemId));
      return `https://www.sugargoo.com/#/home/productDetail?productLink=${orig}&memberId=${code}`;
    },
  },
  {
    id: "acbuy",
    name: "ACBuy",
    // VERIFICAR al activar: https://www.acbuy.com/product?id=XXXX&source=WD&u=CODE (source: TB/WD/AL)
    buildUrl: (platform, itemId, code) =>
      `https://www.acbuy.com/product?id=${itemId}&source=${SHOP_TYPE.acbuy[platform] || "TB"}&u=${code}`,
  },
  {
    id: "cssbuy",
    name: "CSSBuy",
    // VERIFICAR al activar: https://www.cssbuy.com/item-micro-XXXX.html?promotionCode=CODE
    // (taobao: item-XXXX / weidian: item-micro-XXXX / 1688: item-1688-XXXX)
    buildUrl: (platform, itemId, code) => {
      const seg = SHOP_TYPE.cssbuy[platform] ?? "";
      return `https://www.cssbuy.com/item-${seg}${itemId}.html?promotionCode=${code}`;
    },
  },
  {
    id: "lovegobuy",
    name: "LoveGoBuy",
    // VERIFICAR al activar: https://www.lovegobuy.com/product?id=XXXX&shop_type=weidian&invite_code=CODE
    buildUrl: (platform, itemId, code) => {
      const t = SHOP_TYPE.family[platform] || "taobao";
      return `https://www.lovegobuy.com/product?id=${itemId}&shop_type=${t}&invite_code=${code}`;
    },
  },
  {
    id: "joyagoo",
    name: "JoyaGoo",
    // VERIFICAR al activar: https://www.joyagoo.com/product?id=XXXX&shop_type=weidian&ref=CODE
    buildUrl: (platform, itemId, code) => {
      const t = SHOP_TYPE.family[platform] || "taobao";
      return `https://www.joyagoo.com/product?id=${itemId}&shop_type=${t}&ref=${code}`;
    },
  },
  {
    id: "allchinabuy",
    name: "AllChinaBuy",
    // VERIFICAR al activar (familia Superbuy): https://www.allchinabuy.com/en/page/buy/?url=<URL_ENCODED>&partnercode=CODE
    buildUrl: (platform, itemId, code) => {
      const orig = encodeURIComponent(originalUrl(platform, itemId));
      return `https://www.allchinabuy.com/en/page/buy/?url=${orig}&partnercode=${code}`;
    },
  },
  {
    id: "orientdig",
    name: "OrientDig",
    // VERIFICAR al activar: https://orientdig.com/product?id=XXXX&shop_type=weidian&ref=CODE
    buildUrl: (platform, itemId, code) => {
      const t = SHOP_TYPE.family[platform] || "taobao";
      return `https://orientdig.com/product?id=${itemId}&shop_type=${t}&ref=${code}`;
    },
  },
  {
    id: "hipobuy",
    name: "Hipobuy",
    // VERIFICAR al activar: https://hipobuy.com/product?id=XXXX&shop_type=weidian&ref=CODE
    buildUrl: (platform, itemId, code) => {
      const t = SHOP_TYPE.family[platform] || "taobao";
      return `https://hipobuy.com/product?id=${itemId}&shop_type=${t}&ref=${code}`;
    },
  },
  {
    id: "usfans",
    name: "USFans",
    // Formato sacado de su propia hoja: https://www.usfans.com/product/<N>/<itemId>?ref=CODE
    // (N: 1=taobao, 2=weidian, 3=1688 — VERIFICAR el mapeo con un link real al activar).
    buildUrl: (platform, itemId, code) => {
      const n = SHOP_TYPE.usfans[platform] || "1";
      return `https://www.usfans.com/product/${n}/${itemId}?ref=${code}`;
    },
  },
];

// Genera todos los links de afiliado para un producto.
// Estado en runtime de cada agente (código + activado). Se inicializa desde
// AFFILIATE_CODES; el admin lo edita y se persiste en la DB (agent_settings).
// Un agente arranca activado solo si trae un código real (no placeholder).
// Por defecto TODOS los agentes se muestran (comparación poblada = nuestro USP).
// El que tiene código real genera tu comisión; el resto sale con enlace funcional
// sin referido (pobla la comparación e invita a que te registres). El admin puede
// desactivar agentes concretos. SHOW_ALL_AGENTS=off vuelve a "solo con tu código".
export const SHOW_ALL_AGENTS = String(process.env.SHOW_ALL_AGENTS ?? "on").toLowerCase() !== "off";

// Semilla del "Top" de agentes destacados y el recomendado por defecto. Es solo el
// arranque: el admin lo edita y se persiste en la DB, así no depende del criterio
// de nadie a fecha fija. Los clics reales (badge "más elegido") mandan por encima.
export const FEATURED_DEFAULT = new Set(["kakobuy", "hoobuy", "mulebuy", "oopbuy", "cssbuy"]);
export const DEFAULT_RECOMMENDED = "kakobuy";

const STATE = {};
for (const a of AGENTS) STATE[a.id] = {
  code: AFFILIATE_CODES[a.id],
  enabled: SHOW_ALL_AGENTS || !isPlaceholder(AFFILIATE_CODES[a.id]),
  featured: FEATURED_DEFAULT.has(a.id),
  isDefault: a.id === DEFAULT_RECOMMENDED,
};

export function getAgentState() {
  return AGENTS.map((a) => ({
    id: a.id, name: a.name, code: STATE[a.id].code || "",
    enabled: STATE[a.id].enabled, configured: !isPlaceholder(STATE[a.id].code),
    featured: !!STATE[a.id].featured, is_default: !!STATE[a.id].isDefault,
  }));
}

export function setAgentState(id, { code, enabled, featured, is_default } = {}) {
  if (!STATE[id]) return false;
  if (code !== undefined) STATE[id].code = code;
  if (enabled !== undefined) STATE[id].enabled = !!enabled;
  if (featured !== undefined) STATE[id].featured = !!featured;
  if (is_default !== undefined) {
    // Solo puede haber UN recomendado por defecto: al marcar uno, se limpian los demás.
    if (is_default) for (const k of Object.keys(STATE)) STATE[k].isDefault = false;
    STATE[id].isDefault = !!is_default;
  }
  return true;
}

export function buildLinks(platform, itemId) {
  const list = [];
  for (const agent of AGENTS) {
    const st = STATE[agent.id];
    if (!st.enabled && !SHOW_ALL_AGENTS) continue;
    const configured = !isPlaceholder(st.code);
    const code = configured ? st.code : ""; // sin tu código = enlace funcional sin referido
    // Sin código, la URL queda con el parámetro de afiliado colgando (…?inviteCode=,
    // …&ref=). Se ve roto y algún agente lo rechaza, así que quitamos ese parámetro
    // vacío del final. Con código no aplica (el valor no está vacío).
    const url = agent.buildUrl(platform, itemId, code).replace(/[?&][^=&?#]+=(?=$|#)/, "");
    const featured = !!st.featured;
    list.push({ id: agent.id, configured, featured, data: { name: agent.name, url, configured, featured } });
  }
  // Destacados (el Top) primero; dentro de cada grupo, los que te pagan primero.
  list.sort((a, b) => Number(b.featured) - Number(a.featured) || Number(b.configured) - Number(a.configured));
  const out = {};
  for (const x of list) out[x.id] = x.data;
  return out;
}

// URLs de BÚSQUEDA por palabra clave en cada agente (con tu código). Se usan como
// fallback cuando un producto no está en nuestro catálogo: el usuario busca en el
// agente y tú conservas la comisión. VERIFICAR el formato al activar cada agente.
const SEARCH = {
  kakobuy: (q, c) => `https://www.kakobuy.com/search?searchText=${q}&affcode=${c}`,
  mulebuy: (q, c) => `https://mulebuy.com/search?text=${q}&ref=${c}`,
  oopbuy: (q, c) => `https://oopbuy.com/search?keyword=${q}&inviteCode=${c}`,
  hoobuy: (q, c) => `https://hoobuy.com/search?keyword=${q}&inviteCode=${c}`,
  acbuy: (q, c) => `https://www.acbuy.com/search?keyword=${q}&u=${c}`,
  cssbuy: (q, c) => `https://www.cssbuy.com/search?keyword=${q}&promotionCode=${c}`,
  superbuy: (q, c) => `https://www.superbuy.com/en/goods/search/?keyword=${q}&partnercode=${c}`,
  sugargoo: (q, c) => `https://www.sugargoo.com/#/home/search?keyword=${q}&memberId=${c}`,
  lovegobuy: (q, c) => `https://www.lovegobuy.com/search?keyword=${q}&invite_code=${c}`,
  joyagoo: (q, c) => `https://www.joyagoo.com/search?keyword=${q}&ref=${c}`,
  allchinabuy: (q, c) => `https://www.allchinabuy.com/en/goods/search/?keyword=${q}&partnercode=${c}`,
  orientdig: (q, c) => `https://orientdig.com/search?keyword=${q}&ref=${c}`,
  hipobuy: (q, c) => `https://hipobuy.com/search?keyword=${q}&ref=${c}`,
  usfans: (q, c) => `https://www.usfans.com/search?keyword=${q}&ref=${c}`, // VERIFICAR formato al activar
};

// Enlaces de búsqueda por palabra clave, solo para agentes activados.
export function buildSearchLinks(q) {
  const eq = encodeURIComponent(String(q || "").trim());
  if (!eq) return [];
  const out = [];
  for (const agent of AGENTS) {
    const st = STATE[agent.id];
    if (!st.enabled && !SHOW_ALL_AGENTS) continue;
    const fn = SEARCH[agent.id];
    if (!fn) continue;
    out.push({ id: agent.id, name: agent.name, url: fn(eq, isPlaceholder(st.code) ? "" : st.code) });
  }
  return out;
}
