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
};

export function isPlaceholder(code) {
  return !code || code.startsWith("YOUR_");
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
];

// Genera todos los links de afiliado para un producto.
// Estado en runtime de cada agente (código + activado). Se inicializa desde
// AFFILIATE_CODES; el admin lo edita y se persiste en la DB (agent_settings).
// Un agente arranca activado solo si trae un código real (no placeholder).
const STATE = {};
for (const a of AGENTS) STATE[a.id] = { code: AFFILIATE_CODES[a.id], enabled: !isPlaceholder(AFFILIATE_CODES[a.id]) };

export function getAgentState() {
  return AGENTS.map((a) => ({
    id: a.id, name: a.name, code: STATE[a.id].code || "",
    enabled: STATE[a.id].enabled, configured: !isPlaceholder(STATE[a.id].code),
  }));
}

export function setAgentState(id, { code, enabled } = {}) {
  if (!STATE[id]) return false;
  if (code !== undefined) STATE[id].code = code;
  if (enabled !== undefined) STATE[id].enabled = !!enabled;
  return true;
}

export function buildLinks(platform, itemId) {
  const out = {};
  for (const agent of AGENTS) {
    const st = STATE[agent.id];
    if (!st.enabled) continue; // solo agentes activados y con código real
    out[agent.id] = {
      name: agent.name,
      url: agent.buildUrl(platform, itemId, st.code || ""),
      configured: !isPlaceholder(st.code),
    };
  }
  return out;
}
