-- Run this once in Supabase SQL Editor after applying schema.sql.
-- Exposes only occupied time ranges, never customer names, phone numbers, or notes.
create or replace function public.get_booked_slots(
  p_barber_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns table(start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.start_at, a.end_at
  from public.appointments a
  where a.barber_id = p_barber_id
    and a.status = 'confirmed'
    and a.start_at < p_to
    and a.end_at > p_from;
$$;
revoke all on function public.get_booked_slots(uuid, timestamptz, timestamptz) from public;
grant execute on function public.get_booked_slots(uuid, timestamptz, timestamptz) to anon, authenticated;
