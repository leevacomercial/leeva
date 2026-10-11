# Leeva

**A logística inteligente do seu delivery.** SaaS de logística para restaurantes —
**não** é marketplace de comida. O pedido comercial continua vindo dos canais do
restaurante (WhatsApp, iFood, site, telefone). O Leeva recebe só os dados de
logística e **cuida da entrega sozinho**: analisa, escolhe o melhor entregador
para aquela entrega agora, envia a oferta, acompanha e mede.

Fluxo central: **PEDIDO → DESPACHO AUTOMÁTICO → MOTOBOY → ROTA → CLIENTE → ENTREGA → INDICADORES**
O despacho é **automático**; se quiser, o dono passa por cima e manda o pedido pra alguém da equipe pelo mapa Ao vivo.


> **Modelo atual (11/10/2026):** só a frota **própria** do estabelecimento + mensalidade.
> Não existe mais rede Leeva, crédito, margem por entrega nem carteira do motoboy — o
> histórico das fases abaixo cita essas partes, mas o código delas foi removido.
> Ver `CLAUDE.md` e `docs/DECISOES-NOTURNAS.md` (11/10).

- **`apps/restaurante`** — painel web (Next.js 15). Porta **3000**.
- **`apps/motoboy`** — PWA do entregador (Next.js 15). Porta **3001**.
- **`apps/admin`** — painel da plataforma Leeva (Next.js 15). Porta **3002**. Acesso restrito ao operador.
- **`packages/shared`** (`@leeva/shared`) — tipos, serviços, integrações, hooks.
- **`supabase/migrations`** — schema, RLS, Realtime.
- **`docs/`** — arquitetura, banco, API, integrações, logística, reputação, admin, deploy.

## O que existe

### Fase 1 — Fundação ✅
Monorepo, os dois apps, auth (restaurante e motoboy), multi-tenant com RLS,
Realtime entre os apps.

### Fase 2 — Central de pedidos, automação e inteligência ✅

| Área | Estado |
|---|---|
| **Central de pedidos** multicanal (manual, iFood, WhatsApp, cardápio, API) com filtros e busca | **funcional** |
| **Normalização** (`NormalizedOrder`) + **adapters** por fonte + idempotência | **funcional** |
| **Despacho inteligente** — `recommendDriver()` pontua candidatos e **explica** com base nos dados reais (disponibilidade, distância à coleta, carga, agrupamento) | **funcional** |
| **Despacho manual** — aceitar recomendação ou escolher outro motoboy | **funcional** |
| **Agrupamento** de entregas próximas (clusters geográficos + rota estimada) | **funcional** |
| **RoutingService** isolado (linha reta agora; OSRM/Google/Mapbox plugáveis) | **funcional / preparado** |
| **Localização do motoboy** — envio periódico só durante entrega ativa, retenção de 24 h | **funcional** |
| **Rastreamento do cliente** — `/track/[token]` público, sem conta, token seguro, mapa esquemático, ETA em intervalo | **funcional** |
| **Sistema de eventos** — `order_events` (trigger no banco), timeline por pedido | **funcional** |
| **NotificationService** — canal in-app **funcional**; WhatsApp/SMS/Push **preparados** (marcam `skipped` se sem credencial, nunca fingem envio) | **funcional / preparado** |
| **Alertas operacionais** — atraso, falta de motoboy, pico de demanda, cozinha acumulando, operação normal (regras determinísticas) | **funcional** |
| **Dashboard "O que está acontecendo?"** — leitura acionável do estado atual | **funcional** |
| **Indicadores** — entregas, tempo médio, distância, custo, atraso, cancelamento; por motoboy; por região; filtros hoje/ontem/7d/30d (tudo do banco) | **funcional** |
| **Webhooks** — assinatura HMAC, idempotência (`event_id` + `source+external_id`), log em `integration_events` | **funcional (infra) / preparado (credenciais)** |
| **iFood / WhatsApp** — adapters, webhook, parsing, `pushStatus` | **preparado** (falta credencial/aprovação) |
| **IA (WhatsApp)** — interpreta mensagem → rascunho de pedido que **exige confirmação humana** | **funcional (heurística) / preparado (LLM)** |

Detalhes de cada item e do que falta: **`docs/INTEGRATIONS.md`**.

### Fase 3 — produto comercial + central de operações + logística automática ✅

| Área | Estado |
|---|---|
| **Despacho 100% automático** — `runDispatchTick` / `scoreCandidatesForOrder`: ETA à coleta, impacto na rota, carga, confiabilidade, histórico, avaliação (pesos configuráveis em `logistics_config.dispatch_weights`) | **funcional** |
| **Retentativa automática** — recusa/timeout libera a oferta e vai ao próximo candidato; esgotado → alerta "sem entregador" | **funcional** |
| **Rede Leeva + frota própria** — `fleet_mode` own/leeva/hybrid; a rede é invisível ao restaurante (RLS) | **funcional** |
| **App do entregador — ofertas** — overlay em tempo real, contagem regressiva, aceitar/recusar, "receber do cliente na entrega" | **funcional** |
| **Central de operações** — situação, cards, mapa funcional (Leaflet/OSM), central de alertas, lista de pedidos ↔ mapa | **funcional** |
| **Mapa de calor** — pontos/regiões/insights de dados reais (plano Pro+) | **funcional** |
| **Remuneração configurável** (`payout_policies`) — base, por km, adicional agrupado, bônus de pico, mínimo; simulação ao vivo nas Configurações | **funcional** |
| **Financeiro** — receita SaaS × receita de logística × custo do entregador × **margem** (coluna gerada); alertas financeiros reais | **funcional** |
| **SaaS** — planos `start`/`pro`/`business` (`plans.features` jsonb), assinatura, uso por período, cobrança por entrega (idempotente) | **funcional** (falta gateway de pagamento) |
| **Onboarding** obrigatório — dados, endereço, frota, logística, tarifas, plano | **funcional** |
| **API de logística** — `POST /api/v1/deliveries` (payload flat, idempotente) | **funcional** |
| **Cron de despacho** — `POST /api/cron/dispatch-tick` | **funcional** (precisa de agendador em produção) |

Detalhes: **`docs/LOGISTICS.md`**, **`docs/BILLING.md`**, **`docs/MAP.md`**.

### Fase 3.5 — go-live + admin da plataforma + reputação ✅

| Área | Estado |
|---|---|
| **Cron real do despacho** — `pg_cron` + `pg_net` chamam `/api/cron/dispatch-tick` a cada ~30 s (funciona sem ninguém abrir o painel). LEASE com TTL + `dispatch_runs` para não processar em duplicidade | **funcional** (agendar 1x — `docs/DEPLOY.md`) |
| **Painel admin** (`apps/admin`) — auth por `platform_admins` validada no backend; restaurante/motoboy sem acesso | **funcional** |
| **Admin: Visão geral** — MRR, receita SaaS/variável/total, custos, margem, restaurantes ativos/trial, entregas, motoboys online, sem entregador + comparação com período anterior | **funcional** |
| **Admin: Operação** — mapa geral da rede (restaurantes, entregadores, entregas, concentração de demanda, áreas com falta) + filtros | **funcional** |
| **Admin: Restaurantes** — tabela + filtros + página de detalhe (assinatura, utilização, integrações, faturamento) | **funcional** |
| **Admin: Entregadores** — desempenho, histórico de ofertas, incidentes, bloquear/desbloquear | **funcional** |
| **Admin: Financeiro** — receita/custo/margem + unit economics (receita/custo/margem por restaurante e entrega, MRR, churn, LTV com aviso de amostra) | **funcional** |
| **Admin: Planos** — editar catálogo `plans` sem deploy | **funcional** |
| **Admin: Reputação** — pesos e limiares do índice de confiabilidade | **funcional** |
| **Qualidade da oferta** — classificada antes de enviar (`excellent/good/acceptable/poor`); recusar oferta ruim **nunca** penaliza | **funcional** |
| **Índice de confiabilidade** — aceitação + finalização + pontualidade + avaliação + incidentes, pesos configuráveis, nenhum eixo domina | **funcional** |
| **Incidentes com origem** — cancelamento/abandono; problema do restaurante/cliente/sistema não pune o entregador | **funcional** |
| **App do motoboy — Desempenho** — índice, taxas, dicas (sem revelar a fórmula) | **funcional** |
| **Rate limiting** — deliveries, tracking, webhooks, geocode, cron (janela deslizante no banco) | **funcional** |
| **Chaves de API por restaurante** — UI em Integrações, hash sha-256, revogação; fim da `LEEVA_API_KEY` global | **funcional** |
| **Monitoramento** — `captureError` → `error_events` (Sentry plugável) | **funcional / preparado** |
| **Cobrança real (gateway)** — arquitetura pronta (`billing_events`), integração adiada | **preparado** |

Detalhes: **`docs/REPUTATION.md`**, **`docs/ADMIN.md`**, **`docs/DEPLOY.md`**, **`docs/GO-LIVE.md`**.

## Rodar localmente

```bash
npm install
```

1. **Banco:** crie um projeto em supabase.com e rode os arquivos de
   `supabase/migrations/` no SQL Editor, na ordem (`0001` → `0018`).
   Detalhes em `supabase/README.md` e `docs/DATABASE.md`.
2. **Env:**
   ```bash
   cp apps/restaurante/.env.local.example apps/restaurante/.env.local
   cp apps/motoboy/.env.local.example     apps/motoboy/.env.local
   cp apps/admin/.env.local.example       apps/admin/.env.local
   ```
   Preencha as 3 chaves do Supabase nos três. O resto é opcional.
3. **Dados de demonstração** (opcional, `DEVELOPMENT ONLY`):
   ```bash
   npm run seed        # restaurante + dono + 1 motoboy + 2 pedidos
   npm run seed:demo   # + 5 motoboys, ~10 clientes, ~20 pedidos, 5 regiões
   npm run seed:fase3  # onboarding + assinatura Pro + 6 entregadores da rede Leeva
   npm run seed:admin  # operador da plataforma → admin@leeva.dev / leeva123
   ```
4. **Subir:**
   ```bash
   npm run dev
   ```
   - Restaurante: http://localhost:3000 — `dono@leeva.dev` / `leeva123`
   - Motoboy: http://localhost:3001 — `motoboy@leeva.dev` / `leeva123`
   - Admin: http://localhost:3002 — `admin@leeva.dev` / `leeva123`

   Em produção, agende o cron do despacho (ver `docs/DEPLOY.md §4`).

## Testes

```bash
npm test                   # 18 unitários (@leeva/shared): geo, routing, máquina de
                           # estados, parser de WhatsApp, cripto, adapter manual
npm run test:integration   # 14 contra o Supabase: criação/normalização, idempotência,
                           # transições, despacho, ETA (limites), agrupamento,
                           # notificação (dedup), tracking (+ cancelado), multi-tenant
npm run test:concurrency   # 7 race conditions: despacho/transição/aceite/conclusão
                           # simultâneos, capacidade, webhook duplicado, LEASE do cron
npm run test:security      # 23 pen-tests: RLS entre organizações, API 401/403,
                           # tracking (não vaza dados, tokens inválido/expirado/revogado)
npm run test:fase3         # 14 contra o Supabase: assinatura, cobrança por entrega,
                           # despacho automático, financeiro, heatmap, isolamento
npm run test:fase35        # 21 contra o Supabase: qualidade da oferta, aceitação
                           # justa, incidentes por origem, confiabilidade, bloqueio,
                           # LEASE do cron, rate limit, chaves de API, admin, RLS
```

Total: **104 testes passando** (25 unitários + 14 integração + 7 concorrência +
23 segurança + 14 fase 3 + 21 fase 3.5). Build de produção e typecheck: OK.

Auditoria e hardening: **`docs/SECURITY.md`**.

## Fluxo "pronto" (Definition of Done da Fase 2)

Verificado ponta a ponta: criar pedido manual → confirmar → recomendação de
motoboy com explicação → despachar (aceitar ou trocar) → motoboy aceita → coleta
→ inicia rota → localização atualiza → cliente abre `/track/[token]` e vê status +
ETA + mapa → eventos registrados → notificações disparadas → motoboy conclui →
tempo/distância gravados → dashboard e alertas atualizam → histórico disponível.

## Scripts

| Comando | Ação |
|---|---|
| `npm run dev` | sobe os três apps |
| `npm run dev:restaurante` / `dev:motoboy` / `dev:admin` | um app só |
| `npm run build` / `typecheck` / `lint` / `test` | via Turborepo |
| `npm run test:integration` / `test:concurrency` / `test:security` / `test:fase3` / `test:fase35` | suítes contra o Supabase |
| `npm run seed` / `seed:demo` / `seed:fase3` / `seed:admin` | dados de teste / demonstração |
| `LEEVA_PROJECT_ID=<ref> npm run db:types` | regenera `packages/shared/src/types/database.ts` |

## Documentação

- `docs/ARCHITECTURE.md` — camadas, módulos, eventos, multi-tenant, IA
- `docs/DATABASE.md` — tabelas, índices, triggers, RLS, migrations
- `docs/API.md` — todas as rotas
- `docs/INTEGRATIONS.md` — estado (implementado/preparado/mock) e o que falta
- `docs/LOGISTICS.md` — despacho automático, frota, remuneração, financeiro
- `docs/BILLING.md` — modelo SaaS: planos, assinatura, uso, cobrança
- `docs/MAP.md` — arquitetura do mapa, central de operações, heatmap
- `docs/REPUTATION.md` — qualidade da oferta + índice de confiabilidade do motoboy
- `docs/ADMIN.md` — painel da plataforma (apps/admin)
- `docs/DEPLOY.md` — Vercel + Supabase + cron real + secrets + monitoramento + backups
- `docs/GO-LIVE.md` — checklist de go-live
- `docs/DATA-RETENTION.md` — localização, tokens, logs, privacidade
- `docs/SECURITY.md` — auditoria e hardening
