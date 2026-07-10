// Renderizado server-side de paginas indexables (SEO): ficha de producto,
// landings de categoria/marca, sitemap. HTML con contenido real + meta + schema.
const AGENT_COLOR = { cnfans: "#ff5a2c", mulebuy: "#2d7ff9", kakobuy: "#18a558", oopbuy: "#8b5cf6" };

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const eur = (p) => (p == null ? "—" : "€" + Number(p).toFixed(2));
const th = (u, w = 500, h = 500) => (u ? `${u}.webp?w=${w}&h=${h}&cp=1` : "");
export const slug = (s) => encodeURIComponent(String(s));

const CSS = `
:root{--bg:#fff;--soft:#f4f4f6;--surface:#fff;--ink:#0a0a0b;--muted:#77777f;--line:rgba(10,10,15,.09);--brand:#ff4d2e;--hot:#ff2d55;--radius:20px;
--fd:"Bricolage Grotesque",-apple-system,system-ui,sans-serif;--ft:"Geist",-apple-system,system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#08080a;--soft:#141417;--surface:#161618;--ink:#f6f6f8;--muted:#8b8b95;--line:rgba(255,255,255,.12)}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--ft);letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}h1,h2,h3,.brand{font-family:var(--fd)}
.wrap{max-width:1120px;margin:0 auto;padding:0 22px}
header{border-bottom:1px solid var(--line);position:sticky;top:0;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(16px);z-index:10}
.nav{display:flex;align-items:center;gap:20px;height:60px}
.brand{display:inline-flex;align-items:center;gap:9px;font-weight:800;font-size:20px;letter-spacing:-.04em}
.brand .m{width:28px;height:28px;border-radius:8px;background:var(--brand);display:grid;place-items:center}
.brand b{color:var(--brand)}
.nav .sp{margin-left:auto;color:var(--muted);font-size:13px}
.crumb{color:var(--muted);font-size:13px;padding:18px 0 0}.crumb a:hover{color:var(--ink)}
.prod{display:grid;grid-template-columns:1fr 1fr;gap:34px;padding:22px 0 10px}
@media(max-width:760px){.prod{grid-template-columns:1fr}}
.gal .main{aspect-ratio:1/1;background:var(--soft);border-radius:var(--radius);overflow:hidden}
.gal .main img{width:100%;height:100%;object-fit:cover}
.gal .ts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.gal .ts img{width:60px;height:60px;border-radius:10px;object-fit:cover;border:1px solid var(--line)}
.pbrand{color:var(--brand);font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.05em}
.prod h1{font-size:clamp(24px,3.4vw,34px);letter-spacing:-.03em;margin:8px 0 6px;line-height:1.1}
.price{font-family:var(--fd);font-size:30px;font-weight:700;letter-spacing:-.03em;margin:10px 0}
.qc{display:inline-flex;align-items:center;gap:7px;background:var(--soft);border-radius:999px;padding:6px 12px;font-size:13px;font-weight:600;margin:4px 0 8px}
.desc{color:var(--muted);line-height:1.6;font-size:15px;margin:10px 0 4px;white-space:pre-line}
.at{font-size:12.5px;color:var(--muted);margin:14px 0 8px}
.agents{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:6px}
.agent{display:flex;align-items:center;gap:10px;padding:13px 14px;border:1px solid var(--line);border-radius:14px;background:var(--surface);font-weight:600;font-size:14px}
.agent:hover{border-color:var(--ink)}.agent .d{width:9px;height:9px;border-radius:9px}
.note{color:var(--muted);font-size:12px;margin-top:16px;line-height:1.5}
section{padding:34px 0}.h2{font-size:22px;letter-spacing:-.03em;margin:0 0 18px;font-weight:700}
.grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;transition:.2s;display:block}
.card:hover{transform:translateY(-4px);box-shadow:0 16px 40px rgba(0,0,0,.12)}
.card .ph{aspect-ratio:1/1;background:var(--soft)}.card .ph img{width:100%;height:100%;object-fit:cover}
.card .b{padding:11px 12px 14px}.card .cb{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.card .cn{font-size:13.5px;font-weight:500;line-height:1.3;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card .cp{font-family:var(--fd);font-weight:700;margin-top:8px}
footer{border-top:1px solid var(--line);background:var(--soft);margin-top:20px;padding:30px 0}
footer .t{color:var(--muted);font-size:12px;line-height:1.6}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.chips a{font-size:12.5px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:5px 11px;background:var(--surface)}
.chips a:hover{color:var(--ink)}
`;

function head({ title, desc, canonical, image, jsonld }) {
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}`;
}

const shellHeader = `<header><div class="wrap nav">
<a class="brand" href="/"><span class="m"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/></svg></span><span><b>CN</b>Finds</span></a>
<span class="sp">Catálogo W2C · fotos QC · precios de fábrica</span></div></header>`;

const shellFooter = (crumbs) => `<footer><div class="wrap">
<div class="chips">${crumbs.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join("")}</div>
<p class="t">CNFinds es un recurso informativo independiente: no vende productos ni gestiona pagos. Todas las compras se realizan a través de agentes de terceros. © 2026 CNFinds.</p>
</div></footer>`;

function doc(meta, body, crumbs = []) {
  return `<!doctype html><html lang="es"><head>${head(meta)}</head><body>${shellHeader}<main class="wrap">${body}</main>${shellFooter(crumbs)}</body></html>`;
}

function cardHtml(p) {
  return `<a class="card" href="/producto/${p.id}">
<div class="ph">${p.image ? `<img loading="lazy" src="${th(p.image)}" alt="${esc(p.name)}">` : ""}</div>
<div class="b"><div class="cb">${esc(p.brand || "")}</div><div class="cn">${esc(p.name)}</div><div class="cp">${eur(p.price_eur)}</div></div></a>`;
}

// --- Ficha de producto ---
export function productPage(p, related, base) {
  const canonical = `${base}/producto/${p.id}`;
  const imgs = p.images && p.images.length ? p.images : (p.image ? [p.image] : []);
  const title = `${p.name}${p.brand ? " — " + p.brand : ""} | CNFinds`;
  const desc = (p.ai_description ? p.ai_description.replace(/\s+/g, " ") : `${p.name}${p.brand ? " de " + p.brand : ""}, ${eur(p.price_eur)}. Compra vía agente (Kakobuy, Mulebuy, OOPBuy) con CNFinds.`).slice(0, 160);
  const jsonld = {
    "@context": "https://schema.org", "@type": "Product", name: p.name,
    image: imgs.slice(0, 5).map((u) => th(u, 800, 800)), category: p.category || undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    description: p.ai_description || undefined,
    offers: { "@type": "Offer", priceCurrency: "EUR", price: p.price_eur ?? undefined, availability: "https://schema.org/InStock", url: canonical },
    ...(p.qc_score ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.qc_score, bestRating: 10, ratingCount: 1 } } : {}),
  };
  const agents = Object.entries(p.links).map(([k, l]) =>
    `<a class="agent" href="${l.url}" target="_blank" rel="nofollow noopener"><span class="d" style="background:${AGENT_COLOR[k] || "#888"}"></span>${esc(l.name)}</a>`).join("");
  const crumbs = [{ href: "/", label: "Inicio" }];
  if (p.category) crumbs.push({ href: `/categoria/${slug(p.category)}`, label: p.category });
  if (p.brand) crumbs.push({ href: `/marca/${slug(p.brand)}`, label: p.brand });

  const body = `
<div class="crumb">${crumbs.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join(" › ")} › ${esc(p.name)}</div>
<div class="prod">
  <div class="gal">
    <div class="main">${imgs[0] ? `<img src="${th(imgs[0], 820, 820)}" alt="${esc(p.name)}">` : ""}</div>
    ${imgs.length > 1 ? `<div class="ts">${imgs.slice(0, 8).map((u) => `<img loading="lazy" src="${th(u, 120, 120)}" alt="">`).join("")}</div>` : ""}
  </div>
  <div>
    ${p.brand ? `<div class="pbrand"><a href="/marca/${slug(p.brand)}">${esc(p.brand)}</a></div>` : ""}
    <h1>${esc(p.name)}</h1>
    ${p.qc_score ? `<div class="qc">★ QC ${p.qc_score}/10${p.qc_summary ? " · " + esc(p.qc_summary) : ""}</div>` : ""}
    <div class="price">${eur(p.price_eur)}</div>
    ${p.ai_description ? `<div class="desc">${esc(p.ai_description)}</div>` : ""}
    <div class="at">Elige tu agente de compra</div>
    <div class="agents">${agents}</div>
    <p class="note">Precio orientativo (fábrica). El coste final incluye el envío internacional que gestiona el agente. CNFinds no vende ni procesa pagos.</p>
  </div>
</div>
${related.length ? `<section><h2 class="h2">También te puede gustar</h2><div class="grid">${related.map(cardHtml).join("")}</div></section>` : ""}`;
  return doc({ title, desc, canonical, image: imgs[0] ? th(imgs[0], 800, 800) : undefined, jsonld }, body, crumbs);
}

// --- Landing de listado (categoria / marca) ---
export function listPage({ kind, name, items, base, crumbs, topLinks }) {
  const path = `${base}/${kind}/${slug(name)}`;
  const label = kind === "marca" ? name : name;
  const title = `${label} — ${items.length}+ productos W2C | CNFinds`;
  const desc = `Descubre ${label} en CNFinds: ${items.length}+ productos con fotos QC y precios de fábrica, listos para comprar vía agente (Kakobuy, Mulebuy, OOPBuy).`;
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: items.slice(0, 20).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/producto/${p.id}`, name: p.name })),
  };
  const body = `
<div class="crumb"><a href="/">Inicio</a> › ${esc(label)}</div>
<section><h2 class="h2" style="font-size:28px">${esc(label)} <span style="color:var(--muted);font-weight:500;font-size:16px">· ${items.length} productos</span></h2>
${topLinks && topLinks.length ? `<div class="chips" style="margin-bottom:18px">${topLinks.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join("")}</div>` : ""}
<div class="grid">${items.map(cardHtml).join("")}</div></section>`;
  return doc({ title, desc, canonical: path, image: items[0] && items[0].image ? th(items[0].image, 800, 800) : undefined, jsonld }, body, crumbs || []);
}

// --- Sitemap ---
export function sitemapXml(base, { productIds, categories, brands }) {
  const url = (loc) => `<url><loc>${loc}</loc></url>`;
  const urls = [
    url(base + "/"),
    ...categories.map((c) => url(`${base}/categoria/${slug(c)}`)),
    ...brands.map((b) => url(`${base}/marca/${slug(b)}`)),
    ...productIds.map((id) => url(`${base}/producto/${id}`)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}
