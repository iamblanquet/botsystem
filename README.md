# Nexo · MVP de asistentes para empresas

Plataforma independiente para gestionar empresas, personalizar asistentes, cargar conocimiento y controlar el consumo de Gemini. Incluye dos pilotos iniciales: Manuel Martínez y Winetalia / La Cava.

## Despliegue en Vercel

Consulta [DEPLOYMENT.md](./DEPLOYMENT.md) para configurar Next.js, Turso/libSQL, Vercel Blob privado y el acceso administrativo. `vercel.json` incluye los comandos de compilación. Las credenciales y datos del entorno de trabajo no forman parte del repositorio.

## Funciones disponibles

- Alta de empresas y asistentes; activación o pausa por empresa.
- Editor de identidad, colores, tipografía, avatar, formas y medidas por asistente, con vista previa y estilos iniciales para cada piloto. El widget no muestra atribución de Nexo.
- Fuentes separadas por asistente: texto pegado y archivos UTF-8 TXT, MD, CSV y JSON (hasta 1 MB / archivo y 50 fuentes / asistente).
- Recuperación de fragmentos por coincidencia de términos; Gemini recibe solo fuentes del asistente y un catálogo opcional de lectura.
- Clave Gemini por empresa, cifrada con AES-GCM; alternativa de clave compartida mediante variable de entorno.
- Contabilidad en microdólares enteros, presupuesto mensual por empresa, reserva atómica antes de generar y liquidación según tokens reportados, incluidos tokens de razonamiento.
- Conversaciones persistentes, registro de solicitudes y exportación CSV.
- Widget flotante con script e iframe, integración dentro de una sección y evento de selección de producto.
- En Vercel, acceso administrativo con contraseña y sesión firmada; el entorno de pruebas existente conserva su autenticación de desarrollo. Cada propietario solo accede a sus empresas.

## Ejecutar localmente

Requiere Node.js 24 para ejecutar la aplicación y sus pruebas con SQLite integrado.

```powershell
npm ci
```

Copia `.env.example` a `.dev.vars` y configura `ENCRYPTION_KEY` con un valor aleatorio de al menos 32 bytes. Este archivo está ignorado por Git. No cambies la clave de cifrado sin migrar las claves ya guardadas. No se incluye ninguna credencial real en el código.

Genera el artefacto y aplica la migración local una sola vez:

```powershell
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_handy_serpent_society.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_regular_adam_destine.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_loose_golden_guardian.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0003_nosy_omega_flight.sql
npm run dev
```

Abre la URL local impresa por el servidor. El starter simula el inicio de sesión exclusivamente en desarrollo local. Al abrir el panel por primera vez se crean los dos pilotos con información pública introductoria, sin consumo inventado. Las bases local y hospedada son independientes.

## Demos locales con iframe

Con `npm run dev` ejecutándose en `http://127.0.0.1:5173`:

- Selector de experiencias: `http://127.0.0.1:5173/demos`.
- Manuel Martínez: `http://127.0.0.1:5173/demos/manuel`.
- Winetalia / La Cava: `http://127.0.0.1:5173/demos/winetalia`.

Son páginas locales adaptadas con recursos públicos de referencia guardados en `public/demo-assets/`. No modifican las páginas originales ni crean un despliegue. También se accede desde **Demos locales** en el menú del panel.

La demo de Manuel abre un iframe flotante. Los botones de los libros envían una pregunta al campo de texto del iframe; la generación ocurre cuando el visitante la envía. Winetalia integra el iframe dentro de la sección de Sofía. Elegir una tarjeta del chat comunica el ID al contenedor y agrega el producto a una selección de demostración en memoria. El precio se toma del catálogo autorizado del negocio, nunca del mensaje recibido. No se crean pedidos, no se procesa pago y la selección se reinicia al recargar.

Ambos iframes cargan `/embed/{id}` con la sesión local del administrador, conservando los asistentes sin publicar. El puente valida `origin`, `source` y el ID del asistente y confirma la conexión antes de enviar preguntas. Las respuestas reales siguen registrándose en el consumo de cada empresa y envían su contexto a Gemini. Winetalia consulta su catálogo público únicamente en lectura.

`scripts/prepare-local-demo-assets.mjs` puede actualizar las copias visuales mediante solicitudes de lectura. No contiene credenciales ni realiza publicaciones. Las capturas de verificación se guardan en `outputs/demo-manuel.png`, `outputs/demo-winetalia.png` y `outputs/demo-winetalia-selection.png`.

## Información y flujos configurables

### Apariencia por sitio

En **Asistentes → Personalizar → Apariencia**, elige Claro, Oscuro, Manuel (negro y dorado) o Winetalia (crema y vino) y ajusta colores de fondo, superficies, encabezado, textos, mensajes, botones y bordes. Los estilos solo modifican apariencia; mantienen conocimiento, instrucciones, flujos y presupuesto.

También se configuran tipografía del sistema, tamaño de texto, esquinas, espaciado, icono o imagen del asistente, descripción, bienvenida, sugerencias, etiqueta de recorridos y texto del campo de mensaje. La vista previa se actualiza sin guardar; **Guardar cambios** persiste el diseño de ese asistente y lo aplica a su iframe. No aparece la leyenda de atribución en el chat.

**Subir desde mi equipo** acepta PNG, JPG y WebP de hasta 2 MB y abre un editor antes de enviar la imagen al almacenamiento local. Puedes conservar el logo completo con márgenes transparentes o llenar un recorte cuadrado, ajustar zoom entre 25% y 400%, arrastrar la imagen y moverla con los controles horizontal y vertical. **Centrar imagen** centra sin cambiar el zoom; **Restablecer** recupera el logo completo, centrado y con zoom de 100%.

Mientras ajustas el recorte, la vista previa del chat usa una imagen temporal del navegador. No se guarda un archivo por cada movimiento y esas direcciones temporales no se incluyen en la configuración persistida. **Cancelar edición** descarta los ajustes y recupera la imagen anterior. **Aplicar recorte** genera una copia PNG cuadrada de 512 × 512 píxeles, conserva transparencia, retira metadatos y la guarda en el R2 local de la empresa. Después, **Guardar cambios** vincula esa imagen con el asistente. El archivo original de tu equipo no se modifica ni se envía a servicios externos o a Gemini.

**Editar recorte** permite partir de una imagen local ya seleccionada en la biblioteca. Cada encuadre aplicado crea una copia y conserva las versiones anteriores; para recuperar áreas descartadas, selecciona una versión previa o vuelve a subir el original. Las imágenes de direcciones externas deben subirse como copia local antes de recortarlas. El tamaño visible del avatar en el encabezado se configura por separado entre 28 y 72 píxeles y se guarda con la apariencia del asistente.

**Forma y borde del avatar** permite elegir Circular, Cuadrado o Redondeado. Para la forma redondeada se ajusta el radio entre 0 y 28 píxeles, independientemente de las esquinas del chat. El borde admite color hexadecimal, grosor de 0 a 6 píxeles y estilos continuo, guiones, puntos o sin borde. La vista previa muestra los ajustes al instante tanto en el encabezado como en los avatares de los mensajes; en los mensajes pequeños el grosor se adapta proporcionalmente. **Guardar cambios** aplica esta configuración al iframe de ese asistente.

Las formas y bordes se aplican a imágenes e iconos mediante su presentación, sin modificar el PNG, repetir la carga ni generar versiones nuevas. Las configuraciones anteriores obtienen valores compatibles al leerse, sin migración de base de datos. El servidor valida formas, radios, colores, estilos y grosores antes de guardarlos; cada asistente conserva sus propios ajustes.

La biblioteca **Imágenes de esta empresa** permite reutilizar hasta 50 imágenes entre sus asistentes. Cargas con los mismos píxeles optimizados reutilizan la imagen existente. **Usar solo el icono** retira la imagen del borrador, manteniendo la copia en la biblioteca para reutilizarla. Una imagen sin aplicar queda disponible únicamente para el administrador propietario. El acceso anónimo se permite solo cuando un asistente publicado y activo de su empresa usa esa imagen. Despublicar o pausar la empresa revoca ese acceso; en los pilotos locales los asistentes permanecen sin publicar.

La migración `0003_nosy_omega_flight.sql` agrega el catálogo local de imágenes. Si ya se aplicaron las migraciones anteriores, ejecuta solamente esta nueva con `--local`. El servidor verifica tamaño, estructura PNG, integridad de bloques, dimensiones y datos descomprimidos; vincula cada imagen a su empresa y limpia el archivo si falla el registro. La ruta de lectura devuelve siempre una imagen PNG con `nosniff` y sin caché persistente. No admite SVG ni contenido ejecutable.

En **Apariencia → Botón flotante** cada empresa puede elegir un icono, reutilizar el avatar del chat o subir un logo propio con el mismo recorte y biblioteca local. El fondo y el color del icono se ajustan por separado; el botón mide de 40 a 96 px. Admite las cuatro esquinas y separaciones horizontal y vertical de 8 a 120 px. Los márgenes se reducen cuando falta espacio para la ventana. El logo independiente no cambia el avatar del chat.

El botón también admite forma **circular, cuadrada o redondeada**. El radio de la forma redondeada va de 0 a 48 px; el borde admite color propio, grosor de 0 a 8 px y estilo continuo, guiones, puntos o sin borde. Estas opciones mantienen el tamaño exterior del botón y no cambian el borde del avatar ni de la ventana. La vista previa y el script usan la misma configuración, incluida al abrir o cerrar.

La vista previa **Botón flotante** permite abrir y cerrar el chat sobre una página de muestra sin guardar. **Guardar cambios** aplica el diseño al script. **Probar botón guardado** abre `/demos/button/:id`, una página local privada que ejecuta el script real para cualquier empresa, incluidos Manuel y Winetalia. Abrir y cerrar no llama a Gemini. No se modifican las páginas originales ni se publica nada.

El script `/widget.js` recibe la apariencia mediante el puente verificado del iframe y configura logo, colores, tamaño y posición del botón, además del ancho, alto y radio de la ventana. La vista previa, la demo flotante de Manuel y el script comparten la geometría de `lib/launcher.ts`. Los logos locales se resuelven respecto al servidor de la plataforma, incluso si el script está en otro dominio. Las imágenes del botón conservan el aislamiento por empresa y solo se pueden leer anónimamente si están en uso por un asistente publicado de una empresa activa. Los pilotos siguen sin publicar. El iframe directo y el chat integrado de Winetalia conservan su ubicación dentro del contenedor. Los cambios de un asistente no afectan a otros. La configuración se guarda en el JSON de apariencia existente, sin una migración adicional.

La migración `0002_loose_golden_guardian.sql` agrega la configuración sin sobrescribir datos existentes. Para una base que ya tiene las migraciones anteriores, aplica únicamente esta nueva migración con `--local`. Se validan colores, opciones permitidas, medidas e imágenes HTTPS públicas o rutas locales. No se admite CSS o HTML arbitrario.

### Información y recorridos

En **Asistentes → Personalizar → Información → Documentos y matrices** puedes subir archivos `.md`, `.markdown`, `.txt`, `.csv`, `.tsv` o `.json`, pegar Markdown o crear una tabla editable desde cero. El mismo importador está en **Conocimiento → Agregar información**. Cada fuente queda vinculada al asistente y su empresa. Reimportar el mismo nombre, formato y contenido no crea un duplicado ni sobrescribe otras fuentes. No hay migración adicional.

Antes de guardar se muestran las tablas, el número total de filas y los fragmentos que consultará el chat. La búsqueda en la vista previa funciona sin guardar. **Probar conocimiento guardado** consulta documentos, datos del negocio, FAQs y fichas del asistente mediante recuperación local, sin Gemini, conversaciones nuevas ni consumo. Las plantillas descargables están en `/templates/matriz-conocimiento.tsv` y `/templates/conocimiento.md`.

Los archivos deben ser UTF-8, de hasta 1 MB y 500000 caracteres. Cada fuente admite 1000 filas entre sus tablas y entre 2 y 32 columnas por tabla. Los encabezados deben ser únicos y no vacíos. CSV detecta coma, punto y coma o tabulador; TSV usa tabulador. Se admiten celdas entre comillas con separadores, saltos de línea y comillas escapadas. Las tablas Markdown conservan sus encabezados y las barras escapadas. No se interpreta HTML, no se ejecutan fórmulas ni se visitan enlaces de las celdas.

La recuperación convierte cada fila en pares `encabezado: valor` para evitar perder la relación entre preguntas, respuestas y atributos. Conserva también el texto y los encabezados de Markdown. El servidor vuelve a validar el contenido antes de guardarlo, comprueba el propietario y acota el cuerpo de la carga aunque falte `Content-Length`. Las fuentes antiguas se conservan. Una matriz de conocimiento aporta contexto a las respuestas; las fichas y reglas de los flujos se configuran por separado.

**Editar fuente** está disponible en la tabla de **Conocimiento**, en la lista de **Documentos y matrices** de cada asistente y al abrir una fuente. Permite cambiar el título, editar documentos Markdown/TXT/JSON, modificar celdas, filas y columnas de CSV/TSV, o reemplazar el contenido con un archivo nuevo. Las matrices CSV/TSV se abren en el editor de tabla conservando su formato; los documentos Markdown se editan como texto para conservar también sus títulos y párrafos. Cambiar entre texto y tabla mantiene el borrador. Abrir y cancelar no modifica la fuente.

El editor muestra la versión guardada y el borrador, una comparación del contenido completo y la vista previa de tablas y fragmentos. Puedes probar consultas antes de pulsar **Actualizar conocimiento**. La actualización conserva el identificador, la empresa, el asistente y la fecha de alta; no crea otra fuente ni altera fichas, flujos o conversaciones. El chat consulta el contenido actualizado a partir de su siguiente solicitud. Editar, previsualizar y buscar no llaman a Gemini.

Cada lectura devuelve una revisión que el servidor exige al actualizar. Si otra pestaña guardó cambios mientras editabas, se rechaza el borrador antiguo con un mensaje de conflicto; nunca se fuerza la sobrescritura. El archivo nuevo se prepara por separado y la actualización de la fuente es condicional. Si falla, se conserva la fuente anterior y se retira la copia temporal. La copia previa se elimina del almacenamiento local solamente después de guardar correctamente. No requiere una migración nueva.

En **Asistentes → Personalizar → Información** se llenan datos del negocio, horarios, contacto, políticas, preguntas frecuentes y fichas de libros o productos. Cada ficha admite descripción aprobada, categoría, etiquetas, precio opcional, enlace y activación. Los documentos existentes siguen disponibles en Conocimiento.

En **Flujos** se pueden crear hasta diez recorridos por asistente desde plantillas de libros, vinos o desde cero. Se editan nombre, introducción, hasta doce preguntas, tipos de respuesta, opciones, etiquetas, obligatoriedad, límites numéricos, condiciones según respuestas anteriores y orden de pasos. Cada pregunta de afinidad puede priorizar coincidencias o exigirlas como filtro. Las condiciones solo pueden depender de una pregunta anterior; el servidor rechaza referencias inválidas al guardar.

Las reglas de resultado eligen fichas locales o el catálogo API, una categoría, máximo de recomendaciones, presupuesto por unidad o total, afinidad mínima y mensajes de resultado, cierre y ausencia de coincidencias. Las coincidencias se ordenan por etiquetas y luego por menor precio. El presupuesto excluye precios desconocidos y nunca se amplía automáticamente. Para presupuesto total agrega una pregunta numérica con función Cantidad. Las etiquetas vacías permiten cualquier preferencia.

**Importar referencias del catálogo API** crea fichas complementarias locales para agregar etiquetas de ocasión, descripciones y enlaces. Se puede buscar por nombre, categoría o etiqueta. Al usar el catálogo API, el precio, nombre, categoría y disponibilidad vigentes tienen prioridad; las fichas locales solo agregan contexto y pueden excluir productos. No se modifica el catálogo original. Si no hay catálogo disponible, el recorrido devuelve su mensaje sin resultados.

Los pilotos incluyen un recorrido de libros para Manuel y otro de ocasión, presupuesto y estilo para Winetalia. En vinos, el estilo elegido actúa como filtro obligatorio salvo «Sorpréndeme». Los pilotos nuevos parten de dos títulos de libros. La copia pública revisada en `lib/data/manuel-books.json` contiene resúmenes propios de trece fichas del sitio del autor, enlaces específicos y notas sobre formato, edición e inconsistencias de idioma. No incluye textos completos, precios ni comprobaciones de inventario.

`node scripts/complete-manuel-books.mjs` incorpora esas trece fichas al piloto local de Manuel, conserva los identificadores y precios manuales existentes, añade preguntas frecuentes y opciones de teatro, novela gráfica, numerología y suspenso al recorrido de libros. Guarda una copia de la configuración previa en `outputs/book-research/` y usa control de versiones al actualizar. Solo escribe mediante la API de localhost; no modifica sitios originales ni publica. Las etiquetas son una clasificación editorial de los temas de las reseñas. Las dos versiones del Código Secreto, las partes II y III de la serie gráfica y los títulos parecidos de comedia se mantienen separados.

La configuración se guarda por asistente con control de versiones. Las sesiones guardan sus respuestas en el servidor, permiten volver o pasar a conversación libre, validan cada respuesta y evitan registrar dos veces un reintento. Si se edita una configuración durante un recorrido, el visitante debe iniciarlo de nuevo. Los recorridos se muestran automáticamente en el iframe y la vista previa tras guardar; no llaman a Gemini ni generan consumo de IA. La conversación libre usa las fichas, preguntas frecuentes y preferencias del recorrido como contexto y conserva el control de presupuesto existente.

Las migraciones se aplican **solo una vez**, en orden. Para una base local que ya tiene la primera migración, aplica únicamente `0001_regular_adam_destine.sql`. La inicialización del panel agrega las plantillas piloto de forma idempotente y conserva las configuraciones existentes, claves y presupuestos.

Con el servidor local activo, `node scripts/test-local-flows.mjs` prueba ambos recorridos sin llamar a Gemini y guarda el reporte en `outputs/local-flows-test.json`. Verifica que no cambien gasto, reservas, registros de IA ni estado de publicación.

`node scripts/test-pilot-recommendations.mjs` verifica seis casos guiados (teatro, novela gráfica, suspenso, tinto por presupuesto, espumoso por presupuesto y ausencia de opciones con un presupuesto insuficiente) y después realiza una consulta real a Gemini por empresa con las claves y límites ya configurados. Estas dos generaciones sí consumen IA. El reporte local `outputs/pilot-recommendations-test.json` conserva resultados, fuentes, tokens y costo estimado; comprueba que los recorridos guiados no aumenten el consumo y que se conserven publicación, claves y reservas previas.

## Conectar y probar IA real

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
