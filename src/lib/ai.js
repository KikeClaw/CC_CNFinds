// Cliente minimo de la API de Claude (Messages API) sin dependencias.
// Usa fetch nativo + salidas estructuradas (output_config.format json_schema).
// Requiere ANTHROPIC_API_KEY en el entorno.
//
// Modelos (configurables por env):
//   AI_MODEL       -> tareas intensivas en razonamiento (default Opus 4.8)
//   AI_MODEL_FAST  -> tareas masivas/interactivas baratas (default Haiku 4.5)
const API_URL = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export const MODELS = {
  smart: process.env.AI_MODEL || "claude-opus-4-8",
  fast: process.env.AI_MODEL_FAST || "claude-haiku-4-5",
};

export function hasKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function call(body, { timeoutMs = 60000 } = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Falta ANTHROPIC_API_KEY en el entorno.");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": key,
        "anthropic-version": VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 300)}`);
    }
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

function firstText(msg) {
  const b = (msg.content || []).find((x) => x.type === "text");
  return b ? b.text : "";
}

// Salida estructurada validada contra un JSON Schema.
export async function structured({ system, prompt, schema, model = MODELS.fast, maxTokens = 1024, images }) {
  const content = [];
  if (images) for (const img of images) {
    const m = /^data:(.*?);base64,(.*)$/s.exec(img);
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
    else content.push({ type: "image", source: { type: "url", url: img } });
  }
  content.push({ type: "text", text: prompt });
  const msg = await call({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
    output_config: { format: { type: "json_schema", schema } },
  });
  const txt = firstText(msg).trim();
  try {
    return JSON.parse(txt);
  } catch {
    const a = txt.indexOf("{"), b = txt.lastIndexOf("}");
    return JSON.parse(txt.slice(a, b + 1));
  }
}

// Texto libre (descripciones, guias de compra...).
export async function text({ system, prompt, model = MODELS.smart, maxTokens = 1500 }) {
  const msg = await call({ model, max_tokens: maxTokens, system, messages: [{ role: "user", content: prompt }] });
  return firstText(msg);
}
