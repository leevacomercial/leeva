-- Escalas e turnos da frota própria.
--
-- Cada linha é um turno de um motoboy da equipe do estabelecimento
-- (ex.: João, sexta 18:00 → 23:30). Quando o restaurante liga
-- "Despachar só pra quem está de turno" (logistics_config.shifts_enforced),
-- o despacho automático só oferece entrega pra quem tem turno cobrindo
-- o horário atual. Desligado, a escala é só organização (não bloqueia nada).

create table if not exists public.driver_shifts (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  motoboy_id    uuid not null references public.motoboys(id) on delete cascade,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  note          text,
  created_at    timestamptz not null default now(),
  constraint driver_shifts_valid_range check (ends_at > starts_at),
  constraint driver_shifts_max_length check (ends_at - starts_at <= interval '16 hours')
);

create index if not exists driver_shifts_restaurant_time_idx
  on public.driver_shifts(restaurant_id, starts_at);
create index if not exists driver_shifts_motoboy_time_idx
  on public.driver_shifts(motoboy_id, starts_at);

alter table public.driver_shifts enable row level security;

-- a equipe do restaurante vê/mexe só na escala do próprio restaurante
drop policy if exists "driver_shifts: equipe gerencia as do restaurante" on public.driver_shifts;
create policy "driver_shifts: equipe gerencia as do restaurante"
  on public.driver_shifts for all
  using (restaurant_id = public.current_restaurant_id())
  with check (restaurant_id = public.current_restaurant_id());

-- o motoboy só lê os próprios turnos
drop policy if exists "driver_shifts: motoboy lê os próprios" on public.driver_shifts;
create policy "driver_shifts: motoboy lê os próprios"
  on public.driver_shifts for select
  using (motoboy_id = public.current_motoboy_id());

comment on table public.driver_shifts is
  'Turnos da frota própria. Com logistics_config.shifts_enforced=true o despacho só chama quem está de turno.';
