// Análisis QC con visión (puntuación 1-10 + notas). Reutilizado por el script
// ai:qc y por el botón "QC del catálogo" del admin.
import { structured, MODELS } from "./ai.js";

export const QC_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    qc_score: { type: "integer" },
    qc_summary: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
  required: ["qc_score", "qc_summary", "flags"],
};

const SYSTEM =
  "Eres un revisor de control de calidad (QC) de productos. Analizas las fotos reales " +
  "del producto y evaluas su calidad aparente del 1 al 10 (nitidez de logos, costuras, " +
  "materiales, acabado). 'qc_summary' en espanol, 1-2 frases. 'flags' = posibles " +
  "defectos o senales de baja calidad (lista corta, vacia si todo ok).";

export async function qcOne(images, name = "") {
  return structured({
    system: SYSTEM, model: MODELS.smart, schema: QC_SCHEMA, images, maxTokens: 400,
    prompt: `Producto: ${name}. Evalua la calidad segun estas fotos.`,
  });
}
