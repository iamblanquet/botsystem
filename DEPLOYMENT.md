# Desplegar BotSystem / Nexo en Vercel

El repositorio contiene dos modos de ejecución: el entorno de pruebas existente con Vite/Cloudflare y una aplicación Next.js para Vercel. `vercel.json` selecciona Next.js y `npm run build:vercel`. Requiere Node.js 24.

## 1. Crear los servicios persistentes

- **Base de datos Turso compatible con libSQL**: obtén su URL `libsql://…` y un token de lectura y escritura. El adaptador conserva las transacciones de presupuestos y el aislamiento entre empresas. No uses un archivo SQLite dentro de una función de Vercel.
- **Vercel Blob privado**: crea un almacén con acceso **Private**, vincúlalo al proyecto y agrega su `BLOB_READ_WRITE_TOKEN`. Los archivos se sirven mediante la aplicación, que verifica propietario o publicación del asistente. Un almacén público no es compatible con esta configuración.

Producción y Preview deben usar bases y almacenes distintos. Una vista previa que usa las credenciales de producción también puede modificar sus datos.

## 2. Configurar las variables

Agrega estas variables en **Vercel → Project → Settings → Environment Variables**. Ninguna lleva el prefijo `NEXT_PUBLIC_`.

| Variable | Uso |
| --- | --- |
| `TURSO_DATABASE_URL` | URL de la base libSQL. |
| `TURSO_AUTH_TOKEN` | Token de acceso a esa base. |
| `BLOB_READ_WRITE_TOKEN` | Token del almacén Blob privado. |
| `ENCRYPTION_KEY` | Secreto aleatorio para cifrar las claves Gemini de las empresas. |
| `ADMIN_EMAIL` | Correo para entrar al panel. |
| `ADMIN_PASSWORD_HASH` | Hash de la contraseña, generado con el comando de abajo. |
| `AUTH_SESSION_SECRET` | Otro secreto aleatorio para firmar las sesiones administrativas. |
| `ADMIN_USER_ID` | Identificador estable del propietario; valor inicial recomendado: `admin`. |
| `GEMINI_API_KEY` | Opcional: clave compartida de respaldo. Se recomienda una clave por empresa desde Configuración. |

Genera **dos secretos diferentes**, ejecutando este comando dos veces: uno para `ENCRYPTION_KEY` y otro para `AUTH_SESSION_SECRET`. Guárdalos en tu gestor de contraseñas y en las variables del servidor.

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Genera el hash de la contraseña administrativa sin escribir la contraseña en el historial de comandos:

```powershell
npm ci
npm run admin:password
```

El comando solicita una contraseña de al menos 12 caracteres con entrada oculta y muestra únicamente el valor de `ADMIN_PASSWORD_HASH`. Pega el hash completo en Vercel, incluidos sus signos `$`. No guardes la contraseña en el repositorio. Las sesiones duran ocho horas; el formulario limita los intentos por dirección IP en ventanas de 15 minutos.

**Conserva `ENCRYPTION_KEY` y `ADMIN_USER_ID` después del alta de empresas.** Cambiar la primera impide descifrar las claves Gemini existentes; cambiar el segundo cambia el propietario que ve el panel. Para invalidar las sesiones existentes, cambia `AUTH_SESSION_SECRET` y vuelve a desplegar.

## 3. Aplicar el esquema de la base

Copia `.env.vercel.example` a `.env.vercel` y completa, como mínimo, `TURSO_DATABASE_URL` y `TURSO_AUTH_TOKEN` con las credenciales del entorno correspondiente. El archivo con valores reales está ignorado por Git.

```powershell
npm run db:migrate:vercel
```

El comando aplica las cuatro migraciones actuales dentro de una transacción, registra sus hashes y puede repetirse sin duplicar tablas. Las siguientes actualizaciones deben agregar migraciones nuevas, sin cambiar las ya aplicadas. Las migraciones se ejecutan explícitamente; una compilación no modifica la base de datos.

## 4. Importar el repositorio y desplegar

1. En Vercel, selecciona **Add New → Project** e importa `iamblanquet/botsystem`.
2. Selecciona la rama `main`, directorio raíz `./`, framework **Next.js** y Node.js **24.x**.
3. Conserva `npm ci` como instalación y `npm run build:vercel` como compilación. No configures un directorio de salida personalizado.
4. Verifica las variables y que la base tenga las migraciones aplicadas. Ejecuta **Deploy**.
5. Abre `/login`, entra con el correo y contraseña administrativos y comprueba que el panel cargue.

El primer acceso crea los pilotos Manuel Martínez y Winetalia, con su información inicial pública y en modo de prueba, sin publicarlos. Los documentos, conversaciones, imágenes y credenciales del entorno de trabajo anterior **no se suben ni se migran automáticamente**. La información pública de los libros incluida en el código se conserva; cualquier dato adicional se carga desde el panel.

## 5. Conectar los chats

1. En **Configuración**, guarda y verifica la clave Gemini de cada empresa. Configura sus tarifas y presupuesto antes de usar el modo Gemini.
2. Revisa documentos, fichas y flujos desde el editor de cada asistente. Prueba ambos pilotos desde **Demos**.
3. Autoriza los dominios HTTPS exactos donde se insertará cada chat. Por ejemplo, el dominio de Manuel y el dominio de Winetalia, según corresponda.
4. Publica únicamente el asistente que quieras habilitar para visitantes. Copia el script o iframe que genera su editor; usará el dominio desde el que abriste la plataforma.

Los iframes publicados aceptan únicamente los dominios autorizados mediante `frame-ancestors`. El panel no permite incrustarse en otros sitios. El presupuesto se reserva antes de generar y se liquida con los tokens informados por Gemini. Los recorridos guiados y las búsquedas de conocimiento no generan cargos de Gemini.

Para incrustar chats de un entorno Preview, revisa también la protección de acceso del despliegue de Vercel: los visitantes del sitio deben poder cargar el iframe. Usa el dominio estable de producción para la integración definitiva.

## Validación del proyecto

```powershell
npm test
npm run typecheck
npm run build:vercel
```

Para probar el servidor Next.js antes de desplegar, completa `.env.local` con las mismas variables de un entorno de pruebas, aplica sus migraciones y ejecuta `npm run dev:vercel`. Abre `http://127.0.0.1:5174`. El entorno anterior conserva `npm run dev`, sus datos y sus claves independientes.

## Referencias oficiales

- [Next.js en Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs)
- [Almacenamiento privado de Vercel Blob](https://vercel.com/docs/vercel-blob/private-storage)
- [SDK TypeScript de Turso](https://docs.turso.tech/sdk/ts/reference)
