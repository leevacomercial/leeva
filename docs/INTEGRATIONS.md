# Integrações — estado e configuração

Classificação (aparece também na tela **Integrações** do painel):

| Rótulo | Significado |
|---|---|
| **IMPLEMENTADO** | Funciona com a configuração atual. |
| **PREPARADO** | Código, webhooks e normalização prontos. Falta credencial / aprovação / config externa. Não simula nada — recusa com erro explícito enquanto não configurado. |
| **MOCK** | Só para desenvolvimento/teste. Marcado como `MOCK / DEVELOPMENT ONLY` no código. |

Resumo:

| Integração | Tipo | Estado | Falta |
|---|---|---|---|
| Manual | fonte de pedido | **IMPLEMENTADO** | — |
| Cardápio / API própria | fonte de pedido | **IMPLEMENTADO** | gerar `x-leeva-api-key` (abaixo) |
| iFood | fonte de pedido | **PREPARADO** (vínculo authorization_code + polling implementados; testado em sandbox até gerar o userCode — falta um humano autorizar no Portal do Parceiro pra testar o recebimento ponta a ponta) | `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`, cada restaurante vincula em Integrações |
| WhatsApp (pedidos) | fonte de pedido | **PREPARADO** | `WHATSAPP_*`, número de produção aprovado |
| WhatsApp (notificações) | canal | **PREPARADO** | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` |
| SMS (Twilio) | canal | **PREPARADO** | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |
| Web Push | canal | **PREPARADO** | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` + assinatura do device |
| Rotas / mapas | routing | **PREPARADO** (cai para linha reta) | `OSRM_BASE_URL` para rota real |
| Tiles / geocoding do mapa | mapa | **IMPLEMENTADO** (OSM + Nominatim, sem chave) | `MAPBOX_TOKEN` para trocar por Mapbox (opcional) |
| API de logística (`/api/v1/deliveries`) | fonte de pedido | **IMPLEMENTADO** | gerar `x-leeva-api-key` por restaurante |
| Cron de despacho | motor | **IMPLEMENTADO** (nudge) / **PREPARADO** (cron) | agendador chamando `/api/cron/dispatch-tick` + `CRON_SECRET` |
| Cobrança SaaS (gateway) | financeiro | **PREPARADO** | `billing_events` + `estimatedTotal` prontos; falta plugar gateway/NF |
| IA WhatsApp | IA | **IMPLEMENTADO** (heurística) / **PREPARADO** (LLM) | `ANTHROPIC_API_KEY` para leitura por LLM |

---

## Endpoints

| Rota | Uso |
|---|---|
| `POST /api/orders` | pedido manual (sessão do painel) |
| `POST /api/integrations/orders` | cardápio próprio / API — header `x-leeva-api-key` |
| `POST /api/webhooks/ifood?restaurant=<id>` | webhook do iFood |
| `GET/POST /api/webhooks/whatsapp?restaurant=<id>` | webhook do WhatsApp (GET = verificação `hub.challenge`) |
| `POST /api/cron/cleanup` | retenção de dados — header `x-cron-secret` |
| `POST /api/v1/deliveries` | **Fase 3** — API de entrada de logística (payload flat), header `x-leeva-api-key`, idempotente por `external_order_id` |
| `POST /api/cron/dispatch-tick` | **Fase 3** — loop do motor de despacho — header `x-cron-secret` |

### `POST /api/v1/deliveries` (Fase 3 — API de logística)

O Leeva **não** recebe o pedido comercial — só os dados de logística. O sistema do
restaurante (WhatsApp/iFood/site/próprio) mantém a venda; envia para cá:

```json
{
  "external_order_id": "PEDIDO-99",
  "customer_name": "Fulano", "customer_phone": "5583999990000",
  "address": "Rua X, 10 - Bessa", "latitude": -7.07, "longitude": -34.84, "region": "Bessa",
  "payment_method": "pix", "payment_status": "paid",
  "order_value": 45, "delivery_fee": 8,
  "notes": "portão azul", "items": [{ "name": "Pizza", "quantity": 1 }]
}
```

`items` é **opcional**. Retorno `201 { delivery_id, order_number, status: "accepted",
dispatch: "searching_driver" }` ou `200 { status: "existing" }` se `external_order_id`
repetir. Cada restaurante tem sua própria chave (`integrations.config.api_key_hash`) —
não há credencial global multi-tenant.

### Despacho automático — cron

`POST /api/cron/dispatch-tick` (header `x-cron-secret`) deve rodar a cada ~15–30 s
em produção (Vercel Cron, GitHub Actions, worker externo). Ele expira ofertas
vencidas, oferta pedidos pendentes ao melhor entregador e marca `failed` os que
esgotaram tentativas. Sem esse cron, o despacho só avança quando alguém abre a
central de operações ou o mapa (que dão um "nudge" via `/api/dispatch/tick`).

Idempotência: todo webhook grava em `integration_events` com `unique(provider, event_id)`;
o pedido em `orders` tem `unique(restaurant_id, source, external_id)`. O mesmo
evento externo nunca cria dois pedidos.

---

## <a id="manual"></a>Manual
Criado pela equipe no painel (**Pedidos → + Novo pedido**). Sem webhook. Coordenadas
são opcionais mas melhoram despacho, ETA e rastreamento.

## <a id="cardapio-api"></a>Cardápio / API própria
`POST /api/integrations/orders` com `x-leeva-api-key`. Payload:
```json
{
  "external_id": "PEDIDO-99",
  "customer": { "name": "Fulano", "phone": "5583999990000" },
  "items": [{ "name": "Pizza", "quantity": 1, "unit_price": 45 }],
  "address": { "formatted": "Rua X, 10 - Bessa", "latitude": -7.07, "longitude": -34.84, "region": "Bessa" },
  "delivery_fee": 8, "total": 45
}
```
**Gerar a chave:** o hash SHA-256 da chave vai em `integrations.config.api_key_hash`
do restaurante. Enquanto não houver UI para isso, use `LEEVA_API_KEY` no `.env`
(dev, restaurante único) ou insira via SQL:
```sql
update integrations set config = config || jsonb_build_object('api_key_hash', '<sha256-da-chave>')
where restaurant_id = '<id>' and provider = 'menu';
```

## <a id="colar-pedido"></a>Colar pedido (qualquer cardápio, inclusive Anota AI)

Anota AI (do iFood) não tem API pública pra logística. O caminho que funciona
com qualquer cardápio: Pedidos → Nova entrega → *Colar pedido do cardápio*.
`POST /api/orders/parse-text { text }` → `parseOrderText`
(`packages/shared/src/integrations/ai/order-text-parser.ts`): heurística por
rótulos ("Cliente:", "Endereço:", "Total:", "Pagamento:", "troco") + Haiku se
`ANTHROPIC_API_KEY` existir. Só preenche o formulário; nada é criado sem o
restaurante confirmar e localizar o endereço.

## <a id="opendelivery"></a>Open Delivery (logística)

Padrão da Abrasel. O cardápio/PDV (Cardápio Web, Saipos…) chama o Leeva como
empresa de logística:

- `POST /api/opendelivery/oauth/token` — client_credentials; `client_secret` = chave de
  integração do painel (a mesma da API própria); o access_token devolvido é a própria chave.
- `POST /api/opendelivery/v1/logistics/delivery` — pedido de entrega; mapeado por
  `openDeliveryToFlat` (`integrations/opendelivery.ts`) e criado por `lib/intake.ts`
  (mesmo caminho da `/api/v1/deliveries`). Responde 202 `{ deliveryId, event: 'PENDING' }`.
- `GET /api/opendelivery/v1/logistics/delivery/{deliveryId|orderId}` — evento atual
  (`openDeliveryEvent`), entregador e link de rastreio.

Ainda não implementado: webhook de status de volta pro cardápio e cancelamento
pelo cardápio. Testar com cada plataforma antes de prometer.

## <a id="ifood"></a>iFood

**Duas coisas importantes que a versão anterior deste doc errava:**

1. O iFood **não envia webhook** pro parceiro. A Merchant API v1.0 é de
   **polling**: o parceiro busca eventos periodicamente e confirma o
   recebimento.
2. O app do Leeva é um **App Distribuído** (um app único, usado por muitos
   restaurantes — não um app interno de um restaurante só). Apps
   distribuídos **não usam `client_credentials`** — só `client_credentials`
   é permitido pra **Apps Centralizados** (um app = um merchant). Um app
   distribuído precisa do fluxo **`authorization_code` com `userCode`**
   (parecido com o "device code" do OAuth 2.0/RFC 8628): cada restaurante
   autoriza o vínculo individualmente pelo Portal do Parceiro do iFood.
   *(Confirmado testando contra o sandbox real: `client_credentials` foi
   recusado com "Unsupported grant type client_credentials to client
   `<id>`" — não era bug de código, era o grant errado pro tipo de app.)*

### Vínculo (uma vez por restaurante) — `services/ifood-link.ts`

```
startIfoodLink(restaurantId)
  → POST /authentication/v1.0/oauth/userCode  { clientId }
  → devolve { userCode, authorizationCodeVerifier, verificationUrlComplete }
  → userCode + link ficam visíveis pro dono do restaurante em Integrações
    (tela IfoodLink.tsx); authorizationCodeVerifier é CIFRADO
    (encryptSecret, chave INTEGRATIONS_ENCRYPTION_KEY) antes de gravar em
    integrations.config — a linha é legível pelo dono via RLS, então o
    verifier em claro seria um vazamento potencial.

[ restaurante abre o link, loga no Portal do Parceiro com a conta do
  MERCHANT dele, autoriza o app "Leeva" ]

completeIfoodLink(restaurantId)
  → POST /authentication/v1.0/oauth/token
      { grantType: 'authorization_code', clientId, clientSecret,
        authorizationCode: userCode, authorizationCodeVerifier }
  → antes do restaurante autorizar, devolve "pending" (não é erro — a tela
    deixa tentar de novo); depois, devolve { accessToken, refreshToken }.
  → refreshToken (de longa duração) e accessToken ficam cifrados em
    integrations.config; listIfoodMerchants() guarda os merchantIds.
```

### Sincronização (repetida) — `services/ifood-sync.ts`

```
getValidIfoodAccessToken(restaurantId)   usa o accessToken cifrado se ainda
                                          válido; senão renova via
                                          refreshIfoodAccessToken() (POST
                                          .../oauth/token, grantType=refresh_token)
  → pollIfoodEvents()                    GET /events:polling
  → (evento código PLC)
      → getIfoodOrder()                  GET /orders/{id}
      → IFoodOrderProvider.parse()       → NormalizedOrder
      → resolveAndApplyDeliveryLocation  (bloco 1 — mesma validação de endereço dos outros canais)
      → createOrderFromNormalized()
  → acknowledgeIfoodEvents()             POST /events/acknowledgment — de TODOS os
                                          eventos buscados, mesmo os que não
                                          viraram pedido (senão o iFood reenvia)
```

Acionado via `POST /api/cron/ifood-poll?restaurant=<id>` (protegido por
`CRON_SECRET`, mesmo padrão do `dispatch-tick`) — ainda não agendado
automaticamente. `pushStatus` (`IFoodOrderProvider`) ficou **sem chamador**
por enquanto: a interface `OrderProvider.pushStatus(externalId, status)` não
carrega `restaurantId`, que agora é necessário pra resolver o token certo —
ajustar quando alguém for de fato ligar isso em `advanceOrderStatus`.

**Variáveis:** `IFOOD_CLIENT_ID`, `IFOOD_CLIENT_SECRET` (credenciais do app,
as mesmas pra todos os restaurantes), `INTEGRATIONS_ENCRYPTION_KEY` (cifra os
segredos por restaurante — gerar com `openssl rand -hex 32` ou
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
uma vez, guardar como env var de produção). `IFOOD_MERCHANT_ID`/
`IFOOD_ACCESS_TOKEN`/`IFOOD_WEBHOOK_SECRET` (formatos antigos) não são mais
usados.

### Testado em 02–03/09 com credenciais de sandbox reais

1. **`client_credentials`** → recusado (`Unsupported grant type
   client_credentials to client <id>`) — diagnosticado pelo usuário: o app é
   Distribuído, precisa do fluxo `authorization_code`.
2. **`authorization_code` + `userCode`** (implementação atual) → **funcionou**:
   ```
   node --import tsx --env-file=apps/restaurante/.env.local scripts/test-ifood-sandbox.mjs start

   ✅ código gerado:
      userCode: MVVB-GTJV
      link:     https://portal.ifood.com.br/apps/code?c=MVVB-GTJV
   ```
   Confirmado: `userCode`/`authorizationCodeVerifier` gravados (o verifier
   cifrado) em `integrations.config` do restaurante demo.
3. **Falta um humano completar**: abrir o link acima, logar no Portal do
   Parceiro com a conta de um merchant de teste do sandbox, autorizar o app.
   Depois disso, rodar:
   ```
   node --import tsx --env-file=apps/restaurante/.env.local scripts/test-ifood-sandbox.mjs complete
   ```
   que troca o código por tokens e roda um ciclo de sincronização completo
   (`syncIfoodOrders`) — só aí dá pra confirmar o recebimento de um pedido de
   ponta a ponta.

## <a id="whatsapp"></a>WhatsApp
Fluxo: `WhatsApp Cloud API → webhook → verify (HMAC x-hub-signature-256) →
extractMessage → parseWhatsAppOrder (IA) → NormalizedOrder [requireConfirmation] →
pedido com nota "[A CONFIRMAR]"`.

- `GET /api/webhooks/whatsapp` responde `hub.challenge` se `hub.verify_token ==
  WHATSAPP_VERIFY_TOKEN`.
- A IA **nunca** cria pedido irreversível: o pedido entra como rascunho a
  confirmar pela equipe.

**Falta:** `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`,
`WHATSAPP_VERIFY_TOKEN` e número de produção aprovado pela Meta.

## <a id="rotas"></a>Rotas / mapas
`RoutingService` isola o provedor. Sem config → `StraightLineRoutingService`
(Haversine × 1.3 de fator de rua, marcado `isEstimate: true`). Provedores reais
**implementados**, todos com fallback automático pra linha reta:

- **Mapbox** — define `MAPBOX_TOKEN` (o mesmo token troca os tiles do mapa). Free
  tier 100k req/mês.
- **OSRM** — define `OSRM_BASE_URL` (instância própria; não use o servidor
  público em produção).

Preferência: OSRM > Mapbox > linha reta. **Passo a passo completo:
`docs/ROTAS-SETUP.md`.**

## <a id="whatsapp"></a><a id="sms"></a><a id="push"></a>Canais de notificação
`NotificationService` sempre grava a versão **in-app** (visível no painel e no
rastreamento). Se houver telefone + canal externo configurado, tenta também por
lá. Se o canal não está configurado, a notificação fica `status = 'skipped'` com
o motivo em `error` — **nunca** marca como enviada sem enviar.

### Bloqueado no portal do iFood, aguardando suporte (ticket 32820575)

Vínculo (`startIfoodLink`) funciona — gera `userCode` real e chega na tela de
autorização do Portal do Parceiro. Mas a **homologação** do app LEEVA pros
módulos **Order/Events** (obrigatória antes de qualquer merchant conseguir
autorizar de verdade) trava no portal com **"Erro ao criar homologação"**,
sem detalhe — tentado com o único app disponível (LEEVA, Distribuído,
status "Em desenvolvimento"), loja de teste "65.819.903 MARIANA CIDELINO DOS
SANTOS", modo POLLING.

**Aberto ticket de suporte com o iFood: Nº 32820575** ("Erro ao criar
homologação — app LEEVA (Distribuído)"), status Em análise em 04/09/2026.
Isso é 100% do lado do iFood — nada a fazer no código enquanto não
responderem. Quando a homologação for liberada, o teste ponta a ponta é:

```bash
node --import tsx --env-file=apps/restaurante/.env.local scripts/test-ifood-sandbox.mjs start
# abrir o link, autorizar no Portal do Parceiro, depois:
node --import tsx --env-file=apps/restaurante/.env.local scripts/test-ifood-sandbox.mjs complete
```

### 17/10/2026 — o módulo certo pro Leeva é LOGISTICS (não Order)

Lido no developer.ifood.com.br (precisa de navegador logado; bloqueia robô):
- **Order** (homologação automática pelo wizard) é só pra apps da categoria
  **PDV**: confirmar pedido em 8 min, cancelar com motivos, readyToPickup,
  dispatch, exibir bandeira/troco/cupom/CPF. Não é o papel do Leeva.
- **Logistics** é pra "plataformas de terceiros que gerenciam entregas para
  múltiplos merchants" — exatamente o Leeva. Fluxo:
  polling `/events/v1.0/events:polling?excludeHeartbeat=true` (30 s) + ack
  `/events/v1.0/events:acknowledgement` `{acknowledgements:[{id,status:200}]}`
  → `GET /logistics/v1.0/orders/{id}` → `POST assignDriver {workerName, workerPhone, workerVehicleType}`
  → `goingToOrigin` → `arrivedAtOrigin` → `dispatch` → `arrivedAtDestination`
  → evento `DELIVERY_DROP_CODE_REQUESTED` (DDCR) → `POST verifyDeliveryCode` (422 = código errado).
  Operações retornam 202 (resultado chega por evento); 409 fora de sequência.
- Homologação Logistics: chamado "Solicitação de Homologação - Logistics API"
  (app, merchant ID da loja de teste, contato) → sessão remota de 45–60 min
  com o analista (fluxo completo + token expirado + 429 + erros). **Reprovou =
  esperar 15 dias.** Exige CNPJ, interface de entregador, dashboard, logs.

### Implementado (17/10/2026) — fluxo Logistics
- `services/ifood-logistics.ts`: `syncIfoodLogistics` (eventos → pedido novo
  via GET /logistics/orders, DDCR → `orders.ifood_code_required`, CAN/CON →
  fecha; ack de todos), `pushIfoodLogisticsSteps` (etapas na ordem, guarda a
  última em `orders.ifood_logistics_step`; 409 conta como feita),
  `confirmIfoodLogisticsDelivery` (arrivedAtDestination + verifyDeliveryCode
  na hora do "Entreguei"), `syncAllIfoodLogistics` (cron de 30 s, dentro do
  dispatch-tick, travado em 1x/28 s).
- Mapa das etapas: motoboy definido → assignDriver + goingToOrigin;
  retirou (picked_up) → arrivedAtOrigin; saiu pra entrega (in_route) →
  dispatch; Entreguei → arrivedAtDestination + verifyDeliveryCode.
  O app do motoboy avisa na hora (api/deliveries) — o cron é rede de segurança.
- 429/5xx: `ifoodFetch` repete com Retry-After/backoff; 401: renova token e
  repete 1x. Tudo que sai fica em `integration_events` (direction outbound).
- App do motoboy (PWA e nativo): loja com iFood vinculado → campo "Código de
  entrega do iFood" no lugar do link externo. Migration 0056.

### Teste de ponta a ponta no sandbox — 17/10/2026 (app "Teste (C)", loja 4096508)
- Pedido gerado em Developer Portal › Pedidos de teste → evento PLC → GET
  /logistics/orders OK (deliveredBy MERCHANT) → entrou no Leeva → motoboy →
  assignDriver, goingToOrigin, arrivedAtOrigin, dispatch, arrivedAtDestination
  = 202 nas 5 → evento DDCR (pediu código) → Leeva bloqueou fechar sem código
  → código errado: verifyDeliveryCode 400 "Confirmation code is invalid" →
  mensagem pro motoboy. Cancelamento (CAN) também fecha no Leeva.
- O iFood cancela o pedido de teste se a loja estiver FECHADA ("O pedido não
  foi enviado para a Loja", 901) ou se ninguém confirmar em 8 min. No real
  quem abre/confirma é o PDV/Gestor da loja; no teste use
  `scripts/simula-loja-ifood.ts` (polling com heartbeat + confirm).
- Ack certo: POST /events/v1.0/events/acknowledgment [{id}] (202).
- Falta testar o código CERTO: o código do pedido de teste aparece pro
  "cliente" (usuário de testes do portal) — ver no app iFood desse usuário.
