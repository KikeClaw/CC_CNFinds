// Renderizado server-side de paginas indexables (SEO): ficha de producto,
// landings de categoria/marca, sitemap. HTML con contenido real + meta + schema.
import { catLabel } from "./categories.js";
const AGENT_COLOR = { cnfans: "#ff5a2c", mulebuy: "#2d7ff9", kakobuy: "#18a558", oopbuy: "#8b5cf6", hoobuy: "#e11d48", superbuy: "#f59e0b", sugargoo: "#ec4899", acbuy: "#0ea5e9", cssbuy: "#14b8a6", lovegobuy: "#f43f5e", joyagoo: "#a855f7", allchinabuy: "#eab308", orientdig: "#22c55e", hipobuy: "#6366f1" };

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const eur = (p) => (p == null ? "—" : "€" + Number(p).toFixed(2));
const th = (u, w = 500, h = 500) => (u ? `${u}.webp?w=${w}&h=${h}&cp=1` : "");
export const slug = (s) => encodeURIComponent(String(s));

const L = {
  es: {
    tagline: "Catálogo W2C · fotos QC · precios de fábrica",
    footer_legal: "CNFinds es un recurso informativo independiente: no vende productos ni gestiona pagos. Todas las compras se realizan a través de agentes de terceros. © 2026 CNFinds.",
    home: "Inicio", guides: "Guías", guide: "Guía",
    choose_agent: "Elige tu agente de compra",
    note: "Precio orientativo (fábrica). El coste final incluye el envío internacional que gestiona el agente. CNFinds no vende ni procesa pagos.",
    related: "También te puede gustar", products: "productos", of: " de ",
    guias_h: "Guías W2C", guias_title: "Guías W2C — cómo comprar, agentes y fotos QC | CNFinds",
    guias_desc: "Guías para comprar productos W2C con confianza: cómo usar un agente de compras, elegir el mejor y revisar las fotos QC.",
    ld_more: "productos W2C", ld_desc: (l, n) => `Descubre ${l} en CNFinds: ${n}+ productos con fotos QC y precios de fábrica, listos para comprar vía agente (Kakobuy, Mulebuy, OOPBuy).`,
    p_desc: (n, b, price) => `${n}${b ? " de " + b : ""}, ${price}. Compra vía agente (Kakobuy, Mulebuy, OOPBuy) con CNFinds.`,
  },
  en: {
    tagline: "W2C catalog · QC photos · factory prices",
    footer_legal: "CNFinds is an independent informational resource: it does not sell products or handle payments. All purchases are made through third-party agents. © 2026 CNFinds.",
    home: "Home", guides: "Guides", guide: "Guide",
    choose_agent: "Choose your shopping agent",
    note: "Indicative price (factory). Final cost includes the international shipping handled by the agent. CNFinds does not sell or process payments.",
    related: "You might also like", products: "products", of: " by ",
    guias_h: "W2C Guides", guias_title: "W2C Guides — how to buy, agents and QC photos | CNFinds",
    guias_desc: "Guides to buy W2C products with confidence: how to use a shopping agent, choose the best one and review QC photos.",
    ld_more: "W2C products", ld_desc: (l, n) => `Discover ${l} on CNFinds: ${n}+ products with QC photos and factory prices, ready to buy via agent (Kakobuy, Mulebuy, OOPBuy).`,
    p_desc: (n, b, price) => `${n}${b ? " by " + b : ""}, ${price}. Buy via agent (Kakobuy, Mulebuy, OOPBuy) with CNFinds.`,
  },
};
const tr = (lang, k) => (L[lang] && L[lang][k] != null ? L[lang][k] : L.es[k]);

const CSS = `
:root{--bg:#fff;--soft:#f4f4f6;--surface:#fff;--ink:#0a0a0b;--muted:#77777f;--line:rgba(10,10,15,.13);--brand:#ff4d2e;--hot:#ff2d55;--radius:20px;--card-shadow:0 1px 2px rgba(10,10,20,.05),0 5px 16px rgba(10,10,20,.07);
--fd:"Bricolage Grotesque",-apple-system,system-ui,sans-serif;--ft:"Geist",-apple-system,system-ui,sans-serif}
:root[data-theme="dark"]{--bg:#08080a;--soft:#141417;--surface:#17171b;--ink:#f6f6f8;--muted:#8b8b95;--line:rgba(255,255,255,.15);--card-shadow:0 1px 2px rgba(0,0,0,.5)}
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
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;transition:.2s;display:block;box-shadow:var(--card-shadow)}
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
.guide{max-width:760px;margin:0 auto;padding-bottom:20px}
.guide h1{font-size:clamp(26px,4vw,38px);letter-spacing:-.03em;margin:18px 0 14px;line-height:1.1}
.guide h2{font-size:20px;letter-spacing:-.02em;margin:28px 0 8px}
.guide p{color:var(--ink);line-height:1.7;margin:10px 0;font-size:15.5px}
.guide ul{margin:10px 0;padding-left:20px;line-height:1.7;color:var(--ink)}
.guide li{margin:5px 0}
.guide a{color:var(--brand);text-decoration:underline}
.guide .tip{background:var(--soft);border-radius:12px;padding:14px 16px;font-size:14px;color:var(--muted)}
`;

function head({ title, desc, canonical, image, jsonld, lang = "es" }) {
  const enUrl = canonical + (canonical.includes("?") ? "&" : "?") + "lang=en";
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<link rel="alternate" hreflang="es" href="${esc(canonical)}">
<link rel="alternate" hreflang="en" href="${esc(enUrl)}">
<link rel="alternate" hreflang="x-default" href="${esc(canonical)}">
<meta property="og:type" content="website"><meta property="og:locale" content="${lang === "en" ? "en_US" : "es_ES"}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canonical)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta name="twitter:card" content="summary_large_image">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}`;
}

const shellHeader = (lang) => `<header><div class="wrap nav">
<a class="brand" href="/"><span class="m"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><circle cx="10" cy="10" r="6"/><path d="M14.5 14.5 20 20"/></svg></span><span><b>CN</b>Finds</span></a>
<span class="sp">${esc(tr(lang, "tagline"))}</span></div></header>`;

const shellFooter = (crumbs, lang) => `<footer><div class="wrap">
<div class="chips">${crumbs.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join("")}</div>
<p class="t">${esc(tr(lang, "footer_legal"))}</p>
</div></footer>`;

function doc(meta, body, crumbs = []) {
  const lang = meta.lang || "es";
  return `<!doctype html><html lang="${lang}"><head>${head(meta)}</head><body>${shellHeader(lang)}<main class="wrap">${body}</main>${shellFooter(crumbs, lang)}</body></html>`;
}

function cardHtml(p, lp = "") {
  return `<a class="card" href="/producto/${p.id}${lp}">
<div class="ph">${p.image ? `<img loading="lazy" src="${th(p.image)}" alt="${esc(p.name)}">` : ""}</div>
<div class="b"><div class="cb">${esc(p.brand || "")}</div><div class="cn">${esc(p.name)}</div><div class="cp">${eur(p.price_eur)}</div></div></a>`;
}

// --- Ficha de producto ---
export function productPage(p, related, base, lang = "es") {
  const lp = lang === "en" ? "?lang=en" : "";
  const canonical = `${base}/producto/${p.id}`;
  const imgs = p.images && p.images.length ? p.images : (p.image ? [p.image] : []);
  const pName = lang === "en" ? (p.name_en || p.name) : p.name;
  const aiDesc = lang === "en" ? (p.ai_description_en || p.ai_description) : p.ai_description;
  const qcSum = lang === "en" ? (p.qc_summary_en || p.qc_summary) : p.qc_summary;
  const title = `${pName}${p.brand ? " — " + p.brand : ""} | CNFinds`;
  const desc = (aiDesc ? aiDesc.replace(/\s+/g, " ") : tr(lang, "p_desc")(pName, p.brand, eur(p.price_eur))).slice(0, 160);
  const jsonld = {
    "@context": "https://schema.org", "@type": "Product", name: pName,
    image: imgs.slice(0, 5).map((u) => th(u, 800, 800)), category: p.category || undefined,
    brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
    description: aiDesc || undefined,
    offers: { "@type": "Offer", priceCurrency: "EUR", price: p.price_eur ?? undefined, availability: "https://schema.org/InStock", url: canonical },
    ...(p.qc_score ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.qc_score, bestRating: 10, ratingCount: 1 } } : {}),
  };
  const agents = Object.entries(p.links).map(([k, l]) =>
    `<a class="agent" href="${l.url}" target="_blank" rel="nofollow noopener"><span class="d" style="background:${AGENT_COLOR[k] || "#888"}"></span>${esc(l.name)}</a>`).join("");
  const crumbs = [{ href: "/" + lp, label: tr(lang, "home") }];
  if (p.category) crumbs.push({ href: `/categoria/${slug(p.category)}${lp}`, label: catLabel(p.category, lang) });
  if (p.brand) crumbs.push({ href: `/marca/${slug(p.brand)}${lp}`, label: p.brand });

  const body = `
<div class="crumb">${crumbs.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join(" › ")} › ${esc(pName)}</div>
<div class="prod">
  <div class="gal">
    <div class="main">${imgs[0] ? `<img src="${th(imgs[0], 820, 820)}" alt="${esc(pName)}">` : ""}</div>
    ${imgs.length > 1 ? `<div class="ts">${imgs.slice(0, 8).map((u) => `<img loading="lazy" src="${th(u, 120, 120)}" alt="">`).join("")}</div>` : ""}
  </div>
  <div>
    ${p.brand ? `<div class="pbrand"><a href="/marca/${slug(p.brand)}${lp}">${esc(p.brand)}</a></div>` : ""}
    <h1>${esc(pName)}</h1>
    ${p.qc_score ? `<div class="qc">★ QC ${p.qc_score}/10${qcSum ? " · " + esc(qcSum) : ""}</div>` : ""}
    <div class="price">${eur(p.price_eur)}</div>
    ${aiDesc ? `<div class="desc">${esc(aiDesc)}</div>` : ""}
    <div class="at">${esc(tr(lang, "choose_agent"))}</div>
    <div class="agents">${agents}</div>
    <p class="note">${esc(tr(lang, "note"))}</p>
  </div>
</div>
${related.length ? `<section><h2 class="h2">${esc(tr(lang, "related"))}</h2><div class="grid">${related.map((r) => cardHtml(r, lp)).join("")}</div></section>` : ""}`;
  return doc({ title, desc, canonical, image: imgs[0] ? th(imgs[0], 800, 800) : undefined, jsonld, lang }, body, crumbs);
}

// --- Landing de listado (categoria / marca) ---
export function listPage({ kind, name, displayLabel, items, base, crumbs, topLinks, lang = "es" }) {
  const lp = lang === "en" ? "?lang=en" : "";
  const path = `${base}/${kind}/${slug(name)}`;
  const label = displayLabel || name;
  const title = `${label} — ${items.length}+ ${tr(lang, "ld_more")} | CNFinds`;
  const desc = tr(lang, "ld_desc")(label, items.length);
  const jsonld = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: items.slice(0, 20).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/producto/${p.id}`, name: p.name })),
  };
  const body = `
<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › ${esc(label)}</div>
<section><h2 class="h2" style="font-size:28px">${esc(label)} <span style="color:var(--muted);font-weight:500;font-size:16px">· ${items.length} ${esc(tr(lang, "products"))}</span></h2>
${topLinks && topLinks.length ? `<div class="chips" style="margin-bottom:18px">${topLinks.map((c) => `<a href="${c.href}${lp}">${esc(c.label)}</a>`).join("")}</div>` : ""}
<div class="grid">${items.map((r) => cardHtml(r, lp)).join("")}</div></section>`;
  return doc({ title, desc, canonical: path, image: items[0] && items[0].image ? th(items[0].image, 800, 800) : undefined, jsonld, lang }, body, crumbs || []);
}

// --- Guías (contenido / SEO) ---
const gTitle = (g, lang) => (lang === "en" && g.title_en ? g.title_en : g.title);
const gDesc = (g, lang) => (lang === "en" && g.desc_en ? g.desc_en : g.desc);
const gBody = (g, lang) => (lang === "en" && g.body_en ? g.body_en : g.body);

export function articlePage(guide, base, lang = "es") {
  const lp = lang === "en" ? "?lang=en" : "";
  const canonical = `${base}/guia/${guide.slug}`;
  const title = gTitle(guide, lang);
  const jsonld = { "@context": "https://schema.org", "@type": "Article", headline: title, description: gDesc(guide, lang), mainEntityOfPage: canonical, inLanguage: lang };
  const body = `
<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › <a href="/guias${lp}">${esc(tr(lang, "guides"))}</a> › ${esc(title)}</div>
<article class="guide"><h1>${esc(title)}</h1>${gBody(guide, lang)}</article>`;
  return doc({ title: `${title} | CNFinds`, desc: gDesc(guide, lang), canonical, jsonld, lang }, body, [{ href: "/guias" + lp, label: tr(lang, "guides") }, { href: "/" + lp, label: tr(lang, "home") }]);
}

export function guidesIndexPage(guides, base, lang = "es") {
  const lp = lang === "en" ? "?lang=en" : "";
  const canonical = `${base}/guias`;
  const cards = guides.map((g) => `<a class="card" href="/guia/${g.slug}${lp}" style="padding:20px">
    <div style="color:var(--brand);font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.05em">${esc(tr(lang, "guide"))}</div>
    <div style="font-weight:600;font-size:16px;margin:6px 0;letter-spacing:-.02em">${esc(gTitle(g, lang))}</div>
    <div style="color:var(--muted);font-size:13px;line-height:1.5">${esc(gDesc(g, lang))}</div></a>`).join("");
  const body = `<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › ${esc(tr(lang, "guides"))}</div>
<section><h2 class="h2" style="font-size:28px">${esc(tr(lang, "guias_h"))}</h2><div class="grid">${cards}</div></section>`;
  return doc({ title: tr(lang, "guias_title"), desc: tr(lang, "guias_desc"), canonical, lang }, body, [{ href: "/" + lp, label: tr(lang, "home") }]);
}

// --- Hub de cupones y bonos de agentes ---
export function couponsPage({ agents, base, lang = "es" }) {
  const lp = lang === "en" ? "?lang=en" : "";
  const canonical = `${base}/cupones`;
  const en = lang === "en";
  const t2 = {
    h: en ? "Agent coupons & welcome bonuses" : "Cupones y bonos de bienvenida de agentes",
    intro: en
      ? "Sign-up bonuses and shipping coupons for the shopping agents we support. Some links are affiliate links — we may earn a small commission at no extra cost to you."
      : "Bonos de registro y cupones de envío de los agentes de compra que soportamos. Algunos enlaces son de afiliado: podemos recibir una pequeña comisión sin coste adicional para ti.",
    signup: en ? "Sign up & get coupons" : "Registrarse y obtener cupones",
    title: en ? "Agent coupons & bonuses — Kakobuy, ACBuy & more | CNFinds" : "Cupones y bonos de agentes — Kakobuy, ACBuy y más | CNFinds",
    note: en ? "Coupons and bonuses change often; verify the current offer on the agent's site." : "Los cupones y bonos cambian a menudo; verifica la oferta actual en la web del agente.",
  };
  const cards = agents.map((a) => `<div class="card" style="padding:22px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;align-items:center;gap:10px"><span style="width:11px;height:11px;border-radius:11px;background:${AGENT_COLOR[a.id] || "#888"}"></span><b style="font-size:18px">${esc(a.name)}</b></div>
    ${a.bonus ? `<div style="background:var(--soft);border-radius:12px;padding:10px 12px;font-size:13.5px;font-weight:600">🎁 ${esc(a.bonus)}</div>` : ""}
    ${a.coupons && a.coupons.length ? `<ul style="margin:2px 0;padding-left:18px;color:var(--muted);font-size:13.5px;line-height:1.6">${a.coupons.map((c) => `<li>${c.code ? `<code>${esc(c.code)}</code> — ` : ""}${esc(c.text)}</li>`).join("")}</ul>` : ""}
    <div style="margin-top:auto;display:flex;gap:8px;flex-wrap:wrap">
      <a class="agent" href="/agente/${a.id}${lp}" style="font-size:13px">${en ? "Guide" : "Guía"}</a>
      ${a.signup ? `<a class="agent" href="${a.signup}" target="_blank" rel="nofollow noopener" style="font-size:13px;border-color:var(--brand);color:var(--brand)">${esc(t2.signup)}</a>` : ""}
    </div>
  </div>`).join("");
  const body = `<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › ${esc(t2.h)}</div>
<section><h2 class="h2" style="font-size:28px">${esc(t2.h)}</h2>
<p style="color:var(--muted);max-width:720px;line-height:1.6;margin:0 0 18px">${esc(t2.intro)}</p>
<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${cards}</div>
<p class="note" style="margin-top:18px">${esc(t2.note)}</p></section>`;
  return doc({ title: t2.title, desc: t2.intro.slice(0, 160), canonical, lang }, body, [{ href: "/" + lp, label: tr(lang, "home") }]);
}

// --- Landing por agente ("Comprar con X") ---
export function agentLandingPage({ agent, base, lang = "es" }) {
  const lp = lang === "en" ? "?lang=en" : "";
  const en = lang === "en";
  const canonical = `${base}/agente/${agent.id}`;
  const title = en ? `How to buy with ${agent.name} (2026)` : `Cómo comprar con ${agent.name} (2026)`;
  const steps = en
    ? [
        ["Create your account", `Sign up on ${agent.name} (free) to get your dashboard and any welcome coupons.`],
        ["Add the product", `Paste any Taobao/Weidian/1688 link into our <a href="/#convertidor${lp}">converter</a> or click the ${agent.name} button on any product on CNFinds.`],
        ["Pay for the item", `Top up your balance and ${agent.name} buys it from the Chinese seller. It arrives at their warehouse in a few days.`],
        ["Review the QC photos", `Check the quality-control photos (or use our <a href="/#qccheck${lp}">AI QC Checker</a>). Request changes if needed.`],
        ["Ship to your country", `Choose a shipping line and pay international shipping. Estimate it with our <a href="/#envio${lp}">shipping calculator</a>.`],
      ]
    : [
        ["Crea tu cuenta", `Regístrate en ${agent.name} (gratis) para tener tu panel y los cupones de bienvenida.`],
        ["Añade el producto", `Pega cualquier link de Taobao/Weidian/1688 en nuestro <a href="/#convertidor${lp}">conversor</a> o pulsa el botón ${agent.name} de cualquier producto en CNFinds.`],
        ["Paga el artículo", `Recargas saldo y ${agent.name} lo compra al vendedor chino. Llega a su almacén en unos días.`],
        ["Revisa las fotos QC", `Revisa las fotos de control de calidad (o usa nuestro <a href="/#qccheck${lp}">QC Checker con IA</a>). Pide cambios si hace falta.`],
        ["Envía a tu país", `Eliges línea de envío y pagas el envío internacional. Estímalo con nuestra <a href="/#envio${lp}">calculadora de envío</a>.`],
      ];
  const pros = (agent.pros || []).map((p) => `<a class="agent" style="cursor:default">${esc(p)}</a>`).join("");
  const jsonld = {
    "@context": "https://schema.org", "@type": "HowTo", name: title,
    step: steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s[0] })),
  };
  const body = `<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › <a href="/cupones${lp}">${en ? "Agents" : "Agentes"}</a> › ${esc(agent.name)}</div>
<article class="guide">
  <h1>${esc(title)}</h1>
  ${agent.bonus ? `<p class="tip" style="background:color-mix(in srgb,var(--brand) 12%,transparent);color:var(--ink)">🎁 <b>${esc(agent.bonus)}</b></p>` : ""}
  <p>${esc(agent.desc || "")}</p>
  ${pros ? `<div class="chips" style="margin:12px 0 4px">${pros}</div>` : ""}
  <h2>${en ? `How to buy with ${agent.name}, step by step` : `Cómo comprar con ${agent.name}, paso a paso`}</h2>
  ${steps.map((s, i) => `<h3 style="margin:16px 0 4px">${i + 1}. ${esc(s[0])}</h3><p style="margin:0">${s[1]}</p>`).join("")}
  ${agent.signup ? `<p style="margin-top:22px"><a href="${agent.signup}" target="_blank" rel="nofollow noopener" class="agent" style="border-color:var(--brand);color:var(--brand);font-weight:700">${en ? `Sign up on ${agent.name}` : `Regístrate en ${agent.name}`} →</a></p>` : ""}
  <p class="note">${en ? "Some links are affiliate links; we may earn a small commission at no extra cost to you." : "Algunos enlaces son de afiliado; podemos recibir una pequeña comisión sin coste adicional para ti."}</p>
</article>`;
  return doc({ title: `${title} | CNFinds`, desc: (agent.desc || "").slice(0, 160), canonical, jsonld, lang }, body, [{ href: "/cupones" + lp, label: en ? "Agents" : "Agentes" }, { href: "/" + lp, label: tr(lang, "home") }]);
}

// --- Centro de ayuda (guía visual de todas las funciones) ---
export function helpPage({ guides, base, lang = "es" }) {
  const lp = lang === "en" ? "?lang=en" : "";
  const en = lang === "en";
  const canonical = `${base}/ayuda`;
  const t2 = {
    h: en ? "Help center" : "Centro de ayuda",
    sub: en ? "Everything you need to go from discovery to your doorstep." : "Todo lo que necesitas para pasar del descubrimiento a tu casa.",
    how: en ? "How it works" : "Cómo funciona",
    tools: en ? "Tools & features" : "Herramientas y funciones",
    guidesH: en ? "In-depth guides" : "Guías a fondo",
    title: en ? "Help center — how to buy reps step by step | CNFinds" : "Centro de ayuda — cómo comprar reps paso a paso | CNFinds",
  };
  const stepsHow = en
    ? [["1", "Search or discover", "Browse the catalog, search in natural language or upload a photo."], ["2", "Choose your agent", "Every product has agent links. The agent buys it in China for you."], ["3", "Get it at home", "Review QC photos, pay international shipping and receive it."]]
    : [["1", "Busca o descubre", "Explora el catálogo, busca en lenguaje natural o sube una foto."], ["2", "Elige tu agente", "Cada producto trae links de agente. El agente lo compra en China por ti."], ["3", "Recibe en casa", "Revisa las fotos QC, paga el envío internacional y recíbelo."]];
  const tools = en
    ? [
        ["🔎", "Natural-language & visual search", "Type what you want or upload a photo to find its match.", `/${lp}`],
        ["🔗", "Link converter", "Turn any Taobao/Weidian/1688 or agent link into your agent links.", `/#convertidor${lp}`],
        ["🛡️", "AI QC Checker", "Paste a link and the AI scores the photo quality 1–10.", `/#qccheck${lp}`],
        ["📦", "Shipping calculator", "Estimate parcel weight and shipping cost by line.", `/#envio${lp}`],
        ["🚚", "Package tracker", "Track your parcel across 1,000+ carriers.", `/#tracker${lp}`],
        ["🧩", "AI outfit builder", "Give a budget and get a full coherent outfit.", `/#fit${lp}`],
        ["🎁", "Agent coupons", "Welcome bonuses and shipping coupons per agent.", `/cupones${lp}`],
        ["❤️", "Favorites", "Save products with the heart; they stay in your browser.", `/${lp}`],
      ]
    : [
        ["🔎", "Búsqueda por IA y visual", "Escribe lo que quieres o sube una foto para encontrar su equivalente.", `/${lp}`],
        ["🔗", "Conversor de enlaces", "Convierte cualquier link de Taobao/Weidian/1688 o de agente en tus links.", `/#convertidor${lp}`],
        ["🛡️", "QC Checker con IA", "Pega un link y la IA puntúa la calidad de las fotos del 1 al 10.", `/#qccheck${lp}`],
        ["📦", "Calculadora de envío", "Estima el peso del paquete y el coste por línea.", `/#envio${lp}`],
        ["🚚", "Rastreador de paquetes", "Sigue tu paquete en más de 1.000 transportistas.", `/#tracker${lp}`],
        ["🧩", "Armador de fits con IA", "Da un presupuesto y monta un outfit completo y coherente.", `/#fit${lp}`],
        ["🎁", "Cupones de agentes", "Bonos de bienvenida y cupones de envío por agente.", `/cupones${lp}`],
        ["❤️", "Favoritos", "Guarda productos con el corazón; se quedan en tu navegador.", `/${lp}`],
      ];
  const stepCards = stepsHow.map((s) => `<div class="card" style="padding:20px"><div style="font-family:var(--fd);font-weight:800;font-size:22px;color:var(--brand)">${s[0]}</div><div style="font-weight:600;margin:6px 0 4px">${esc(s[1])}</div><div style="color:var(--muted);font-size:13.5px;line-height:1.5">${esc(s[2])}</div></div>`).join("");
  const toolCards = tools.map((tl) => `<a class="card" href="${tl[3]}" style="padding:20px;display:block"><div style="font-size:26px">${tl[0]}</div><div style="font-weight:600;margin:6px 0 4px">${esc(tl[1])}</div><div style="color:var(--muted);font-size:13.5px;line-height:1.5">${esc(tl[2])}</div></a>`).join("");
  const guideCards = (guides || []).map((g) => `<a class="card" href="/guia/${g.slug}${lp}" style="padding:18px"><div style="color:var(--brand);font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.05em">${esc(tr(lang, "guide"))}</div><div style="font-weight:600;font-size:15px;margin:6px 0">${esc(gTitle(g, lang))}</div><div style="color:var(--muted);font-size:13px;line-height:1.5">${esc(gDesc(g, lang))}</div></a>`).join("");
  const faq = en
    ? [
        ["Is CNFinds a shop?", "No. CNFinds is an independent directory. You buy through third-party shopping agents; we don't sell or process payments."],
        ["What is a shopping agent (W2C)?", "A middleman that buys a product in China (Taobao/Weidian/1688) and forwards it to your country. They mainly charge for international shipping."],
        ["What are QC photos?", "Quality-control photos the agent takes of your item before shipping. You review them and can request changes. Our AI QC Checker gives a quick indicative score."],
        ["Is it free?", "Yes, using CNFinds is free. Some agent links are affiliate links; we may earn a small commission at no extra cost to you."],
        ["Which agents do you support?", "Kakobuy, Mulebuy, OOPBuy, ACBuy, CSSBuy, Superbuy, Sugargoo and more. See the coupons page for welcome bonuses."],
      ]
    : [
        ["¿CNFinds es una tienda?", "No. CNFinds es un directorio independiente. Compras a través de agentes de terceros; no vendemos ni procesamos pagos."],
        ["¿Qué es un agente de compras (W2C)?", "Un intermediario que compra el producto en China (Taobao/Weidian/1688) y te lo reenvía. Cobran sobre todo por el envío internacional."],
        ["¿Qué son las fotos QC?", "Fotos de control de calidad que el agente hace de tu artículo antes de enviarlo. Las revisas y puedes pedir cambios. Nuestro QC Checker con IA da una puntuación orientativa rápida."],
        ["¿Es gratis?", "Sí, usar CNFinds es gratis. Algunos enlaces a agentes son de afiliado; podemos recibir una pequeña comisión sin coste adicional para ti."],
        ["¿Qué agentes soportáis?", "Kakobuy, Mulebuy, OOPBuy, ACBuy, CSSBuy, Superbuy, Sugargoo y más. Mira la página de cupones para los bonos de bienvenida."],
      ];
  const faqHtml = faq.map((f) => `<details style="border:1px solid var(--line);border-radius:12px;padding:12px 16px;margin:8px 0"><summary style="font-weight:600;cursor:pointer">${esc(f[0])}</summary><p style="color:var(--muted);line-height:1.6;margin:8px 0 0">${esc(f[1])}</p></details>`).join("");
  const jsonld = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map((f) => ({ "@type": "Question", name: f[0], acceptedAnswer: { "@type": "Answer", text: f[1] } })) };
  const body = `<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › ${esc(t2.h)}</div>
<section><h2 class="h2" style="font-size:30px">${esc(t2.h)}</h2><p style="color:var(--muted);max-width:720px;line-height:1.6;margin:-6px 0 20px">${esc(t2.sub)}</p>
<h3 style="font-size:17px;margin:8px 0 12px">${esc(t2.how)}</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-bottom:26px">${stepCards}</div>
<h3 style="font-size:17px;margin:8px 0 12px">${esc(t2.tools)}</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin-bottom:26px">${toolCards}</div>
<h3 style="font-size:17px;margin:8px 0 12px">${esc(t2.guidesH)}</h3><div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));margin-bottom:26px">${guideCards}</div>
<h3 style="font-size:17px;margin:8px 0 12px">FAQ</h3><div style="max-width:760px">${faqHtml}</div>
</section>`;
  return doc({ title: t2.title, desc: t2.sub, canonical, jsonld, lang }, body, [{ href: "/" + lp, label: tr(lang, "home") }]);
}

// --- Sitemap ---
export function sitemapXml(base, { productIds, categories, brands, guides = [], agents = [], pages = [] }) {
  const url = (loc) => `<url><loc>${loc}</loc></url>`;
  const urls = [
    url(base + "/"),
    url(base + "/guias"),
    ...pages.map((p) => url(base + p)),
    ...guides.map((g) => url(`${base}/guia/${g}`)),
    ...agents.map((a) => url(`${base}/agente/${a}`)),
    ...categories.map((c) => url(`${base}/categoria/${slug(c)}`)),
    ...brands.map((b) => url(`${base}/marca/${slug(b)}`)),
    ...productIds.map((id) => url(`${base}/producto/${id}`)),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}
