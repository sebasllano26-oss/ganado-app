# Operación de Gestión Ganadera

## Altas de cuenta

Al crear una cuenta, el trigger `provision_account_after_signup` intenta crear en una transacción:

- el perfil;
- la organización;
- la membresía `owner`;
- la suscripción de prueba.

El trigger nunca cancela el alta de Auth. Si el bloque falla, revierte esas cuatro filas, conserva el usuario y registra el detalle para el administrador:

```sql
select id, user_id, detalle, creado_el
from ganax_private.errores_alta
order by creado_el desc;
```

Al ingresar, la aplicación llama a `crear_ganaderia(null)` si no encuentra membresías. Esa función reconstruye las filas faltantes, soporta llamadas repetidas o simultáneas y devuelve siempre el mismo UUID del propietario. Después de reparar una cuenta, revisa el error registrado y corrige su causa antes de borrarlo mediante un procedimiento administrativo controlado.

## Perfiles y seguridad

Cada usuario solo puede leer su perfil. La política de actualización también limita la fila al usuario autenticado, pero no se concede `update` directo: el cambio del nombre visible pasa por `actualizar_perfil`. `user_id`, `correo` y `creado_el` no se pueden alterar desde esa función.

Los nombres rechazan HTML y tienen límites de longitud. La aplicación muestra `perfiles.nombre_mostrar` y `organizaciones.nombre`; no usa `user_metadata` como fuente posterior al registro.

## Equipo

El propietario agrega a una persona desde **Cuenta y plan → Equipo**. La persona debe haber creado primero una cuenta con el mismo correo. La función `invitar_miembro` busca esa cuenta y agrega o actualiza su rol mediante una escritura controlada. No insertes filas de `miembros` manualmente y no concedas permisos directos de escritura.

Cuando una persona pertenece a varias ganaderías, puede elegir el espacio activo en **Cuenta y plan → Tus ganaderías**. `viewer` consulta y exporta; `editor` registra cambios durante la vigencia del plan; `owner` también administra el equipo y solicita cambios de plan.

## Planes

Solo el administrador del proyecto activa una suscripción. Revisa la fila antes de modificarla:

```sql
select o.id, o.nombre, s.*
from public.organizaciones o
join public.suscripciones s on s.organizacion_id=o.id;

update public.suscripciones
set plan_id='esencial', estado='active',
    current_period_end=now()+interval '1 month', updated_at=now()
where organizacion_id='UUID-DE-LA-ORGANIZACION';
```

Cuando se integre una pasarela, verifica las firmas de los webhooks y procesa eventos de forma idempotente. Las claves de pago deben existir solo en el servidor.

## Configuración de Auth pendiente de aprobación

Para igualar la validación del cliente, la configuración propuesta es:

- longitud mínima de contraseña: `10`;
- requisitos adicionales de caracteres: ninguno;
- protección contra contraseñas filtradas: activada si el proyecto usa plan Pro o superior;
- URL local permitida: `http://127.0.0.1:5173/**`;
- URL del sitio y redirección de producción: el dominio HTTPS exacto de Vercel cuando exista.

No cambies estos valores hasta aprobarlos y contar con el dominio final.

## Solicitudes, datos y archivos

- `solicitudes_plan` contiene la última solicitud comercial por organización.
- `soporte` guarda los tickets; el administrador puede cambiar su estado a `en_revision` o `resuelto`.
- El usuario puede descargar un respaldo JSON desde Cuenta y plan, aunque venza la suscripción.
- El bucket interno `ganax-files` es privado y conserva su nombre por compatibilidad. Cada ruta empieza con el UUID de la organización.
- Los enlaces firmados vencen después de una hora.
- `auditoria` registra usuario, operación y tablas modificadas.

## Diagnóstico

- **La demo funciona pero no puedo entrar:** revisa las cuatro variables y las migraciones aplicadas.
- **La cuenta abre sin ganadería:** revisa `ganax_private.errores_alta`; el siguiente ingreso intentará repararla.
- **No llega la confirmación:** revisa SMTP, registros de Auth y URLs permitidas.
- **No puedo agregar a una persona:** confirma que ya creó su cuenta con el mismo correo.
- **Se alcanzó el límite:** revisa el plan y `planes.max_animales`.
- **Los datos cambiaron mientras trabajabas:** actualiza la vista antes de repetir la edición.

## Estructura

- `src/`: portada, autenticación, cuenta, vistas y estilos.
- `api/rpc.mjs`: API autenticada y demostración pública de consulta.
- `server/domain/`: reglas y cálculos ganaderos.
- `server/runtime.mjs`: ejecución aislada por petición.
- `supabase/migrations/`: fuente versionada de tablas, permisos, funciones y validaciones.
- `scripts/supabase-mcp.mjs`: acceso al MCP autenticado sin copiar credenciales.
