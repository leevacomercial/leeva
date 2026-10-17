-- =========================================================
-- LEEVA — iFood pelo módulo LOGISTICS (homologação)
-- =========================================================
-- O Leeva é a plataforma de logística da loja: recebe os pedidos do iFood e
-- avisa cada etapa da entrega (assignDriver → goingToOrigin → arrivedAtOrigin
-- → dispatch → arrivedAtDestination → verifyDeliveryCode).
--
-- ifood_logistics_step   = última etapa já avisada ao iFood (null = nenhuma)
-- ifood_code_required    = o iFood pediu o código de entrega (evento DDCR)

alter table public.orders add column if not exists ifood_logistics_step text;
alter table public.orders add column if not exists ifood_code_required boolean not null default false;
create index if not exists orders_ifood_logistics_idx
  on public.orders(restaurant_id, status) where source = 'ifood';
