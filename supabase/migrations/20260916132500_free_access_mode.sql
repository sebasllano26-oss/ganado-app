-- Subscription billing is intentionally dormant while the product is validated.
-- Owners and editors may write without a trial date or plan limit.
create or replace function ganax_private.can_write(org uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1
    from public.miembros m
    where m.organizacion_id = org
      and m.user_id = auth.uid()
      and m.rol in ('owner', 'editor')
  );
$$;

create or replace function public.ganax_commit(
  org uuid,
  expected_revision bigint,
  changes jsonb,
  action text
)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  rev bigint;
  op jsonb;
  t text;
  r jsonb;
  keys text[];
  cols text;
  sets text;
  predicate text;
begin
  if not ganax_private.can_write(org) then
    raise exception 'No tienes permisos para editar esta ganadería.';
  end if;

  select revision into rev
  from public.organizaciones
  where id=org
  for update;

  if rev<>expected_revision then
    raise exception 'CONFLICT: los datos cambiaron. Actualiza y vuelve a intentar.' using errcode='40001';
  end if;
  if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>10000 then
    raise exception 'Cambios inválidos';
  end if;

  for op in select * from jsonb_array_elements(changes) loop
    t=op->>'table';
    if not(t=any(ARRAY['animales','mediciones','ventas','sanidad','catalogos','predios','lotes','tareas','lluvias','facturas'])) then
      raise exception 'Tabla no permitida';
    end if;
    keys=case t
      when 'animales' then ARRAY['codigo']
      when 'mediciones' then ARRAY['id_medicion']
      when 'ventas' then ARRAY['id_venta']
      when 'sanidad' then ARRAY['id_evento']
      when 'catalogos' then ARRAY['categoria','valor']
      when 'predios' then ARRAY['id_predio']
      when 'lotes' then ARRAY['id_lote']
      when 'tareas' then ARRAY['id_tarea']
      when 'lluvias' then ARRAY['id_lluvia']
      when 'facturas' then ARRAY['id_factura']
    end;
    r=op->'row';
    select jsonb_object_agg(key,case when value='""'::jsonb then 'null'::jsonb else value end)
      into r from jsonb_each(r);
    r=r||jsonb_build_object('organizacion_id',org);
    select string_agg(
      format('%I is not distinct from (jsonb_populate_record(null::public.%I,$2)).%I',k,t,k),
      ' and '
    ) into predicate from unnest(keys) k;
    if coalesce((op->>'remove')::boolean,false) then
      execute format('delete from public.%I where organizacion_id=$1 and %s',t,predicate) using org,r;
    else
      select string_agg(quote_ident(a.attname),','),
             string_agg(format('%I=excluded.%I',a.attname,a.attname),',')
        into cols,sets
      from pg_catalog.pg_attribute a
      where a.attrelid=format('public.%I',t)::regclass
        and a.attnum>0
        and not a.attisdropped;
      execute format(
        'insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).* on conflict (organizacion_id,%s) do update set %s',
        t,t,array_to_string(keys,','),sets
      ) using r;
    end if;
  end loop;

  update public.organizaciones
    set revision=revision+1
    where id=org
    returning revision into rev;
  insert into public.auditoria(organizacion_id,user_id,accion,tablas)
    values(
      org,
      auth.uid(),
      left(action,100),
      ARRAY(select distinct x->>'table' from jsonb_array_elements(changes) x)
    );
  return rev;
end $$;
