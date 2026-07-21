// Parseo de precios de las hojas. La columna de la DB es price_eur, así que TODO
// acaba en euros. Las hojas de la comunidad escriben el precio de mil formas:
//   "$6.92"  "6,92$"  "€ 12,50"  "EUR 3.96"  "￥480"  "USD 19.99"  "12.50"
// y muchas dan el MISMO precio en dos monedas ("6,92$" y debajo "5,98€").
// Antes se cogía el primer número que apareciera, así que un precio en dólares se
// guardaba como si fueran euros (~16% de más) y uno en yuanes se iba x7.

export const USD_TO_EUR = 0.864; // el tipo que usan las propias hojas ($6,92 → 5,98€)
export const CNY_TO_EUR = 0.13;

const AMOUNT = /\d{1,6}(?:[.,]\d{1,2})?/;
const CUR = String.raw`[$€￥¥]|\b(?:EUR|USD|CNY|RMB)\b`;
// Importe con moneda delante ("$6.92", "EUR 3.96") o detrás ("6,92$", "12,50 €").
export const PRICE_RE = new RegExp(
  String.raw`(?:${CUR})\s?${AMOUNT.source}|${AMOUNT.source}\s?(?:${CUR})`, "i");

function currencyOf(s) {
  if (/€|\bEUR\b/i.test(s)) return "eur";
  if (/[￥¥]|\b(?:CNY|RMB)\b/i.test(s)) return "cny";
  if (/\$|\bUSD\b/i.test(s)) return "usd";
  return null;
}

function amountOf(s) {
  const m = s.match(AMOUNT);
  const v = m ? parseFloat(m[0].replace(",", ".")) : NaN;
  return Number.isFinite(v) ? v : null;
}

function toEur(v, cur) {
  if (v == null) return null;
  if (cur === "cny") return Math.round(v * CNY_TO_EUR);
  if (cur === "usd") return Math.round(v * USD_TO_EUR * 100) / 100;
  return v; // ya en euros (o moneda desconocida: se asume euros)
}

// Texto libre (una celda cualquiera del grid). Exige moneda explícita: si no, un
// número suelto —una talla, un contador de estilos— pasaría por precio.
// Si hay varias monedas, gana el EURO (es exacto, sin conversión).
export function parsePriceText(text) {
  const hits = String(text || "").match(new RegExp(PRICE_RE, "gi")) || [];
  if (!hits.length) return null;
  for (const cur of ["eur", "cny", "usd"]) {
    const hit = hits.find((h) => currencyOf(h) === cur);
    if (hit) return sanePrice(toEur(amountOf(hit), cur));
  }
  return null;
}

// Celda de una columna de PRECIO ya identificada. Aquí un número pelado ("12.50")
// sí es un precio: se asume que ya viene en euros (comportamiento de siempre).
export function parsePriceField(raw) {
  if (raw == null || raw === "") return null;
  const withCur = parsePriceText(raw);
  if (withCur != null) return withCur;
  return sanePrice(amountOf(String(raw)));
}

// --- Cordura ------------------------------------------------------------------
// No podemos fiarnos del formato de cada hoja, así que desconfiamos del RESULTADO.
// Esto es genérico: no sabe nada de la hoja de la que viene el precio.
//
// Los fallos de moneda dan múltiplos predecibles (~7,7x si un yuan se cuela como
// euro; ~1,16x si es un dólar), y las hojas también traen ceros y erratas. Un precio
// fuera de rango es peor que no tener precio: engaña al comprador y ensucia el
// filtro. Por eso se descarta (null) en vez de guardarse.
export const PRICE_MIN_EUR = 0.5;    // por debajo no hay producto real (0, 0.08…)
export const PRICE_MAX_EUR = 2000;   // por encima es casi siempre moneda mal leída

export function isSanePrice(v) {
  return v != null && Number.isFinite(v) && v >= PRICE_MIN_EUR && v <= PRICE_MAX_EUR;
}

// Precio listo para guardar: null si no supera la cordura.
export function sanePrice(v) {
  return isSanePrice(v) ? v : null;
}

// Señal de "esta fuente cotiza en otra moneda": si la MEDIANA de una hoja está muy
// por encima de lo normal en el catálogo, probablemente son yuanes leídos como euros.
// Se usa para AVISAR en la vista previa del admin, nunca para convertir a ciegas.
export function medianOf(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
