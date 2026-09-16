-- Account provisioning backed by PostgreSQL. Existing internal names are kept for compatibility.
begin;

create table public.perfiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 correo text not null check(length(correo) between 3 and 320 and correo !~ '[<>]'),
 nombre_mostrar text not null check(length(nombre_mostrar) between 2 and 100 and nombre_mostrar !~ '[<>]'),
 ganaderia_solicitada text not null check(length(ganaderia_solicitada) between 2 and 100 and ganaderia_solicitada !~ '[<>]'),
 creado_el timestamptz not null default now(),
 actualizado_el timestamptz not null default now()
);

create table ganax_private.errores_alta (
 id bigint generated always as identity primary key,
 user_id uuid not null,
 detalle text not null,
 creado_el timestamptz not null default now()
);
revoke all on ganax_private.errores_alta from public, anon, authenticated;

alter table public.perfiles enable row level security;
revoke all on public.perfiles from anon, authenticated;
grant select on public.perfiles to authenticated;
create policy read_own_profile on public.perfiles for select to authenticated
 using (user_id = (select auth.uid()));
create policy update_own_profile on public.perfiles for update to authenticated
 using (user_id = (select auth.uid()))
 with check (user_id = (select auth.uid()));

create function ganax_private.validate_profile_change() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.user_id is distinct from old.user_id or new.creado_el is distinct from old.creado_el then
  raise exception 'El usuario y la fecha de creación del perfil no se pueden cambiar.';
 end if;
 if new.correo is distinct from old.correo then
  raise exception 'El correo se actualiza desde la cuenta de acceso.';
 end if;
 new.actualizado_el=now();
 return new;
end $$;
revoke all on function ganax_private.validate_profile_change() from public, anon, authenticated;
create trigger validate_profile_change before update on public.perfiles
 for each row execute function ganax_private.validate_profile_change();

create index miembros_user_id_idx on public.miembros(user_id);
create trigger validate_organization_name before insert or update on public.organizaciones
 for each row execute function ganax_private.validate_record();

alter table public.organizaciones drop constraint organizaciones_owner_id_fkey;
alter table public.organizaciones add constraint organizaciones_owner_id_fkey
 foreign key(owner_id) references auth.users(id) on delete cascade;
alter table public.soporte drop constraint soporte_user_id_fkey;
alter table public.soporte add constraint soporte_user_id_fkey
 foreign key(user_id) references auth.users(id) on delete cascade;
alter table public.auditoria drop constraint auditoria_user_id_fkey;
alter table public.auditoria add constraint auditoria_user_id_fkey
 foreign key(user_id) references auth.users(id) on delete cascade;
-- An owner deletion cascades through the organization, including audit rows written by other members.
alter table public.auditoria drop constraint auditoria_organizacion_id_fkey;
alter table public.auditoria add constraint auditoria_organizacion_id_fkey
 foreign key(organizacion_id) references public.organizaciones(id) on delete cascade;

create function ganax_private.provision_account(
 target_user uuid,
 target_email text,
 metadata jsonb,
 requested_farm text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
 org uuid;
 farm text;
 display_name text;
begin
 farm=trim(coalesce(nullif(requested_farm,''),metadata->>'farm_name','Mi ganadería'));
 if length(farm) not between 2 and 100 or farm ~ '[<>]' then farm='Mi ganadería'; end if;
 display_name=trim(coalesce(nullif(metadata->>'display_name',''),nullif(metadata->>'full_name',''),split_part(target_email,'@',1),'Usuario'));
 if length(display_name) not between 2 and 100 or display_name ~ '[<>]' then
  display_name='Usuario';
 end if;

 insert into public.perfiles(user_id,correo,nombre_mostrar,ganaderia_solicitada)
 values(target_user,lower(trim(target_email)),display_name,farm)
 on conflict(user_id) do nothing;

 insert into public.organizaciones(nombre,owner_id) values(farm,target_user)
 on conflict(owner_id) do nothing returning id into org;
 if org is null then
  select id into org from public.organizaciones where owner_id=target_user;
 end if;
 if org is null then raise exception 'No fue posible preparar la ganadería.'; end if;

 insert into public.miembros(organizacion_id,user_id,rol) values(org,target_user,'owner')
 on conflict(organizacion_id,user_id) do update set rol='owner';
 insert into public.suscripciones(organizacion_id,plan_id,estado)
 values(org,'trial','trialing') on conflict(organizacion_id) do nothing;
 return org;
end $$;
revoke all on function ganax_private.provision_account(uuid,text,jsonb,text) from public, anon, authenticated;

create function ganax_private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 begin
  perform ganax_private.provision_account(new.id,new.email,coalesce(new.raw_user_meta_data,'{}'::jsonb),null);
 exception when others then
  begin
   insert into ganax_private.errores_alta(user_id,detalle)
   values(new.id,left(sqlerrm,1000));
  exception when others then
   raise warning 'No se pudo registrar el error de alta para el usuario %.',new.id;
  end;
 end;
 return new;
end $$;
revoke all on function ganax_private.handle_new_user() from public, anon, authenticated;
create trigger provision_account_after_signup after insert on auth.users
 for each row execute function ganax_private.handle_new_user();

create or replace function public.crear_ganaderia(nombre text) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 org uuid;
 v_user uuid;
 account_email text;
 account_metadata jsonb;
 farm text;
begin
 v_user=(select auth.uid());
 if v_user is null then raise exception 'Inicia sesión para continuar.'; end if;
 select p.ganaderia_solicitada into farm from public.perfiles p where p.user_id=v_user;
 select u.email,coalesce(u.raw_user_meta_data,'{}'::jsonb)
 into account_email,account_metadata from auth.users u where u.id=v_user;
 if account_email is null then raise exception 'Tu cuenta no tiene un correo válido. Revisa el acceso en Supabase.'; end if;
 farm=coalesce(nullif(trim(nombre),''),farm,account_metadata->>'farm_name','Mi ganadería');
 org=ganax_private.provision_account(v_user,account_email,account_metadata,farm);
 return org;
end $$;

create function public.actualizar_perfil(nombre_mostrar text) returns void
language plpgsql security definer set search_path='' as $$
declare v_user uuid; clean_name text; begin
 v_user=(select auth.uid());
 if v_user is null then raise exception 'Inicia sesión para continuar.'; end if;
 clean_name=trim(nombre_mostrar);
 if length(clean_name) not between 2 and 100 or clean_name ~ '[<>]' then
  raise exception 'Escribe un nombre de 2 a 100 caracteres, sin HTML.';
 end if;
 update public.perfiles set nombre_mostrar=clean_name where user_id=v_user;
 if not found then raise exception 'No encontramos tu perfil. Vuelve a ingresar e inténtalo de nuevo.'; end if;
end $$;

create function public.invitar_miembro(org uuid, correo text, nuevo_rol text) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid; invited_user uuid; clean_email text; begin
 v_user=(select auth.uid());
 if not exists(select 1 from public.miembros where organizacion_id=org and user_id=v_user and rol='owner') then
  raise exception 'Solo el propietario puede agregar personas al equipo.';
 end if;
 clean_email=lower(trim(correo));
 if clean_email='' or length(clean_email)>320 or clean_email ~ '[<>[:space:]]' then
  raise exception 'Escribe un correo válido.';
 end if;
 if nuevo_rol not in ('editor','viewer') then raise exception 'Elige acceso de edición o de consulta.'; end if;
 select id into invited_user from auth.users where lower(email)=clean_email limit 1;
 if invited_user is null then
  raise exception 'Esa persona debe crear su cuenta primero con el mismo correo.';
 end if;
 if exists(select 1 from public.organizaciones where id=org and owner_id=invited_user) then
  raise exception 'Esa persona ya es propietaria de la ganadería.';
 end if;
 insert into public.miembros(organizacion_id,user_id,rol) values(org,invited_user,nuevo_rol)
 on conflict(organizacion_id,user_id) do update set rol=excluded.rol;
 return invited_user;
end $$;

create or replace function public.solicitar_plan(org uuid, plan text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.miembros where organizacion_id=org and user_id=(select auth.uid()) and rol='owner') then
  raise exception 'Solo el propietario puede solicitar un plan.';
 end if;
 if plan not in ('esencial','profesional') then raise exception 'Elige un plan válido.'; end if;
 insert into public.solicitudes_plan(organizacion_id,plan_id) values(org,plan)
 on conflict(organizacion_id) do update set plan_id=excluded.plan_id,created_at=now();
end $$;

create or replace function public.crear_ticket(org uuid, asunto text, mensaje text) returns uuid
language plpgsql security definer set search_path='' as $$
declare ticket uuid; v_user uuid; begin
 v_user=(select auth.uid());
 if v_user is null or not ganax_private.is_member(org) then raise exception 'No tienes acceso a esta ganadería.'; end if;
 if (select count(*) from public.soporte where organizacion_id=org and created_at>now()-interval '1 day')>=10 then
  raise exception 'Ya registraste varias solicitudes hoy. Inténtalo de nuevo mañana.';
 end if;
 insert into public.soporte(organizacion_id,user_id,asunto,mensaje)
 values(org,v_user,asunto,mensaje) returning id into ticket;
 return ticket;
end $$;

revoke all on function public.crear_ganaderia(text) from public, anon;
grant execute on function public.crear_ganaderia(text) to authenticated;
revoke all on function public.actualizar_perfil(text) from public, anon;
grant execute on function public.actualizar_perfil(text) to authenticated;
revoke all on function public.invitar_miembro(uuid,text,text) from public, anon;
grant execute on function public.invitar_miembro(uuid,text,text) to authenticated;
revoke all on function public.solicitar_plan(uuid,text) from public, anon;
grant execute on function public.solicitar_plan(uuid,text) to authenticated;
revoke all on function public.crear_ticket(uuid,text,text) from public, anon;
grant execute on function public.crear_ticket(uuid,text,text) to authenticated;

commit;
