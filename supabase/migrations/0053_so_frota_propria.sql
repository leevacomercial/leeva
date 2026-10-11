-- Fim da rede Leeva: o Leeva é só ferramenta pra frota PRÓPRIA do
-- estabelecimento, cobrando mensalidade. Sem créditos, sem margem por
-- entrega, sem carteira/saque de motoboy, sem cadastro aberto de entregador.
--
-- Nada é apagado: as tabelas antigas (restaurant_credits, credit_ledger,
-- driver_earnings, payout_batches, credit_packages…) ficam no banco como
-- histórico — o código só parou de usá-las.

-- 1) Todo estabelecimento passa a ser frota própria, e novos já nascem assim.
update public.restaurants set fleet_mode = 'own' where fleet_mode <> 'own';
alter table public.restaurants alter column fleet_mode set default 'own';

-- 2) Motoboys que eram da rede (sem estabelecimento) saem do ar: não recebem
--    oferta nenhuma e não aparecem pra ninguém. A linha continua no banco.
update public.motoboys
   set active = false, status = 'offline'
 where fleet = 'leeva' and active;

-- 3) Planos: nenhum plano cobra por entrega. Os planos antigos da rede
--    saem da vitrine (assinaturas existentes neles continuam valendo até o
--    admin trocar o plano do cliente em Clientes).
update public.plans set per_delivery_price = 0, per_delivery_margin = 0;
--    Só desliga se o plano mensal (migration 0049) já existir, pra nunca
--    ficar sem nenhum plano ativo.
update public.plans set active = false
 where code in ('start', 'pro', 'business')
   and exists (select 1 from public.plans where code = 'mensal' and active);

-- 4) Cron de cobrança/saque (se ainda existir em algum ambiente).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'leeva-payout-closing') then
    perform cron.unschedule('leeva-payout-closing');
  end if;
exception when undefined_table then
  null; -- pg_cron não habilitado — nada a desligar
end $$;
