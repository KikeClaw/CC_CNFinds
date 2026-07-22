// Renderizado server-side de paginas indexables (SEO): ficha de producto,
// landings de categoria/marca, sitemap. HTML con contenido real + meta + schema.
import { catLabel } from "./categories.js";
import { GUIDES } from "./guides.js";
const AGENT_COLOR = { cnfans: "#ff5a2c", mulebuy: "#2d7ff9", kakobuy: "#18a558", oopbuy: "#8b5cf6", hoobuy: "#e11d48", superbuy: "#f59e0b", sugargoo: "#ec4899", acbuy: "#0ea5e9", cssbuy: "#14b8a6", lovegobuy: "#f43f5e", joyagoo: "#a855f7", allchinabuy: "#eab308", orientdig: "#22c55e", hipobuy: "#6366f1" };

export function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}
const eur = (p) => (p == null ? "—" : "€" + Number(p).toFixed(2));
const th = (u, w = 500, h = 500) => {
  if (!u) return "";
  if (/geilicdn|weidian/.test(u)) return `${u}.webp?w=${w}&h=${h}&cp=1`;
  // Google bloquea el embebido cross-origin (CORP same-site) → vía nuestro proxy.
  if (/sheets-images-rt/.test(u)) return "/img?u=" + encodeURIComponent(u.replace(/=w\d+(?:-h\d+)?$/, `=w${w}`));
  return u;
};
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

// BreadcrumbList JSON-LD desde una lista [{name, href}] + la página actual (sin url).
function breadcrumbLd(base, items) {
  return {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name,
      ...(it.href ? { item: base + it.href } : {}),
    })),
  };
}

const CSS = `
:root{--bg:#fff;--soft:#f4f4f6;--surface:#fff;--ink:#0a0a0b;--muted:#77777f;--line:rgba(10,10,15,.13);--brand:#ff4d2e;--hot:#ff2d55;--radius:20px;--card-shadow:0 1px 2px rgba(10,10,20,.05),0 5px 16px rgba(10,10,20,.07);
--fd:"Bricolage Grotesque",-apple-system,system-ui,sans-serif;--ft:"Geist",-apple-system,system-ui,sans-serif}
:root[data-theme="dark"]{--bg:#08080a;--soft:#141417;--surface:#17171b;--ink:#f6f6f8;--muted:#8b8b95;--line:rgba(255,255,255,.15);--card-shadow:0 1px 2px rgba(0,0,0,.5)}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--ft);letter-spacing:-.01em;-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}h1,h2,h3,.brand{font-family:var(--fd)}
.wrap{max-width:1120px;margin:0 auto;padding:0 22px}
header{border-bottom:1px solid var(--line);position:sticky;top:0;background:color-mix(in srgb,var(--bg) 78%,transparent);backdrop-filter:saturate(180%) blur(20px);z-index:10}
.nav{display:flex;align-items:center;gap:18px;height:70px}
.nav::after{content:"";flex:1 1 0}
.brand{flex:1 1 0;display:inline-flex;align-items:center;gap:12px;font-weight:800;font-size:30px;letter-spacing:-.045em}
.brand .m{width:40px;height:40px;display:inline-grid;place-items:center}
.brand b{color:var(--brand)}
.navgroups{flex:0 0 auto;display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
@media(max-width:1024px){.nav{height:auto;min-height:64px;flex-wrap:wrap;padding:10px 0}.nav::after{display:none}.brand{flex:0 0 auto}.navgroups{margin-left:auto}}
.navgroups .links{display:flex;gap:3px;background:color-mix(in srgb,var(--soft) 60%,transparent);padding:4px;border-radius:999px;border:1px solid var(--line)}
.navgroups a{padding:8px 12px;border-radius:999px;color:var(--muted);font-size:13.5px;font-weight:600;white-space:nowrap}
.navgroups a:hover{background:var(--surface);color:var(--ink)}
.navgroups a.nav-cta{color:var(--brand);font-weight:700}
.navgroups a.active{background:var(--brand);color:#fff}
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
.acmp-t{width:100%;border-collapse:collapse;margin-top:6px;font-size:13.5px}
.acmp-t th{text-align:left;color:var(--muted);font-weight:600;font-size:12px;padding:6px 10px;border-bottom:1px solid var(--line)}
.acmp-t td{padding:11px 10px;border-bottom:1px solid var(--line);vertical-align:middle}
.acmp-t td:first-child{font-weight:600;white-space:nowrap}
.acmp-t td .d{display:inline-block;width:9px;height:9px;border-radius:9px;margin-right:8px;vertical-align:middle}
.acmp-t td.bn{color:var(--muted);font-size:12.5px}
.acmp-t .buy{display:inline-block;background:var(--brand);color:#fff;font-weight:700;font-size:13px;padding:7px 14px;border-radius:10px;white-space:nowrap}
@media(max-width:560px){.acmp-t th:nth-child(3),.acmp-t td.bn{display:none}}
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

function head({ title, desc, canonical, image, jsonld, lang = "es", ogType = "website" }) {
  const esUrl = canonical;
  const enUrl = canonical + (canonical.includes("?") ? "&" : "?") + "lang=en";
  // El canonical debe ser AUTO-REFERENCIAL por idioma: la página servida en inglés
  // (?lang=en) tiene que canonicalizar a su propia URL EN, no a la española. Si no,
  // Google trata todo el inglés como duplicado del español y no lo indexa.
  const selfCanonical = lang === "en" ? enUrl : esUrl;
  return `<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(selfCanonical)}">
<link rel="alternate" hreflang="es" href="${esc(esUrl)}">
<link rel="alternate" hreflang="en" href="${esc(enUrl)}">
<link rel="alternate" hreflang="x-default" href="${esc(esUrl)}">
<meta property="og:type" content="${ogType}"><meta property="og:locale" content="${lang === "en" ? "en_US" : "es_ES"}"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(selfCanonical)}">
${image ? `<meta property="og:image" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(image)}">` : ""}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Geist:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}`;
}

const shellNav = (lang, active) => {
  const en = lang === "en", lp = en ? "?lang=en" : "";
  const A = (t, h, cta) => { const p = h.split("?")[0]; const c = ((p === active ? "active " : "") + (cta ? "nav-cta" : "")).trim(); return `<a href="${h}"${c ? ` class="${c}"` : ""}>${esc(t)}</a>`; };
  return `<div class="navgroups">
<div class="links">${A(en ? "Home" : "Inicio", "/")}${A(en ? "Catalog" : "Catálogo", "/productos", true)}${A(en ? "Categories" : "Categorías", "/#categorias")}${A(en ? "Brands" : "Marcas", "/#marcas")}</div>
<div class="links">${A(en ? "AI Tools" : "Herramientas IA", "/herramientas")}${A(en ? "Coupons" : "Cupones", "/cupones" + lp)}${A(en ? "Help" : "Ayuda", "/ayuda" + lp)}</div>
</div>`;
};
const shellHeader = (lang, active) => `<header><div class="wrap nav">
<a class="brand" href="/"><span class="m"><svg viewBox="0 0 32 32" width="40" height="40"><defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff6a3d"/><stop offset="1" stop-color="#ff2e63"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#hg)"/><g fill="none" stroke="#fff" stroke-width="3.3" stroke-linecap="round"><path d="M19.24 19.56 A6.6 6.6 0 1 1 21.57 13.81"/><path d="M19.24 19.56 L23.9 25"/></g></svg></span><span><b>CN</b>Finds</span></a>
${shellNav(lang, active)}</div></header>`;

const shellFooter = (crumbs, lang) => `<footer><div class="wrap">
<div class="chips">${crumbs.map((c) => `<a href="${c.href}">${esc(c.label)}</a>`).join("")}</div>
<p class="t">${esc(tr(lang, "footer_legal"))}</p>
</div></footer>`;

function doc(meta, body, crumbs = []) {
  const lang = meta.lang || "es";
  const active = (meta.canonical || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0] || "/";
  return `<!doctype html><html lang="${lang}"><head>${head(meta)}</head><body>${shellHeader(lang, active)}<main class="wrap">${body}</main>${shellFooter(crumbs, lang)}</body></html>`;
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
    // Sin aggregateRating: la nota QC es NUESTRA valoración interna, no reseñas de
    // usuarios. Marcarla como AggregateRating (ratingCount:1) es "rating auto-servido"
    // que Google penaliza (acción manual "ratings not from users") y además se vería
    // como ~2 estrellas (4/10). La insignia ★ QC sigue en la página, sin schema.
  };
  const en = lang === "en";
  const bonusTxt = (l) => (l.bonus ? (en ? l.bonus.en || l.bonus.es : l.bonus.es) : "");
  const rows = Object.entries(p.links).map(([k, l]) =>
    `<tr><td><span class="d" style="background:${AGENT_COLOR[k] || "#888"}"></span>${esc(l.name)}${l.badge ? `<span style="display:inline-block;background:#ff4d2e;color:#fff;font-size:10px;font-weight:800;line-height:1;padding:3px 6px;border-radius:6px;margin-left:7px;vertical-align:middle">★ ${l.badge === "chosen" ? (en ? "Most chosen" : "Más elegido") : (en ? "Recommended" : "Recomendado")}</span>` : ""}</td><td>${l.cashback ? esc(l.cashback) : "—"}</td><td class="bn">${esc(bonusTxt(l)) || "—"}</td><td><a class="buy" href="${l.url}" target="_blank" rel="nofollow noopener" data-agent="${esc(k)}" data-pid="${p.id}">${en ? "Buy" : "Comprar"} →</a></td></tr>`).join("");
  const agents = Object.keys(p.links).length
    ? `<table class="acmp-t"><thead><tr><th>${en ? "Agent" : "Agente"}</th><th>Cashback</th><th>${en ? "Welcome bonus" : "Bono de bienvenida"}</th><th></th></tr></thead><tbody>${rows}</tbody></table>`
    : `<p class="note">${en ? "No agents enabled yet." : "Aún no hay agentes activos."}</p>`;
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
${related.length ? `<section><h2 class="h2">${esc(tr(lang, "related"))}${en ? " — compare versions" : " — compara versiones"}</h2><div class="grid">${related.map((r) => cardHtml(r, lp)).join("")}</div></section>` : ""}
<section style="max-width:540px">
  <h2 class="h2" style="font-size:19px">🔔 ${en ? "Price drop alert" : "Alerta de bajada de precio"}</h2>
  <p style="color:var(--muted);font-size:14px;margin:-8px 0 12px">${en ? "We'll notify you if this drops below your target price." : "Te avisamos si baja de tu precio objetivo."}</p>
  <form id="pa" style="display:flex;gap:8px;flex-wrap:wrap">
    <input id="paEmail" type="email" required placeholder="${en ? "you@email.com" : "tu@email.com"}" style="flex:1;min-width:180px;padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink)">
    <input id="paTarget" type="number" min="1" step="0.01" required placeholder="€ ${en ? "target" : "objetivo"}" style="width:130px;padding:11px 13px;border:1px solid var(--line);border-radius:12px;background:var(--surface);color:var(--ink)">
    <button type="submit" style="background:var(--brand);color:#fff;font-weight:700;border:0;border-radius:12px;padding:11px 20px;cursor:pointer">${en ? "Alert me" : "Avísame"}</button>
  </form>
  <div id="paMsg" style="font-size:14px;margin-top:10px"></div>
</section>
<script>
(function(){
  var PID=${p.id};
  document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a[data-agent]");if(a){try{navigator.sendBeacon("/api/track",new Blob([JSON.stringify({product_id:a.getAttribute("data-pid")?+a.getAttribute("data-pid"):null,agent:a.getAttribute("data-agent")})],{type:"application/json"}))}catch(_){}}},true);
  var f=document.getElementById("pa");
  if(f)f.addEventListener("submit",function(e){e.preventDefault();var m=document.getElementById("paMsg");var email=document.getElementById("paEmail").value.trim();var target=parseFloat(document.getElementById("paTarget").value);fetch("/api/price-alert",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({email:email,product_id:PID,target_eur:target})}).then(function(r){return r.json()}).then(function(d){m.style.color=d.ok?"#16a34a":"#ff4d2e";m.textContent=d.ok?(${en ? '"Done! We\'ll alert you ✓"' : '"¡Listo! Te avisaremos ✓"'}):(d.error||"Error");if(d.ok)f.reset();}).catch(function(){m.style.color="#ff4d2e";m.textContent="Error";});});
})();
</script>`;
  const bc = breadcrumbLd(base, [...crumbs.map((c) => ({ name: c.label, href: c.href })), { name: pName }]);
  return doc({ title, desc, canonical, image: imgs[0] ? th(imgs[0], 800, 800) : undefined, jsonld: [jsonld, bc], lang, ogType: "product" }, body, crumbs);
}

// --- Landing de listado (categoria / marca) ---
export function listPage({ kind, name, displayLabel, items, base, crumbs, topLinks, lang = "es" }) {
  const lp = lang === "en" ? "?lang=en" : "";
  const path = `${base}/${kind}/${slug(name)}`;
  const label = displayLabel || name;
  const en = lang === "en";
  const isBrand = kind === "marca";
  // Precio mínimo real (señal "desde €X" + más contenido para SEO).
  const prices = items.map((p) => p.price_eur).filter((x) => x != null && x > 0);
  const minP = prices.length ? Math.min(...prices) : null;
  // H1/título orientados a la búsqueda real ("mejores {X} reps").
  const h1 = en ? `Best ${label} reps` : `Mejores réplicas de ${label}`;
  const title = en
    ? `Best ${label} reps 2026 · ${items.length}+ QC finds | CNFinds`
    : `Mejores réplicas de ${label} 2026 · ${items.length}+ finds con QC | CNFinds`;
  const desc = isBrand
    ? (en ? `Best ${label} reps 2026: ${items.length}+ finds with real QC photos${minP ? `, from €${minP.toFixed(0)}` : ""}. Buy via a trusted agent — compare and checkout with confidence on CNFinds.`
          : `Mejores réplicas de ${label} 2026: ${items.length}+ finds con fotos QC reales${minP ? `, desde €${minP.toFixed(0)}` : ""}. Compra vía agente fiable — compara y compra con confianza en CNFinds.`)
    : (en ? `Best ${label} reps 2026: ${items.length}+ finds with QC photos and factory prices${minP ? `, from €${minP.toFixed(0)}` : ""}, ready to buy via a shopping agent on CNFinds.`
          : `Mejores ${label} reps 2026: ${items.length}+ finds con fotos QC y precios de fábrica${minP ? `, desde €${minP.toFixed(0)}` : ""}, listos para comprar vía agente en CNFinds.`);
  const intro = isBrand
    ? (en ? `Discover ${items.length}+ <b>${esc(label)}</b> replica finds with real QC photos and factory prices${minP ? `, from <b>€${minP.toFixed(0)}</b>` : ""}. Buy through a trusted shopping agent (Kakobuy, Mulebuy, ACBuy…) — CNFinds regenerates every link, checks quality with AI and lets you compare agents so you checkout with confidence.`
          : `Descubre ${items.length}+ finds de <b>${esc(label)}</b> con fotos QC reales y precios de fábrica${minP ? `, desde <b>€${minP.toFixed(0)}</b>` : ""}. Compra a través de un agente fiable (Kakobuy, Mulebuy, ACBuy…) — CNFinds regenera cada enlace, revisa la calidad con IA y te deja comparar agentes para comprar con confianza.`)
    : (en ? `Browse ${items.length}+ <b>${esc(label)}</b> finds with QC photos and factory prices${minP ? `, from <b>€${minP.toFixed(0)}</b>` : ""}, ready to buy via a shopping agent. Use our AI QC Checker and shipping calculator to buy smarter on CNFinds.`
          : `Explora ${items.length}+ finds de <b>${esc(label)}</b> con fotos QC y precios de fábrica${minP ? `, desde <b>€${minP.toFixed(0)}</b>` : ""}, listos para comprar vía agente. Usa nuestro QC Checker con IA y la calculadora de envío para comprar mejor en CNFinds.`);
  // FAQ (rich snippets) + enlaces internos a guías.
  const explore = isBrand ? `/productos?brands=${encodeURIComponent(name)}` : `/productos?cats=${encodeURIComponent(name)}`;
  const faqs = en
    ? [
        [`How do I buy ${label} reps?`, `Find the product here, then click a shopping agent (Kakobuy, Mulebuy…) on the listing — we regenerate the link so the agent buys it in China and forwards it to you. Full steps in our <a href="/guia/como-comprar-en-weidian?lang=en">buying guide</a>.`],
        [`Are ${label} reps good quality?`, `It depends on the batch. Always review the <a href="/guia/fotos-qc?lang=en">QC photos</a> and our AI quality score before shipping. See <a href="/guia/mejor-batch?lang=en">how to choose the best batch</a>.`],
        [`Which agent is best for ${label}?`, `Compare bonuses, cashback and shipping on our <a href="/agentes?lang=en">agent comparison</a>. Kakobuy is a solid starting point.`],
      ]
    : [
        [`¿Cómo comprar réplicas de ${label}?`, `Busca el producto aquí y pulsa un agente (Kakobuy, Mulebuy…) en la ficha — regeneramos el enlace para que el agente lo compre en China y te lo reenvíe. Pasos completos en nuestra <a href="/guia/como-comprar-en-weidian">guía de compra</a>.`],
        [`¿Son de buena calidad las réplicas de ${label}?`, `Depende del batch. Revisa siempre las <a href="/guia/fotos-qc">fotos QC</a> y nuestra puntuación de calidad con IA antes de enviar. Mira <a href="/guia/mejor-batch">cómo elegir el mejor batch</a>.`],
        [`¿Qué agente es mejor para ${label}?`, `Compara bonos, cashback y envío en nuestra <a href="/agentes">comparativa de agentes</a>. Kakobuy es un buen punto de partida.`],
      ];
  const faqHtml = `<section style="margin-top:34px"><h2 class="h2" style="font-size:22px">${en ? "FAQ" : "Preguntas frecuentes"}</h2>${faqs.map(([q, a]) => `<h3 style="margin:16px 0 4px;font-size:16px">${esc(q)}</h3><p style="margin:0;color:var(--muted);line-height:1.6">${a}</p>`).join("")}</section>`;
  const itemList = {
    "@context": "https://schema.org", "@type": "ItemList",
    itemListElement: items.slice(0, 20).map((p, i) => ({ "@type": "ListItem", position: i + 1, url: `${base}/producto/${p.id}`, name: p.name })),
  };
  const faqLd = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faqs.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a.replace(/<[^>]+>/g, "") } })),
  };
  const body = `
<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › ${esc(label)}</div>
<section><h1 class="h2" style="font-size:28px;margin-top:6px">${esc(h1)} <span style="color:var(--muted);font-weight:500;font-size:16px">· ${items.length} ${esc(tr(lang, "products"))}</span></h1>
<p style="color:var(--muted);max-width:780px;line-height:1.6;margin:-2px 0 14px">${intro}</p>
<p style="margin:0 0 16px"><a class="agent" href="${explore}" style="border-color:var(--brand);color:var(--brand);font-weight:700">${en ? `Filter all ${label} →` : `Filtrar todo ${label} →`}</a></p>
${topLinks && topLinks.length ? `<div class="chips" style="margin-bottom:18px">${topLinks.map((c) => `<a href="${c.href}${lp}">${esc(c.label)}</a>`).join("")}</div>` : ""}
<div class="grid">${items.map((r) => cardHtml(r, lp)).join("")}</div></section>
${faqHtml}`;
  const bc = breadcrumbLd(base, [{ name: tr(lang, "home"), href: "/" + lp }, { name: label }]);
  return doc({ title, desc, canonical: path, image: items[0] && items[0].image ? th(items[0].image, 800, 800) : undefined, jsonld: [itemList, bc, faqLd], lang }, body, crumbs || []);
}

// --- Cuerpos auto-contenidos para inyectar en la SPA (mantienen navbar+footer) ---
// Estilos inline con las variables del sitio, sin depender de clases de la SPA.
export function couponsBody(agents, base, lang = "es") {
  const en = lang === "en", lp = en ? "?lang=en" : "";
  const t = {
    h: en ? "Agent coupons & welcome bonuses" : "Cupones y bonos de bienvenida",
    intro: en ? "Sign-up bonuses and shipping coupons for the shopping agents we support. Some links are affiliate links — we may earn a small commission at no extra cost to you." : "Bonos de registro y cupones de envío de los agentes de compra que soportamos. Algunos enlaces son de afiliado: podemos recibir una pequeña comisión sin coste adicional para ti.",
    signup: en ? "Sign up" : "Registrarse", guide: en ? "Guide" : "Guía",
    note: en ? "Coupons change often; verify the current offer on the agent's site." : "Los cupones cambian a menudo; verifica la oferta actual en la web del agente.",
  };
  const cards = agents.map((a) => `<div style="background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:10px">
    <div style="display:flex;align-items:center;gap:10px"><span style="width:11px;height:11px;border-radius:11px;background:${AGENT_COLOR[a.id] || "#888"}"></span><b style="font-size:17px">${esc(a.name)}</b>${a.cashback ? `<span style="margin-left:auto;font-size:12px;font-weight:700;color:var(--brandc)">${esc(a.cashback)}</span>` : ""}</div>
    ${a.bonus ? `<div style="background:var(--soft);border-radius:12px;padding:10px 12px;font-size:13.5px;font-weight:600">🎁 ${esc(a.bonus)}</div>` : ""}
    ${a.coupons && a.coupons.length ? `<ul style="margin:2px 0;padding-left:18px;color:var(--muted);font-size:13.5px;line-height:1.6">${a.coupons.map((c) => `<li>${c.code ? `<code>${esc(c.code)}</code> — ` : ""}${esc(c.text)}</li>`).join("")}</ul>` : ""}
    <div style="margin-top:auto;display:flex;gap:8px;flex-wrap:wrap">
      <a href="/agente/${a.id}${lp}" style="border:1px solid var(--line);border-radius:10px;padding:7px 12px;font-size:13px;font-weight:600">${esc(t.guide)}</a>
      ${a.signup ? `<a href="${a.signup}" target="_blank" rel="nofollow noopener" style="border:1px solid var(--brand);color:var(--brand);border-radius:10px;padding:7px 12px;font-size:13px;font-weight:700">${esc(t.signup)} →</a>` : ""}
    </div></div>`).join("");
  return `<div style="padding-top:24px">
  <div style="color:var(--muted);font-size:13px;margin-bottom:10px"><a href="/${lp}" style="color:var(--muted)">${esc(tr(lang, "home"))}</a> › ${esc(t.h)}</div>
  <h1 style="font-family:var(--fd);font-size:32px;margin:0 0 8px;letter-spacing:-.03em">${esc(t.h)}</h1>
  <p style="color:var(--muted);max-width:700px;line-height:1.6;margin:0 0 22px">${esc(t.intro)}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px">${cards}</div>
  <p style="color:var(--muted);font-size:13px;margin-top:20px">${esc(t.note)}</p></div>`;
}

export function helpBody(guides, base, lang = "es") {
  const en = lang === "en", lp = en ? "?lang=en" : "";
  const t = {
    h: en ? "Help center" : "Centro de ayuda",
    sub: en ? "Everything you need to go from discovery to your doorstep." : "Todo lo que necesitas para pasar del descubrimiento a tu casa.",
    gH: en ? "In-depth guides" : "Guías a fondo", faqH: en ? "Quick FAQ" : "Preguntas rápidas", all: en ? "All guides →" : "Todas las guías →",
  };
  const links = [
    [en ? "AI Tools" : "Herramientas IA", "/herramientas", en ? "Link converter, AI QC, outfit builder, visual search, shipping calculator." : "Conversor de enlaces, QC con IA, armador de outfits, búsqueda visual y calculadora de envío."],
    [en ? "Favorites & haul" : "Favoritos y haul", "/favoritos", en ? "Save finds with the ♥ and open them all in your agent at once — build your haul in one click." : "Guarda finds con el ♥ y ábrelos todos en tu agente de una vez — monta tu haul en un clic."],
    [en ? "Guides" : "Guías", "/guias" + lp, en ? "How to buy, choosing an agent, QC photos, batches, saving money." : "Cómo comprar, elegir agente, fotos QC, batches y ahorrar."],
    [en ? "Coupons & bonuses" : "Cupones y bonos", "/cupones" + lp, en ? "Welcome bonuses and shipping coupons for every agent." : "Bonos de bienvenida y cupones de envío de cada agente."],
    [en ? "Agent comparison" : "Comparativa de agentes", "/agentes" + lp, en ? "Compare bonuses, cashback and shipping side by side." : "Compara bonos, cashback y envío en paralelo."],
  ];
  const cards = links.map(([tt, h, d]) => `<a href="${h}" style="background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:20px;display:block"><b style="font-size:16px">${esc(tt)}</b><div style="color:var(--muted);font-size:13.5px;margin-top:6px;line-height:1.55">${esc(d)}</div></a>`).join("");
  const gl = guides.slice(0, 8).map((g) => `<a href="/guia/${g.slug}${lp}" style="color:var(--brandc);font-size:14px;display:block;margin:7px 0">${esc(en && g.title_en ? g.title_en : g.title)} →</a>`).join("");
  const faqs = en
    ? [["How do I buy?", "Find a product, click a shopping agent — it buys it in China and forwards it to you."], ["How do I buy several items at once (a haul)?", "Save them with the ♥, open Favorites, pick your agent and hit 'Open all' — it opens each item converted to your agent so you build your haul fast. If the browser blocks the tabs, allow pop-ups for the site."], ["Is it safe and legal?", "Buying for personal use is generally fine in most countries; use reputable agents and review QC photos before shipping."], ["What are QC photos?", "Real photos of your item at the agent's warehouse before shipping — review them to avoid surprises."]]
    : [["¿Cómo compro?", "Busca un producto y pulsa un agente: lo compra en China y te lo reenvía."], ["¿Cómo compro varios a la vez (un haul)?", "Guárdalos con el ♥, abre Favoritos, elige tu agente y pulsa 'Abrir todos' — abre cada producto convertido a tu agente para montar el haul rápido. Si el navegador bloquea las pestañas, permite las ventanas emergentes."], ["¿Es seguro y legal?", "Comprar para uso personal no suele perseguirse; usa agentes reputados y revisa las fotos QC antes de enviar."], ["¿Qué son las fotos QC?", "Fotos reales de tu producto en el almacén del agente antes de enviar — revísalas para evitar sorpresas."]];
  return `<div style="padding-top:24px">
  <div style="color:var(--muted);font-size:13px;margin-bottom:10px"><a href="/${lp}" style="color:var(--muted)">${esc(tr(lang, "home"))}</a> › ${esc(t.h)}</div>
  <h1 style="font-family:var(--fd);font-size:32px;margin:0 0 6px;letter-spacing:-.03em">${esc(t.h)}</h1>
  <p style="color:var(--muted);max-width:680px;line-height:1.6;margin:0 0 22px">${esc(t.sub)}</p>
  <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;margin-bottom:30px">${cards}</div>
  <h2 style="font-family:var(--fd);font-size:22px;margin:0 0 10px">${esc(t.gH)}</h2>${gl}<a href="/guias${lp}" style="color:var(--brandc);font-size:14px;font-weight:700;display:block;margin-top:8px">${esc(t.all)}</a>
  <h2 style="font-family:var(--fd);font-size:22px;margin:30px 0 6px">${esc(t.faqH)}</h2>${faqs.map(([q, a]) => `<h3 style="font-size:16px;margin:16px 0 3px">${esc(q)}</h3><p style="color:var(--muted);line-height:1.6;margin:0">${esc(a)}</p>`).join("")}</div>`;
}

// --- Guías (contenido / SEO) ---
const gTitle = (g, lang) => (lang === "en" && g.title_en ? g.title_en : g.title);
const gDesc = (g, lang) => (lang === "en" && g.desc_en ? g.desc_en : g.desc);
const gBody = (g, lang) => (lang === "en" && g.body_en ? g.body_en : g.body);

export function articlePage(guide, base, lang = "es") {
  const lp = lang === "en" ? "?lang=en" : "";
  const en = lang === "en";
  const canonical = `${base}/guia/${guide.slug}`;
  const title = gTitle(guide, lang);
  const jsonld = { "@context": "https://schema.org", "@type": "Article", headline: title, description: gDesc(guide, lang), mainEntityOfPage: canonical, inLanguage: lang };
  // Guías relacionadas (3 siguientes, en bucle): enlace interno + retención.
  const others = GUIDES.filter((g) => g.slug !== guide.slug);
  const start = Math.max(0, others.findIndex((g) => g.slug > guide.slug));
  const related = [...others.slice(start), ...others.slice(0, start)].slice(0, 3);
  const relatedHtml = related.length ? `<section style="margin-top:36px;border-top:1px solid var(--line);padding-top:20px">
    <h2 class="h2" style="font-size:18px">${en ? "Related guides" : "Guías relacionadas"}</h2>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px">${related.map((g) => `<a class="card" href="/guia/${g.slug}${lp}" style="padding:16px"><div style="font-weight:600;font-size:15px;margin-bottom:4px">${esc(gTitle(g, lang))}</div><div style="color:var(--muted);font-size:13px;line-height:1.5">${esc(gDesc(g, lang).slice(0, 90))}…</div></a>`).join("")}</div>
  </section>` : "";
  const body = `
<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › <a href="/guias${lp}">${esc(tr(lang, "guides"))}</a> › ${esc(title)}</div>
<article class="guide"><h1>${esc(title)}</h1>${gBody(guide, lang)}</article>
${relatedHtml}`;
  return doc({ title: `${title} | CNFinds`, desc: gDesc(guide, lang), canonical, jsonld, lang, ogType: "article" }, body, [{ href: "/guias" + lp, label: tr(lang, "guides") }, { href: "/" + lp, label: tr(lang, "home") }]);
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

// --- Comparativa de agentes (tabla, /agentes) ---
export function agentsComparePage({ agents, base, lang = "es" }) {
  const lp = lang === "en" ? "?lang=en" : "";
  const en = lang === "en";
  const canonical = `${base}/agentes`;
  const t2 = {
    h: en ? "Shopping agent comparison (2026)" : "Comparativa de agentes de compra (2026)",
    intro: en
      ? "Compare the shopping agents we support side by side — welcome bonuses, strengths and how to sign up. Some links are affiliate links; we may earn a small commission at no extra cost to you."
      : "Compara en paralelo los agentes de compra que soportamos: bonos de bienvenida, puntos fuertes y cómo registrarte. Algunos enlaces son de afiliado; podemos recibir una pequeña comisión sin coste adicional para ti.",
    title: en ? "Shopping agent comparison 2026 — Kakobuy, Mulebuy, ACBuy & more | CNFinds" : "Comparativa de agentes 2026 — Kakobuy, Mulebuy, ACBuy y más | CNFinds",
    a: en ? "Agent" : "Agente", bonus: en ? "Welcome bonus" : "Bono de bienvenida",
    cash: "Cashback", pros: en ? "Strengths" : "Puntos fuertes", act: en ? "Actions" : "Acciones",
    guide: en ? "Guide" : "Guía", signup: en ? "Sign up" : "Registrarse",
    note: en ? "Bonuses change often; verify the current offer on the agent's site." : "Los bonos cambian a menudo; verifica la oferta actual en la web del agente.",
    lead: en ? "New to agents? Read " : "¿Nuevo con los agentes? Lee ",
    l1: en ? "what a W2C agent is" : "qué es un agente W2C", l2: en ? "best agents 2026" : "los mejores agentes 2026",
    seeCoupons: en ? "See all coupons" : "Ver todos los cupones", browse: en ? "Browse the catalog" : "Explorar el catálogo",
  };
  const td = "padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top";
  const rows = agents.map((a) => `<tr>
    <td style="${td};white-space:nowrap"><span style="display:inline-block;width:10px;height:10px;border-radius:10px;background:${AGENT_COLOR[a.id] || "#888"};margin-right:7px"></span><b>${esc(a.name)}</b></td>
    <td style="${td}">${a.bonus ? "🎁 " + esc(a.bonus) : "—"}</td>
    <td style="${td}">${a.cashback ? "<b>" + esc(a.cashback) + "</b>" : "—"}</td>
    <td style="${td};color:var(--muted);font-size:13px">${(a.pros || []).slice(0, 3).map(esc).join(" · ") || "—"}</td>
    <td style="${td};white-space:nowrap"><a href="/agente/${a.id}${lp}" style="color:var(--brandc)">${esc(t2.guide)}</a>${a.signup ? ` · <a href="${a.signup}" target="_blank" rel="nofollow noopener" style="color:var(--brand);font-weight:700">${esc(t2.signup)}</a>` : ""}</td>
  </tr>`).join("");
  const body = `<div class="crumb"><a href="/${lp}">${esc(tr(lang, "home"))}</a> › ${esc(t2.h)}</div>
<section><h1 class="h2" style="font-size:28px;margin-top:6px">${esc(t2.h)}</h1>
<p style="color:var(--muted);max-width:760px;line-height:1.6;margin:0 0 8px">${esc(t2.intro)}</p>
<p style="margin:0 0 18px">${esc(t2.lead)}<a href="/guia/guia-agentes${lp}" style="color:var(--brandc)">${esc(t2.l1)}</a> · <a href="/guia/mejores-agentes-2026${lp}" style="color:var(--brandc)">${esc(t2.l2)}</a>.</p>
<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14px"><thead><tr>${[t2.a, t2.bonus, t2.cash, t2.pros, t2.act].map((h) => `<th style="text-align:left;padding:10px 12px;border-bottom:2px solid var(--line);white-space:nowrap">${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
<p class="note" style="margin-top:16px">${esc(t2.note)}</p>
<p style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap"><a class="agent" href="/cupones${lp}">${esc(t2.seeCoupons)}</a><a class="agent" href="/productos">${esc(t2.browse)}</a></p></section>`;
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
        ["🔔", "Price drop alerts", "Open any product and set a target — we'll ping you if it drops.", `/${lp}`],
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
        ["🔔", "Alertas de precio", "Abre un producto y fija tu objetivo — te avisamos si baja.", `/${lp}`],
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
