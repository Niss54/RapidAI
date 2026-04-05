create table if not exists public.patients (
  patient_id text primary key,
  heart_rate numeric,
  spo2 numeric,
  temperature numeric,
  blood_pressure text,
  risk_level text default 'STABLE',
  last_updated timestamptz default timezone('utc', now())
);

create index if not exists idx_patients_risk_level on public.patients(risk_level);
create index if not exists idx_patients_last_updated on public.patients(last_updated desc);

create table if not exists public.telemetry_events (
  id bigint generated always as identity primary key,
  patient_id text not null,
  heart_rate numeric,
  spo2 numeric,
  temperature numeric,
  blood_pressure text,
  risk_level text not null,
  reason text,
  received_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_telemetry_events_patient_time
  on public.telemetry_events(patient_id, received_at desc);
create index if not exists idx_telemetry_events_risk_time
  on public.telemetry_events(risk_level, received_at desc);

create table if not exists public.voice_interactions (
  id bigint generated always as identity primary key,
  transcript text not null,
  intent text not null,
  patient_id text,
  language text not null,
  response_text text not null,
  source text not null default 'text',
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_voice_interactions_created_at
  on public.voice_interactions(created_at desc);
create index if not exists idx_voice_interactions_patient_time
  on public.voice_interactions(patient_id, created_at desc);

create table if not exists public.alert_events (
  id bigint generated always as identity primary key,
  patient_id text not null,
  alert_type text not null,
  language text not null,
  message text not null,
  delivered boolean not null default false,
  delivery_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_alert_events_patient_time
  on public.alert_events(patient_id, created_at desc);
create index if not exists idx_alert_events_type_time
  on public.alert_events(alert_type, created_at desc);

create extension if not exists pg_cron with schema extensions;

create or replace function public.has_app_role(allowed_roles text[])
returns boolean
language sql
stable
as $$
  select coalesce((auth.jwt() ->> 'app_role') = any(allowed_roles), false);
$$;

grant usage on schema public to authenticated;
grant select, insert, update on table public.patients to authenticated;
grant select, insert on table public.telemetry_events to authenticated;
grant select, insert on table public.voice_interactions to authenticated;
grant select, insert on table public.alert_events to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter table public.patients enable row level security;
alter table public.telemetry_events enable row level security;
alter table public.voice_interactions enable row level security;
alter table public.alert_events enable row level security;

drop policy if exists patients_select_clinical on public.patients;
drop policy if exists patients_insert_clinical on public.patients;
drop policy if exists patients_update_clinical on public.patients;

create policy patients_select_clinical
  on public.patients
  for select
  to authenticated
  using (public.has_app_role(array['nurse', 'doctor', 'admin']));

create policy patients_insert_clinical
  on public.patients
  for insert
  to authenticated
  with check (public.has_app_role(array['doctor', 'admin']));

create policy patients_update_clinical
  on public.patients
  for update
  to authenticated
  using (public.has_app_role(array['doctor', 'admin']))
  with check (public.has_app_role(array['doctor', 'admin']));

drop policy if exists telemetry_select_clinical on public.telemetry_events;
drop policy if exists telemetry_insert_clinical on public.telemetry_events;

create policy telemetry_select_clinical
  on public.telemetry_events
  for select
  to authenticated
  using (public.has_app_role(array['nurse', 'doctor', 'admin']));

create policy telemetry_insert_clinical
  on public.telemetry_events
  for insert
  to authenticated
  with check (public.has_app_role(array['doctor', 'admin']));

drop policy if exists voice_select_clinical on public.voice_interactions;
drop policy if exists voice_insert_clinical on public.voice_interactions;

create policy voice_select_clinical
  on public.voice_interactions
  for select
  to authenticated
  using (public.has_app_role(array['doctor', 'admin']));

create policy voice_insert_clinical
  on public.voice_interactions
  for insert
  to authenticated
  with check (public.has_app_role(array['doctor', 'admin']));

drop policy if exists alerts_select_clinical on public.alert_events;
drop policy if exists alerts_insert_clinical on public.alert_events;

create policy alerts_select_clinical
  on public.alert_events
  for select
  to authenticated
  using (public.has_app_role(array['nurse', 'doctor', 'admin']));

create policy alerts_insert_clinical
  on public.alert_events
  for insert
  to authenticated
  with check (public.has_app_role(array['doctor', 'admin']));

create or replace function public.cleanup_event_tables(retention_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_telemetry integer := 0;
  deleted_alerts integer := 0;
  deleted_voice integer := 0;
begin
  delete from public.telemetry_events
  where received_at < timezone('utc', now()) - make_interval(days => retention_days);
  get diagnostics deleted_telemetry = row_count;

  delete from public.alert_events
  where created_at < timezone('utc', now()) - make_interval(days => retention_days);
  get diagnostics deleted_alerts = row_count;

  delete from public.voice_interactions
  where created_at < timezone('utc', now()) - make_interval(days => retention_days);
  get diagnostics deleted_voice = row_count;

  return jsonb_build_object(
    'retention_days', retention_days,
    'deleted_telemetry_events', deleted_telemetry,
    'deleted_alert_events', deleted_alerts,
    'deleted_voice_interactions', deleted_voice,
    'ran_at_utc', timezone('utc', now())
  );
end;
$$;

do $$
declare
  existing_job_id bigint;
begin
  if to_regclass('cron.job') is null then
    raise notice 'pg_cron is unavailable. Run select public.cleanup_event_tables(30) manually.';
    return;
  end if;

  select jobid into existing_job_id
  from cron.job
  where jobname = 'daily_event_retention'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  begin
    perform cron.schedule(
      'daily_event_retention',
      '20 2 * * *',
      $job$select public.cleanup_event_tables(30);$job$
    );
  exception
    when undefined_function then
      raise notice 'pg_cron schedule function is unavailable. Run cleanup manually.';
  end;
end;
$$;
