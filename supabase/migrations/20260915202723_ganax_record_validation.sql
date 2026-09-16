-- Stored records may be rendered by operational views with inline actions.
-- Keep identifiers predictable and reject HTML in plain-text fields at the DB boundary.
begin;
create function ganax_private.validate_record() returns trigger language plpgsql set search_path='' as $$
declare entry record; val text; begin
 for entry in select key,value from jsonb_each(to_jsonb(new)) loop
  if jsonb_typeof(entry.value)<>'string' then continue; end if;
  val=entry.value#>>'{}';
  if length(val)>10000 or val ~ '[<>]' then raise exception 'El campo % debe contener texto simple, sin HTML.',entry.key; end if;
  if entry.key in ('codigo','madre_codigo','predio','lote','propietario','nombre','tipo','actividad','categoria','valor') or entry.key like 'id_%' then
   if length(val)>0 and val !~ '^[[:alnum:] ._()/+:,áéíóúÁÉÍÓÚñÑ-]+$' then raise exception 'El campo % contiene caracteres no permitidos. Usa letras, números, espacios o guiones.',entry.key; end if;
  end if;
  if entry.key like '%_url' and length(val)>0 then
   if val ~ '["''[:space:]]' or not(val like 'https://%' or val like 'storage://' || new.organizacion_id::text || '/%') then raise exception 'Enlace de archivo inválido'; end if;
  end if;
 end loop;
 return new;
end $$;
revoke all on function ganax_private.validate_record() from public;
do $$declare t text; begin
 foreach t in array ARRAY['animales','mediciones','ventas','sanidad','catalogos','predios','lotes','tareas','lluvias','facturas'] loop
  execute format('create trigger validate_record before insert or update on public.%I for each row execute function ganax_private.validate_record()',t);
 end loop;
end $$;
commit;
