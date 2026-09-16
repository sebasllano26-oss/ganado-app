# Gestión Ganadera

Plataforma ganadera multiusuario para ofrecer por suscripción. Es independiente de la versión de Google Apps Script y no requiere Google Sheets.

## Incluye

- Portada comercial y demostración pública de consulta con 28 animales ficticios.
- Registro, confirmación por correo, inicio de sesión y recuperación con Supabase Auth.
- Perfil, ganadería, membresía de propietario y prueba de 14 días creados por la base de datos al registrar una cuenta.
- Roles `owner`, `editor` y `viewer`, con cambio entre las ganaderías autorizadas.
- Inventario, pesajes, reproducción, sanidad, ventas, gastos, tareas, predios y lluvias.
- Archivos en un bucket privado y enlaces firmados por una hora.
- Planes preparados y solicitudes comerciales sin cobros automáticos.
- Escrituras transaccionales, control de concurrencia, auditoría y RLS.

La demostración se genera en el servidor, no modifica Supabase y no contiene datos reales. Las cuentas nuevas empiezan vacías.

## Ejecutar localmente

Requiere Node.js 22 o posterior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

En Windows puedes usar `Copy-Item .env.example .env.local`. Si `.env.local` ya existe y está configurado, consérvalo.

Abre `http://127.0.0.1:5173`. La demostración funciona sin credenciales en `http://127.0.0.1:5173/?demo=1`.

`VITE_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_PUBLISHABLE_KEY` usan la misma clave pública. Nunca pongas una clave `service_role` en una variable que empiece por `VITE_`.

## Supabase

El repositorio apunta a `pemwlgwqysaufwsrsjdq`. Las migraciones de `supabase/migrations/` son la fuente versionada del esquema y se ejecutan en orden.

Las tres migraciones, incluida `20260916021123_account_provisioning.sql`, están registradas en ese proyecto.

El flujo de alta es el siguiente:

1. El navegador envía a Supabase Auth el correo, la contraseña, el nombre de la persona y el nombre solicitado para la ganadería.
2. Un trigger `after insert` crea `perfiles`, `organizaciones`, la membresía `owner` y la suscripción `trialing` en una sola transacción.
3. Si falla ese bloque, el usuario de Auth se conserva y el error queda en `ganax_private.errores_alta`.
4. En el siguiente ingreso, `crear_ganaderia` repara de forma idempotente las filas faltantes y devuelve la organización existente ante llamadas repetidas.
5. La aplicación muestra el nombre desde `perfiles` y `organizaciones`; los metadatos de Auth solo transportan los datos iniciales.

Los clientes tienen lectura con RLS. Las escrituras pasan por funciones `security definer` con `search_path` vacío. El perfil se actualiza mediante `actualizar_perfil`, y los miembros existentes se agregan mediante `invitar_miembro`; no hay permisos directos de `insert`, `update` o `delete` para `authenticated`.

## Desplegar en Vercel

1. Importa `sebasllano26-oss/ganado-app` con la raíz del repositorio como **Root Directory**.
2. Usa Vite, `npm run build`, salida `dist` y Node.js 22 o posterior.
3. Añade `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
4. Despliega. `api/rpc.mjs` se publica como función de Vercel.
5. Después de conocer el dominio final, configura en Supabase la URL del sitio y las redirecciones para ese dominio y `http://127.0.0.1:5173/**`.
6. Configura SMTP y prueba registro, confirmación, recuperación e ingreso antes de abrir las ventas.

No uses `vite preview` como servidor de producción: solo entrega archivos estáticos y no incluye la API.

## Suscripciones y soporte

Los precios y la pasarela se definirán después. Esencial admite 250 animales y Profesional 1.000. Ningún botón cobra ni convierte una solicitud en una suscripción pagada.

Consulta [OPERACION.md](docs/OPERACION.md) para administrar planes, equipos, errores de alta y respaldos.

## Verificación

```bash
npm test
npm run build
npx playwright install chromium
npx playwright test
```

Las pruebas cubren el alta desde `auth.users`, la recuperación concurrente, el aislamiento de perfiles, RLS, suscripciones, transacciones, conflictos y navegación de la demostración.

## Arquitectura y límites

- Frontend Vite con JavaScript y Chart.js; API Node para Vercel.
- PostgreSQL entrega una instantánea coherente y aplica cambios en una transacción con revisión optimista.
- No se migraron datos reales desde Excel ni Google Sheets.
- Las facturas se capturan manualmente; el reconocimiento automático no está habilitado.
- Las invitaciones agregan usuarios que ya crearon una cuenta. No se envían correos de invitación.
- El MCP de Supabase está autenticado en Codex para `pemwlgwqysaufwsrsjdq`.

Referencias: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [MCP Supabase](https://supabase.com/docs/guides/ai-tools/mcp).
