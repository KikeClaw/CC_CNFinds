// Auto-descubrimiento de las pestanas (tabs) de un Google Sheet publico.
// Lee la vista htmlview (accesible con "cualquiera con el enlace") y extrae
// el nombre y el gid de cada pestana desde el blob JS embebido.
// Asi el importador se adapta solo si el duenno de la hoja anade/quita tabs.

function unescapeJs(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

// Quita emojis y simbolos, deja una categoria limpia.
// "🥼Hoodies and Pants👖" -> "Hoodies and Pants"
export function cleanCategory(name) {
  return name
    .replace(/[^\p{L}\p{N}\s&\-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function discoverTabs(sheetId) {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/htmlview`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`No pude leer htmlview (HTTP ${res.status}).`);
  const html = await res.text();

  const re = /name:\s*"((?:[^"\\]|\\.)*)"[^{}]*?gid:\s*"(\d+)"/g;
  const byGid = new Map(); // gid -> name (evita duplicados)
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = unescapeJs(m[1]);
    byGid.set(m[2], name);
  }
  return [...byGid].map(([gid, name]) => ({ gid, name }));
}
