import { DEFAULT_PLATFORM } from "../../config/agents.js";
import { parsePriceField, parsePriceText } from "./price.js";

// --- Mapeo flexible de columnas ---------------------------------------------
// Encuentra el indice de la primera cabecera que contiene alguno de los alias.
function findCol(headers, aliases) {
  return headers.findIndex((h) =>
    aliases.some((a) => h.trim().toLowerCase().includes(a))
  );
}

// La columna "id" es delicada: "id" aparece como subcadena en muchos sitios.
// Priorizamos coincidencia exacta y luego alias mas especificos.
function findIdCol(headers) {
  const lower = headers.map((h) => h.trim().toLowerCase());
  const exact = lower.indexOf("id");
  if (exact !== -1) return exact;
  return findCol(headers, ["itemid", "item id", "product id", "goods id"]);
}

const NAME_ALIASES = ["item name", "name", "producto", "nombre", "title"];

// Detecta la fila de cabecera y TODOS los bloques de columnas.
// Muchas hojas W2C ponen 2-3 bloques identicos en paralelo (item name, Price,
// photo, ID, links... repetidos en horizontal) para ahorrar filas. Devolvemos
// un array de mapeos de columna, uno por bloque, con indices absolutos.
export function detectHeaderBlocks(rows, maxScan = 30) {
  const limit = Math.min(rows.length, maxScan);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    // Un bloque empieza en cada cabecera de "nombre".
    const starts = [];
    row.forEach((h, idx) => {
      const v = (h || "").trim().toLowerCase();
      if (v && NAME_ALIASES.some((a) => v.includes(a))) starts.push(idx);
    });
    if (starts.length === 0) continue;

    const blocks = [];
    for (let b = 0; b < starts.length; b++) {
      const s = starts[b];
      const e = b + 1 < starts.length ? starts[b + 1] : row.length;
      const local = mapColumns(row.slice(s, e));
      const cols = {};
      for (const k of Object.keys(local)) cols[k] = local[k] >= 0 ? local[k] + s : -1;
      if (cols.id >= 0) blocks.push(cols); // solo bloques con ID sirven
    }
    if (blocks.length) return { headerIndex: i, blocks };
  }
  return { headerIndex: -1, blocks: [] };
}

// Primera columna de link a un agente (sirve para inferir la posicion del ID).
function findLinkCol(headers) {
  return headers.findIndex((h) => {
    const v = h.trim().toLowerCase();
    return /cnfans|oopbuy|mulebuy|kakobuy/.test(v) || v.endsWith("link");
  });
}

export function mapColumns(headers) {
  const image = findCol(headers, ["photo", "image", "imagen", "foto", "picture"]);
  let id = findIdCol(headers);
  // En algunas pestanas (p.ej. HOT SALE) la columna ID NO tiene cabecera.
  // La estructura es siempre [name, price, photo, ID, links...], asi que la
  // inferimos: justo despues de "photo", o justo antes del primer link.
  if (id < 0) {
    if (image >= 0) id = image + 1;
    else {
      const link = findLinkCol(headers);
      if (link > 0) id = link - 1;
    }
  }
  return {
    name: findCol(headers, ["item name", "name", "producto", "nombre", "title"]),
    price: findCol(headers, ["price", "precio"]),
    id,
    platform: findCol(headers, ["platform", "plataforma", "shop type", "tienda"]),
    image,
  };
}

// --- Parsers de campo --------------------------------------------------------
// Columna de precio ya identificada: delega en el parseo central, que reconoce la
// moneda ("$19.99", "EUR 3.96", "￥480") y convierte a euros. Un número pelado se
// asume ya en euros. Antes se cogía el número a secas, así que las hojas en dólares
// entraban ~16% infladas y las de yuanes por las nubes.
export function parsePrice(raw) {
  return parsePriceField(raw);
}

// itemId = solo digitos. Descarta valores demasiado cortos para ser reales.
export function parseItemId(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 6) return null;
  return digits;
}

const PLATFORM_ALIASES = {
  taobao: ["taobao", "tb", "tao"],
  weidian: ["weidian", "wd", "wei"],
  "1688": ["1688", "ali_1688", "alibaba"],
};

export function normalizePlatform(raw) {
  if (!raw) return DEFAULT_PLATFORM;
  const v = String(raw).trim().toLowerCase();
  for (const [canon, aliases] of Object.entries(PLATFORM_ALIASES)) {
    if (aliases.some((a) => v.includes(a))) return canon;
  }
  return DEFAULT_PLATFORM;
}

// --- Heuristica marca / categoria a partir del nombre -----------------------
const CATEGORY_WORDS = [
  "hoodie", "sweater", "sweatshirt", "set", "tracksuit", "tshirt", "tee",
  "shirt", "polo", "pants", "trousers", "shorts", "jacket", "coat", "vest",
  "jeans", "cap", "hat", "beanie", "shoes", "sneakers", "bag", "belt",
  "socks", "dress", "skirt", "scarf", "gloves", "jersey",
];

function splitCamel(s) {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_\-]+/g, " ")
    .trim();
}

export function deriveBrandCategory(name) {
  if (!name) return { brand: null, category: null };
  const words = splitCamel(name).split(/\s+/).filter(Boolean);
  let catIdx = -1;
  let category = null;
  for (let i = words.length - 1; i >= 0; i--) {
    if (CATEGORY_WORDS.includes(words[i].toLowerCase())) {
      catIdx = i;
      category = words[i];
      break;
    }
  }
  const brand = catIdx > 0 ? words.slice(0, catIdx).join(" ") : null;
  return { brand, category };
}

// --- Normalizacion de una fila cruda ----------------------------------------
// Precio de la fila. La columna PRICE detectada manda, PERO si ahí viene un número
// pelado y en la misma fila hay una celda con moneda explícita, gana esa: estas hojas
// ponen las dos juntas ("260" en yuanes y al lado "40,00$"), y quedarse con la pelada
// guardaba ¥260 como €260 (7,5x de más). Regla genérica: moneda explícita > número.
function priceForRow(cells, cols) {
  const col = cols.price >= 0 ? cells[cols.price] : null;
  if (col != null && parsePriceText(col) != null) return parsePriceText(col); // ya trae moneda
  // Fallback con moneda explícita, pero SOLO dentro de las columnas de ESTE bloque.
  // Las hojas W2C ponen 2-3 bloques de producto en paralelo por fila; escanear la
  // fila entera hacía que un producto heredara el precio (convertido) del vecino.
  const idx = [cols.name, cols.price, cols.id, cols.platform, cols.image].filter((i) => i >= 0);
  if (idx.length) {
    for (let i = Math.min(...idx); i <= Math.max(...idx); i++) {
      const p = parsePriceText(cells[i]); if (p != null) return p;
    }
  }
  return parsePrice(col);
}

// Devuelve un producto canonico o null si la fila no es valida (sin itemId).
export function normalizeRow(cells, cols) {
  // Colapsa saltos de linea y espacios multiples ("LV\nBag" -> "LV Bag").
  const rawName = cols.name >= 0 ? (cells[cols.name] || "").replace(/\s+/g, " ").trim() : "";
  const itemId = parseItemId(cols.id >= 0 ? cells[cols.id] : null);
  if (!itemId) return null; // sin itemId no hay producto

  const platform = normalizePlatform(cols.platform >= 0 ? cells[cols.platform] : null);
  const price = priceForRow(cells, cols);
  const imageRaw = cols.image >= 0 ? (cells[cols.image] || "").trim() : "";
  // Solo aceptamos imagen si es una URL http (la Sheet suele traer =IMAGE(), no exportable).
  const image = /^https?:\/\//i.test(imageRaw) ? imageRaw : null;
  const { brand, category } = deriveBrandCategory(rawName);

  return {
    platform,
    item_id: itemId,
    name: rawName || `${platform}-${itemId}`,
    brand,
    category,
    price_eur: price,
    image_url: image,
  };
}
