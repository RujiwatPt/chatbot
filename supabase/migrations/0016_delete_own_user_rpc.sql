-- Migration 0016: Add SECURITY DEFINER RPC to delete own user from auth.users
-- Allows users to permanently erase their account & all cascading data (GDPR right to erasure).

set search_path = public;

create or replace function public.delete_own_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  -- Null out foreign key references on invite_codes so auth.users deletion is not blocked by NO ACTION constraints
  update invite_codes set used_by = null where used_by = v_uid;
  update invite_codes set created_by = null where created_by = v_uid;

  -- Deleting from auth.users automatically cascades to profiles, characters, chats, messages, memories
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_own_user() from public;
grant execute on function public.delete_own_user() to authenticated;
