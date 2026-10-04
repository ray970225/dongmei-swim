-- Deployed to Supabase as migration version 20261004153005.
-- Record administrative content changes in the database so the actor is derived
-- from the authenticated request rather than trusted from browser-supplied data.
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text not null default '系統作業',
  action text not null check (action in ('create', 'update', 'delete')),
  entity_type text not null check (entity_type in ('article', 'news', 'honour', 'recruitment', 'member')),
  entity_id text not null,
  entity_label text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_entity_created_at_idx
  on public.admin_audit_logs (entity_type, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;
grant all on public.admin_audit_logs to service_role;

create policy admin_audit_logs_admin_read
  on public.admin_audit_logs
  for select
  to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]));

create or replace function private.audit_admin_content_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_actor_email text := '系統作業';
  v_action text := lower(tg_op);
  v_entity_type text;
  v_entity_id text;
  v_entity_label text;
  v_current jsonb;
  v_previous jsonb;
  v_details jsonb := '{}'::jsonb;
begin
  if v_actor_id is not null then
    select p.email
      into v_actor_email
      from public.profiles p
      where p.id = v_actor_id
        and p.active
        and p.role = 'admin';

    if v_actor_email is null then
      raise exception 'Active administrator required for audit logging';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_current := to_jsonb(old);
    v_previous := v_current;
  else
    v_current := to_jsonb(new);
    if tg_op = 'UPDATE' then
      v_previous := to_jsonb(old);
    end if;
  end if;

  case tg_table_name
    when 'articles' then
      v_entity_type := 'article';
      v_entity_id := v_current ->> 'id';
      v_entity_label := coalesce(v_current ->> 'title', '未命名文章');
      if tg_op = 'UPDATE'
        and v_previous ->> 'status' is distinct from v_current ->> 'status' then
        v_details := jsonb_build_object(
          'from_status', v_previous ->> 'status',
          'to_status', v_current ->> 'status'
        );
      end if;
    when 'site_news' then
      v_entity_type := 'news';
      v_entity_id := v_current ->> 'id';
      v_entity_label := coalesce(v_current ->> 'title', '未命名消息');
    when 'site_honours' then
      v_entity_type := 'honour';
      v_entity_id := v_current ->> 'id';
      v_entity_label := concat_ws(
        ' · ',
        coalesce(v_current ->> 'event', '未命名賽事'),
        v_current ->> 'year',
        v_current ->> 'name'
      );
    when 'recruitment_classes' then
      v_entity_type := 'recruitment';
      v_entity_id := v_current ->> 'id';
      v_entity_label := coalesce(v_current ->> 'name', '未命名招生班別');
    else
      raise exception 'Unsupported audit target table: %', tg_table_name;
  end case;

  insert into public.admin_audit_logs (
    actor_id, actor_email, action, entity_type, entity_id, entity_label, details
  ) values (
    v_actor_id,
    coalesce(v_actor_email, '系統作業'),
    v_action,
    v_entity_type,
    coalesce(v_entity_id, ''),
    coalesce(v_entity_label, ''),
    v_details
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.audit_admin_content_change() from public, anon, authenticated;

create trigger admin_audit_articles
  after insert or update or delete on public.articles
  for each row execute function private.audit_admin_content_change();
create trigger admin_audit_site_news
  after insert or update or delete on public.site_news
  for each row execute function private.audit_admin_content_change();
create trigger admin_audit_site_honours
  after insert or update or delete on public.site_honours
  for each row execute function private.audit_admin_content_change();
create trigger admin_audit_recruitment_classes
  after insert or update or delete on public.recruitment_classes
  for each row execute function private.audit_admin_content_change();
