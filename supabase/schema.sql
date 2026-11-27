-- ตัดดี: Supabase schema for authentication and barber appointments.
-- Run this file in Supabase Dashboard -> SQL Editor.
-- Safe to re-run for the objects/policies defined below.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text not null default '',
  price_thb integer not null check (price_thb >= 0),
  duration_minutes integer not null check (duration_minutes between 15 and 240),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  service_id uuid not null references public.services(id) on delete restrict,
  barber_id uuid not null references public.barbers(id) on delete restrict,
  customer_name text not null check (length(trim(customer_name)) between 1 and 100),
  customer_phone text not null check (length(trim(customer_phone)) between 8 and 25),
  note text not null default '' check (length(note) <= 500),
  start_at timestamptz not null,
  end_at timestamptz not null,
  price_thb integer not null check (price_thb >= 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  constraint appointments_no_barber_overlap
    exclude using gist (
      barber_id with =,
      tstzrange(start_at, end_at, '[)') with &&
    ) where (status = 'confirmed')
);

create index if not exists appointments_customer_start_idx
  on public.appointments (customer_id, start_at desc);
create index if not exists appointments_start_idx
  on public.appointments (start_at) where status = 'confirmed';

-- New accounts always start as customers. Promote the shop owner manually
-- from the Supabase SQL Editor only; never allow profile role updates from clients.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.barbers enable row level security;
alter table public.appointments enable row level security;

-- Profiles: users can read their own profile; admins can read all.
drop policy if exists "profiles read self or admin" on public.profiles;
create policy "profiles read self or admin"
on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));
-- Intentionally no client-side INSERT/UPDATE policy on profiles.

drop policy if exists "active services public read" on public.services;
create policy "active services public read"
on public.services for select to anon, authenticated
using (active or (select public.is_admin()));
drop policy if exists "admins manage services" on public.services;
create policy "admins manage services"
on public.services for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "active barbers public read" on public.barbers;
create policy "active barbers public read"
on public.barbers for select to anon, authenticated
using (active or (select public.is_admin()));
drop policy if exists "admins manage barbers" on public.barbers;
create policy "admins manage barbers"
on public.barbers for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "customers read own and admins read all" on public.appointments;
create policy "customers read own and admins read all"
on public.appointments for select to authenticated
using (customer_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "admins update appointments" on public.appointments;
create policy "admins update appointments"
on public.appointments for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
-- Appointment writes happen only through the checked RPC functions below.

create or replace function public.book_appointment(
  p_service_id uuid,
  p_barber_id uuid,
  p_start_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_note text default ''
)
returns public.appointments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_service public.services%rowtype;
  v_end_at timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
  v_appointment public.appointments%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  if length(trim(coalesce(p_customer_name, ''))) not between 1 and 100 then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_customer_phone, ''))) not between 8 and 25 then
    raise exception 'INVALID_PHONE' using errcode = '22023';
  end if;
  if length(coalesce(p_note, '')) > 500 then
    raise exception 'NOTE_TOO_LONG' using errcode = '22023';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id and active;
  if not found then
    raise exception 'SERVICE_UNAVAILABLE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.barbers where id = p_barber_id and active
  ) then
    raise exception 'BARBER_UNAVAILABLE' using errcode = '22023';
  end if;

  v_end_at := p_start_at + make_interval(mins => v_service.duration_minutes);
  v_local_start := p_start_at at time zone 'Asia/Bangkok';
  v_local_end := v_end_at at time zone 'Asia/Bangkok';
  if p_start_at <= now() then
    raise exception 'TIME_IN_PAST' using errcode = '22023';
  end if;
  if v_local_start::date <> v_local_end::date
     or v_local_start::time < time '10:00'
     or v_local_end::time > time '20:00' then
    raise exception 'OUTSIDE_BUSINESS_HOURS' using errcode = '22023';
  end if;

  insert into public.appointments (
    customer_id, service_id, barber_id, customer_name, customer_phone,
    note, start_at, end_at, price_thb
  ) values (
    v_user_id, p_service_id, p_barber_id, trim(p_customer_name),
    trim(p_customer_phone), coalesce(p_note, ''), p_start_at, v_end_at,
    v_service.price_thb
  ) returning * into v_appointment;

  return v_appointment;
exception
  when exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = '23P01';
end;
$$;
revoke all on function public.book_appointment(uuid, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.book_appointment(uuid, uuid, timestamptz, text, text, text) to authenticated;

create or replace function public.cancel_appointment(p_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;
  update public.appointments
  set status = 'cancelled'
  where id = p_appointment_id
    and status = 'confirmed'
    and (customer_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND_OR_FORBIDDEN' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.cancel_appointment(uuid) from public, anon;
grant execute on function public.cancel_appointment(uuid) to authenticated;

insert into public.services (name, description, price_thb, duration_minutes)
values
  ('ตัดผม', 'สระ · ตัด · เซ็ตทรง', 250, 45),
  ('ตัดทรงเฟด', 'ไล่เฟดเนียน คมทุกองศา', 300, 60),
  ('ตัดแต่งหนวด', 'เก็บรายละเอียดให้เข้าทรง', 150, 30),
  ('สระและเซ็ต', 'ผ่อนคลาย พร้อมจัดทรง', 120, 30),
  ('ตัดผม + หนวด', 'ครบจบในครั้งเดียว', 350, 60),
  ('ออกแบบทรงผม', 'ปรึกษาช่างก่อนเริ่มตัด', 400, 75)
on conflict (name) do nothing;

insert into public.barbers (display_name)
values ('ช่างต้น'), ('ช่างแม็กซ์'), ('ช่างแบงค์')
on conflict (display_name) do nothing;
