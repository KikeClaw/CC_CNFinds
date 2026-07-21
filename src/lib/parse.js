// Extrae (plataforma, itemId) de casi cualquier URL: tiendas nativas
// (Taobao/Tmall, Weidian, 1688) o links de agentes (CNFans, Mulebuy, Kakobuy,
// OOPBuy, Hoobuy, Superbuy, Sugargoo, AllChinaBuy, ACBuy, CSSBuy...).
const PLAT_FROM_SHOPTYPE = {
  weidian: "weidian", wd: "weidian",
  taobao: "taobao", tmall: "taobao", tb: "taobao",
  ali_1688: "1688", "1688": "1688", alibaba: "1688",
};

const isId = (v) => (v && /^\d{6,}$/.test(v) ? v : null);

// Enlaces que NO son una ficha de producto: tienda, colección, perfil de vendedor.
// Llevan un número largo (el id de la TIENDA), así que sin este filtro acaban
// entrando como productos fantasma —con nombre de categoría, foto de banner de
// tienda (vshop…), sin precio y con un enlace que no lleva a ningún sitio.
const SHOP_URL = /[?&]user_?id=|[?&]shop_?id=|[?&]sellerId=|\.v\.weidian\.com|wfr=vshop|\/shop\b|\/store\b|\/collection\b|\/seller\b/i;
// Señal de que la URL sí apunta a una ficha concreta. Ojo: nada de un "/detail"
// suelto — los agentes usan /shop/detail para la página de una TIENDA.
const HAS_ITEM_ID = /item_?id=|\/item\b|\/offer\//i;

export function parseAnyUrl(input, depth = 0) {
  if (!input || depth > 3) return null;
  const s = String(input).trim();
  // Tienda/colección sin ficha concreta: no es un producto.
  if (SHOP_URL.test(s) && !HAS_ITEM_ID.test(s)) return null;

  let url;
  try { url = new URL(s); }
  catch { try { url = new URL("https://" + s); } catch { return null; } }

  const host = url.hostname.toLowerCase();
  const p = url.searchParams;

  // Agente que envuelve la URL original (p.ej. Kakobuy ?url=<encoded>)
  const embedded = p.get("url") || p.get("goodsUrl") || p.get("productUrl");
  if (embedded && /taobao|weidian|1688|tmall/i.test(embedded)) {
    const r = parseAnyUrl(decodeURIComponent(embedded), depth + 1);
    if (r) return r;
  }

  const shopType = (p.get("shop_type") || p.get("platform") || p.get("channel") || "").toLowerCase();
  const idParam = isId(p.get("id") || p.get("itemID") || p.get("itemId") || p.get("goodsId"));

  // shop_type + id (familia CNFans/Mulebuy/etc.)
  if (shopType && idParam && PLAT_FROM_SHOPTYPE[shopType]) {
    return { platform: PLAT_FROM_SHOPTYPE[shopType], itemId: idParam };
  }

  // Hosts nativos
  if (host.includes("weidian")) {
    const id = isId(p.get("itemID") || p.get("itemId") || p.get("id"));
    if (id) return { platform: "weidian", itemId: id };
  }
  if (host.includes("taobao") || host.includes("tmall")) {
    const id = isId(p.get("id"));
    if (id) return { platform: "taobao", itemId: id };
  }
  if (host.includes("1688")) {
    const m = url.pathname.match(/offer\/(\d{6,})/);
    if (m) return { platform: "1688", itemId: m[1] };
    if (idParam) return { platform: "1688", itemId: idParam };
  }

  // Rutas tipo OOPBuy: /product/{slug}/{id}
  const mo = url.pathname.match(/product\/([a-z0-9_]+)\/(\d{6,})/i);
  if (mo) {
    const plat = PLAT_FROM_SHOPTYPE[mo[1].toLowerCase()] || "weidian";
    return { platform: plat, itemId: mo[2] };
  }

  // Genericos
  if (idParam) return { platform: PLAT_FROM_SHOPTYPE[shopType] || "weidian", itemId: idParam };
  // Último recurso: un id largo suelto en la URL. Solo si la URL apunta de verdad a
  // una FICHA (host de marketplace, o ruta de producto de un agente). Antes valía
  // CUALQUIER URL con un número de 9+ cifras, así que un enlace de seguimiento o de
  // tienda entraba al catálogo como producto inexistente.
  const looksLikeItem = /weidian|taobao|tmall|1688/.test(host) || HAS_ITEM_ID.test(s) || /\/(product|goods)\b/i.test(url.pathname);
  if (looksLikeItem) {
    const any = s.match(/(\d{9,})/);
    if (any) return { platform: PLAT_FROM_SHOPTYPE[shopType] || "weidian", itemId: any[1] };
  }
  return null;
}
