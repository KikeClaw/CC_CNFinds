// Tallas reales de un producto, sacadas de los atributos de Weidian.
//
// La ficha trae dos ejes: 款式 (variante: 1, 2, 3…) y 尺寸 (la talla). Pero NO nos
// fiamos del título en chino —varía entre vendedores—, sino del CONTENIDO: el eje
// cuyos valores parecen tallas es la talla. Así funciona aunque el vendedor lo
// titule de otra forma.
//
// Tres casos reales del catálogo:
//   ropa    -> XS | S | M | L | XL | XXL
//   calzado -> 36 | 37 | 38 | 39 | 40 …   (numeración EU)
//   sin eje -> 均码 ("talla única"), 个 ("unidad"), 套 ("set") → no hay que elegir

const LETTER = /^(XXS|XS|S|M|L|XL|XXL|XXXL|[2-6]XL)$/i;
const SHOE = /^(\d{2})(\.5)?$/;               // 35–50 en numeración EU
const ONE_SIZE = /^(均码|均碼|统一|均一|个|個|套|只|双|雙|one\s?size|free\s?size)$/i;

const isLetter = (v) => LETTER.test(String(v).trim());
const isShoe = (v) => { const m = SHOE.exec(String(v).trim()); return !!m && +m[1] >= 34 && +m[1] <= 50; };
const isOneSize = (v) => ONE_SIZE.test(String(v).trim());

// Clasifica una lista de valores. Devuelve el tipo de eje o null si no son tallas.
function classify(values) {
  const v = values.map((x) => String(x).trim()).filter(Boolean);
  if (!v.length) return null;
  if (v.every(isOneSize)) return "one";
  const letters = v.filter(isLetter).length;
  const shoes = v.filter(isShoe).length;
  // Mayoría clara: tolera que se cuele un "均码" suelto entre tallas normales.
  if (letters >= Math.ceil(v.length * 0.6)) return "letter";
  if (shoes >= Math.ceil(v.length * 0.6)) return "shoe";
  return null;
}

// attrList de la API -> { kind, values } | null
// kind: "letter" (ropa) | "shoe" (calzado) | "one" (talla única)
export function pickSizeAxis(attrList) {
  let best = null;
  for (const a of attrList || []) {
    const values = (a.attrValues || []).map((x) => x && x.attrValue).filter(Boolean);
    const kind = classify(values);
    if (!kind) continue;
    // Un eje con tallas de verdad gana siempre a uno de "talla única".
    if (!best || (best.kind === "one" && kind !== "one")) {
      best = { kind, values: values.map((s) => String(s).trim()) };
    }
  }
  return best;
}
