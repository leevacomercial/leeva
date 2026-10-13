-- =========================================================
-- LEEVA — código de convite do motoboy
-- =========================================================
-- A loja cadastra o motoboy (nome + telefone) e manda o convite pelo
-- WhatsApp. Antes, quem soubesse o telefone conseguia ativar a conta. Agora
-- a ativação exige o CÓDIGO de 6 números que vai no link do convite — e o
-- código diz exatamente de qual loja é o cadastro (o mesmo telefone pode
-- estar em mais de uma loja).

alter table public.motoboys add column if not exists invite_code text;
create unique index if not exists motoboys_invite_code_idx
  on public.motoboys(invite_code) where invite_code is not null;

-- quem ainda não ativou ganha um código agora
update public.motoboys
   set invite_code = lpad((floor(random() * 1000000))::int::text, 6, '0')
 where user_id is null and invite_code is null;
