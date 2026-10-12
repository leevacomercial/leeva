-- =========================================================
-- LEEVA — fila dos motoboys da equipe própria (já aplicada no banco em 12/10)
-- =========================================================
-- Modelo atual: o motoboy é do estabelecimento. A próxima entrega vai pro
-- primeiro da FILA: quem ficou livre primeiro (ficou online ou terminou a
-- última entrega). `queue_since` guarda esse momento; NULL = fora da fila.

alter table public.motoboys add column if not exists queue_since timestamptz;
create index if not exists motoboys_queue_idx
  on public.motoboys(restaurant_id, queue_since) where fleet = 'own';

-- 1) ficou online → entra no fim da fila; ficou offline → sai da fila
create or replace function public.motoboy_queue_on_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'offline' then
    new.queue_since := null;
  elsif old.status = 'offline' and new.status <> 'offline' then
    new.queue_since := now();
  end if;
  return new;
end $$;

drop trigger if exists motoboy_queue_on_status on public.motoboys;
create trigger motoboy_queue_on_status
  before update of status on public.motoboys
  for each row when (old.status is distinct from new.status)
  execute function public.motoboy_queue_on_status();

-- 2) terminou a última entrega (entregue/cancelada) → volta pro fim da fila
create or replace function public.motoboy_queue_on_order_done()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.motoboy_id is not null
     and new.status in ('delivered', 'cancelled')
     and old.status is distinct from new.status
     and not exists (
       select 1 from public.orders o
        where o.motoboy_id = new.motoboy_id
          and o.id <> new.id
          and o.status in ('assigned', 'picked_up', 'in_route')
     ) then
    update public.motoboys
       set queue_since = now()
     where id = new.motoboy_id and status <> 'offline';
  end if;
  return new;
end $$;

drop trigger if exists motoboy_queue_on_order_done on public.orders;
create trigger motoboy_queue_on_order_done
  after update of status on public.orders
  for each row execute function public.motoboy_queue_on_order_done();

-- quem já está online entra na fila agora
update public.motoboys
   set queue_since = coalesce(location_updated_at, now())
 where status <> 'offline' and queue_since is null;

-- 3) termos novos (modelo "app de organização"): o motoboy é da LOJA; o
--    Leeva só fornece o aplicativo. RASCUNHO — revisar com advogado.
insert into public.terms_versions (version, audience, active, content)
select coalesce(max(version), 0) + 1, 'motoboy', true, $t$TERMOS DE USO DO APLICATIVO LEEVA — ENTREGADOR

1 — O que é o Leeva
1.1. O Leeva é um aplicativo de organização de entregas usado por estabelecimentos (lojas, restaurantes) para organizar a sua PRÓPRIA equipe de entregadores: receber as entregas no celular, ver a rota, confirmar retirada e entrega e conversar com a loja.
1.2. O Leeva NÃO contrata, NÃO remunera e NÃO intermedeia o seu trabalho. A sua relação de trabalho ou de prestação de serviço — inclusive valores, forma e data de pagamento — é exclusivamente com o estabelecimento que cadastrou você.

2 — Seu cadastro
2.1. Quem cadastra você é o estabelecimento, com nome e telefone. CPF e chave Pix são opcionais e só são pedidos se a loja quiser.
2.2. Você é responsável pela sua senha e pelo uso da sua conta.

3 — Localização
3.1. Enquanto você estiver "disponível" no app, a sua localização é enviada para o estabelecimento que cadastrou você, para ele organizar as entregas e acompanhar a equipe em tempo real. Durante uma entrega, o cliente daquele pedido também vê a sua posição no link de acompanhamento.
3.2. Ao ficar "indisponível", o envio da localização para.

4 — Dados pessoais (LGPD)
4.1. Os seus dados (nome, telefone, localização, fotos de comprovação de entrega e, se informados, CPF e chave Pix) são usados somente para o funcionamento das entregas do estabelecimento, guardados com segurança e não são vendidos a ninguém.
4.2. Você pode pedir ao estabelecimento ou ao Leeva a correção ou a exclusão dos seus dados, respeitados os prazos legais de guarda.

5 — Uso correto
5.1. Use o app apenas para as entregas do estabelecimento. Não registre entrega que não aconteceu nem confirme código ou localizador que não recebeu do cliente.
5.2. O estabelecimento pode desativar a sua conta a qualquer momento.

6 — Geral
6.1. O app é oferecido "como está"; trabalhamos para que funcione sempre, mas pode haver falhas de internet, GPS ou do celular.
6.2. Estes termos podem mudar; se mudarem, o app pede um novo aceite.
$t$
from public.terms_versions;

insert into public.terms_versions (version, audience, active, content)
select coalesce(max(version), 0) + 1, 'restaurant', true, $t$TERMOS DE USO DO LEEVA — ESTABELECIMENTO (PLANO MENSAL)

1 — O serviço
1.1. O Leeva é um software (SaaS) de organização das entregas feitas pela SUA PRÓPRIA equipe de entregadores: recebimento dos pedidos (digitados, colados, por integração), fila e roteirização, envio da entrega ao app do entregador, mapa em tempo real, rastreamento para o cliente, indicadores e controle do acerto com os entregadores.
1.2. O Leeva NÃO fornece entregadores, NÃO contrata nem remunera a sua equipe e NÃO recebe nem repassa o dinheiro das entregas ou das vendas. Valores pagos aos entregadores e cobrados dos clientes são definidos e pagos por você.

2 — Mensalidade
2.1. O uso é cobrado por mensalidade, conforme o plano escolhido, com o período de teste informado na contratação. Sem pagamento, o acesso pode ser suspenso até a regularização.

3 — Sua equipe e os dados
3.1. Você é responsável por cadastrar e desativar os seus entregadores e pela relação de trabalho ou prestação de serviço com eles.
3.2. A localização dos entregadores é compartilhada com você enquanto eles estiverem disponíveis no app, só para organizar as entregas. Use esses dados apenas para essa finalidade (LGPD).
3.3. Os dados dos seus clientes (nome, telefone, endereço) são usados só para as entregas e o rastreamento.

4 — Responsabilidades
4.1. O Leeva se esforça para manter o sistema no ar, mas não responde por atrasos, extravios ou acidentes nas entregas, que são operadas pela sua equipe.
4.2. Integrações com terceiros (iFood, cardápios digitais) dependem do funcionamento desses serviços.

5 — Cancelamento
5.1. Você pode cancelar a qualquer momento; o acesso segue até o fim do período já pago.
$t$
from public.terms_versions;

-- 4) cobranças da MENSALIDADE (Pix via Asaas). Uma linha por mês cobrado.
create table if not exists public.subscription_invoices (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references public.restaurants(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  amount          numeric(10,2) not null,
  status          text not null default 'pending' check (status in ('pending','paid','expired','failed')),
  simulated       boolean not null default false,
  external_id     text,
  invoice_url     text,
  pix_copy_paste  text,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists subscription_invoices_restaurant_idx
  on public.subscription_invoices(restaurant_id, created_at desc);
create unique index if not exists subscription_invoices_external_idx
  on public.subscription_invoices(external_id) where external_id is not null;
alter table public.subscription_invoices enable row level security;
drop policy if exists "subscription_invoices: dono lê as do restaurante" on public.subscription_invoices;
create policy "subscription_invoices: dono lê as do restaurante" on public.subscription_invoices
  for select using (restaurant_id = public.current_restaurant_id());
