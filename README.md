# Nexo · MVP de asistentes para empresas

Plataforma independiente para gestionar empresas, personalizar asistentes, cargar conocimiento y controlar el consumo de Gemini. Incluye dos pilotos iniciales: Manuel Martínez y Winetalia / La Cava.

## Funciones disponibles

- Alta de empresas y asistentes; activación o pausa por empresa.
- Editor de nombre, color, bienvenida, instrucciones y preguntas sugeridas con vista previa.
- Fuentes separadas por asistente: texto pegado y archivos UTF-8 TXT, MD, CSV y JSON (hasta 1 MB / archivo y 50 fuentes / asistente).
- Recuperación de fragmentos por coincidencia de términos; Gemini recibe solo fuentes del asistente y un catálogo opcional de lectura.
- Clave Gemini por empresa, cifrada con AES-GCM; alternativa de clave compartida mediante variable de entorno.
- Contabilidad en microdólares enteros, presupuesto mensual por empresa, reserva atómica antes de generar y liquidación según tokens reportados, incluidos tokens de razonamiento.
- Conversaciones persistentes, registro de solicitudes y exportación CSV.
- Widget flotante con script e iframe, integración dentro de una sección y evento de selección de producto.
- Autenticación del panel provista por Sites; cada administrador solo accede a sus empresas.

## Ejecutar localmente

Requiere Node.js 22.13 o superior. Se recomienda Node 24 para ejecutar también las pruebas con SQLite integrado.

```powershell
npm ci
```

Copia `.env.example` a `.dev.vars` y configura `ENCRYPTION_KEY` con un valor aleatorio de al menos 32 bytes. Este archivo está ignorado por Git. No cambies la clave de cifrado sin migrar las claves ya guardadas. No se incluye ninguna credencial real en el código.

Genera el artefacto y aplica la migración local una sola vez:

```powershell
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_handy_serpent_society.sql
npm run dev
```

Abre la URL local impresa por el servidor. El starter simula el inicio de sesión exclusivamente en desarrollo local. Al abrir el panel por primera vez se crean los dos pilotos con información pública introductoria, sin consumo inventado. Las bases local y hospedada son independientes.

## Activar Gemini

1. Abre **Configuración** y selecciona la empresa.
2. Guarda su clave de Google AI Studio y las tarifas de entrada y salida en USD por millón de tokens.
3. En **Asistentes → Personalizar → Comportamiento**, configura un modelo disponible en el proyecto de Google y elige **IA real**.
4. Guarda y prueba. Las pruebas con IA real también consumen presupuesto.

El identificador inicial es `gemini-3.8-flash`, consultado en la documentación de Google el 9 de noviembre de 2026; es editable. No se presupone una tarifa ni se cobra una llamada simulada. Todos los asistentes activos con IA real de una empresa usan un mismo modelo / tarifa en esta versión.

Se usa REST `countTokens` y `generateContent` del endpoint oficial de Gemini. La contabilidad es estimada con las tarifas indicadas por el administrador; no sustituye la factura del proveedor. Se cuentan salida visible y razonamiento. No se habilitan herramientas de pago, grounding ni caching explícito. Las cuotas del proyecto de Google se aplican adicionalmente.

Si una generación no devuelve consumo confirmable, la reserva se conserva y la solicitud queda **Por conciliar**. No se reintenta automáticamente una generación para evitar cargos duplicados. La conciliación manual de reservas, facturación a clientes, tarifas por modelo y límites individuales por asistente son ampliaciones pendientes.

El período de presupuesto es mensual en UTC; el historial se muestra con fechas de Ciudad de México. Hay un límite de 12 mensajes por minuto por asistente e IP. La lista de dominios controla el embedding mediante CSP y no se considera autenticación del visitante.

## Integración de los pilotos

**El despliegue inicial del panel es privado.** Permite revisar y probar usando la sesión del administrador. Para visitantes anónimos de los sitios piloto se necesita publicar un runtime público separado para `/widget.js`, `/embed/*`, `/api/widget/*` y `/api/chat`, manteniendo protegidos los endpoints administrativos. Esta separación de despliegue y la instalación en los sitios originales no se han realizado. Cambiar un ajuste «Publicado» del asistente no cambia la privacidad del hospedaje.

El editor genera el código exacto con el ID del asistente. Para insertar dentro de una sección mediante el loader, agrega `data-container="#mi-asesor"` al script y crea ese contenedor. El iframe directo muestra el chat; para las acciones de carrito usa el loader, que hace el handshake y valida origen y ventana.

Winetalia trae configurada la consulta de lectura `https://winetalia.vercel.app/api/catalog`. El catálogo permanece en Winetalia. La selección de una tarjeta emite `nexo:product-selected`; un adaptador en el sitio debe conectar ese ID a su función existente `add(productId)`. El backend comercial sigue validando precio, existencias y solicitudes. No se modifica el sitio piloto ni se crean pedidos desde la plataforma.

Los fragmentos de los pilotos son resúmenes públicos, no libros completos ni un catálogo congelado. Los productos mostrados por el widget provienen del catálogo consultado; son accesos al catálogo, no una cotización final.

## Verificación

```powershell
npm test
npm run typecheck
npm run build
```

Las pruebas usan SQLite real y simulan únicamente identidad, bindings y respuestas de Gemini. Cubren aislamiento de empresas, autorización, claves cifradas, fuentes, tokens de razonamiento, reservas concurrentes, presupuesto agotado, errores inciertos e idempotencia. No requieren credenciales ni generan cargos.

## Estructura

- `components/dashboard.tsx`: panel y navegación.
- `components/assistant-editor.tsx`: personalización y códigos de integración.
- `components/chat-widget.tsx`: interfaz compartida del chat.
- `lib/server.ts`: autorización, CRUD, proveedor, catálogo y contabilidad.
- `lib/core.ts`: recuperación de conocimiento y cálculos de costo.
- `db/schema.ts` y `drizzle/`: esquema y migraciones D1.
- `worker/index.ts`: Worker, contexto del starter y políticas de embedding.
- `.openai/hosting.json`: identidad del Site y bindings D1 / R2.

La primera versión no incluye PDF/DOCX, OCR, embeddings vectoriales, editor visual de flujos, acceso delegado a administradores de clientes, facturación ni transferencia a operadores humanos. Las preguntas sugeridas e instrucciones permiten configurar el recorrido básico. El panel aplica la autorización por propietario; no representa aún un sistema completo de roles de una agencia.

## Referencias de integración

- [Gemini: generación de contenido](https://ai.google.dev/gemini-api/docs/text-generation)
- [Gemini: uso de tokens](https://ai.google.dev/gemini-api/docs/tokens)
- [Gemini: precios](https://ai.google.dev/gemini-api/docs/pricing)
