-- Public website content currently managed by the legacy Firebase admin.
-- Keep this separate from member-only education content.
create table public.site_news (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  date date not null default current_date,
  title text not null,
  "desc" text not null default '',
  img text not null default '',
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.site_honours (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  cat text not null default '其他',
  event text not null,
  name text not null,
  year smallint not null,
  items text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recruitment_classes (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  name text not null,
  age text not null default '',
  "desc" text not null default '',
  fee text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_news enable row level security;
alter table public.site_honours enable row level security;
alter table public.recruitment_classes enable row level security;

create policy site_news_public_read on public.site_news for select to anon, authenticated using (true);
create policy site_news_admin_manage on public.site_news for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy site_honours_public_read on public.site_honours for select to anon, authenticated using (true);
create policy site_honours_admin_manage on public.site_honours for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy recruitment_public_read on public.recruitment_classes for select to anon, authenticated using (true);
create policy recruitment_admin_manage on public.recruitment_classes for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));

grant select on public.site_news, public.site_honours, public.recruitment_classes to anon, authenticated;
grant insert, update, delete on public.site_news, public.site_honours, public.recruitment_classes to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-media', 'site-media', true, 8388608,
  array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 8388608,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];
create policy site_media_public_read on storage.objects for select to anon, authenticated
  using (bucket_id = 'site-media');
create policy site_media_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'site-media' and public.has_active_role(array['admin']::public.member_role[]));
create policy site_media_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'site-media' and public.has_active_role(array['admin']::public.member_role[]))
  with check (bucket_id = 'site-media' and public.has_active_role(array['admin']::public.member_role[]));
create policy site_media_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'site-media' and public.has_active_role(array['admin']::public.member_role[]));
