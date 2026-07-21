// Asesor de tallas. Recomienda sobre las tallas REALES que ofrece la ficha, no
// sobre una tabla genérica: si el vendedor solo llega a 3XL, hay que decirlo.
//
// En reps no se puede devolver, así que fallar de talla es dinero perdido. Por eso
// el aviso de "no hay tu talla" importa tanto como la recomendación: evita el pedido
// entero. Y por eso la respuesta lleva confianza y remite a la tabla de medidas —
// dar una talla con falsa seguridad es peor que admitir la duda.
import { structured, MODELS } from "./ai.js";

export const SIZE_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    recommended: { type: ["string", "null"] },  // una de las tallas disponibles
    alternative: { type: ["string", "null"] },  // 2ª opción (entre dos tallas)
    fits: { type: "boolean" },                  // ¿existe una talla para esta persona?
    confidence: { type: "string", enum: ["alta", "media", "baja"] },
    advice: { type: "string" },
    advice_en: { type: "string" },
  },
  required: ["recommended", "alternative", "fits", "confidence", "advice", "advice_en"],
};

const SYSTEM =
  "Eres un asesor de tallas para ropa y calzado comprado en China (Taobao/Weidian), " +
  "bilingue espanol e ingles. Las tallas chinas tallan MAS PEQUENO que las europeas o " +
  "americanas: para ropa suele hacer falta subir 1-2 tallas, y en calzado conviene ir a " +
  "la numeracion EU real del pie. " +
  "REGLAS: 'recommended' y 'alternative' deben ser EXACTAMENTE uno de los valores de la " +
  "lista de tallas disponibles, o null. Si ninguna talla le sirve (p.ej. necesitaria una " +
  "mayor que la mas grande disponible), pon fits=false, recommended=null y explica en " +
  "'advice' que busque otro producto. Si solo hay talla unica, dilo. " +
  "'confidence' es 'baja' si el usuario da poca informacion. " +
  "'advice' en espanol (2-3 frases, directo y util) y 'advice_en' lo mismo en ingles. " +
  "Recuerda SIEMPRE en el consejo que confirme con la tabla de medidas en cm de las fotos " +
  "del anuncio, porque cada vendedor chino talla distinto.";

export async function sizeAdvice({ name, category, kind, sizes, user }, { model = MODELS.fast } = {}) {
  const tipo = kind === "shoe" ? "calzado (numeracion EU)" : kind === "one" ? "talla unica" : "ropa";
  return structured({
    system: SYSTEM, model, schema: SIZE_SCHEMA, maxTokens: 500,
    prompt:
      `Producto: ${name}\n` +
      `Categoria: ${category || "?"}\n` +
      `Tipo de talla: ${tipo}\n` +
      `Tallas disponibles: ${sizes.join(", ")}\n\n` +
      `Datos del comprador: ${user}\n\n` +
      `Recomienda que talla pedir.`,
  });
}
