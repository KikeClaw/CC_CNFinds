// Guías de contenido (SEO + confianza). Renderizadas como páginas indexables.
export const GUIDES = [
  {
    slug: "como-comprar-en-kakobuy",
    title: "Cómo comprar en Kakobuy paso a paso (2026)",
    desc: "Guía sencilla para comprar productos de Taobao/Weidian/1688 a través de Kakobuy: registro, pedido, control de calidad y envío internacional.",
    body: `
<p>Kakobuy es un <b>agente de compras</b>: compra el producto en China por ti, lo revisa y te lo reenvía a tu país. Así se hace, paso a paso:</p>
<h2>1. Crea tu cuenta</h2>
<p>Regístrate en Kakobuy (gratis). Verás tu panel con pedidos, almacén y saldo.</p>
<h2>2. Añade el producto</h2>
<p>En CNFinds, pulsa el botón <b>Kakobuy</b> de cualquier producto: te lleva directo a la ficha en Kakobuy con el enlace ya convertido. También puedes pegar cualquier link de Taobao/Weidian/1688 en nuestro <a href="/#convertidor">conversor</a>.</p>
<h2>3. Paga el producto</h2>
<p>Recargas saldo (tarjeta, PayPal, etc.) y Kakobuy compra el artículo al vendedor chino. Llega a su almacén en unos días.</p>
<h2>4. Revisa las fotos QC</h2>
<p>Cuando el producto llega al almacén, Kakobuy sube <b>fotos de control de calidad (QC)</b>. Revísalas: si algo no está bien, puedes pedir cambio o reembolso antes de enviar. Más info en nuestra <a href="/guia/fotos-qc">guía de fotos QC</a>.</p>
<h2>5. Envía a tu país</h2>
<p>Eliges la línea de envío (según precio/tiempo/seguro) y pagas el envío internacional. Kakobuy consolida y envía. El coste final = producto + envío.</p>
<p class="tip">Consejo: junta varios productos en un mismo envío para ahorrar. Y usa códigos de descuento de envío cuando estén disponibles.</p>`,
  },
  {
    slug: "guia-agentes",
    title: "Qué es un agente W2C y cómo elegir el mejor",
    desc: "Explicación de qué hace un agente de compras (W2C), cómo cobran, y cómo elegir uno fiable con buen envío y control de calidad.",
    body: `
<p>Un <b>agente W2C</b> ("where to cop") es un intermediario que compra productos en marketplaces chinos (Taobao, Weidian, 1688) y te los reenvía. Tú no compras directo en China; el agente lo hace por ti.</p>
<h2>¿Cómo ganan dinero?</h2>
<p>Cobran principalmente por el <b>envío/reenvío internacional</b> (no por el producto). Por eso el precio que ves es el de fábrica, y el coste final incluye ese envío.</p>
<h2>¿Qué mirar para elegir?</h2>
<ul>
  <li><b>Fotos QC</b>: que ofrezcan control de calidad antes de enviar.</li>
  <li><b>Líneas de envío</b>: variedad de precio/tiempo y buen seguro.</li>
  <li><b>Comisiones y descuentos</b>: cupones de envío, tarifas claras.</li>
  <li><b>Reputación</b>: reseñas de la comunidad (Reddit, Discord, Trustpilot).</li>
  <li><b>Soporte de plataformas</b>: que soporte Weidian/Taobao/1688.</li>
</ul>
<h2>Nuestra recomendación</h2>
<p>En CNFinds priorizamos agentes <b>fiables, que pagan y soportan Weidian</b>. Ahora mismo generamos enlaces a <b>Kakobuy</b> (3,5–7,5% de bonificación, sin tope). Diversificar entre varios agentes es buena idea para no depender de uno solo.</p>`,
  },
  {
    slug: "fotos-qc",
    title: "Qué son las fotos QC y cómo revisarlas",
    desc: "Las fotos de control de calidad (QC) son tu mejor herramienta para evitar sorpresas. Aprende qué mirar antes de enviar tu pedido.",
    body: `
<p>Las <b>fotos QC</b> (Quality Control) son las imágenes reales que el agente toma de <i>tu</i> producto cuando llega a su almacén, antes de enviártelo. Son tu oportunidad de revisar y decidir.</p>
<h2>¿Qué revisar?</h2>
<ul>
  <li><b>Logos y estampados</b>: nitidez, alineación, tipografía correcta.</li>
  <li><b>Costuras y acabados</b>: rectas, sin hilos sueltos.</li>
  <li><b>Color y material</b>: que coincida con lo que pediste.</li>
  <li><b>Etiquetas y detalles</b>: talla, tags, herrajes.</li>
  <li><b>Defectos</b>: manchas, roturas, asimetrías.</li>
</ul>
<h2>Si algo está mal</h2>
<p>Puedes pedir <b>cambio o reembolso</b> antes de enviar. Por eso nunca envíes sin revisar el QC.</p>
<h2>QC con IA en CNFinds</h2>
<p>En CNFinds analizamos las fotos con inteligencia artificial para darte una <b>puntuación de calidad (1–10)</b> orientativa y señalar posibles defectos. Es una ayuda extra; la decisión final siempre es tuya sobre tus fotos QC reales.</p>`,
  },
];

export const guideBySlug = (slug) => GUIDES.find((g) => g.slug === slug);
