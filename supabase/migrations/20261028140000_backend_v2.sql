create extension if not exists btree_gist with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create table public.app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value) values ('school_timezone', 'America/Chicago');

create table public.schedule_types_v2 (
  code text not null,
  name text not null,
  passing_minutes smallint not null default 5,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_types_v2_pkey primary key (code),
  constraint schedule_types_v2_name_key unique (name),
  constraint schedule_types_code_format check (code ~ '^[a-z0-9_]+$'),
  constraint schedule_types_passing_minutes_check check (passing_minutes between 0 and 30)
);

create table public.schedule_blocks_v2 (
  schedule_type_code text not null,
  code text not null,
  name text not null,
  kind text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_blocks_v2_pkey primary key (schedule_type_code, code),
  constraint schedule_blocks_schedule_type_code_fkey
    foreign key (schedule_type_code) references public.schedule_types_v2 (code) on delete cascade,
  constraint schedule_blocks_kind_check check (kind in ('period', 'passing')),
  constraint schedule_blocks_time_order check (end_time > start_time),
  constraint schedule_blocks_no_overlap exclude using gist (
    schedule_type_code with =,
    (tsrange('2000-01-01'::date + start_time, '2000-01-01'::date + end_time)) with &&
  )
);

create table public.lunch_periods_v2 (
  schedule_type_code text not null,
  code text not null,
  name text not null,
  during_block_code text not null,
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lunch_periods_pkey primary key (schedule_type_code, code),
  constraint lunch_periods_block_fkey
    foreign key (schedule_type_code, during_block_code)
    references public.schedule_blocks_v2 (schedule_type_code, code) on delete cascade,
  constraint lunch_periods_time_order check (end_time > start_time),
  constraint lunch_periods_no_overlap exclude using gist (
    schedule_type_code with =,
    (tsrange('2000-01-01'::date + start_time, '2000-01-01'::date + end_time)) with &&
  )
);

create table public.weekly_schedule_v2 (
  weekday smallint not null,
  schedule_type_code text,
  note text,
  updated_at timestamptz not null default now(),
  constraint weekly_schedule_pkey primary key (weekday),
  constraint weekly_schedule_weekday_check check (weekday between 1 and 7),
  constraint weekly_schedule_schedule_type_code_fkey
    foreign key (schedule_type_code) references public.schedule_types_v2 (code) on delete restrict
);

create table public.school_calendar_v2 (
  date date not null,
  schedule_type_code text,
  is_school_day boolean generated always as (schedule_type_code is not null) stored,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_calendar_pkey primary key (date),
  constraint school_calendar_schedule_type_code_fkey
    foreign key (schedule_type_code) references public.schedule_types_v2 (code) on delete restrict
);


create temporary table schedule_type_map (old_id uuid primary key, code text not null) on commit drop;

insert into schedule_type_map (old_id, code)
select id,
       case name
         when 'Blue' then 'blue'
         when 'White' then 'white'
         when 'RAM' then 'ram'
         when 'ER White' then 'er_white'
       end
from public.schedule_types;

do $$
begin
  if exists (select 1 from schedule_type_map where code is null) then
    raise exception 'Unmapped schedule type: %',
      (select string_agg(st.name, ', ')
         from public.schedule_types st
         join schedule_type_map m on m.old_id = st.id
        where m.code is null);
  end if;
end
$$;

insert into public.schedule_types_v2 (code, name, passing_minutes, active, created_at, updated_at)
select m.code, st.name, 5, st.active, st.created_at, now()
from public.schedule_types st
join schedule_type_map m on m.old_id = st.id;

insert into public.schedule_blocks_v2 (
  schedule_type_code, code, name, kind, start_time, end_time, created_at, updated_at
)
select m.code, b.block_id, b.name, b.kind, b.start_time, b.end_time, b.created_at, now()
from public.schedule_blocks b
join schedule_type_map m on m.old_id = b.schedule_type_id
where b.kind in ('period', 'passing')
  and not (m.code = 'er_white' and b.block_id = 'passing1');

insert into public.schedule_blocks_v2 (schedule_type_code, code, name, kind, start_time, end_time)
select * from (values
  ('er_white', 'passing1', 'Passing Period', 'passing', '08:35'::time, '08:40'::time),
  ('er_white', 'passing2', 'Passing Period', 'passing', '09:40'::time, '09:45'::time),
  ('er_white', 'passing3', 'Passing Period', 'passing', '10:50'::time, '10:55'::time)
) as v
where exists (select 1 from public.schedule_types_v2 t where t.code = 'er_white');

insert into public.lunch_periods_v2 (
  schedule_type_code, code, name, during_block_code, start_time, end_time, created_at, updated_at
)
select m.code,
       b.block_id,
       b.name,
       (select p.block_id
          from public.schedule_blocks p
         where p.schedule_type_id = b.schedule_type_id
           and p.kind = 'period'
           and p.start_time <= b.start_time
           and p.end_time >= b.end_time
         order by p.start_time
         limit 1),
       b.start_time,
       b.end_time,
       b.created_at,
       now()
from public.schedule_blocks b
join schedule_type_map m on m.old_id = b.schedule_type_id
where b.kind = 'lunch';

insert into public.weekly_schedule_v2 (weekday, schedule_type_code)
select case when d.weekday = 0 then 7 else d.weekday end, m.code
from public.schedule_defaults d
join schedule_type_map m on m.old_id = d.schedule_type_id;

insert into public.weekly_schedule_v2 (weekday)
select g from generate_series(1, 7) g
where not exists (select 1 from public.weekly_schedule_v2 w where w.weekday = g);

insert into public.school_calendar_v2 (date, schedule_type_code, note, created_at, updated_at)
select c.date, m.code, c.note, c.created_at, now()
from public.calendar_dates c
left join schedule_type_map m on m.old_id = c.schedule_type_id;


do $$
declare
  v_expected bigint;
  v_actual bigint;
  v_added bigint := 0;
  v_excluded bigint;
begin
  if not exists (select 1 from public.schedule_types) then
    return;
  end if;

  select count(*)
    into v_excluded
    from public.schedule_blocks b
    join schedule_type_map m on m.old_id = b.schedule_type_id
   where m.code = 'er_white' and b.block_id = 'passing1';

  select count(*) into v_added
    from public.schedule_blocks_v2
   where schedule_type_code = 'er_white'
     and code in ('passing1', 'passing2', 'passing3')
     and start_time in ('08:35'::time, '09:40'::time, '10:50'::time);

  select count(*) into v_expected from public.schedule_types;
  select count(*) into v_actual from public.schedule_types_v2;
  if v_expected <> v_actual then
    raise exception 'schedule_types copy mismatch: expected %, got %', v_expected, v_actual;
  end if;

  select count(*) into v_expected from public.schedule_blocks where kind in ('period', 'passing');
  v_expected := v_expected - v_excluded + v_added;
  select count(*) into v_actual from public.schedule_blocks_v2;
  if v_expected <> v_actual then
    raise exception 'schedule_blocks copy mismatch: expected %, got %', v_expected, v_actual;
  end if;

  select count(*) into v_expected from public.schedule_blocks where kind = 'lunch';
  select count(*) into v_actual from public.lunch_periods_v2;
  if v_expected <> v_actual then
    raise exception 'lunch_periods copy mismatch: expected %, got %', v_expected, v_actual;
  end if;

  if exists (select 1 from public.lunch_periods_v2 where during_block_code is null) then
    raise exception 'A lunch period could not be matched to a period';
  end if;

  select count(*) into v_expected from public.calendar_dates;
  select count(*) into v_actual from public.school_calendar_v2;
  if v_expected <> v_actual then
    raise exception 'school_calendar copy mismatch: expected %, got %', v_expected, v_actual;
  end if;

  select count(*) into v_expected from public.calendar_dates where is_school_day = false;
  select count(*) into v_actual from public.school_calendar_v2 where is_school_day = false;
  if v_expected <> v_actual then
    raise exception 'no-school day copy mismatch: expected %, got %', v_expected, v_actual;
  end if;

  if exists (
    select 1 from public.weekly_schedule_v2
     where weekday between 1 and 5 and schedule_type_code is null
  ) then
    raise exception 'A weekday lost its schedule type';
  end if;
end
$$;


drop table public.schedule_blocks;
drop table public.schedule_defaults;
drop table public.calendar_dates;
drop table public.schedule_types;

alter table public.schedule_types_v2 rename to schedule_types;
alter table public.schedule_blocks_v2 rename to schedule_blocks;
alter table public.lunch_periods_v2 rename to lunch_periods;
alter table public.weekly_schedule_v2 rename to weekly_schedule;
alter table public.school_calendar_v2 rename to school_calendar;

alter table public.schedule_types rename constraint schedule_types_v2_pkey to schedule_types_pkey;
alter table public.schedule_types rename constraint schedule_types_v2_name_key to schedule_types_name_key;
alter table public.schedule_blocks rename constraint schedule_blocks_v2_pkey to schedule_blocks_pkey;


create function public.schedule_type_code_is_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.code <> old.code then
    raise exception
      'schedule_types.code is immutable (%) — deactivate it and add a new code instead.', old.code;
  end if;
  return new;
end;
$$;

create trigger schedule_types_code_immutable
  before update on public.schedule_types
  for each row execute function public.schedule_type_code_is_immutable();

create function public.validate_lunch_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_start time;
  v_end time;
begin
  select b.start_time, b.end_time
    into v_start, v_end
    from public.schedule_blocks b
   where b.schedule_type_code = new.schedule_type_code
     and b.code = new.during_block_code;

  if v_start is null then
    raise exception 'during_block_code % does not exist for schedule type %',
      new.during_block_code, new.schedule_type_code;
  end if;

  if new.start_time < v_start or new.end_time > v_end then
    raise exception 'Lunch % (%–%) must fall inside block % (%–%)',
      new.code, new.start_time, new.end_time, new.during_block_code, v_start, v_end;
  end if;

  return new;
end;
$$;

create trigger lunch_periods_validate
  before insert or update on public.lunch_periods
  for each row execute function public.validate_lunch_period();

create trigger schedule_types_set_updated_at
  before update on public.schedule_types
  for each row execute function public.set_updated_at();

create trigger schedule_blocks_set_updated_at
  before update on public.schedule_blocks
  for each row execute function public.set_updated_at();

create trigger lunch_periods_set_updated_at
  before update on public.lunch_periods
  for each row execute function public.set_updated_at();

create trigger weekly_schedule_set_updated_at
  before update on public.weekly_schedule
  for each row execute function public.set_updated_at();

create trigger school_calendar_set_updated_at
  before update on public.school_calendar
  for each row execute function public.set_updated_at();

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function public.set_updated_at();


create function public.school_timezone()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select value from public.app_settings where key = 'school_timezone'),
    'America/Chicago'
  );
$$;

create function public.schedule_for_date(p_date date)
returns table (schedule_type_code text, schedule_type_name text, source text)
language sql
stable
set search_path = ''
as $$
  with exception as (
    select t.code, t.name
      from public.school_calendar c
      join public.schedule_types t on t.code = c.schedule_type_code
     where c.date = p_date
  ),
  weekly as (
    select t.code, t.name
      from public.weekly_schedule w
      join public.schedule_types t on t.code = w.schedule_type_code
     where w.weekday = extract(isodow from p_date)::smallint
       and t.active
  )
  select e.code, e.name, 'exception'::text from exception e
  union all
  select w.code, w.name, 'weekly'::text
    from weekly w
   where not exists (select 1 from public.school_calendar c where c.date = p_date);
$$;

create view public.v_resolved_days
with (security_invoker = true)
as
select d::date as date,
       to_char(d, 'FMDay') as weekday,
       r.schedule_type_code,
       r.schedule_type_name,
       coalesce(r.source, 'no_school') as source
from generate_series(current_date - 14, current_date + 90, interval '1 day') d
left join lateral public.schedule_for_date(d::date) r on true;

create view public.v_schedule_overview
with (security_invoker = true)
as
select b.schedule_type_code, t.name as schedule_type_name, b.code, b.name, b.kind,
       b.start_time, b.end_time, b.end_time - b.start_time as duration
from public.schedule_blocks b
join public.schedule_types t on t.code = b.schedule_type_code
union all
select l.schedule_type_code, t.name, l.code, l.name, 'lunch'::text,
       l.start_time, l.end_time, l.end_time - l.start_time
from public.lunch_periods l
join public.schedule_types t on t.code = l.schedule_type_code;


create table public.push_installations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  endpoint text unique,
  p256dh text,
  auth text,
  enabled boolean not null default true,
  period_end boolean not null default true,
  lunch_end boolean not null default true,
  upcoming boolean not null default true,
  lunch_choices jsonb not null default '{}'::jsonb,
  disabled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_installations_lunch_choices_object check (jsonb_typeof(lunch_choices) = 'object'),
  constraint push_installations_endpoint_complete check (
    (endpoint is null and p256dh is null and auth is null)
    or (endpoint is not null and p256dh is not null and auth is not null)
  )
);

create trigger push_installations_set_updated_at
  before update on public.push_installations
  for each row execute function public.set_updated_at();

insert into public.push_installations (
  id, token_hash, endpoint, p256dh, auth,
  enabled, period_end, lunch_end, upcoming, created_at, updated_at, last_seen_at
)
select distinct on (s.installation_id)
  s.id,
  encode(extensions.digest(s.installation_id::text, 'sha256'), 'hex'),
  s.endpoint,
  s.p256dh,
  s.auth,
  s.enabled and coalesce(p.enabled, true),
  coalesce(p.period_end, true),
  coalesce(p.lunch_end, true),
  coalesce(p.upcoming, true),
  s.created_at,
  s.updated_at,
  s.last_seen_at
from public.push_subscriptions s
left join public.notification_preferences p on p.subscription_id = s.id
order by s.installation_id, s.last_seen_at desc;

do $$
declare
  v_old bigint;
  v_new bigint;
begin
  select count(distinct installation_id) into v_old from public.push_subscriptions;
  select count(*) into v_new from public.push_installations;
  if v_new <> v_old then
    raise exception 'push_installations copy mismatch: expected %, got %', v_old, v_new;
  end if;
end
$$;

drop table public.notification_deliveries;
drop table public.notification_preferences;
drop table public.push_subscriptions;


create table public.notification_events (
  id bigint generated always as identity primary key,
  event_date date not null,
  schedule_type_code text not null references public.schedule_types (code) on delete cascade,
  block_kind text not null,
  block_code text not null,
  block_name text not null,
  event_type text not null,
  fire_at timestamptz not null,
  generated_at timestamptz not null default now(),
  constraint notification_events_event_type_check check (
    event_type in ('period_end', 'lunch_end', 'upcoming')
  ),
  constraint notification_events_unique unique (
    event_date, schedule_type_code, block_code, event_type
  )
);

create index notification_events_fire_at_idx on public.notification_events (fire_at);

create table public.notification_deliveries (
  event_id bigint not null references public.notification_events (id) on delete cascade,
  installation_id uuid not null references public.push_installations (id) on delete cascade,
  status text not null default 'claimed',
  attempts smallint not null default 1,
  last_error text,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint notification_deliveries_pkey primary key (event_id, installation_id),
  constraint notification_deliveries_status_check check (status in ('claimed', 'sent', 'failed'))
);

create index notification_deliveries_installation_idx
  on public.notification_deliveries (installation_id);

create function public.refresh_notification_events(p_days int default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone public.school_timezone())::date;
  v_inserted int;
begin
  if p_days < 1 or p_days > 14 then
    raise exception 'p_days must be between 1 and 14';
  end if;

  delete from public.notification_events e
   where e.fire_at > now()
     and e.event_date < v_today + p_days
     and not exists (
       select 1 from public.notification_deliveries d where d.event_id = e.id
     );

  insert into public.notification_events (
    event_date, schedule_type_code, block_kind, block_code, block_name, event_type, fire_at
  )
  select d.day,
         r.schedule_type_code,
         b.kind,
         b.code,
         b.name,
         ev.event_type,
         (d.day::date + ev.fire_at_time) at time zone public.school_timezone()
  from generate_series(v_today::timestamp, (v_today + p_days - 1)::timestamp, interval '1 day')
    as d (day)
  join lateral public.schedule_for_date(d.day::date) r on true
  cross join lateral (
    select b.code, b.kind, b.name, b.end_time
      from public.schedule_blocks b
     where b.schedule_type_code = r.schedule_type_code
       and b.kind = 'period'
    union all
    select l.code, 'lunch'::text, l.name, l.end_time
      from public.lunch_periods l
     where l.schedule_type_code = r.schedule_type_code
  ) b
  cross join lateral (
    values
      (case when b.kind = 'lunch' then 'lunch_end' else 'period_end' end, b.end_time),
      ('upcoming', b.end_time - interval '2 minutes')
  ) as ev (event_type, fire_at_time)
  on conflict (event_date, schedule_type_code, block_code, event_type) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create function public.claim_due_pushes(p_limit int default 250)
returns table (
  installation_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  events jsonb
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select e.id, e.event_type, e.block_kind, e.block_code, e.block_name,
           e.schedule_type_code, e.fire_at
      from public.notification_events e
     where e.fire_at <= now()
       and e.fire_at > now() - interval '15 minutes'
  ),
  targeted as (
    select i.id as installation_id, d.id, d.event_type, d.block_name,
           d.schedule_type_code, d.fire_at
      from public.push_installations i
      cross join due d
     where i.enabled
       and i.endpoint is not null
       and i.disabled_reason is null
       and case d.event_type
             when 'period_end' then i.period_end
             when 'lunch_end' then i.lunch_end
             else i.upcoming
           end
       and (
         d.block_kind <> 'lunch'
         or (i.lunch_choices ->> d.schedule_type_code) is null
         or (i.lunch_choices ->> d.schedule_type_code) = d.block_code
       )
       and not exists (
         select 1 from public.notification_deliveries x
          where x.event_id = d.id and x.installation_id = i.id and x.status = 'sent'
       )
  ),
  claimed as (
    insert into public.notification_deliveries (event_id, installation_id)
    select t.id, t.installation_id from targeted t
    on conflict (event_id, installation_id) do update
      set status = 'claimed',
          attempts = notification_deliveries.attempts + 1,
          claimed_at = now()
      where notification_deliveries.status <> 'sent'
        and notification_deliveries.attempts < 4
        and (
          notification_deliveries.status = 'failed'
          or notification_deliveries.claimed_at < now() - interval '5 minutes'
        )
    returning event_id, installation_id
  )
  select i.id, i.endpoint, i.p256dh, i.auth,
         jsonb_agg(
           jsonb_build_object(
             'event_id', c.event_id,
             'event_type', t.event_type,
             'block_name', t.block_name
           )
           order by t.fire_at
         )
    from claimed c
    join public.push_installations i on i.id = c.installation_id
    join targeted t on t.id = c.event_id and t.installation_id = c.installation_id
   group by i.id, i.endpoint, i.p256dh, i.auth
   limit greatest(p_limit, 1);
$$;

create function public.finish_push_batch(p_results jsonb, p_disabled uuid[] default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  update public.notification_deliveries d
     set status = r.status,
         last_error = r.error,
         sent_at = case when r.status = 'sent' then now() else null end
    from jsonb_to_recordset(p_results)
      as r (event_id bigint, installation_id uuid, status text, error text)
   where d.event_id = r.event_id
     and d.installation_id = r.installation_id;

  update public.push_installations i
     set disabled_reason = 'expired'
   where i.id = any (coalesce(p_disabled, '{}'::uuid[]));
$$;

create function public.prune_notification_history()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.notification_deliveries where claimed_at < now() - interval '30 days';
  delete from public.notification_events where fire_at < now() - interval '7 days';
  delete from public.push_installations where last_seen_at < now() - interval '120 days';
$$;


create function public.register_push_installation(
  p_token uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token::text, 'sha256'), 'hex');
begin
  if p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'endpoint, p256dh and auth are required';
  end if;

  delete from public.push_installations
   where endpoint = p_endpoint and token_hash <> v_hash;

  insert into public.push_installations as pi (token_hash, endpoint, p256dh, auth, last_seen_at)
  values (v_hash, p_endpoint, p_p256dh, p_auth, now())
  on conflict (token_hash) do update
    set endpoint = excluded.endpoint,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        disabled_reason = null,
        last_seen_at = now(),
        updated_at = now();

end;
$$;

create function public.save_notification_settings(
  p_token uuid,
  p_enabled boolean,
  p_period_end boolean,
  p_lunch_end boolean,
  p_upcoming boolean,
  p_lunch_choices jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text := encode(extensions.digest(p_token::text, 'sha256'), 'hex');
  v_choices jsonb := coalesce(p_lunch_choices, '{}'::jsonb);
begin
  if jsonb_typeof(v_choices) <> 'object' then
    raise exception 'lunch choices must be a JSON object keyed by schedule type';
  end if;

  if exists (
    select 1 from jsonb_each_text(v_choices) where value is not null and value not in ('A', 'B', 'C')
  ) then
    raise exception 'Invalid lunch choice in %', v_choices;
  end if;

  insert into public.push_installations as pi (
    token_hash, enabled, period_end, lunch_end, upcoming, lunch_choices, last_seen_at
  )
  values (v_hash, p_enabled, p_period_end, p_lunch_end, p_upcoming, v_choices, now())
  on conflict (token_hash) do update
    set enabled = excluded.enabled,
        period_end = excluded.period_end,
        lunch_end = excluded.lunch_end,
        upcoming = excluded.upcoming,
        lunch_choices = excluded.lunch_choices,
        last_seen_at = now(),
        updated_at = now();
end;
$$;


create function public.get_app_bootstrap(p_past_days int default 30, p_future_days int default 400)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with cfg as (
    select public.school_timezone() as tz
  ),
  today as (
    select (now() at time zone cfg.tz)::date as d from cfg
  ),
  span as (
    select gs::date as date
      from today t,
           generate_series(
             (t.d - least(greatest(p_past_days, 0), 60))::timestamp,
             (t.d + least(greatest(p_future_days, 7), 800))::timestamp,
             interval '1 day'
           ) as gs
  ),
  resolved as (
    select s.date, r.schedule_type_code
      from span s
      left join lateral public.schedule_for_date(s.date) r on true
  ),
  version as (
    select max(updated_at) as updated_at
      from (
        select updated_at from public.schedule_types
        union all select updated_at from public.schedule_blocks
        union all select updated_at from public.lunch_periods
        union all select updated_at from public.weekly_schedule
        union all select updated_at from public.school_calendar
      ) stamps
  )
  select jsonb_build_object(
    'version', (select updated_at from version),
    'timezone', (select tz from cfg),
    'today', (select d from today),
    'types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'code', t.code, 'name', t.name, 'passing_minutes', t.passing_minutes
      ) order by t.code), '[]'::jsonb)
      from public.schedule_types t
      where t.active
    ),
    'blocks', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schedule_type_code', b.schedule_type_code,
        'code', b.code,
        'name', b.name,
        'kind', b.kind,
        'start_time', to_char(b.start_time, 'HH24:MI'),
        'end_time', to_char(b.end_time, 'HH24:MI')
      ) order by b.schedule_type_code, b.start_time, b.code), '[]'::jsonb)
      from public.schedule_blocks b
      join public.schedule_types t on t.code = b.schedule_type_code
      where t.active
    ),
    'lunches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'schedule_type_code', l.schedule_type_code,
        'code', l.code,
        'name', l.name,
        'during_block_code', l.during_block_code,
        'start_time', to_char(l.start_time, 'HH24:MI'),
        'end_time', to_char(l.end_time, 'HH24:MI')
      ) order by l.schedule_type_code, l.start_time), '[]'::jsonb)
      from public.lunch_periods l
      join public.schedule_types t on t.code = l.schedule_type_code
      where t.active
    ),
    'days', (
      select coalesce(jsonb_object_agg(to_char(r.date, 'YYYY-MM-DD'), r.schedule_type_code), '{}'::jsonb)
      from resolved r
      where r.schedule_type_code is not null
    )
  );
$$;


drop function if exists public.upsert_push_subscription(uuid, text, text, text);
drop function if exists public.update_notification_preferences(uuid, boolean, boolean, boolean, boolean);

alter default privileges for role postgres in schema public
  revoke references, trigger, truncate, maintain on tables
  from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated, service_role;

revoke all on all tables in schema public from anon, authenticated;

grant select on
  public.schedule_types,
  public.schedule_blocks,
  public.lunch_periods,
  public.weekly_schedule,
  public.school_calendar,
  public.app_settings,
  public.motd,
  public.v_resolved_days,
  public.v_schedule_overview
to anon, authenticated;

alter table public.schedule_types enable row level security;
alter table public.schedule_blocks enable row level security;
alter table public.lunch_periods enable row level security;
alter table public.weekly_schedule enable row level security;
alter table public.school_calendar enable row level security;
alter table public.app_settings enable row level security;
alter table public.push_installations enable row level security;
alter table public.notification_events enable row level security;
alter table public.notification_deliveries enable row level security;

create policy "Schedule types are publicly readable"
  on public.schedule_types for select to anon, authenticated using (active = true);

create policy "Schedule blocks are publicly readable"
  on public.schedule_blocks for select to anon, authenticated
  using (
    exists (
      select 1 from public.schedule_types t
      where t.code = schedule_blocks.schedule_type_code and t.active = true
    )
  );

create policy "Lunch periods are publicly readable"
  on public.lunch_periods for select to anon, authenticated
  using (
    exists (
      select 1 from public.schedule_types t
      where t.code = lunch_periods.schedule_type_code and t.active = true
    )
  );

create policy "Weekly schedule is publicly readable"
  on public.weekly_schedule for select to anon, authenticated using (true);

create policy "School calendar is publicly readable"
  on public.school_calendar for select to anon, authenticated using (true);

create policy "Public settings are publicly readable"
  on public.app_settings for select to anon, authenticated using (true);

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as signature
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
  loop
    execute format('revoke all on routine %s from public', r.signature);
  end loop;
end
$$;

revoke all on function public.register_push_installation(uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.save_notification_settings(uuid, boolean, boolean, boolean, boolean, jsonb)
  from public, anon, authenticated;
revoke all on function public.refresh_notification_events(int) from public, anon, authenticated;
revoke all on function public.claim_due_pushes(int) from public, anon, authenticated;
revoke all on function public.finish_push_batch(jsonb, uuid[]) from public, anon, authenticated;
revoke all on function public.prune_notification_history() from public, anon, authenticated;
revoke all on function public.get_app_bootstrap(int, int) from public, anon, authenticated;
revoke all on function public.schedule_for_date(date) from public, anon, authenticated;
revoke all on function public.school_timezone() from public, anon, authenticated;

grant execute on function public.register_push_installation(uuid, text, text, text)
  to anon, authenticated, service_role;
grant execute on function public.save_notification_settings(
  uuid, boolean, boolean, boolean, boolean, jsonb
) to anon, authenticated, service_role;
grant execute on function public.get_app_bootstrap(int, int) to anon, authenticated, service_role;
grant execute on function public.schedule_for_date(date) to anon, authenticated, service_role;
grant execute on function public.school_timezone() to anon, authenticated, service_role;

grant execute on function public.refresh_notification_events(int) to service_role;
grant execute on function public.claim_due_pushes(int) to service_role;
grant execute on function public.finish_push_batch(jsonb, uuid[]) to service_role;
grant execute on function public.prune_notification_history() to service_role;

grant select, insert, update, delete on public.push_installations to service_role;
grant select, insert, update, delete on public.notification_events to service_role;
grant select, insert, update on public.notification_deliveries to service_role;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    execute 'revoke all on all routines in schema net from public, anon, authenticated';
  end if;
end
$$;


insert into public.app_settings (key, value)
values (
  'notification_worker_url',
  'https://upjgstxbzgvlbleerszj.supabase.co/functions/v1/send-schedule-notifications'
)
on conflict (key) do nothing;

do $$
declare
  v_secret text;
  v_url text;
  r record;
begin
  for r in select jobid from cron.job where jobname in ('vram-generate-events', 'vram-prune')
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  perform cron.schedule(
    'vram-generate-events',
    '17 * * * *',
    $cron$select public.refresh_notification_events(3)$cron$
  );

  perform cron.schedule(
    'vram-prune',
    '23 7 * * *',
    $cron$select public.prune_notification_history()$cron$
  );

  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'vram_cron_secret';

  select value into v_url from public.app_settings where key = 'notification_worker_url';

  if v_secret is null or v_url is null then
    raise notice 'vram_cron_secret is not in Vault: keeping the existing send job as-is';
    return;
  end if;

  for r in select jobid from cron.job
   where jobname in ('send-schedule-notifications', 'vram-send-pushes')
  loop
    perform cron.unschedule(r.jobid);
  end loop;

  perform cron.schedule(
    'vram-send-pushes',
    '* * * * *',
    $cron$select net.http_post(
      url := (select value from public.app_settings where key = 'notification_worker_url'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'vram_cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 50000
    )$cron$
  );
end
$$;

select public.refresh_notification_events(3);


comment on table public.schedule_types is
  'One row per bell schedule (Blue, White, RAM, ER White). `code` is immutable and used by the app; `name` is the label shown to students.';
comment on column public.schedule_types.passing_minutes is
  'Length of the passing period inserted around a lunch when a class is split.';
comment on column public.schedule_types.active is
  'Inactive schedules are hidden from the app but keep their history.';

comment on table public.schedule_blocks is
  'Periods and passing periods, in local school time (see app_settings.school_timezone). Blocks of one schedule type may not overlap.';
comment on column public.schedule_blocks.code is
  'Stable identifier used by the app for custom period names and notifications, e.g. p1, passing1, home.';
comment on column public.schedule_blocks.kind is
  'period = class time, passing = transition between classes.';

comment on table public.lunch_periods is
  'A/B/C lunch windows. during_block_code names the period the lunch interrupts; the app splits that period around the lunch.';
comment on column public.lunch_periods.during_block_code is
  'Must be a block of the same schedule type, and the lunch must fall inside its start and end.';

comment on table public.weekly_schedule is
  'Default schedule per weekday, ISO numbering (1 = Monday … 7 = Sunday). Blank means no school.';
comment on table public.school_calendar is
  'Per-date overrides. Set schedule_type_code to a schedule type for a school day, or leave it blank for no school. Dates not listed follow weekly_schedule.';
comment on column public.school_calendar.is_school_day is
  'Derived from schedule_type_code; do not edit.';
comment on table public.app_settings is
  'Public, non-secret settings. Do not store secrets here — this table is readable by anon.';
comment on column public.app_settings.value is
  'school_timezone holds the IANA timezone used to decide which school day it is.';

comment on table public.push_installations is
  'One row per browser/app installation. Created on first visit (for lunch choice), joined to a push subscription once notifications are enabled.';
comment on column public.push_installations.token_hash is
  'SHA-256 of the installation token held in the browser. The token itself is never stored.';
comment on column public.push_installations.enabled is
  'The user''s master switch. Registration never flips this back on.';
comment on column public.push_installations.disabled_reason is
  'Set when the push service rejects the endpoint (410/404). Cleared on re-registration.';
comment on column public.push_installations.lunch_choices is
  'Lunch per schedule type, e.g. {"blue": "A", "white": "C"}. A missing entry means every lunch window is announced.';

comment on table public.notification_events is
  'Precomputed notifications. Regenerated hourly for upcoming days; past events are kept until pruned.';
comment on table public.notification_deliveries is
  'One row per event and installation: the claim/sent/failed log used to avoid duplicate sends.';
comment on function public.get_app_bootstrap(int, int) is
  'Everything the client needs to render the schedule in one payload. Dates missing from `days` are not school days.';
