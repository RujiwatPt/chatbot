-- Pull display_name from the OAuth user_metadata when redeeming an invite,
-- so profiles have a name from day one.
create or replace function public.redeem_invite(p_code text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists (select 1 from profiles where id = v_uid) then
    return;
  end if;

  update invite_codes
     set used_by = v_uid, used_at = now()
   where code = p_code
     and used_by is null
     and (expires_at is null or expires_at > now());

  if not found then
    raise exception 'invalid_or_used_code';
  end if;

  select coalesce(
           raw_user_meta_data->>'full_name',
           raw_user_meta_data->>'name',
           split_part(email, '@', 1)
         )
    into v_name
    from auth.users
   where id = v_uid;

  insert into profiles (id, invite_code, display_name)
  values (v_uid, p_code, v_name);
end;
$$;
