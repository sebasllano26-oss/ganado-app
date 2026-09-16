-- GanaX Cloud: isolated workspaces, account trials and operational records.
begin;
create schema if not exists ganax_private;
revoke all on schema ganax_private from public;
create table public.organizaciones (
 id uuid primary key default gen_random_uuid(), nombre text not null check(length(nombre) between 2 and 100),
 owner_id uuid not null unique references auth.users(id), created_at timestamptz not null default now(), revision bigint not null default 0
);
create table public.miembros (
 organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 rol text not null default 'owner' check(rol in ('owner','editor','viewer')),
 primary key(organizacion_id,user_id)
);
create table public.planes (id text primary key, nombre text not null, max_animales integer not null check(max_animales>0), disponible boolean not null default false);
insert into public.planes values ('trial','Prueba',100,true),('esencial','Esencial',250,false),('profesional','Profesional',1000,false);
create table public.suscripciones (
 organizacion_id uuid primary key references public.organizaciones(id) on delete cascade,
 plan_id text not null references public.planes(id) default 'trial',
 estado text not null default 'trialing' check(estado in ('trialing','active','past_due','canceled')),
 trial_ends_at timestamptz not null default now()+interval '14 days',
 current_period_end timestamptz, proveedor text, external_id text unique, updated_at timestamptz not null default now()
);
create table public.solicitudes_plan (
 organizacion_id uuid primary key references public.organizaciones(id) on delete cascade,
 plan_id text not null references public.planes(id), created_at timestamptz not null default now()
);
create table public.soporte (
 id uuid primary key default gen_random_uuid(), organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 user_id uuid not null references auth.users(id), asunto text not null check(length(asunto) between 3 and 150),
 mensaje text not null check(length(mensaje) between 10 and 5000), estado text not null default 'abierto' check(estado in ('abierto','en_revision','resuelto')), created_at timestamptz not null default now()
);
create table public.auditoria (
 id bigint generated always as identity primary key, organizacion_id uuid not null references public.organizaciones(id), user_id uuid references auth.users(id),
 accion text not null, tablas text[] not null, created_at timestamptz not null default now()
);
create function ganax_private.is_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.miembros where organizacion_id=org and user_id=(select auth.uid())); $$;
create function ganax_private.can_write(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.miembros m join public.suscripciones s using(organizacion_id)
 where m.organizacion_id=org and m.user_id=(select auth.uid()) and m.rol in ('owner','editor')
 and ((s.estado='trialing' and s.trial_ends_at>now()) or (s.estado='active' and s.current_period_end>now()))); $$;
grant usage on schema ganax_private to authenticated;
revoke all on all functions in schema ganax_private from public;
grant execute on all functions in schema ganax_private to authenticated;
create table public.animales (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 codigo text not null,
 predio text,
 lote text,
 tipo text,
 indicaciones text,
 fecha_ingreso date,
 meses numeric,
 peso_inicial numeric,
 precio_compra numeric,
 estado text,
 dias_en_finca numeric,
 propietario text,
 causa_muerte text,
 estado_reproductivo text,
 desarrollo_ovarico text,
 estado_descarte text,
 motivo_descarte text,
 obs_descarte text,
 fecha_descarte date,
 foto_url text,
 tipo_ingreso text,
 sexo text,
 fecha_nacimiento date,
 madre_codigo text,
 proveedor text,
 en_vacas text,
 meta_crec numeric,
 fecha_muerte date,
 causa_muerte_otra text,
 obs_muerte text,
 foto_muerte_url text, primary key(organizacion_id,codigo));
create table public.mediciones (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_medicion text not null,
 codigo text,
 fecha date,
 peso numeric,
 ganancia_peso numeric,
 dias_desde_anterior numeric,
 gdp numeric,
 clasificacion text,
 observacion text,
 alerta text, primary key(organizacion_id,id_medicion));
create table public.ventas (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_venta text not null,
 codigo text,
 fecha_venta date,
 precio_salida numeric,
 precio_kg numeric,
 peso_salida numeric,
 utilidad numeric,
 dias_en_predio numeric,
 comprador text,
 precio_compra numeric, primary key(organizacion_id,id_venta));
create table public.sanidad (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_evento text not null,
 codigo text,
 fecha date,
 tipo text,
 medicamento text,
 dosis text,
 responsable text,
 proxima_fecha date,
 observacion text,
 estado_reproductivo text,
 desarrollo_ovarico text, primary key(organizacion_id,id_evento));
create table public.catalogos (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 categoria text not null,
 valor text not null, primary key(organizacion_id,categoria,valor));
create table public.predios (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_predio text not null,
 nombre text,
 propietario text,
 notas text,
 activo text, primary key(organizacion_id,id_predio));
create table public.lotes (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_lote text not null,
 id_predio text,
 nombre text,
 area_ha numeric,
 notas text,
 activo text, primary key(organizacion_id,id_lote));
create table public.tareas (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_tarea text not null,
 id_predio text,
 id_lote text,
 actividad text,
 descripcion text,
 responsable text,
 fecha_programada date,
 fecha_ejecucion date,
 estado text,
 motivo text,
 observacion text,
 id_origen text,
 origen_tipo text,
 creada_el text,
 prioridad text, primary key(organizacion_id,id_tarea));
create table public.lluvias (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_lluvia text not null,
 id_predio text,
 fecha date,
 milimetros numeric,
 observacion text,
 registrado_por text,
 creada_el text, primary key(organizacion_id,id_lluvia));
create table public.facturas (organizacion_id uuid not null references public.organizaciones(id) on delete cascade,
 id_factura text not null,
 fecha date,
 proveedor text,
 nit text,
 numero text,
 concepto text,
 categoria text,
 id_predio text,
 subtotal numeric,
 iva numeric,
 total numeric,
 estado text,
 revisada text,
 drive_id text,
 drive_url text,
 mes text,
 notas text,
 subida_el text,
 enviada_el text,
 aprobada_el text, primary key(organizacion_id,id_factura));
alter table public.mediciones add foreign key(organizacion_id,codigo) references public.animales(organizacion_id,codigo) deferrable initially deferred;
create index on public.mediciones(organizacion_id,codigo);
alter table public.ventas add foreign key(organizacion_id,codigo) references public.animales(organizacion_id,codigo) deferrable initially deferred;
create index on public.ventas(organizacion_id,codigo);
alter table public.sanidad add foreign key(organizacion_id,codigo) references public.animales(organizacion_id,codigo) deferrable initially deferred;
create index on public.sanidad(organizacion_id,codigo);
alter table public.animales add foreign key(organizacion_id,madre_codigo) references public.animales(organizacion_id,codigo) deferrable initially deferred;
alter table public.lotes add foreign key(organizacion_id,id_predio) references public.predios(organizacion_id,id_predio) deferrable initially deferred;
alter table public.lotes add unique(organizacion_id,id_predio,id_lote);
alter table public.tareas add foreign key(organizacion_id,id_predio) references public.predios(organizacion_id,id_predio) deferrable initially deferred;
alter table public.tareas add foreign key(organizacion_id,id_predio,id_lote) references public.lotes(organizacion_id,id_predio,id_lote) deferrable initially deferred;
alter table public.lluvias add foreign key(organizacion_id,id_predio) references public.predios(organizacion_id,id_predio) deferrable initially deferred;
alter table public.facturas add foreign key(organizacion_id,id_predio) references public.predios(organizacion_id,id_predio) deferrable initially deferred;
alter table public.mediciones add constraint peso_valido check(peso>0 and peso<3000), add unique(organizacion_id,codigo,fecha);
alter table public.animales add constraint estado_valido check(estado in ('ACTIVO','VENDIDO','MUERTO'));
alter table public.lluvias add constraint lluvia_valida check(milimetros>=0 and milimetros<=2000);
alter table public.ventas add constraint venta_valida check(precio_salida>0 and peso_salida>0);
alter table public.facturas add constraint total_valido check(total>0);
create index on public.animales(organizacion_id,estado);
create index on public.tareas(organizacion_id,fecha_programada);
create index on public.lluvias(organizacion_id,fecha);
create index on public.facturas(organizacion_id,mes);
alter table public.organizaciones enable row level security;
revoke all on public.organizaciones from anon,authenticated;
grant select on public.organizaciones to authenticated;
create policy read_member on public.organizaciones for select to authenticated using (ganax_private.is_member(id));
alter table public.planes enable row level security;
revoke all on public.planes from anon,authenticated;
grant select on public.planes to authenticated;
create policy read_member on public.planes for select to authenticated using (true);
alter table public.miembros enable row level security;
revoke all on public.miembros from anon,authenticated;
grant select on public.miembros to authenticated;
create policy read_member on public.miembros for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.suscripciones enable row level security;
revoke all on public.suscripciones from anon,authenticated;
grant select on public.suscripciones to authenticated;
create policy read_member on public.suscripciones for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.solicitudes_plan enable row level security;
revoke all on public.solicitudes_plan from anon,authenticated;
grant select on public.solicitudes_plan to authenticated;
create policy read_member on public.solicitudes_plan for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.soporte enable row level security;
revoke all on public.soporte from anon,authenticated;
grant select on public.soporte to authenticated;
create policy read_member on public.soporte for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.auditoria enable row level security;
revoke all on public.auditoria from anon,authenticated;
grant select on public.auditoria to authenticated;
create policy read_member on public.auditoria for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.animales enable row level security;
revoke all on public.animales from anon,authenticated;
grant select on public.animales to authenticated;
create policy read_member on public.animales for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.mediciones enable row level security;
revoke all on public.mediciones from anon,authenticated;
grant select on public.mediciones to authenticated;
create policy read_member on public.mediciones for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.ventas enable row level security;
revoke all on public.ventas from anon,authenticated;
grant select on public.ventas to authenticated;
create policy read_member on public.ventas for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.sanidad enable row level security;
revoke all on public.sanidad from anon,authenticated;
grant select on public.sanidad to authenticated;
create policy read_member on public.sanidad for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.catalogos enable row level security;
revoke all on public.catalogos from anon,authenticated;
grant select on public.catalogos to authenticated;
create policy read_member on public.catalogos for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.predios enable row level security;
revoke all on public.predios from anon,authenticated;
grant select on public.predios to authenticated;
create policy read_member on public.predios for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.lotes enable row level security;
revoke all on public.lotes from anon,authenticated;
grant select on public.lotes to authenticated;
create policy read_member on public.lotes for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.tareas enable row level security;
revoke all on public.tareas from anon,authenticated;
grant select on public.tareas to authenticated;
create policy read_member on public.tareas for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.lluvias enable row level security;
revoke all on public.lluvias from anon,authenticated;
grant select on public.lluvias to authenticated;
create policy read_member on public.lluvias for select to authenticated using (ganax_private.is_member(organizacion_id));
alter table public.facturas enable row level security;
revoke all on public.facturas from anon,authenticated;
grant select on public.facturas to authenticated;
create policy read_member on public.facturas for select to authenticated using (ganax_private.is_member(organizacion_id));
create function public.crear_ganaderia(nombre text) returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; begin
 if auth.uid() is null then raise exception 'Inicia sesión'; end if;
 select id into org from public.organizaciones where owner_id=auth.uid(); if org is not null then return org; end if;
 insert into public.organizaciones(nombre,owner_id) values(trim(nombre),auth.uid()) returning id into org;
 insert into public.miembros values(org,auth.uid(),'owner'); insert into public.suscripciones(organizacion_id) values(org);
 return org;
end $$;
create function public.ganax_snapshot(org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; t text; rows jsonb; begin
 if not ganax_private.is_member(org) then raise exception 'Acceso denegado'; end if;
 select jsonb_build_object('revision',revision) into result from public.organizaciones where id=org;
 foreach t in array ARRAY['animales','mediciones','ventas','sanidad','catalogos','predios','lotes','tareas','lluvias','facturas'] loop
  execute format('select coalesce(jsonb_agg(to_jsonb(x)-''organizacion_id''),''[]''::jsonb) from public.%I x where organizacion_id=$1',t) into rows using org;
  result=result||jsonb_build_object(t,rows);
 end loop;
 return result;
end $$;
create function public.ganax_commit(org uuid, expected_revision bigint, changes jsonb, action text) returns bigint language plpgsql security definer set search_path='' as $$
declare rev bigint; op jsonb; t text; r jsonb; keys text[]; cols text; sets text; predicate text; limit_n int; begin
 if not ganax_private.can_write(org) then raise exception 'Tu cuenta no permite cambios. Revisa tu plan o permisos.'; end if;
 select revision into rev from public.organizaciones where id=org for update;
 if rev<>expected_revision then raise exception 'CONFLICT: los datos cambiaron. Actualiza y vuelve a intentar.' using errcode='40001'; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>10000 then raise exception 'Cambios inválidos'; end if;
 for op in select * from jsonb_array_elements(changes) loop
  t=op->>'table';
  if not(t=any(ARRAY['animales','mediciones','ventas','sanidad','catalogos','predios','lotes','tareas','lluvias','facturas'])) then raise exception 'Tabla no permitida'; end if;
  keys=case t when 'animales' then ARRAY['codigo'] when 'mediciones' then ARRAY['id_medicion'] when 'ventas' then ARRAY['id_venta'] when 'sanidad' then ARRAY['id_evento'] when 'catalogos' then ARRAY['categoria','valor'] when 'predios' then ARRAY['id_predio'] when 'lotes' then ARRAY['id_lote'] when 'tareas' then ARRAY['id_tarea'] when 'lluvias' then ARRAY['id_lluvia'] when 'facturas' then ARRAY['id_factura'] end;
  r=op->'row';
  select jsonb_object_agg(key,case when value='""'::jsonb then 'null'::jsonb else value end) into r from jsonb_each(r);
  r=r||jsonb_build_object('organizacion_id',org);
  select string_agg(format('%I is not distinct from (jsonb_populate_record(null::public.%I,$2)).%I',k,t,k),' and ') into predicate from unnest(keys) k;
  if coalesce((op->>'remove')::boolean,false) then
   execute format('delete from public.%I where organizacion_id=$1 and %s',t,predicate) using org,r;
  else
   select string_agg(quote_ident(a.attname),','), string_agg(format('%I=excluded.%I',a.attname,a.attname),',') into cols,sets
   from pg_catalog.pg_attribute a where a.attrelid=format('public.%I',t)::regclass and a.attnum>0 and not a.attisdropped;
   execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).* on conflict (organizacion_id,%s) do update set %s',t,t,array_to_string(keys,','),sets) using r;
  end if;
 end loop;
 select p.max_animales into limit_n from public.suscripciones s join public.planes p on p.id=s.plan_id where s.organizacion_id=org;
 if (select count(*) from public.animales where organizacion_id=org and estado='ACTIVO')>limit_n then raise exception 'Se alcanzó el límite de animales del plan.'; end if;
 update public.organizaciones set revision=revision+1 where id=org returning revision into rev;
 insert into public.auditoria(organizacion_id,user_id,accion,tablas) values(org,auth.uid(),left(action,100),ARRAY(select distinct x->>'table' from jsonb_array_elements(changes) x));
 return rev;
end $$;
create function public.solicitar_plan(org uuid, plan text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.miembros where organizacion_id=org and user_id=auth.uid() and rol='owner') then raise exception 'Solo el propietario puede solicitar un plan'; end if;
 if plan not in ('esencial','profesional') then raise exception 'Plan inválido'; end if;
 insert into public.solicitudes_plan(organizacion_id,plan_id) values(org,plan) on conflict(organizacion_id) do update set plan_id=excluded.plan_id,created_at=now();
end $$;
create function public.crear_ticket(org uuid, asunto text, mensaje text) returns uuid language plpgsql security definer set search_path='' as $$
declare ticket uuid; begin
 if not ganax_private.is_member(org) then raise exception 'Acceso denegado'; end if;
 if (select count(*) from public.soporte where organizacion_id=org and created_at>now()-interval '1 day')>=10 then raise exception 'Límite diario de solicitudes alcanzado'; end if;
 insert into public.soporte(organizacion_id,user_id,asunto,mensaje) values(org,auth.uid(),asunto,mensaje) returning id into ticket;
 return ticket;
end $$;
revoke all on function public.crear_ganaderia(text) from public,anon; grant execute on function public.crear_ganaderia(text) to authenticated;
revoke all on function public.ganax_snapshot(uuid) from public,anon; grant execute on function public.ganax_snapshot(uuid) to authenticated;
revoke all on function public.ganax_commit(uuid,bigint,jsonb,text) from public,anon; grant execute on function public.ganax_commit(uuid,bigint,jsonb,text) to authenticated;
revoke all on function public.solicitar_plan(uuid,text) from public,anon; grant execute on function public.solicitar_plan(uuid,text) to authenticated;
revoke all on function public.crear_ticket(uuid,text,text) from public,anon; grant execute on function public.crear_ticket(uuid,text,text) to authenticated;
commit;

begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ganax-files','ganax-files',false,2500000,ARRAY['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy ganax_read_files on storage.objects for select to authenticated
using(bucket_id='ganax-files' and (storage.foldername(name))[1] in (select organizacion_id::text from public.miembros where user_id=auth.uid()));
create policy ganax_upload_files on storage.objects for insert to authenticated
with check(bucket_id='ganax-files' and (storage.foldername(name))[1] in (select organizacion_id::text from public.miembros where user_id=auth.uid() and ganax_private.can_write(organizacion_id)));
commit;
