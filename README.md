# W2C Catalog — Importador (Fase 1)

Importa el catálogo de una spreadsheet W2C (tipo w2cfind) a una base de datos
local y **genera los links de afiliado con TUS códigos** a partir del `itemID`.

> Nunca copia los links de la hoja original (esos pagan al autor de la hoja).
> Solo usa el `ID` del producto y reconstruye el enlace con tu código.

## Requisitos

- Node.js >= 22 (usa `node:sqlite` integrado — **cero dependencias externas**).

## Uso rápido

```bash
npm run import                     # descubre e importa TODAS las pestañas
npm run query -- --category SHOES  # consulta + genera links al vuelo
```

Otras opciones:

```bash
GID=343368508 npm run import       # importar solo una pestaña
SHEET_ID=xxxxx npm run import       # otra spreadsheet
CNFANS_REF=miCodigo npm run import  # con tu código real de afiliado
npm run query -- --brand "Ralph Lauren" --limit 50
```

## Configura tus códigos de afiliado

Edita [`config/agents.js`](config/agents.js) o define variables de entorno:
`CNFANS_REF`, `MULEBUY_REF`, `KAKOBUY_REF`, `OOPBUY_REF`.

⚠️ **Verifica el formato de cada URL** en el panel de afiliado de cada agente:
los formatos incluidos son los habituales del sector pero los agentes los
cambian de vez en cuando. Si uno cambia, solo tocas `config/agents.js`.

## Cómo funciona

```
htmlview ──► descubre pestañas (gid + nombre = categoría)
   │
   └─ por pestaña:
        gviz CSV ──► parseCsv ──► detecta cabecera + BLOQUES en paralelo
                                        │
                        normaliza (itemID, precio, categoría=pestaña)
                                        │
                        dedup por (plataforma, itemID)
                                        │
                        upsert en SQLite (data/catalog.db)
                                        │
        render ──► genera links de afiliado desde (plataforma + itemID)
```

Detalles que resuelve el importador (aprendidos de la hoja real):

- **Fila-banner** antes de la cabecera ("USE Ctrl+F...") → detecta la cabecera real.
- **Bloques de columnas en paralelo** (2-3 grupos `name|price|photo|ID|links`
  en horizontal) → lee todos, no solo el primero.
- **Columna ID sin cabecera** (pestaña HOT SALE) → la infiere por posición
  (después de "photo" / antes del primer link).
- **Duplicados masivos** dentro de cada pestaña → dedup por `(plataforma, itemID)`.
- **Categoría** = nombre de la pestaña (limpio de emojis). "HOT SALE" no es una
  categoría: se guarda como flag `hot`.
- **Nombres multilínea** ("LV\nBag") → normaliza espacios.

## Esquema de datos

Tabla `products` — **sin columnas de links** (se generan al vuelo):

| campo | descripción |
|-------|-------------|
| `platform`, `item_id` | clave única del producto |
| `name`, `brand`, `category` | metadatos |
| `price_eur` | precio |
| `image_url` | imagen cacheada (Fase 2) |
| `hot` | apareció en HOT SALE |
| `status` | active / dead / out_of_stock |
| `first_seen`, `last_seen`, `last_checked` | mantenimiento |

## Estado / limitaciones (Fase 1)

- ✅ ~1.400 productos importados, 99% con precio, categorizados, deduplicados.
- ⚠️ **Imágenes**: la hoja usa `=IMAGE()`, no exportable vía CSV → `image_url`
  vacío. Se rellenará en **Fase 2** (enriquecimiento vía endpoint del agente
  por `itemID`), que también da fotos QC y valida que el producto sigue vivo.
- ⚠️ **Plataforma**: la hoja no la trae; se asume `weidian` (configurable en
  `DEFAULT_PLATFORM`). La Fase 2 la confirmará al enriquecer.
- ⚠️ **Formatos de link de afiliado**: verificar con cada panel (ver arriba).

## Funciones de IA (Claude)

Requieren `ANTHROPIC_API_KEY` en el entorno. Modelos configurables:
`AI_MODEL` (razonamiento, def. `claude-opus-4-8`) y `AI_MODEL_FAST`
(masivo/interactivo, def. `claude-haiku-4-5`). Salidas estructuradas
(`output_config.format`). Si no hay key, los endpoints degradan con un mensaje.

- **Buscador en lenguaje natural** — `GET /api/ai-search?q=...` + botón "IA" del hero.
  Traduce "chaqueta Stone Island cara" → filtros (categoría, marca, precio, orden).
- **Armador de fit/haul** — `GET /api/ai-fit?budget=120&style=techwear` → outfit
  dentro de presupuesto con motivo por pieza.
- **Etiquetado del catálogo** — `npm run ai:tag -- --limit 20` → `clean_title`,
  marca, modelo, colorway, género, tags (mejora búsqueda y SEO).
- **Contenido SEO** — `npm run ai:content -- --limit 10` → descripción + bullets.
- **QC con visión** — `npm run ai:qc -- --limit 10` → `qc_score` (1-10) + notas
  analizando las fotos reales del producto.

## SEO / páginas server-side

Además de la SPA, el servidor renderiza **páginas indexables** con meta tags,
OpenGraph y JSON-LD:

- `/producto/:id` — ficha con schema `Product` (marca, precio, QC).
- `/categoria/:nombre` y `/marca/:nombre` — landings con schema `ItemList`.
- `/sitemap.xml` y `/robots.txt`.

Las URLs canónicas usan `SITE_URL` (configúralo al desplegar; en local usa el host).

## Admin — importador universal (`/admin`)

Panel para añadir contenido al catálogo desde **cualquier fuente**, con **tus IDs**:

- **Google Sheet (URL)**, **CSV/TSV pegado** o **links/texto** (Reddit/Telegram).
- Pipeline: cosecha ciega al formato (URLs) + detección de bloques (hojas reps) +
  **mapeo con IA** de fallback → **dedup contra el catálogo** → inserta con tus links.
- Previsualiza (nuevos vs existentes) antes de aplicar.
- Protegido con `ADMIN_TOKEN` (por defecto `cnfinds-admin` — **cámbialo**).

**Gestor de afiliación** (misma página): rellena tu código por agente y actívalo
según te registres. Se guarda en la DB (`agent_settings`) y **solo los agentes
activos con código real** aparecen en la web y generan tu comisión.

Tras importar, lanza `npm run enrich` (fotos) y `npm run ai:tag` (limpieza IA).

## Deploy

Sin dependencias externas — solo necesita **Node ≥ 22.5** (por el SQLite integrado).

1. Copia `.env.example` a `.env` y rellena `ANTHROPIC_API_KEY`, `SITE_URL`,
   tus códigos de afiliado, etc.
2. Genera la base de datos: `npm run import` (y `npm run enrich` para las fotos).
3. Arranca: `npm start` (respeta `PORT`).

**Docker:**
```bash
npm run import && npm run enrich   # genera data/catalog.db
docker build -t cnfinds .
docker run -p 8080:8080 --env-file .env cnfinds
```

**Hosts (Render/Railway/Fly/VPS):** build sin `npm install` (no hay deps),
comando de arranque `npm start`, y **disco persistente** para `data/`. Define
`SITE_URL` con tu dominio real.

### Railway (paso a paso)

1. **New Project → Deploy from GitHub repo** → elige `KikeClaw/CC_CNFinds`.
   Railway detecta el `Dockerfile` y construye solo.
2. **Volumen persistente** (imprescindible para el SQLite): en el servicio →
   *Settings → Volumes → New Volume*, **Mount path `/data`**.
3. **Variables** (*Variables*):
   - `DB_PATH=/data/catalog.db`  ← dentro del volumen
   - `ANTHROPIC_API_KEY=…`  (funciones IA)
   - `ADMIN_TOKEN=…`  (contraseña del panel `/admin`)
   - `SITE_URL=https://tu-dominio`  (o la URL de Railway al principio)
   - `KAKOBUY_REF=4mqkq` (y demás códigos según los actives)
   - `PORT` lo inyecta Railway solo.
4. **Deploy.** En el primer arranque, si el volumen está vacío, la app
   **se auto-siembra** (importa el catálogo) y **enriquece las fotos en segundo
   plano** — sin tocar la terminal. Míralo en los *Logs*.
5. **Dominio:** *Settings → Networking → Generate Domain* (o añade el tuyo) y
   actualiza `SITE_URL`.

## Estructura

```
config/agents.js     códigos de afiliado + generadores de link por agente
src/lib/sheet.js     descarga CSV (gviz)
src/lib/tabs.js      auto-descubrimiento de pestañas (htmlview)
src/lib/csv.js       parser CSV sin dependencias
src/lib/normalize.js cabeceras, bloques, itemID, precio, categoría
src/lib/db.js        esquema SQLite + upsert
src/importer.js      orquestador
src/query.js         consulta + genera links
```
