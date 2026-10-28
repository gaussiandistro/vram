create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema public;
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists "uuid-ossp" with schema extensions;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;


create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.update_notification_preferences(
  p_subscription_id uuid,
  p_enabled boolean,
  p_period_end boolean,
  p_lunch_end boolean,
  p_upcoming boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.push_subscriptions
  set
    enabled = p_enabled,
    updated_at = now()
  where id = p_subscription_id;

  update public.notification_preferences
  set
    enabled = p_enabled,
    period_end = p_period_end,
    lunch_end = p_lunch_end,
    upcoming = p_upcoming,
    updated_at = now()
  where subscription_id = p_subscription_id;
end;
$$;

create or replace function public.upsert_push_subscription(
  p_installation_id uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_subscription_id uuid;
begin
  insert into public.push_subscriptions (
    installation_id,
    endpoint,
    p256dh,
    auth,
    enabled,
    last_seen_at
  )
  values (
    p_installation_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    true,
    now()
  )
  on conflict (endpoint)
  do update set
    installation_id = excluded.installation_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    enabled = true,
    last_seen_at = now(),
    updated_at = now()
  returning id into v_subscription_id;

  insert into public.notification_preferences (subscription_id)
  values (v_subscription_id)
  on conflict (subscription_id) do nothing;

  return v_subscription_id;
end;
$$;


create table public.schedule_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  schedule_type_id uuid not null references public.schedule_types (id) on delete cascade,
  block_id text not null,
  name text not null,
  kind text not null,
  start_time time not null,
  end_time time not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint schedule_blocks_check check (end_time > start_time),
  constraint schedule_blocks_kind_check check (kind in ('period', 'passing', 'lunch')),
  constraint schedule_blocks_schedule_type_id_block_id_key unique (schedule_type_id, block_id),
  constraint schedule_blocks_schedule_type_id_sort_order_key unique (
    schedule_type_id,
    sort_order
  )
);

create table public.schedule_defaults (
  weekday integer primary key,
  schedule_type_id uuid not null references public.schedule_types (id) on delete cascade,
  constraint schedule_defaults_weekday_check check (weekday >= 0 and weekday <= 6)
);

create table public.calendar_dates (
  date date primary key,
  schedule_type_id uuid references public.schedule_types (id) on delete restrict,
  is_school_day boolean not null,
  note text,
  created_at timestamptz not null default now(),
  constraint calendar_dates_check check (
    (is_school_day = true and schedule_type_id is not null)
    or (is_school_day = false and schedule_type_id is null)
  )
);


create table public.motd (
  id integer primary key default 1,
  message text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  constraint motd_id_check check (id = 1)
);


create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  installation_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_installation_id_idx on public.push_subscriptions (installation_id);

create table public.notification_preferences (
  subscription_id uuid primary key references public.push_subscriptions (id) on delete cascade,
  period_end boolean not null default true,
  lunch_end boolean not null default true,
  upcoming boolean not null default true,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  event_key text not null,
  status text not null,
  error_message text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_deliveries_status_check check (
    status in ('claimed', 'sent', 'failed')
  ),
  constraint notification_deliveries_subscription_id_event_key_key unique (
    subscription_id,
    event_key
  )
);

create index notification_deliveries_event_key_idx on public.notification_deliveries (event_key);


create trigger motd_set_updated_at
  before update on public.motd
  for each row execute function public.set_updated_at();

create trigger notification_preferences_set_updated_at
  before update on public.notification_preferences
  for each row execute function public.set_updated_at();

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

-- Row level security

alter table public.schedule_types enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.schedule_defaults enable row level security;
alter table public.calendar_dates enable row level security;
alter table public.motd enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "Public can read active schedule types"
  on public.schedule_types for select to anon, authenticated
  using (active = true);

create policy "public read schedule_types"
  on public.schedule_types for select to anon
  using (true);

create policy "Public can read schedule blocks"
  on public.schedule_blocks for select to anon, authenticated
  using (
    exists (
      select 1
      from public.schedule_types st
      where st.id = schedule_blocks.schedule_type_id
        and st.active = true
    )
  );

create policy "public read schedule_blocks"
  on public.schedule_blocks for select to anon
  using (true);

create policy "Public can read schedule defaults"
  on public.schedule_defaults for select to anon, authenticated
  using (true);

create policy "Public can read calendar dates"
  on public.calendar_dates for select to anon, authenticated
  using (true);

create policy "public read calendar_dates"
  on public.calendar_dates for select to anon
  using (true);

create policy "Public can read motd"
  on public.motd for select to anon, authenticated
  using (active = true);


grant usage on schema public to anon, authenticated, service_role;

grant select, references, trigger, truncate, maintain on public.schedule_types to anon;
grant references, trigger, truncate, maintain on public.schedule_types to authenticated;
grant select, references, trigger, truncate, maintain on public.schedule_types to service_role;

grant select, references, trigger, truncate, maintain on public.schedule_blocks to anon;
grant references, trigger, truncate, maintain on public.schedule_blocks to authenticated;
grant select, references, trigger, truncate, maintain on public.schedule_blocks to service_role;

grant select, references, trigger, truncate, maintain on public.schedule_defaults to anon;
grant select, references, trigger, truncate, maintain on public.schedule_defaults to authenticated;
grant select, references, trigger, truncate, maintain on public.schedule_defaults to service_role;

grant select, references, trigger, truncate, maintain on public.calendar_dates to anon;
grant references, trigger, truncate, maintain on public.calendar_dates to authenticated;
grant select, references, trigger, truncate, maintain on public.calendar_dates to service_role;

grant select, references, trigger, truncate, maintain on public.motd to anon;
grant references, trigger, truncate, maintain on public.motd to authenticated;
grant references, trigger, truncate, maintain on public.motd to service_role;

grant references, trigger, truncate, maintain on public.push_subscriptions to anon;
grant references, trigger, truncate, maintain on public.push_subscriptions to authenticated;
grant select, references, trigger, truncate, maintain, update
  on public.push_subscriptions to service_role;

grant references, trigger, truncate, maintain on public.notification_preferences to anon;
grant references, trigger, truncate, maintain on public.notification_preferences to authenticated;
grant select, references, trigger, truncate, maintain
  on public.notification_preferences to service_role;

grant references, trigger, truncate, maintain on public.notification_deliveries to anon;
grant references, trigger, truncate, maintain on public.notification_deliveries to authenticated;
grant select, insert, references, trigger, truncate, maintain, update
  on public.notification_deliveries to service_role;

revoke all on function public.set_updated_at() from anon, authenticated, service_role;
revoke all on function public.update_notification_preferences(
  uuid, boolean, boolean, boolean, boolean
) from anon, authenticated, service_role;
revoke all on function public.upsert_push_subscription(uuid, text, text, text)
  from anon, authenticated, service_role;

grant execute on function public.set_updated_at() to public;
grant execute on function public.update_notification_preferences(
  uuid, boolean, boolean, boolean, boolean
) to public;
grant execute on function public.upsert_push_subscription(uuid, text, text, text) to public;

alter default privileges for role postgres in schema public grant all on tables to postgres;
alter default privileges for role postgres in schema public
  grant references, trigger, truncate, maintain on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres;
alter default privileges for role postgres in schema public grant all on functions to postgres;
