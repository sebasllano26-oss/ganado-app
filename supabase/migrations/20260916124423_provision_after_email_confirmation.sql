-- A public account becomes usable only after Supabase confirms its email.
begin;

drop trigger if exists provision_account_after_signup on auth.users;

create or replace function ganax_private.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is null then
  return new;
 end if;

 begin
  perform ganax_private.provision_account(
   new.id,
   new.email,
   coalesce(new.raw_user_meta_data,'{}'::jsonb),
   null
  );
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

create trigger provision_account_after_confirmation
 after insert or update of email_confirmed_at on auth.users
 for each row
 when (new.email_confirmed_at is not null)
 execute function ganax_private.handle_new_user();

commit;
