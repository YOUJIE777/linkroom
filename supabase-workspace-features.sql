-- Linkroom: batch dates and administrator-only audit history.
alter table public.batches add column if not exists batch_date date;
update public.batches set batch_date=created_at::date where batch_date is null;

drop policy if exists "members can view activity" on public.record_activity;
drop policy if exists "editors can add activity" on public.record_activity;
create policy "admins can view activity" on public.record_activity for select to authenticated
using (exists (select 1 from public.workspace_members m where m.workspace_id=record_activity.workspace_id and m.user_id=auth.uid() and m.role='admin'));
revoke insert, update, delete on public.record_activity from authenticated, anon;

create or replace function public.linkroom_audit_record()
returns trigger language plpgsql security definer set search_path=public
as $$
declare action_label text;
begin
  if tg_op='INSERT' then action_label:='创建链接';
  elsif tg_op='DELETE' then action_label:='删除链接';
  elsif old.url is distinct from new.url then action_label:='修改链接';
  elsif old.status is distinct from new.status then action_label:='修改状态';
  elsif old.note is distinct from new.note then action_label:='修改备注';
  elsif old.assignee is distinct from new.assignee then action_label:='修改负责人';
  elsif old.batch_id is distinct from new.batch_id then action_label:='调整批次';
  else return coalesce(new,old); end if;
  insert into public.record_activity(workspace_id,record_id,actor,action,before_data,after_data)
  values(coalesce(new.workspace_id,old.workspace_id),case when tg_op='DELETE' then null else new.id end,auth.uid(),action_label,
    case when tg_op='INSERT' then null else jsonb_build_object('url',old.url,'status',old.status,'note',old.note,'assignee',old.assignee,'batch_id',old.batch_id) end,
    case when tg_op='DELETE' then null else jsonb_build_object('url',new.url,'status',new.status,'note',new.note,'assignee',new.assignee,'batch_id',new.batch_id) end);
  return coalesce(new,old);
end $$;
drop trigger if exists linkroom_audit_record on public.records;
create trigger linkroom_audit_record after insert or update or delete on public.records
for each row execute function public.linkroom_audit_record();

create or replace function public.linkroom_audit_attachment()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
  insert into public.record_activity(workspace_id,record_id,actor,action,after_data)
  values(new.workspace_id,new.record_id,auth.uid(),'上传附件',jsonb_build_object('name',new.original_name));
  return new;
end $$;
drop trigger if exists linkroom_audit_attachment on public.attachments;
create trigger linkroom_audit_attachment after insert on public.attachments
for each row execute function public.linkroom_audit_attachment();

drop function if exists public.list_workspace_members(uuid);
create function public.list_workspace_members(target_workspace uuid)
returns table(user_id uuid,email text,role text,display_name text)
language plpgsql stable security definer set search_path=public,auth
as $$
begin
  if not public.is_workspace_member(target_workspace) then raise exception 'not a workspace member' using errcode='42501'; end if;
  return query select m.user_id,u.email::text,m.role,coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'),''),u.email)::text
    from public.workspace_members m join auth.users u on u.id=m.user_id
    where m.workspace_id=target_workspace order by m.created_at;
end $$;
revoke all on function public.list_workspace_members(uuid) from public,anon;
grant execute on function public.list_workspace_members(uuid) to authenticated;
