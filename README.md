# Gestión Ganadera

Plataforma ganadera multiusuario conectada a Supabase. Es independiente de la versión de Google Apps Script y no requiere Google Sheets.

## Incluye

- Portada comercial y demostración pública de consulta con 28 animales ficticios.
- Registro inmediato, inicio de sesión y recuperación con Supabase Auth.
- Perfil, ganadería y membresía de propietario creados por la base de datos al registrar la cuenta.
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

Las cuatro migraciones, incluida `20260916124423_provision_after_email_confirmation.sql`, están registradas en ese proyecto.

El flujo de alta es el siguiente:

1. El navegador envía a Supabase Auth el correo, la contraseña, el nombre de la persona y el nombre solicitado para la ganadería.
2. Supabase crea el usuario pendiente, pero todavía no crea datos de la ganadería ni permite una sesión válida.
3. Al registrar la cuenta, Supabase la confirma automáticamente y el trigger `provision_account_after_confirmation` crea `perfiles`, `organizaciones` y la membresía `owner` en una sola transacción.
4. Si falla ese bloque, el usuario de Auth se conserva y el error queda en `ganax_private.errores_alta`.
5. En el siguiente ingreso, `crear_ganaderia` repara de forma idempotente las filas faltantes y devuelve la organización existente ante llamadas repetidas.
6. La aplicación vuelve a comprobar con Auth que el usuario existe y que su correo está confirmado antes de abrir el espacio de trabajo.

Para aceptar registros del público hay que configurar SMTP propio. El SMTP básico de Supabase solo entrega a direcciones autorizadas del equipo y tiene límites estrictos; no se debe usar para producción.

Los clientes tienen lectura con RLS. Las escrituras pasan por funciones `security definer` con `search_path` vacío. El perfil se actualiza mediante `actualizar_perfil`, y los miembros existentes se agregan mediante `invitar_miembro`; no hay permisos directos de `insert`, `update` o `delete` para `authenticated`.

## Desplegar en Vercel

1. Importa `sebasllano26-oss/ganado-app` con la raíz del repositorio como **Root Directory**.
2. Usa Vite, `npm run build`, salida `dist` y Node.js 22 o posterior.
3. Añade `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL` y `SUPABASE_PUBLISHABLE_KEY`.
4. Despliega. `api/rpc.mjs` se publica como función de Vercel.
5. Después de conocer el dominio final, configura en Supabase la URL del sitio y las redirecciones para ese dominio y `http://127.0.0.1:5173/**`.
6. Configura SMTP propio antes de habilitar recuperación por correo o confirmación de cuentas.

No uses `vite preview` como servidor de producción: solo entrega archivos estáticos y no incluye la API.

## Acceso y soporte

Durante esta etapa no hay planes, cobros ni límites por suscripción. Los propietarios y editores pueden registrar información; los usuarios de consulta conservan acceso de solo lectura.

Consulta [OPERACION.md](docs/OPERACION.md) para administrar planes, equipos, errores de alta y respaldos.

## Verificación

```bash
npm test
npm run build
npx playwright install chromium
npx playwright test
```

Las pruebas cubren el alta desde `auth.users`, la recuperación concurrente, el aislamiento de perfiles, RLS, permisos, transacciones, conflictos y navegación de la demostración.

## Arquitectura y límites

- Frontend Vite con JavaScript y Chart.js; API Node para Vercel.
- PostgreSQL entrega una instantánea coherente y aplica cambios en una transacción con revisión optimista.
- No se migraron datos reales desde Excel ni Google Sheets.
- Las facturas se capturan manualmente; el reconocimiento automático no está habilitado.
- Las invitaciones agregan usuarios que ya crearon una cuenta. No se envían correos de invitación.
- El MCP de Supabase está autenticado en Codex para `pemwlgwqysaufwsrsjdq`.

Referencias: [Supabase Auth](https://supabase.com/docs/guides/auth), [SMTP de Supabase](https://supabase.com/docs/guides/auth/auth-smtp), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [MCP Supabase](https://supabase.com/docs/guides/ai-tools/mcp).
