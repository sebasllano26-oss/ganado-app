# GanaX Cloud

Plataforma ganadera para ofrecer a distintos clientes. Proyecto independiente de la versión de Google Apps Script: no requiere Google Sheets para funcionar.

## Incluye

- Portada comercial y demostración pública de consulta con **28 animales ficticios** (26 activos), pesajes, sanidad, predios, tareas, lluvias, ventas y una factura de ejemplo.
- Registro, confirmación por correo, inicio de sesión, recuperación de contraseña y cierre de sesión con Supabase Auth.
- Una ganadería por propietario, con datos separados por organización. Roles internos `owner`, `editor` y `viewer`.
- Inventario, fichas, nacimientos, pesajes y GDP, reproducción, mortalidad, sanidad, proyecciones, ventas, gastos, tareas, calendario, predios y lluvias.
- Fotos y soportes en un bucket privado. Enlaces firmados de una hora.
- Prueba de 14 días, límites de animales, planes preparados y solicitudes comerciales **sin realizar cobros**.
- Solicitudes de soporte guardadas y exportación de datos JSON.
- Escrituras en transacción, control de concurrencia, auditoría y restricciones en la base de datos.

La demo se genera en el servidor, no modifica Supabase y no contiene los datos reales del proyecto original. Las cuentas nuevas empiezan vacías.

## Ejecutar localmente

Requiere Node.js 22 o posterior.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

En Windows puedes copiar `.env.example` a `.env.local` desde el explorador o usar `Copy-Item .env.example .env.local`. Si `.env.local` ya existe y está configurado, consérvalo.

Abre `http://127.0.0.1:5173`. La demostración funciona sin credenciales en `http://127.0.0.1:5173/?demo=1`.

Las variables `VITE_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_PUBLISHABLE_KEY` usan la **misma clave pública** del proyecto. Nunca pongas una clave `service_role` en una variable que empiece por `VITE_`.

## Supabase

Proyecto configurado: `pemwlgwqysaufwsrsjdq`.

Las migraciones de `supabase/migrations/` son la fuente versionada del esquema. Ya se aplicaron al proyecto indicado durante la preparación inicial. Para otro proyecto, ejecútalas en orden con Supabase CLI o el editor SQL.

Tablas comerciales: `organizaciones`, `miembros`, `planes`, `suscripciones`, `solicitudes_plan`, `soporte`, `auditoria`.

Tablas operativas: `animales`, `mediciones`, `ventas`, `sanidad`, `catalogos`, `predios`, `lotes`, `tareas`, `lluvias`, `facturas`.

Todas tienen RLS habilitado. El cliente puede consultar sus registros; las escrituras pasan por funciones que verifican el usuario, su organización, el rol y la vigencia del plan. Los clientes no pueden cambiar sus propias suscripciones.

## Desplegar en Vercel

1. Importa el repositorio `sebasllano26-oss/ganado-app`.
2. **Root Directory:** raíz del repositorio. **Framework:** Vite. Build `npm run build`; salida `dist`.
3. Usa Node.js 22 o posterior.
4. Añade las cuatro variables de `.env.local` a Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`.
5. Despliega. `api/rpc.mjs` se publica como función de Vercel; el navegador nunca recibe credenciales administrativas.
6. En Supabase → Authentication → URL Configuration configura **Site URL** con el dominio final y permite `https://TU-DOMINIO/**` y `http://127.0.0.1:5173/**` para las redirecciones de confirmación y recuperación.
7. Configura el proveedor SMTP de Supabase para los correos de clientes. Prueba un registro, confirmación y recuperación reales antes de abrir las ventas.

No uses `vite preview` como servidor de producción: solo sirve los archivos estáticos; `npm run dev` y Vercel incluyen la API.

## Suscripciones y soporte

Los precios y la pasarela se definirán después. Los planes Esencial (250 animales) y Profesional (1.000) son configurables en `planes`. Ningún botón cobra ni convierte una solicitud en una suscripción pagada.

Consulta [OPERACION.md](docs/OPERACION.md) para activar un plan manualmente, añadir usuarios existentes, revisar solicitudes y respaldar los datos.

## Verificación

```bash
npm test
npm run build
npx playwright install chromium
npx playwright test
```

Las pruebas cubren reglas ganaderas, aislamiento de organizaciones, RLS, bloqueo de suscripciones vencidas, transacciones, conflictos de escritura y navegación de la demo en escritorio y móvil.

## Arquitectura y límites actuales

- Frontend Vite con JavaScript y Chart.js. El módulo de gestión se carga al entrar a la aplicación.
- API Node.js para Vercel. Reutiliza el motor de cálculo original en contextos independientes por petición. El código confiable del dominio se ejecuta con tiempo máximo y sin acceso a procesos, red ni archivos desde ese contexto.
- PostgreSQL devuelve una instantánea coherente de cada ganadería. Los cambios se aplican mediante una transacción y una revisión optimista. Una edición concurrente muestra un aviso y requiere actualizar; no se sobrescribe silenciosamente.
- El enfoque de instantánea es apropiado para las capacidades iniciales de los planes. Antes de habilitar operaciones significativamente mayores, conviene llevar reportes y cálculos agregados a consultas SQL paginadas.
- No se migraron datos reales desde Excel ni Google Sheets. No se envían correos operativos automáticos. El soporte se revisa en Supabase; no hay todavía una consola de administración comercial ni invitaciones de equipo desde la interfaz.
- Las facturas se capturan y revisan manualmente. El reconocimiento automático de imágenes del prototipo anterior no está habilitado.
- El MCP quedó registrado y autenticado en Codex. La sesión actual lo verificó mediante el transporte oficial de `codex app-server`; después de reiniciar Codex también estará disponible en `/mcp`.

Referencias: [Supabase Auth](https://supabase.com/docs/guides/auth), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [MCP Supabase](https://supabase.com/docs/guides/ai-tools/mcp), [MCP en Codex](https://developers.openai.com/codex/mcp).
