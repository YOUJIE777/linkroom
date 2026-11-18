-- Linkroom collaboration upgrade. Run once in Supabase SQL Editor.
-- Creates server-side member listing/inviting and reliable concurrent update stamps.

create or replace function public.linkroom_touch_updated_at()
returns trigger language plpgsql set search_path = public
as $$ begin new.updated_at := clock_timestamp(); return new; end $$;

drop trigger if exists linkroom_records_touch_updated_at on public.records;
create trigger linkroom_records_touch_updated_at before update on public.records
for each row execute function public.linkroom_touch_updated_at();

drop trigger if exists linkroom_batches_touch_updated_at on public.batches;
create trigger linkroom_batches_touch_updated_at before update on public.batches
for each row execute function public.linkroom_touch_updated_at();

create or replace function public.list_workspace_members(target_workspace uuid)
returns table(user_id uuid, email text, role text)
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_workspace_member(target_workspace) then
    raise exception 'not a workspace member' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role
    from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = target_workspace
    order by m.created_at;
end;
$$;

create or replace function public.add_workspace_member_by_email(
  target_workspace uuid, target_email text, target_role text default 'editor'
)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare target_user uuid;
begin
  if not exists (select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.role='admin') then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if target_role not in ('editor','viewer') then
    raise exception 'role must be editor or viewer' using errcode = '22023';
  end if;
  select u.id into target_user from auth.users u where lower(u.email)=lower(trim(target_email)) limit 1;
  if target_user is null then
    raise exception 'This email has not signed in to Linkroom yet. Send a Supabase Auth invite first.' using errcode = 'P0002';
  end if;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(target_workspace,target_user,target_role)
  on conflict(workspace_id,user_id) do update set role=excluded.role;
end;
$$;

create or replace function public.set_workspace_member_role(
  target_workspace uuid, target_user uuid, target_role text
)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not exists (select 1 from public.workspace_members m where m.workspace_id=target_workspace and m.user_id=auth.uid() and m.role='admin') then
    raise exception 'admin permission required' using errcode = '42501';
  end if;
  if target_role not in ('editor','viewer') then
    raise exception 'role must be editor or viewer' using errcode = '22023';
  end if;
  update public.workspace_members set role=target_role
  where workspace_id=target_workspace and user_id=target_user and role <> 'admin';
  if not found then raise exception 'member not found or is an admin'; end if;
end;
$$;

revoke all on function public.list_workspace_members(uuid) from public, anon;
revoke all on function public.add_workspace_member_by_email(uuid,text,text) from public, anon;
revoke all on function public.set_workspace_member_role(uuid,uuid,text) from public, anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.add_workspace_member_by_email(uuid,text,text) to authenticated;
grant execute on function public.set_workspace_member_role(uuid,uuid,text) to authenticated;

-- Realtime is safe to run again if the tables were already added.
do $$ begin alter publication supabase_realtime add table public.records;
exception when duplicate_object then null; when undefined_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.batches;
exception when duplicate_object then null; when undefined_object then null; end $$;
