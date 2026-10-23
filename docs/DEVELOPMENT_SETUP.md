# Entorno de desarrollo reproducible

Fecha de verificación: 2026-10-23

Rama: `release/production-prep`

Commit verificado: `90dba42e3d93704e35a7fd4de5ebbae3c9b61864`

## Resultado

El entorno de desarrollo puede construirse desde un checkout limpio sin restaurar la base existente, sin ejecutar `db reset` y sin acceder a Supabase Cloud. La verificación aplicó las 57 migraciones en una instancia local desechable, ejecutó 628 pruebas pgTAP, levantó la PWA y el Admin y compiló ambas aplicaciones.

La instalación limpia produce deliberadamente una base sin usuarios ni actividad operativa. Las migraciones crean únicamente la configuración y el contenido inicial versionado: dos rutas, tres buckets privados, un anuncio y la bandera `web_push=false`.

## Versiones verificadas

- Windows con PowerShell.
- Git.
- Node.js `v24.21.0`.
- npm `11.19.0`.
- Docker Engine `29.9.2`.
- Docker Compose `v5.6.0`.
- Supabase CLI `2.117.0`, fijada como dependencia de desarrollo del proyecto.
- PostgreSQL local `17.6` mediante la imagen administrada por Supabase CLI.

Estas son las versiones del ensayo, no una afirmación de compatibilidad con todas las versiones anteriores o posteriores. Para evitar diferencias de CLI, los comandos usan la dependencia local instalada por `npm ci`.

## 1. Checkout e instalación

Desde un directorio nuevo:

```powershell
git clone <URL_DEL_REPOSITORIO> volcan-santa-maria-pwa
Set-Location volcan-santa-maria-pwa
git switch release/production-prep

npm ci
npm --prefix admin-web ci
```

No usar `npm install` para la preparación reproducible: `npm ci` valida y respeta los dos lockfiles. En el ensayo, ambas instalaciones terminaron sin vulnerabilidades reportadas por npm.

## 2. Iniciar Supabase local

Docker Desktop debe estar iniciado. En una instalación normal, donde no existe otra copia activa con el mismo `project_id`, ejecutar:

```powershell
npm run auth:local:start
node scripts/configure-local-auth.mjs --check
```

`auth:local:start` crea o reinicia la instancia, aplica las migraciones cuando la base es nueva y configura la opción nativa de GoTrue que exige la contraseña actual para un cambio normal de contraseña. Esta opción todavía no está representada por `supabase/config.toml` en la CLI 2.117.0; por eso un `npx supabase start` aislado no sustituye al comando del proyecto. El script conserva los volúmenes y no ejecuta `db reset`.

Los puertos versionados son 54320–54329. Si solo esos puertos están ocupados, puede seleccionarse temporalmente otra centena:

```powershell
$env:SUPABASE_LOCAL_PORT_BASE = '54500'
npm run auth:local:start
Remove-Item Env:SUPABASE_LOCAL_PORT_BASE
```

El script restaura `supabase/config.toml` aunque el arranque falle. La variable de puerto evita conflictos de puertos, pero no permite ejecutar simultáneamente dos clones con el mismo `project_id`; para el flujo ordinario debe existir una sola copia local activa.

Durante el primer arranque se descargan las imágenes de Docker. La CLI muestra `WARN: no files matched pattern: supabase/seed.sql`; es un aviso no bloqueante conocido. Actualmente no existe un seed de desarrollo y los datos iniciales necesarios se crean mediante migraciones.

## 3. Variables locales de las aplicaciones

Crear archivos locales ignorados por Git para la PWA y el Admin:

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.example admin-web/.env.local
npx --no-install supabase status -o json
```

En ambos archivos asignar:

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=<PUBLISHABLE_KEY_LOCAL>
VITE_WEB_PUSH_ENABLED=false
```

Si se configuró una base de puertos distinta, ajustar la URL al puerto API resultante; por ejemplo, la base 54500 usa `http://127.0.0.1:54521`.

Tomar `PUBLISHABLE_KEY_LOCAL` del campo `PUBLISHABLE_KEY` de `supabase status`. No colocar `SECRET_KEY`, `SERVICE_ROLE_KEY`, contraseñas ni claves privadas en variables `VITE_*`: Vite incorpora esas variables al código cliente. No versionar ningún archivo `.env.local`.

`VITE_TURNSTILE_SITE_KEY`, `VITE_MAPTILER_KEY`, `VITE_PAYPAL_DONATION_URL` y `VITE_VAPID_PUBLIC_KEY` son opcionales para el arranque local. Web Push debe permanecer desactivado.

## 4. Levantar PWA y Admin

Abrir dos terminales desde la raíz del repositorio.

PWA:

```powershell
npm run dev -- --host 127.0.0.1 --port 3000
```

Admin:

```powershell
npm --prefix admin-web run dev -- --host 127.0.0.1 --port 3001
```

Las URLs son `http://127.0.0.1:3000` y `http://127.0.0.1:3001`. Coinciden con las URLs locales permitidas en la configuración de Auth.

## 5. Verificación obligatoria

Con Supabase local activo:

```powershell
node scripts/configure-local-auth.mjs --check
npx --no-install supabase db test

npm run lint
npm run build
npm --prefix admin-web run lint
npm --prefix admin-web run build
```

Resultado esperado de base de datos:

- 57 migraciones aplicadas, desde `20260914204658` hasta `20261023130000`.
- 29 archivos pgTAP y 628 pruebas aprobadas.
- Dos filas en `public.routes`.
- Tres filas privadas en `storage.buckets`: `avatars`, `notification-media` y `route-media`.
- Una fila en `public.announcements`.
- Una fila `web_push=false` en `public.runtime_feature_flags`.
- Cero filas en Auth, perfiles, roles, consentimientos, visitas, integrantes, menores, contactos de emergencia, notificaciones, destinatarios, suscripciones Push, auditoría y objetos Storage.

Los builds pueden mostrar el aviso informativo de Vite sobre chunks mayores de 500 kB en la PWA. No es un error de compilación.

Para detener los servicios conservando los datos locales:

```powershell
npx --no-install supabase stop
```

No usar `--no-backup` ni `db reset` sobre una instancia que contenga datos que deban conservarse.

## Evidencia del ensayo aislado

La verificación se hizo desde un clon local limpio en un directorio temporal. Para coexistir con la instancia de trabajo activa se cambió únicamente dentro de esa copia el namespace de Docker y los puertos a 54620–54629; también se adaptaron allí las dos comprobaciones literales del helper de Auth al namespace desechable. Ningún cambio de aislamiento se copió al repositorio.

Resultados:

- `npm ci` en raíz: PASS, 211 paquetes, cero vulnerabilidades reportadas.
- `npm ci` en Admin: PASS, 196 paquetes, cero vulnerabilidades reportadas.
- Arranque nuevo de Supabase y aplicación ordenada de las 57 migraciones: PASS.
- Configuración y comprobación de Auth con contraseña actual obligatoria: PASS y servicio saludable.
- PostgreSQL: versión 17.6 y 57 migraciones registradas.
- Línea base limpia: coincide con los conteos de la sección anterior.
- pgTAP: `Files=29, Tests=628`, PASS.
- PWA: lint PASS, build PASS y servidor de desarrollo HTTP 200.
- Admin: lint PASS, build PASS y servidor de desarrollo HTTP 200.

La instancia original permaneció activa en sus puertos 545xx durante todo el ensayo. No se ejecutó `db reset`, `db push`, eliminación de datos, modificación de Cloud, commit ni push. `supabase/config.toml`, `supabase/config.toml.qa-backup` y `tmp/` se conservaron.
