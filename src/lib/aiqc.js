// Análisis QC con visión (puntuación 1-10 + notas). Reutilizado por el script
// ai:qc y por el botón "QC del catálogo" del admin.
import { structured, MODELS } from "./ai.js";

export const QC_SCHEMA = {
  type: "object", additionalProperties: false,
  properties: {
    qc_score: { type: "integer" },
    qc_summary: { type: "string" },
    qc_summary_en: { type: "string" },
    flags: { type: "array", items: { type: "string" } },
  },
  required: ["qc_score", "qc_summary", "qc_summary_en", "flags"],
};

const SYSTEM =
  "Eres un revisor de control de calidad (QC) de productos, bilingue (espanol e ingles). " +
  "Analizas las fotos reales del producto y evaluas su calidad aparente del 1 al 10 " +
  "(nitidez de logos, costuras, materiales, acabado). 'qc_summary' en espanol (1-2 frases) " +
  "y 'qc_summary_en' la misma valoracion en ingles. 'flags' = posibles defectos o senales " +
  "de baja calidad (lista corta, vacia si todo ok).";

// QC con Haiku (visión) por defecto: es una valoración sencilla (nota + resumen),
// no compensa el coste de Opus. Se puede forzar otro modelo con AI_MODEL_FAST o
// pasando { model } desde el llamador.
export async function qcOne(images, name = "", { model = MODELS.fast } = {}) {
  return structured({
    system: SYSTEM, model, schema: QC_SCHEMA, images, maxTokens: 400,
    prompt: `Producto: ${name}. Evalua la calidad segun estas fotos.`,
  });
}
