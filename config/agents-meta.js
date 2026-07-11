// Metadatos de marketing por agente (bilingüe): descripción, ventajas, bono de
// bienvenida, URL de registro (con TU código) y cupones. Alimenta el hub de
// cupones (/cupones), las landings por agente (/agente/:id) y la Ayuda.
//
// NOTA: los cupones y bonos cambian a menudo; edítalos aquí. Las URLs de registro
// usan tu código de afiliado. VERIFICA el formato en el panel de cada agente.

import { AFFILIATE_CODES, isPlaceholder } from "./agents.js";

// Plantillas de registro por agente (con tu código). VERIFICAR al activar.
const SIGNUP = {
  kakobuy: (c) => `https://ikako.vip/r/${c}`,
  mulebuy: (c) => `https://mulebuy.com/register?ref=${c}`,
  oopbuy: (c) => `https://oopbuy.com/register?inviteCode=${c}`,
  hoobuy: (c) => `https://hoobuy.com/register?inviteCode=${c}`,
  superbuy: (c) => `https://www.superbuy.com/en/page/login/?partnercode=${c}`,
  sugargoo: (c) => `https://www.sugargoo.com/#/register?memberId=${c}`,
  acbuy: (c) => `https://www.acbuy.com/register?u=${c}`,
  cssbuy: (c) => `https://www.cssbuy.com/register?promotionCode=${c}`,
  lovegobuy: (c) => `https://www.lovegobuy.com/register?invite_code=${c}`,
  joyagoo: (c) => `https://www.joyagoo.com/register?ref=${c}`,
  allchinabuy: (c) => `https://www.allchinabuy.com/en/page/register?partnercode=${c}`,
  orientdig: (c) => `https://orientdig.com/register?ref=${c}`,
  hipobuy: (c) => `https://hipobuy.com/register?ref=${c}`,
};

// Contenido por agente. `bonus`, `desc`, `pros`, `coupons` son bilingües.
export const AGENT_META = {
  kakobuy: {
    cashback: "3.5–7.5%",
    bonus: { es: "Hasta $500 en cupones de bienvenida al registrarte", en: "Up to $500 in welcome coupons on sign-up" },
    desc: {
      es: "Agente fiable y muy popular: control de calidad (QC) gratis, soporta Weidian/Taobao/1688 y ofrece buenas líneas de envío. Bonificación de afiliado del 3,5–7,5% sin tope.",
      en: "Reliable and very popular agent: free quality control (QC), supports Weidian/Taobao/1688 and good shipping lines. 3.5–7.5% affiliate cashback with no cap.",
    },
    pros: { es: ["Fotos QC gratis", "Soporta Weidian/Taobao/1688", "Muchas líneas de envío", "App móvil"], en: ["Free QC photos", "Supports Weidian/Taobao/1688", "Many shipping lines", "Mobile app"] },
    coupons: [
      { code: "WELCOME", text: { es: "Pack de cupones de bienvenida (hasta $500) al crear la cuenta", en: "Welcome coupon pack (up to $500) when you create your account" } },
    ],
  },
  mulebuy: {
    bonus: { es: "Pack de cupones de envío para nuevos usuarios", en: "Shipping coupon pack for new users" },
    desc: { es: "Agente de la familia CNFans con interfaz limpia, QC y cupones de envío frecuentes.", en: "CNFans-family agent with a clean interface, QC and frequent shipping coupons." },
    pros: { es: ["Interfaz limpia", "Cupones de envío", "QC"], en: ["Clean interface", "Shipping coupons", "QC"] },
    coupons: [{ code: "NEW", text: { es: "Cupones de envío al registrarte", en: "Shipping coupons on sign-up" } }],
  },
  oopbuy: {
    bonus: { es: "Cupones de bienvenida y descuentos de envío", en: "Welcome coupons and shipping discounts" },
    desc: { es: "Agente en crecimiento con buenas tarifas de envío y soporte de las principales plataformas.", en: "Growing agent with good shipping rates and support for the main platforms." },
    pros: { es: ["Buenas tarifas", "QC", "Soporte multiplataforma"], en: ["Good rates", "QC", "Multi-platform support"] },
    coupons: [{ code: "NEW", text: { es: "Cupones de bienvenida al registrarte", en: "Welcome coupons on sign-up" } }],
  },
  hoobuy: {
    bonus: { es: "Cupones para nuevos usuarios", en: "Coupons for new users" },
    desc: { es: "Agente popular con QC y precios competitivos de envío.", en: "Popular agent with QC and competitive shipping prices." },
    pros: { es: ["QC", "Precios competitivos"], en: ["QC", "Competitive prices"] },
    coupons: [{ code: "NEW", text: { es: "Cupones al registrarte", en: "Coupons on sign-up" } }],
  },
  superbuy: {
    bonus: { es: "Cupones de envío para nuevos usuarios", en: "Shipping coupons for new users" },
    desc: { es: "Uno de los agentes veteranos, con almacén propio, muchas líneas de envío y servicios extra.", en: "One of the veteran agents, with its own warehouse, many shipping lines and extra services." },
    pros: { es: ["Veterano y fiable", "Muchos servicios", "Almacén propio"], en: ["Veteran and reliable", "Many services", "Own warehouse"] },
    coupons: [{ code: "NEW", text: { es: "Cupones de envío al registrarte", en: "Shipping coupons on sign-up" } }],
  },
  sugargoo: {
    bonus: { es: "Cupones de bienvenida", en: "Welcome coupons" },
    desc: { es: "Agente conocido con buena app, QC detallado y opciones de reenvío flexibles.", en: "Well-known agent with a good app, detailed QC and flexible forwarding options." },
    pros: { es: ["App potente", "QC detallado", "Reenvío flexible"], en: ["Powerful app", "Detailed QC", "Flexible forwarding"] },
    coupons: [{ code: "NEW", text: { es: "Cupones de bienvenida al registrarte", en: "Welcome coupons on sign-up" } }],
  },
  acbuy: {
    bonus: { es: "Cupones de bienvenida para nuevos usuarios", en: "Welcome coupons for new users" },
    desc: { es: "Agente moderno y rápido, con QC y tarifas de envío competitivas.", en: "Modern, fast agent with QC and competitive shipping rates." },
    pros: { es: ["Rápido", "QC", "Tarifas competitivas"], en: ["Fast", "QC", "Competitive rates"] },
    coupons: [{ code: "NEW", text: { es: "Cupones al registrarte", en: "Coupons on sign-up" } }],
  },
  cssbuy: {
    bonus: { es: "Descuentos para nuevos usuarios", en: "Discounts for new users" },
    desc: { es: "Agente veterano muy usado por la comunidad, con tarifas de servicio bajas.", en: "Veteran agent widely used by the community, with low service fees." },
    pros: { es: ["Comisión baja", "Veterano", "QC"], en: ["Low service fee", "Veteran", "QC"] },
    coupons: [{ code: "NEW", text: { es: "Descuentos al registrarte", en: "Discounts on sign-up" } }],
  },
  lovegobuy: {
    bonus: { es: "Cupones de bienvenida", en: "Welcome coupons" },
    desc: { es: "Agente de la familia CNFans con QC y cupones frecuentes.", en: "CNFans-family agent with QC and frequent coupons." },
    pros: { es: ["Cupones frecuentes", "QC"], en: ["Frequent coupons", "QC"] },
    coupons: [{ code: "NEW", text: { es: "Cupones al registrarte", en: "Coupons on sign-up" } }],
  },
  joyagoo: {
    bonus: { es: "Cupones para nuevos usuarios", en: "Coupons for new users" },
    desc: { es: "Agente en crecimiento con buena relación calidad/precio en envíos.", en: "Growing agent with good shipping value for money." },
    pros: { es: ["Buen precio de envío", "QC"], en: ["Good shipping price", "QC"] },
    coupons: [{ code: "NEW", text: { es: "Cupones al registrarte", en: "Coupons on sign-up" } }],
  },
  allchinabuy: {
    bonus: { es: "Cupones de envío de bienvenida", en: "Welcome shipping coupons" },
    desc: { es: "Agente hermano de Superbuy, con su misma infraestructura y muchas líneas de envío.", en: "Superbuy's sister agent, with the same infrastructure and many shipping lines." },
    pros: { es: ["Infraestructura Superbuy", "Muchas líneas", "QC"], en: ["Superbuy infrastructure", "Many lines", "QC"] },
    coupons: [{ code: "NEW", text: { es: "Cupones de envío al registrarte", en: "Shipping coupons on sign-up" } }],
  },
  orientdig: {
    bonus: { es: "Cupones para nuevos usuarios", en: "Coupons for new users" },
    desc: { es: "Agente reciente y popular en la comunidad, con QC y envíos competitivos.", en: "Recent agent, popular in the community, with QC and competitive shipping." },
    pros: { es: ["Popular ahora", "QC"], en: ["Trending now", "QC"] },
    coupons: [{ code: "NEW", text: { es: "Cupones al registrarte", en: "Coupons on sign-up" } }],
  },
  hipobuy: {
    bonus: { es: "Cupones de bienvenida", en: "Welcome coupons" },
    desc: { es: "Agente con QC y buenas tarifas de reenvío internacional.", en: "Agent with QC and good international forwarding rates." },
    pros: { es: ["QC", "Buenas tarifas"], en: ["QC", "Good rates"] },
    coupons: [{ code: "NEW", text: { es: "Cupones al registrarte", en: "Coupons on sign-up" } }],
  },
};

export function signupUrl(id) {
  const code = AFFILIATE_CODES[id];
  const fn = SIGNUP[id];
  if (!fn) return null;
  return fn(isPlaceholder(code) ? "" : code);
}

export function agentMeta(id) {
  return AGENT_META[id] || null;
}
