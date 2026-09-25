-- TMSC V2 relational foundation. Apply only after creating a Supabase project.
create extension if not exists pgcrypto;

create type public.member_role as enum ('member', 'admin');
create type public.visibility_level as enum ('public', 'member', 'admin');
create type public.article_status as enum ('draft', 'published', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  display_name text not null default '',
  role public.member_role not null default 'member',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email)) where email <> '';

create table public.member_invites (
  email text primary key,
  display_name text not null default '',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.member_invites enable row level security;
revoke all on public.member_invites from anon, authenticated;
grant all on public.member_invites to service_role;

create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  source_swimmer_id text unique,
  full_name text not null,
  english_name text,
  gender text,
  birth_year smallint,
  visibility public.visibility_level not null default 'public',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profile_athletes (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  relation text not null default 'athlete',
  created_at timestamptz not null default now(),
  primary key (profile_id, athlete_id)
);

create table public.meets (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  name text not null,
  start_date date,
  end_date date,
  created_at timestamptz not null default now()
);

create table public.results (
  id text primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  meet_id uuid references public.meets(id) on delete set null,
  event_name text not null,
  competition_date date,
  team_name text,
  rank integer,
  time_text text,
  time_milliseconds integer,
  pool_type text,
  round_name text,
  age_group text,
  source_name text,
  source_file text,
  visibility public.visibility_level not null default 'public',
  synced_at timestamptz,
  raw_source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, meet_id, event_name, competition_date, time_text, pool_type, round_name)
);
create index results_athlete_event_date_idx on public.results (athlete_id, event_name, competition_date desc);
create index results_meet_idx on public.results (meet_id);
create index results_visibility_date_idx on public.results (visibility, competition_date desc);

create table public.splits (
  id uuid primary key default gen_random_uuid(),
  result_id text not null references public.results(id) on delete cascade,
  distance_m smallint not null,
  split_milliseconds integer not null check (split_milliseconds > 0),
  source_payload jsonb not null default '{}'::jsonb,
  unique (result_id, distance_m)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
insert into public.categories (name, slug, sort_order) values
  ('最新資訊', 'latest', 1), ('國內升學', 'domestic', 2),
  ('海外留學', 'overseas', 3), ('招生簡章', 'prospectus', 4)
on conflict (slug) do nothing;
create table public.articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  title text not null,
  slug text not null unique,
  summary text not null default '',
  body jsonb not null default '[]'::jsonb,
  status public.article_status not null default 'draft',
  published_at timestamptz,
  author_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index articles_published_idx on public.articles (published_at desc) where status = 'published';
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique
);
create table public.article_tags (
  article_id uuid not null references public.articles(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (article_id, tag_id)
);
create table public.deadlines (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.articles(id) on delete set null,
  title text not null,
  details text not null default '',
  due_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  object_path text not null unique,
  file_name text not null,
  mime_type text not null,
  byte_size bigint not null default 0,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('queued', 'running', 'success', 'failed')),
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  duplicate_count integer not null default 0,
  affected_athlete_count integer not null default 0,
  error_count integer not null default 0,
  summary jsonb not null default '{}'::jsonb
);
create index sync_jobs_recent_idx on public.sync_jobs (requested_at desc);
create unique index sync_jobs_one_active on public.sync_jobs ((status)) where status in ('queued', 'running');

create table public.sync_state (
  singleton boolean primary key default true check (singleton),
  last_success_at timestamptz,
  source_name text not null default '游泳成績通',
  updated_at timestamptz not null default now()
);
insert into public.sync_state (singleton) values (true) on conflict (singleton) do nothing;
alter table public.sync_state enable row level security;
create policy sync_state_public_read on public.sync_state for select to anon, authenticated using (singleton);
grant select on public.sync_state to anon, authenticated;
grant all on public.sync_state to service_role;

create or replace function public.has_active_role(required_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.active and p.role = any(required_roles)
  );
$$;
revoke all on function public.has_active_role(public.member_role[]) from public;
-- Anonymous policies also evaluate this helper; with auth.uid() = NULL it can only return false.
grant execute on function public.has_active_role(public.member_role[]) to anon, authenticated;

-- Auth signup must be disabled in project settings; invited accounts get member by default.
create or replace function public.create_member_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  invited_name text;
  invited boolean := false;
begin
  if coalesce(new.email, '') <> '' then
    select i.display_name into invited_name from public.member_invites i
      where lower(i.email) = lower(new.email) for update;
    invited := found;
  end if;
  insert into public.profiles (id, email, display_name, role, active)
  values (new.id, coalesce(new.email, ''),
    case when invited then coalesce(invited_name, '') else '' end, 'member', invited)
  on conflict (id) do nothing;
  if invited then
    delete from public.member_invites where lower(email) = lower(new.email);
  end if;
  return new;
end;
$$;
create trigger auth_user_profile_created
  after insert on auth.users for each row execute function public.create_member_profile();

alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.profile_athletes enable row level security;
alter table public.meets enable row level security;
alter table public.results enable row level security;
alter table public.splits enable row level security;
alter table public.categories enable row level security;
alter table public.articles enable row level security;
alter table public.tags enable row level security;
alter table public.article_tags enable row level security;
alter table public.deadlines enable row level security;
alter table public.attachments enable row level security;
alter table public.sync_jobs enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.has_active_role(array['admin']::public.member_role[]));
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));

create policy athletes_by_visibility on public.athletes for select to anon, authenticated
  using (active and (visibility = 'public' or
    (visibility = 'member' and public.has_active_role(array['member','admin']::public.member_role[])) or
    (visibility = 'admin' and public.has_active_role(array['admin']::public.member_role[]))));
create policy athletes_admin_manage on public.athletes for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));

create policy profile_athletes_self_read on public.profile_athletes for select to authenticated
  using (profile_id = (select auth.uid()) or public.has_active_role(array['admin']::public.member_role[]));
create policy profile_athletes_admin_manage on public.profile_athletes for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));

create policy meets_visible_results on public.meets for select to anon, authenticated
  using (exists (select 1 from public.results r
    join public.athletes a on a.id = r.athlete_id
    where r.meet_id = meets.id and a.active and
      (r.visibility = 'public' or
       (r.visibility = 'member' and public.has_active_role(array['member','admin']::public.member_role[])) or
       (r.visibility = 'admin' and public.has_active_role(array['admin']::public.member_role[]))) and
      (a.visibility = 'public' or
       (a.visibility = 'member' and public.has_active_role(array['member','admin']::public.member_role[])) or
       (a.visibility = 'admin' and public.has_active_role(array['admin']::public.member_role[])))));
create policy meets_admin_manage on public.meets for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));

create policy results_by_visibility on public.results for select to anon, authenticated
  using ((visibility = 'public' or
    (visibility = 'member' and public.has_active_role(array['member','admin']::public.member_role[])) or
    (visibility = 'admin' and public.has_active_role(array['admin']::public.member_role[])))
    and exists (select 1 from public.athletes a where a.id = results.athlete_id and a.active
      and (a.visibility = 'public' or
        (a.visibility = 'member' and public.has_active_role(array['member','admin']::public.member_role[])) or
        (a.visibility = 'admin' and public.has_active_role(array['admin']::public.member_role[])))));
create policy results_admin_manage on public.results for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy splits_visible_result on public.splits for select to anon, authenticated
  using (exists (select 1 from public.results r
    join public.athletes a on a.id = r.athlete_id
    where r.id = splits.result_id and a.active and
      (r.visibility = 'public' or
       (r.visibility = 'member' and public.has_active_role(array['member','admin']::public.member_role[])) or
       (r.visibility = 'admin' and public.has_active_role(array['admin']::public.member_role[]))) and
      (a.visibility = 'public' or
       (a.visibility = 'member' and public.has_active_role(array['member','admin']::public.member_role[])) or
       (a.visibility = 'admin' and public.has_active_role(array['admin']::public.member_role[])))));
create policy splits_admin_manage on public.splits for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));

-- Education metadata/content are member-only, including titles and attachment paths.
create policy categories_member_read on public.categories for select to authenticated
  using (public.has_active_role(array['member','admin']::public.member_role[]) and
    exists (select 1 from public.articles a where a.category_id = categories.id and a.status = 'published'));
create policy categories_admin_manage on public.categories for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy articles_member_read on public.articles for select to authenticated
  using (public.has_active_role(array['member','admin']::public.member_role[]) and status = 'published');
create policy articles_admin_manage on public.articles for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy tags_member_read on public.tags for select to authenticated
  using (public.has_active_role(array['member','admin']::public.member_role[]) and
    exists (select 1 from public.article_tags at join public.articles a on a.id = at.article_id
      where at.tag_id = tags.id and a.status = 'published'));
create policy tags_admin_manage on public.tags for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy article_tags_member_read on public.article_tags for select to authenticated
  using (public.has_active_role(array['member','admin']::public.member_role[]) and
    exists (select 1 from public.articles a where a.id = article_tags.article_id and a.status = 'published'));
create policy article_tags_admin_manage on public.article_tags for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy deadlines_member_read on public.deadlines for select to authenticated
  using (public.has_active_role(array['member','admin']::public.member_role[]) and
    (article_id is null or exists (select 1 from public.articles a where a.id = deadlines.article_id and a.status = 'published')));
create policy deadlines_admin_manage on public.deadlines for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy attachments_member_read on public.attachments for select to authenticated
  using (public.has_active_role(array['member','admin']::public.member_role[]) and
    exists (select 1 from public.articles a where a.id = attachments.article_id and a.status = 'published'));
create policy attachments_admin_manage on public.attachments for all to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]))
  with check (public.has_active_role(array['admin']::public.member_role[]));
create policy sync_jobs_admin_read on public.sync_jobs for select to authenticated
  using (public.has_active_role(array['admin']::public.member_role[]));

grant select on public.athletes, public.meets, public.results, public.splits to anon, authenticated;
grant select on public.profiles, public.profile_athletes to authenticated;
grant select on public.categories, public.articles, public.tags, public.article_tags,
  public.deadlines, public.attachments, public.sync_jobs to authenticated;
grant insert, update, delete on public.athletes, public.profile_athletes, public.meets,
  public.results, public.splits, public.categories, public.articles, public.tags,
  public.article_tags, public.deadlines, public.attachments to authenticated;
grant update on public.profiles to authenticated;

-- Private by default. Apply Storage policies before uploading member documents.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('education', 'education', false, 52428800,
  array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false;
create policy education_member_read on storage.objects for select to authenticated
  using (bucket_id = 'education' and
    (public.has_active_role(array['admin']::public.member_role[]) or
      (public.has_active_role(array['member']::public.member_role[]) and exists (select 1 from public.attachments at
        join public.articles a on a.id = at.article_id
        where at.object_path = storage.objects.name and a.status = 'published'))));
create policy education_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'education' and public.has_active_role(array['admin']::public.member_role[]));
create policy education_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'education' and public.has_active_role(array['admin']::public.member_role[]))
  with check (bucket_id = 'education' and public.has_active_role(array['admin']::public.member_role[]));
create policy education_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'education' and public.has_active_role(array['admin']::public.member_role[]));

create or replace function public.request_sync_job()
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  job_id uuid;
  most_recent timestamptz;
begin
  if not public.has_active_role(array['admin']::public.member_role[]) then
    raise exception 'admin_required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(6620410901);
  if exists (select 1 from public.sync_jobs where status in ('queued','running')) then
    raise exception 'sync_already_running' using errcode = '55000';
  end if;
  select requested_at into most_recent from public.sync_jobs order by requested_at desc limit 1;
  if most_recent is not null and most_recent > now() - interval '15 minutes' then
    raise exception 'sync_cooldown' using errcode = '55000';
  end if;
  insert into public.sync_jobs (requested_by, status)
    values ((select auth.uid()), 'queued') returning id into job_id;
  return job_id;
end;
$$;
revoke all on function public.request_sync_job() from public, anon;
grant execute on function public.request_sync_job() to authenticated;
