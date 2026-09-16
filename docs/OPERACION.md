# Operación de GanaX

## Planes

Solo el administrador del proyecto puede cambiar una suscripción. Desde Supabase SQL Editor, usa el UUID de la organización solicitado; revisa la fila antes de modificarla.

```sql
select o.id, o.nombre, s.*
from public.organizaciones o
join public.suscripciones s on s.organizacion_id=o.id;

-- Reemplaza el UUID por la organización que corresponda.
update public.suscripciones
set plan_id='esencial', estado='active',
    current_period_end=now()+interval '1 month', updated_at=now()
where organizacion_id='UUID-DE-LA-ORGANIZACION';
```

No actives planes automáticamente por el retorno de una pantalla de pago. Cuando se integre una pasarela, verifica la firma de sus webhooks y procesa cada evento de forma idempotente. Las claves de la pasarela serán exclusivas del servidor. Los estados contemplados son `trialing`, `active`, `past_due` y `canceled`.

## Usuarios del equipo

La interfaz inicial crea una ganadería por propietario. Para agregar a alguien que ya tenga usuario en Supabase Auth, el administrador puede insertar una membresía. No uses el correo como autorización; usa el UUID de `auth.users`.

```sql
insert into public.miembros(organizacion_id,user_id,rol)
values ('UUID-ORGANIZACION','UUID-USUARIO','editor');
```

`viewer` puede consultar y exportar. `editor` puede registrar cambios durante la vigencia del plan. `owner` puede además solicitar un cambio de plan. Todos los miembros de la ganadería pueden consultar la información financiera de esa organización; no se usa el antiguo PIN compartido.

## Solicitudes y soporte

`solicitudes_plan` contiene la última solicitud comercial por organización. `soporte` guarda los tickets. Puedes actualizar el estado del ticket a `en_revision` o `resuelto` desde Supabase. Las solicitudes no envían correos ni comprometen una compra.

## Datos y archivos

- El usuario puede descargar un respaldo JSON desde Cuenta y plan, incluso si venció su suscripción.
- Habilita las copias de seguridad adecuadas para tu plan de Supabase y documenta una restauración de prueba antes de operar comercialmente.
- El bucket `ganax-files` es privado; cada ruta comienza con el UUID de la organización. Los enlaces firmados vencen después de una hora y se renuevan al consultar los registros.
- Eliminar un registro no elimina automáticamente su fotografía. Esto conserva soportes; una futura limpieza debe comprobar referencias antes de borrar objetos.
- `auditoria` registra el usuario, la operación y las tablas modificadas, sin duplicar información sensible en los logs de Vercel.

## Seguridad

Las funciones RPC `SECURITY DEFINER` son intencionales: centralizan escrituras que no están concedidas a los clientes. Cada función comprueba `auth.uid()`, pertenencia, rol o vigencia según corresponda, usa un `search_path` vacío y restringe las tablas permitidas. El asesor de Supabase las señala como revisión manual; las pruebas incluyen accesos cruzados y manipulación del plan.

Los nombres e identificadores de las vistas operativas admiten letras, números, espacios y signos sencillos. La base rechaza HTML y enlaces ejecutables. Antes de introducir nuevas columnas o operaciones, extiende las validaciones y las pruebas de aislamiento.

## Diagnóstico

- **La demo funciona pero no puedo entrar:** revisa las cuatro variables y que las migraciones estén aplicadas.
- **No llega confirmación:** revisa SMTP, registros de Auth y URLs permitidas en Supabase.
- **Se alcanzó el límite:** revisa `planes.max_animales` y el plan de esa organización.
- **Los datos cambiaron mientras trabajabas:** actualiza la vista; otro registro modificó la revisión de la ganadería.
- **No permite cambios:** verifica el rol y la fecha de vencimiento.
- **Una operación falla por relación:** revisa el animal, predio o lote relacionado antes de eliminarlo.

## Estructura

`src/`: portada, autenticación, cuenta, vistas ganaderas y estilos.

`api/rpc.mjs`: API autenticada y demo pública de consulta.

`server/domain/`: reglas y cálculos ganaderos migrados del sistema original.

`server/runtime.mjs`: repositorio en memoria por petición; no es persistencia local.

`supabase/migrations/`: tablas, permisos, funciones, almacenamiento y validaciones.

`scripts/supabase-mcp.mjs`: mantenimiento mediante el MCP autenticado de Codex. No inicia turnos de modelo ni copia credenciales.
