# Decisões noturnas — sessão autônoma (2026-08-31 → 01/09)

Registro das decisões tomadas sem validação humana durante a execução autônoma
dos blocos B, C, 4, 5 e do redesign. Cada item: o que estava ambíguo, o que
decidi e por quê. O usuário revisa de manhã.

Regra seguida: travar só em mudança de arquitetura ou algo irreversível/arriscado.
Nunca tocar em Asaas produção nem integração iFood.

---

## Bloco B — Notificação push ✅

**Feito:**
- Migration `0026_fase5_push_subscriptions.sql`: tabela `push_subscriptions`
  (1 linha por dispositivo), coluna `motoboys.push_enabled`.
- `packages/shared/src/services/push.ts` — Web Push real via lib `web-push`
  + VAPID. Remove assinatura morta (404/410) automaticamente.
- `notify-driver.ts` — helper único `notifyDriver()` (in-app + push).
- Service worker `apps/motoboy/public/sw.js` (push + clique).
- `NotificationSetup.tsx` na tela de Status: cartão claro pedindo permissão,
  auto-dispara quando o motoboy fica online; some quando ativo (deixa só
  "🔔 Notificações ativas — enviar teste").
- Gatilhos de push: nova oferta (autodispatch), entrega cancelada após
  aceite (orders.advanceOrderStatus), repasse pago/falhou (driverpayouts).
- Chaves VAPID geradas e configuradas na Vercel (projeto leeva-motoboy) e
  no `.env.local`. Valores não expostos no chat.

**Decisões tomadas sozinho:**
1. **Permissão pedida ao ficar online, não no cadastro.** O prompt original
   dizia "peça permissão claramente no primeiro 'available'". Implementei
   exatamente isso: o cartão aparece na tela de Status e o `requestPermission`
   dispara automaticamente quando `status !== 'offline'`. Antes disso o
   cartão fica visível mas sem forçar o pop-up.
2. **Repasse pago/falhou = só push, sem in-app.** A tabela `notifications`
   exige `restaurant_id` (NOT NULL) e um repasse não tem restaurante único.
   Em vez de migração para afrouxar a coluna (mudança de schema com impacto
   em RLS), o aviso de repasse vai só por push — a tela Pagamentos já mostra
   o histórico de repasses de qualquer jeito.
3. **web-push como lib de envio** (padrão de mercado, sem serviço pago).
   Sem provedor VAPID configurado, `sendPushToMotoboy` vira no-op explícito
   (`skipped:true`) — nada finge que enviou.
4. **Sem cache offline no service worker** por enquanto — só o canal de
   notificações. PWA installability plena fica pro redesign (Parte 2).

**Não testável 100% sem device real:** o envio de verdade depende de uma
subscription gerada por um navegador. Os testes cobrem toda a lógica de
banco/erro; o `POST /api/push/test` permite o usuário confirmar no celular.

---

## Bloco C — Agrupamento de entregas com precificação incremental ✅

**Feito:**
- Migrations `0027` (colunas de grupo em orders/dispatch_attempts + config) e
  `0028` (`credit_adjust` — ajuste de crédito com sinal).
- `services/grouping-dispatch.ts`: `planGroupForOrder` (monta a rota),
  `applyGroupPlan` (grava + ajusta crédito), `dissolveGroup` (desfaz).
- Integração no `autodispatch`: antes de ofertar um pedido, tenta montar
  uma rota com vizinhos; se conseguir, cria UMA oferta agrupada.
- `acceptOffer` agrupado → atribui todos os pedidos ao mesmo motoboy.
- `declineOffer` / timeout agrupado → dissolve o grupo.
- Oferta no app do motoboy mostra a sequência de paradas, o valor de cada
  parada e o total da rota (`OffersPanel`).
- Admin (Planos & Taxas): piso da parada extra, raio de agrupamento e
  máximo de paradas — todos configuráveis, nada fixo no código.
- Testes: `scripts/test-fase5c.mjs` (6/6) — rota de 2 e 3 paradas, recusa,
  destino distante fora do grupo, ajuste de crédito.

**Preço implementado (exatamente como o prompt pediu):**
- Parada 1 (lead) = tabela cheia: `base + max(0, km−free_km)×per_km`, ≥ mínimo.
- Parada k>1 = `max(group_stop_min, kmIncremental(parada k-1 → k) × per_km)`.
  Sem `free_km` nas paradas extras (já estão perto). Piso inicial R$ 3,50.
- Restaurante paga por pedido = valor do motoboy daquela parada + margem do plano.

**Decisões tomadas sozinho:**
1. **Recusa dissolve o grupo** (a mais simples). Oferta agrupada recusada ou
   expirada → cada pedido volta ao despacho individual normal, com a cobrança
   cheia recomposta. Motivo: evita uma "rota fantasma" quicando entre motoboys
   mal posicionados e não exige uma máquina de estado nova de oferta agrupada.
   Reaproveita 100% o caminho individual que já existia e é testado.
2. **Ajuste de crédito no agrupamento.** O crédito é debitado pelo valor cheio
   na criação (regra da Fase 4, não mexi nela). Quando o despacho agrupa e a
   cobrança do 2º+ pedido cai, o Leeva **devolve a diferença** ao crédito do
   restaurante (lançamento `adjustment` no extrato). Se o grupo é desfeito,
   volta a cobrar. Alternativa (consumir crédito só no despacho) mudaria a
   arquitetura da Fase 4 — não fiz sozinho.
3. **Agrupa só pedidos com a mesma forma de pagamento** (não mistura "recebe
   na entrega em dinheiro" com "pago online") — evita confundir a cobrança na
   porta do cliente.
4. **Ordenação da rota = vizinho mais próximo** a partir do restaurante. Não é
   um solver de rota ótimo (VRP), é uma heurística boa o suficiente e barata.
   OSRM, quando ligado (Bloco 5), melhora as distâncias das pernas.
5. **Ligado por padrão** (`group_max_stops = 3`). Para desligar, o admin põe
   `máximo de paradas = 1`.

**Pendência menor:** a tela do restaurante ainda não destaca "este pedido foi
agrupado com os pedidos X e Y". O valor cobrado já aparece certo. Anotado para
o redesign.

---

## Bloco 4 — Comunicação automática com o cliente + rastreamento público ✅

**Estado encontrado:** a maior parte já existia da Fase 2 —
`services/tracking.ts` (token aleatório, expira em 48h, revogável),
página pública `/track/[token]` com atualização ao vivo, API com rate limit,
`events.ts` disparando notificação do cliente em mudança de status, e o
`NotificationService` com WhatsApp/SMS "PREPARADOS" (ligam sozinhos quando
`WHATSAPP_*` / `TWILIO_*` entram no ambiente).

**Feito nesta noite:**
- Token de rastreamento **criado já na criação do pedido** (antes só quando o
  restaurante clicava "gerar link").
- **Link de rastreamento vai junto de toda notificação do cliente** — no corpo
  (WhatsApp/SMS) e em `notifications.data.tracking_url` (in-app). Helper
  `trackingUrl()` + env `LEEVA_TRACKING_BASE_URL` nos 3 apps da Vercel.
- Novo aviso **"um entregador está a caminho"** quando a oferta é aceita
  (`customer.driver_assigned`) — antes o cliente só sabia no "saiu para entrega".
- Testes: `scripts/test-tracking.mjs` (7/7).

**Decisão / limite honesto:**
- **Sem provedor externo, a notificação não *chega* ao cliente sozinha.** O
  Leeva não tem canal próprio para o cliente final (WhatsApp Business API e SMS
  são pagos; iFood está fora do combinado). O que está pronto: a página de
  rastreamento pública e automática, o link sempre disponível para o
  restaurante repassar, e todo o encanamento para o envio automático disparar
  no segundo em que `WHATSAPP_TOKEN`/`TWILIO_*` forem configurados. Não inventei
  um "canal fake" — as notificações externas ficam com status `skipped` e o
  motivo, exatamente como o resto do sistema já faz.
- A detecção de "pedido chegando" (`delivery.nearby`) por proximidade GPS ficou
  de fora — exige um watcher de localização com histerese; anotado como
  melhoria futura. Os outros 4 marcos (confirmado, a caminho, saiu, entregue)
  estão cobertos.

---

## Bloco 5 — Rota real (OSRM) no lugar da linha reta ✅

**Estado encontrado:** `OsrmRoutingService` já estava escrito (PREPARADO),
só faltava ligar. Os cálculos de distância já tratavam `null` do provedor
caindo para Haversine × 1,3 — então a troca é segura.

**Feito:**
- `HybridRoutingService`: envolve o OSRM com fallback automático para linha
  reta (se o OSRM falha por rede/rate-limit/ponto sem via, não perde a
  estimativa) + cache curto em memória (5 min, 500 pernas) para não martelar
  o servidor OSRM.
- `OSRM_BASE_URL` = `https://router.project-osrm.org` nos 3 apps da Vercel e
  no `.env.local`.
- Testado ao vivo: restaurante → Bessa deu **4,95 km reais** contra ~1,7 km
  da linha reta ×1,3 (tem rio/ponte no caminho) — a diferença é exatamente
  o que justifica a rota real.
- Testes: `routing.test.ts` +4 (usa real, cai para fallback, cacheia).

**Decisão / aviso:**
- Usei o **servidor OSRM público** (`router.project-osrm.org`). Ele tem rate
  limit e os termos dele desaconselham produção pesada. Para volume real, subir
  uma instância própria de OSRM (Docker + extrato do OpenStreetMap do Nordeste)
  e trocar só a env `OSRM_BASE_URL`. O fallback garante que, se o público
  bloquear, o sistema continua funcionando na estimativa. Reversível: basta
  apagar a env.
- Não liguei Google Maps / Mapbox (pagos, precisam de chave e cartão).

---

## Parte 2 — Redesign dos 3 apps ✅

**Feito:**
- `docs/DESIGN-SYSTEM.md` — sistema de design completo: princípios, paleta
  (clara por padrão + escuro), escala tipográfica, espaçamento, specs de
  componente, e uma lista explícita dos **clichês de IA proibidos**.
- `globals.css` dos 3 apps reescritos sobre o novo sistema, **mantendo todos
  os nomes de classe** já usados (`.card`, `.btn`, `.button`, `.input`,
  `.tag`, `.op-alert`, `.stat`, `.tbl`, `.tabbar`, `.offer-*`...). Zero
  mudança de estrutura de componente → baixo risco.
- Aliases retrocompatíveis (`--accent` → `--brand`, `--panel` → `--surface`)
  para os `style={{}}` inline que usam essas variáveis não quebrarem.
- Cores hardcoded de tema escuro nos componentes (`#f87171`, `#fca5a5`,
  `#86efac`, `#fbbf24`...) trocadas por tokens (`var(--danger)` etc.) — assim
  funcionam nos dois temas.
- Setas `→` removidas dos botões ("Ver entrega atual", "Abrir mapa completo",
  "Abrir endereço no mapa"). Peso de fonte 800 → 650. `text-transform` zerado
  no reset global.
- Verificado no navegador nos 3 apps, tema claro e escuro: login, visão geral,
  pedidos, restaurantes (admin), status (motoboy).

**Direção de design escolhida (decisão minha):**
- **"Ferramenta de trabalho", não site de marketing.** Sóbrio, denso,
  legível com pressa.
- **Claro por padrão** (restaurante trabalha de dia; modelo mental de
  comanda impressa), com modo escuro real via `prefers-color-scheme`.
- **Neutro cinza-quente** (`#f7f7f5`, hue ~40°, saturação < 4%) — explicitamente
  **não** bege/terracota.
- **Uma cor de marca: verde-pinho** (`#1f6f5c`). Troquei o laranja `#ff5a1f`
  anterior — laranja é a cor-clichê de app de delivery. Verde = movimento,
  confiança, "pode ir".
- **Elevação é exceção**: sombra só no `.offer-card`, modais e popovers. Todo
  o resto se separa com fundo (`--surface-2`) e linha de 1px.
- Botões sem ícone/seta. Rótulos em caixa normal, sempre.

**Escopo — o que fiz e o que não:**
- Fiz: a **linguagem visual** (cor, tipografia, superfícies, botões, inputs,
  tabelas, tags, navegação) trocada de forma sistemática nos 3 apps.
- Não fiz: rework tela a tela das telas secundárias (cada formulário de
  config, cada sub-página). A estrutura delas foi preservada e herda o novo
  visual, mas algumas ainda têm grades de KPI com "vários cards iguais" que o
  design system pede para consolidar. É a evolução natural: dá para ir
  refinando tela por tela sem mais nenhuma mudança de base.
- Ícones emoji na navegação (📦 🗺️) foram **mantidos** — o usuário não os
  listou como clichê e eles ajudam a orientação. O design system os marca
  como opcionais/decorativos.

---

## Extra — app nativo do motoboy (Android) a partir do zip "Levva-clone"

O usuário mandou um zip com uma segunda versão do Leeva (stack diferente:
Express + Prisma + Socket.io + app Expo/React Native). Pedido: **portar só o
app nativo do motoboy** e manter o resto do nosso Leeva.

**Feito:**
- `apps/motoboy-app/` — app Expo/RN, **fora do workspace npm** (deps de React
  Native não convivem com as dos apps web; tem `node_modules` e lockfile
  próprios). Vercel não toca nele; turbo não vê.
- Camada de dados reescrita: `@supabase/supabase-js` (login, tempo real) +
  `fetch` nas rotas `/api/*` do `apps/motoboy` com `Authorization: Bearer`
  (access token do Supabase). Socket.io → Supabase Realtime.
- Backend: `getMotoboyContextFromReq(req)` aceita Bearer **além** do cookie
  (PWA continua igual). Novas rotas JSON: `/api/me`, `/api/entrega`,
  `/api/historico`, `/api/push/expo`.
- Push nativo via **Expo Push Service** — `push_subscriptions.kind` ('web' |
  'expo'), migration 0029. `sendPushToMotoboy` agora envia pros dois canais.
- Telas adaptadas ao nosso modelo (ofertas com `dispatch_attempts`, entregas
  com `orders`, ofertas agrupadas, gate de aprovação + termos).
- `expo-doctor` 21/21, `tsc` limpo, bundle Android gera sem erro.

**Decisões tomadas sozinho:**
1. **App nativo = cliente fino sobre as rotas `/api` que o PWA já usa.** Em
   vez de duplicar a lógica de negócio (aceitar oferta, avançar status) ou
   abrir o RLS pro cliente nativo, o app chama os mesmos endpoints. Só
   precisou o Bearer no backend.
2. **Cadastro de novo entregador continua no site.** O `/quero-entregar` tem
   upload de documentos (CNH/RG + CRLV) — refazer isso em RN com câmera/picker
   é um projeto à parte. O app tem um botão que abre o cadastro no navegador.
3. **Chave Pix: só leitura no app** por enquanto (mesma razão — o fluxo bom
   é no painel). Dá pra adicionar edição depois.
4. **Tema escuro no app nativo** (o design system é claro-primeiro). Deliberado:
   entregador usa na rua/à noite, tela escura poupa bateria. Usa a MESMA cor de
   marca (verde) e os mesmos tokens da versão escura do design system.
5. **GPS só em primeiro plano** nesta primeira versão. Rastreamento em segundo
   plano (app fechado) precisa de `expo-task-manager` + `expo-location`
   background + configuração extra de build — anotado como próximo passo.
6. **Servidor OSRM público** (já era assim no resto do Leeva).

**O que falta pro app ir pra loja (precisa do usuário):**
- Conta Expo (grátis) + `eas build` → gera o APK/AAB. `apps/motoboy-app/README.md`
  tem o passo a passo.
- Para o push nativo funcionar no APK standalone: `google-services.json` (FCM) —
  o assistente do `eas build` guia.
- Publicar na Play Store: conta de desenvolvedor Google (US$ 25, uma vez).
- Testar num aparelho real (Expo Go): login, ficar online, receber oferta,
  aceitar, fluxo de entrega, notificação.

---

## App nativo — ícone, GPS em segundo plano, preparação de build (01/09)

Sessão "usuário fora, sem token da Expo". Adiantado tudo que não depende de
autenticação. Resumo em `docs/RESUMO-2026-09-01-app-nativo.md`.

**Decisões tomadas sozinho:**

1. **`app.json` virou `app.config.js` (config dinâmica).** Motivo: o pedido era
   "o código reconhece o `google-services.json` sozinho, sem mais mudança
   depois". Com config estática isso não dá; com `app.config.js` eu checo
   `fs.existsSync('google-services.json')` e injeto `googleServicesFile` só se
   existir. É o padrão do Expo pra isso, reversível, e não muda comportamento
   nenhum enquanto o arquivo não está lá.
2. **Ícone: um "L" terminando num pino de rota**, verde-pinho do design system.
   Não reaproveitei o chevron "A" azul do zip (era rascunho, com as linhas de
   grade aparecendo, e azul). Gerado com `sharp` a partir de um SVG; todos os
   tamanhos do Expo (icon, adaptive foreground dentro da zona segura,
   monochrome, splash).
3. **A task de segundo plano é a ÚNICA que manda localização pro servidor
   quando há entrega ativa.** O `watchPositionAsync` de primeiro plano passou a
   só alimentar o mapa (`setPosition`), sem `POST /api/location`. Assim não tem
   envio duplicado quando o app está aberto com o foreground service rodando.
   Sem entrega ativa (só "disponível"), o foreground watch volta a enviar.
4. **Rastreamento em segundo plano liga/desliga sozinho pelo `activeDelivery`.**
   Enquanto há entrega → `startLocationUpdatesAsync` com foreground service +
   notificação fixa. Sem entrega / offline / logout → `stopLocationUpdatesAsync`.
   Nada de ficar drenando bateria fora de entrega.
5. **Testes só da lógica pura** (`locationPayload.ts`: throttle, montagem do
   payload, "última leitura do lote"). O comportamento nativo (foreground
   service, permissão background) só dá pra validar num device/build — anotado.
6. **`eas.json` com as env NÃO-secretas embutidas** (`EXPO_PUBLIC_API_URL`,
   `EXPO_PUBLIC_SUPABASE_URL`). A chave anon do Supabase fica no `.env` local
   (gitignored) que o EAS lê no build — não no `eas.json` (que vai pro repo
   público).
7. **Indicadores das telas de admin/restaurante: consolidação via CSS.**
   `.stat-row` deixou de ser "vários cartões com borda" e virou um cartão só
   com divisórias de 1px entre os números (o design system pedia isso).
   Fiz no CSS em vez de reescrever cada tela — mesma melhora, risco quase zero,
   pega Visão geral / Financeiro / Unit economics / Entregadores / Repasses /
   detalhe do restaurante de uma vez.
8. **`delivery.nearby` (pedido chegando):** descobri que **já estava
   implementado** em `recordDriverLocation` (< 400 m do destino, idempotente).
   Estava listado como pendente por engano na sessão anterior. Só adicionei um
   teste (`test-tracking.mjs`).

**Nada disso é irreversível ou arquitetural** — o PWA em produção não foi
tocado, o backend só ganhou o teste novo, e todo o resto é o app nativo (que
ainda não está publicado em lugar nenhum).

---

## Build do APK, Sentry, auditoria (02/09) — resumo em `RESUMO-2026-09-02-build-e-auditoria.md`

**Decisões tomadas sozinho:**

1. **Slug do projeto EAS = `leeva`** (não `leeva-motoboy`). O prompt dizia "o
   slug precisa bater com `leeva-motoboy`", mas o projeto que o usuário criou
   na Expo (`5c851aad-...`, org `leeva-jp`) tem slug real `leeva`. Segui o real
   — é o único jeito do `eas build` funcionar. Ajustei `app.config.js`
   (`slug` + `owner: 'leeva-jp'`).
2. **Sentry só em restaurante + admin, NÃO no PWA `apps/motoboy`.** A Parte 2
   pedia "3 apps web", mas a regra "não mexer no PWA de produção" está no mesmo
   prompt e é absoluta. Como o Sentry é no-op sem DSN, não há perda em esperar
   o usuário. Receita pra adicionar depois está no `SENTRY-SETUP.md`.
3. **`withSentryConfig` no next.config** (em vez de um setup manual mais
   enxuto). O `@sentry/nextjs` puxa módulos Node pro bundle edge e quebra o
   build sem ele — é o caminho oficial. Configurado pra não exigir
   `SENTRY_AUTH_TOKEN` no build (source map upload fica opcional).
4. **`sourcemaps.disable` condicional ao `SENTRY_AUTH_TOKEN`** — sem token, o
   build nem tenta subir source map (senão falharia).
5. **Botão "Entrar" do admin → `.btn.primary`** (era um `.btn` sem `primary`,
   que no design system novo renderiza secundário/branco). Inconsistência com
   os outros 2 logins; corrigido.
6. **Auditoria: nada crítico.** RLS ok nas 35 tabelas, rotas de API todas
   escopadas, zero segredo hardcoded, zero `console.log`/`TODO`. Detalhe no
   resumo do dia.
7. **`EXPO_PUBLIC_SUPABASE_ANON_KEY` via `eas env:set`** (comando novo; o
   `eas env:create` está deprecado) no ambiente `preview`, visibilidade
   `sensitive`. A chave anon é pública por design, mas `sensitive` evita ela
   aparecer em logs de build.

---

## Validação de endereço + performance do painel (02/09, tarde)

### Performance do painel do restaurante

1. **`loading.tsx` no grupo `(app)`.** Não existia tela de carregamento em
   lugar nenhum — o Next bloqueava a navegação até o server component resolver
   todos os `await`, e a tela "congelava" a cada clique. Esqueleto instantâneo
   resolve a percepção. Foi a causa nº 1 do "trava muito".
2. **`requireRestaurantContext` / `getApiContext` com `React.cache()`.** Eram
   chamados 2× por navegação (layout + página) → 2 `auth.getUser()` (ida e
   volta à Supabase). `cache()` deduplica na mesma request.
3. **Polling só com a aba visível, a 20s** (Visão geral + Mapa; era 12s
   sempre). Relógio da Visão geral isolado em `<Clock/>` — antes re-renderizava
   o mapa inteiro a cada segundo.
4. **Removido `DashboardLive.tsx`** — componente morto, não importado, com
   links quebrados (`/despacho`, `/motoboys`).

### Bug: endereço inventado gerava pedido + tarifa + oferta

**Encontrado em teste:** "rua aaaaa, número aaaaa" criava pedido normalmente.
Causa: nada geocodificava o endereço; sem coordenada, a tarifa caía no piso
(`base`/`min_payout`) e o despacho seguia.

5. **Novo `services/address.ts` — `resolveDeliveryLocation` / `resolvePickupLocation`.**
   Geocodifica o endereço antes de criar o pedido. Três desfechos:
   - **localizado** (perto do restaurante, precisão de rua ou melhor) → segue
     com a coordenada do geocoder (ignora lat/lng que o cliente mandou — mata
     o vetor "digitar lat/lng falsa");
   - **não encontrado** (ou match ruim: longe demais / só nível cidade) →
     **bloqueia** com "Não conseguimos localizar esse endereço…";
   - **geocoder instável** (rede/timeout/5xx/429 — agora `GeocoderUnavailableError`,
     distinto de "não encontrado") → **não bloqueia à toa**: pede uma
     confirmação manual do restaurante (checkbox + lat/lng). Sem confirmação,
     responde 503 "serviço de mapas instável, tente de novo".
6. **Aplicado em todos os pontos de entrada:** `/api/orders` (manual),
   `/api/v1/deliveries`, `/api/integrations/orders`, pipeline de webhooks
   (menos rascunho de WhatsApp, que ainda passa por confirmação humana) e
   `/api/onboarding` (endereço de coleta do restaurante).
7. **Rede de segurança em `createOrderFromNormalized`:** pedido "pra valer"
   (sem `requireConfirmation`) não nasce sem coordenada de entrega — retorna
   `code: 'address_not_found'`. Rascunho de WhatsApp continua podendo nascer
   sem coordenada (é revisado antes).
8. **`MAX_DELIVERY_RADIUS_KM = 60`.** Correspondência de geocoding além disso a
   partir do ponto de coleta é quase certamente um match errado — tratada como
   "não encontrado". Restaurante que realmente mudar pra >60 km usa o caminho
   de confirmação manual.
9. **Teste de regressão:** `scripts/test-address.mjs` (11 casos), com geocoder
   falso determinístico (via `__setMapProvider`) pra não depender de rede.
   Cobre o caso exato reportado.

---

## iFood — integração por polling (02/09, sandbox)

Pedido do usuário: configurar credenciais de sandbox reais (Client ID/Secret/
Merchant ID) e testar o fluxo completo. Pausei antes de agir porque contrariava
a regra repetida em toda sessão ("nunca iFood") — usuário confirmou
explicitamente que queria seguir mesmo assim ("pode sim").

1. **Doc `docs/IFOOD-INTEGRACAO.md` citado pelo usuário não existia.** O real
   é `docs/INTEGRATIONS.md#ifood`. Avisei antes de continuar.
2. **O código existente (`ifood.ts`) estava arquitetado errado** — assumia
   webhook push do iFood. A Merchant API v1.0 real é por *polling*: o
   parceiro autentica via OAuth, busca eventos, confirma recebimento, busca
   o pedido. Implementei esse fluxo de verdade em vez de só "configurar 3
   variáveis" (que não teria funcionado sobre o código antigo).
3. **Testado contra o sandbox real:** autenticação OAuth foi recusada pelo
   iFood ("Unsupported grant type client_credentials to client <id>").
   Confirmei que o formato do request está correto (testei a variante
   snake_case padrão OAuth2 também, que dá um erro diferente/pior). É uma
   configuração do app no portal de parceiros do iFood, não um bug daqui —
   documentado o que conferir em `docs/INTEGRATIONS.md#ifood`.
4. **Credenciais reais só em `apps/restaurante/.env.local`** (gitignored),
   nunca no código, no chat de novo, ou em commit.
5. **Não fiz merge pra `main`** — ficou em `feature/ifood-sandbox` (branch
   separada da do redesign) esperando: (a) você resolver a configuração do
   app no portal iFood, (b) revisar o código antes de ir pra produção. É
   integração nova com um provedor de pedidos externo — trato com a mesma
   cautela do Asaas.

---

## iFood — correção: fluxo authorization_code (02–03/09)

Usuário diagnosticou corretamente a causa do erro anterior: o app é
**Distribuído** no iFood (um app, muitos restaurantes), e apps distribuídos
não usam `client_credentials` — só `authorization_code` com `userCode`
(fluxo tipo "device code", cada restaurante autoriza individualmente pelo
Portal do Parceiro).

1. **Reescrevi o cliente iFood** (`ifood-client.ts`): removido
   `client_credentials`; adicionado `startIfoodAuthorization` (gera
   userCode), `exchangeIfoodAuthorizationCode`, `refreshIfoodAccessToken`.
2. **Vínculo por restaurante** (`ifood-link.ts`, novo): guarda o estado em
   `integrations.config` (tabela que já existia, sem migration nova). O
   dono do restaurante pode ler a própria linha via RLS — por isso o
   `authorizationCodeVerifier` e o `refreshToken`/`accessToken` são
   **cifrados** (`encryptSecret`/`decryptSecret`, AES-GCM via Web Crypto,
   chave `INTEGRATIONS_ENCRYPTION_KEY`) antes de gravar. Só o status de
   exibição (userCode, link, merchantIds) fica em claro.
3. **Tela nova em Integrações** (`IfoodLink.tsx` + `/api/ifood/link`):
   dono clica "Vincular", vê o código + link do Portal do Parceiro, autoriza
   lá, volta e clica "Concluir vínculo".
4. **`pushStatus` do iFood ficou sem chamador** — a interface `OrderProvider`
   não carrega `restaurantId` (que agora é necessário pra resolver o token
   certo). Documentado, não é regressão (já não tinha chamador antes).
5. **Testado contra o sandbox real**: `startIfoodLink` funcionou —
   gerou um userCode de verdade (`MVVB-GTJV`) e um link real do Portal do
   Parceiro, confirmando que o grant certo é esse. Falta um humano abrir o
   link e autorizar (não é algo que eu deva fazer — é a conta do
   restaurante/merchant) pra testar o recebimento de pedido ponta a ponta.
6. Gerei uma `INTEGRATIONS_ENCRYPTION_KEY` local pro teste (só em
   `apps/restaurante/.env.local`, nunca commitada) — em produção precisa de
   uma chave própria, gerada uma vez e nunca trocada (trocar invalida todo
   segredo já cifrado).

---

## 2026-09-08 — Asaas: metade "dinheiro entrando" (compra de crédito via Pix)

A metade "dinheiro saindo" (repasse Pix ao motoboy) já estava pronta desde a
Fase 4. Faltava a metade "entrando": o restaurante comprava crédito e o
sistema só simulava (`addCredit` direto, sem cobrar nada).

1. **Migration `0031_asaas_credit_purchases.sql`**: tabela `credit_purchases`
   (uma linha por tentativa de compra: `pending` → `paid`/`expired`/`failed`).
   Índice único `(provider, external_id)` = idempotência. RLS: equipe do
   restaurante lê as próprias; escrita só service_role.
2. **`credit-purchase.ts` (novo)**: `startCreditPurchase` cria a linha e gera
   a cobrança Pix na Asaas (devolve `invoiceUrl` + copia-e-cola).
   `confirmCreditPurchase` (chamado pelo webhook) libera o crédito —
   idempotente via trava otimista (`update ... neq status 'paid'`).
   Sem `ASAAS_API_KEY` → modo simulação (credita na hora, `simulated: true`).
3. **`/api/webhooks/asaas` (novo)**: valida o header `asaas-access-token`
   contra `ASAAS_WEBHOOK_TOKEN` (sem essa env → 503, recusa tudo).
   `PAYMENT_RECEIVED`/`CONFIRMED` → credita; `OVERDUE` → expira;
   `DELETED`/`REFUNDED` → falha.
4. **`/api/credits` e `CreditsClient.tsx`**: a compra agora mostra o Pix e
   fica conferindo o saldo a cada 5s (o webhook credita sozinho).
5. **Chave de produção da usuária**: guardada em `.env.local` sob um nome que
   o código NÃO lê (`ASAAS_API_KEY_PROD_GUARDADA`) — de propósito, pra não
   mover dinheiro real antes do teste ponta a ponta. NÃO commitada.
6. **Não rodei teste com dinheiro real** — regra da casa. O teste de R$ real
   é a usuária quem faz, pagando no próprio celular. `npm run test:asaas`
   cobre o fluxo com cliente fake (8 casos, precisa da migration aplicada).
7. Passo a passo de produção: `docs/ASAAS-SETUP.md`.

### 2026-09-08 (cont.) — Asaas: cliente/pagador + valor livre

Primeiro teste real deu "Customer inválido ou não informado" — a cobrança
Asaas (`POST /payments`) exige um `customer`.

1. **`asaas.ts`**: `createCustomer({name, cpfCnpj, ...})` novo; `createPixCharge`
   agora recebe `customer` e busca o copia-e-cola em
   `GET /payments/{id}/pixQrCode` (não vem na resposta do POST).
2. **`credit-purchase.ts`**: `resolveAsaasCustomer` — acha o customerId em
   `restaurants.settings.asaas.customerId` ou cria um (precisa do CNPJ/CPF na
   1ª vez; fica salvo). Erro `code: 'need_cpf_cnpj'` quando falta.
3. **Valor livre**: mínimo baixado de R$ 5 → **R$ 3** (`MIN_CREDIT_PURCHASE`).
   Tela de Créditos ganhou campo "Ou outro valor" + campo de CNPJ/CPF que só
   aparece quando o backend pede.
4. `test:asaas` agora 10 casos (inclui o pedido de documento).

### 2026-09-08 (cont.) — repasse das taxas Asaas

Primeiro Pix real de R$ 5 → conta Leeva recebeu ~R$ 4 (taxa de R$ 0,99). Decisão
da dona sobre cada taxa:

1. **Pix recebido** (compra de crédito): restaurante paga por cima.
   `gross = crédito + ASAAS_PIX_FEE_IN`. Tela mostra o detalhe. QR code
   adicionado na tela (`encodedImage` do `/pixQrCode`).
2. **Pix transferido** (repasse ao motoboy): **descontado do motoboy**, 1 saque
   por dia, avisado de antemão. `payout_batches.transfer_fee` (migration 0032),
   Pix enviado = `amount − ASAAS_TRANSFER_FEE`. Avisos: tela Pagamentos (PWA),
   GanhosScreen (nativo), painel admin de repasses, notificação do repasse.
   Guarda: se `amount ≤ taxa`, lote falha com alerta (não deve acontecer:
   min_payout R$ 6 > taxa R$ 1,99).

### 2026-09-08 (cont.) — comprovação de entrega (GPS + foto)

Antes: motoboy apertava "Entreguei" de qualquer lugar, sem prova. Decisão da
dona: exigir **GPS + foto**.

1. **Migration 0033**: colunas em `orders` (`delivered_lat/lng`,
   `delivery_distance_m`, `delivery_gps_status`, `delivery_photo_path`) +
   bucket privado `delivery-proof` no storage.
2. **`delivery-proof.ts`**: `confirmDeliveryWithProof` — perto (≤ 150 m,
   `DELIVERY_PROXIMITY_M`) confirma; longe **bloqueia** (`too_far`, 422);
   sem GPS confirma mas marca `no_gps`. `min_payout` (R$ 6) > qualquer taxa,
   sem edge de valor.
3. **PWA** (`DeliveryFlow.tsx` + `/api/deliveries/[id]` action `deliver`):
   passo `in_route` abre captura de foto (redimensionada no navegador p/ ~1280px
   JPEG) + pega GPS, envia base64, servidor sobe pro bucket e confirma.
   Foto **obrigatória** no PWA.
4. **Nativo** (`RideContext` + `entregas.ts`): manda o GPS no `delivered`
   (sem foto — precisa de `expo-image-picker` + rebuild do APK; anotado).
   O endpoint aceita `action:'status'` delivered com GPS pra não quebrar
   APKs em campo.
5. **Restaurante** (`OrderDetail` + `/api/orders/[id]`): mostra a foto (URL
   assinada 1h) + "confirmada no local (X m)" ou "sem localização".
6. `npm run test:delivery-proof` (5 casos).

### 2026-09-09 — "o restaurante decide" quais pedidos do iFood vão pro Leeva

Pergunta da dona: com o iFood ligado, TODO pedido vai pro Leeva? E se ela não
quiser mandar todos?

- **Setting** `logistics_config.ifood_auto_call` (default `true` = automático,
  como era). Desligado → pedido do iFood entra **segurado**.
- **Migration 0034**: `orders.dispatch_hold boolean`. Segurado = aparece no
  painel ("Aguardando você chamar") e no mapa, mas: **não despacha, não
  calcula taxa, não desconta crédito**.
- `createOrderFromNormalized({ holdForReview })`: pula finalizeDeliveryCharge
  + consumo de crédito + trigger de despacho; grava `dispatch_hold=true`.
- `callDriverForOrder(db, orderId, restaurantId)` (novo): só aqui calcula a
  taxa, desconta crédito (sem saldo → continua segurado), e libera
  (`dispatch_hold=false`, `dispatch_state='searching'`).
- Despacho (`autodispatch`, `grouping-dispatch`) e alertas ignoram
  `dispatch_hold`. Mapa mostra `dispatchHold` no marcador; segurado não conta
  como "atrasado".
- UI: botão **"Chamar entregador"** no card do pedido (Pedidos); "Cancelar"
  vira "Recusar" pro segurado. Toggle em Configurações → Logística.
- `npm run test:order-hold` (4 casos).

### 2026-09-09 (cont.) — status do iFood fecha o pedido no Leeva

Requisito da dona: pedido do iFood que ela NÃO mandou pro Leeva (segurado ou
recusado), quando concluído no iFood, tem que fechar no Leeva também.

- `IFOOD_EVENT_CONCLUDED = 'CON'`, `IFOOD_EVENT_CANCELLED = 'CAN'`.
- `syncIfoodOrders` agora trata esses eventos → `closeIfoodOrder(db, rid, extId, outcome)`:
  - `cancelled` → `advanceOrderStatus('cancelled')` (estorna crédito, encerra oferta).
  - `concluded` + entrega nossa em rota → conclui normal (motoboy ganha).
  - `concluded` nos demais casos → update direto `status='delivered'`,
    `delivery_gps_status='external'` (bypass da máquina de estados de propósito).
- `markOrderHandledExternally` (novo) + `/api/orders/[id]/handle-externally`:
  o botão "Recusar" no card agora fecha como "entregue por fora" (antes
  cancelava — e aí o CON do iFood não reabria). Sem custo.
- `OrderDetail`: bloco "Conclusão — entrega feita por fora do Leeva".
- Triggers do banco são permissivos (só logam a mudança de status), então o
  update direto para 'delivered' é seguro e gera o order_event.
- `test:order-hold` agora 7 casos.

### 2026-09-09 (cont.) — APK do motoboy v1.0.1 (com push)

- `google-services.json` agora vem de env var de arquivo da EAS
  (`GOOGLE_SERVICES_JSON`, secret, criada com `eas env:create --type file`
  para preview+production). `app.config.js` lê do env var no build, do arquivo
  local no dev. Build anterior saía sem Firebase (arquivo gitignored não subia).
- Build `725c8db1` (preview/APK, SDK 57, vc 2, commit 0ba15c8):
  https://expo.dev/artifacts/eas/Lg3xJUcRYNcEQUL-P47jo3ivC_U7GkItB5EElTZ5xac.apk
- Inclui: redesign motoboy, GPS na confirmação de entrega, aviso da taxa de saque.
- Conta EAS logada: leeva-jp (owner). Build via `eas-cli build --profile preview
  --platform android --non-interactive --no-wait`.

### 2026-09-09 (cont.) — endereço do restaurante por texto (não mais lat/lng na mão)

Bug relatado: entrega pro "mesmo local" dava 20+ km. Causa: o restaurante demo
tinha coordenadas placeholder em João Pessoa e `address = null`, e a tela de
Configurações só tinha 2 campos crus de Latitude/Longitude — impossível pra
quem não é técnico.

- `POST /api/config/pickup`: recebe `{ address }`, usa `resolvePickupLocation`
  (mesmo geocode do Bloco 1), grava `address` + `latitude` + `longitude`.
- ConfigForm "Ponto de coleta" → "Endereço do restaurante": campo de texto +
  botão "Encontrar no mapa" que mostra o endereço achado pra confirmar. Os
  campos lat/lng viraram `<details>` "ajuste manual (avançado)".
- É daqui que sai a distância de TODA entrega — a distância do cliente é o
  geocode do endereço digitado em Nova entrega; a origem é este ponto.

### 2026-09-10 — Integrações: página amigável pra conectar cardápio digital

Antes: tabela crua de status + lista de endpoints com jargão. Inútil pra dono
de restaurante.

- `ConnectMenu.tsx` (novo, substitui `ApiKeys.tsx`): fluxo em 3 passos —
  (1) gerar chave, (2) copiar a URL `/api/v1/deliveries` + onde colar,
  (3) mensagem pronta pra mandar pro suporte da plataforma. + botão "Criar
  pedido de teste" (`POST /api/integrations/test` — cria via provider 'api'
  com `holdForReview`, endereço = o do restaurante, marcado como teste).
- `integracoes/page.tsx`: lidera com "como um pedido chega" + ConnectMenu +
  IfoodLink; tabela técnica + endpoints agora dentro de `<details>` "para o
  seu desenvolvedor".
- Arquitetura já suportava: `NormalizedOrder` + `createOrderFromNormalized`
  é o funil único; qualquer plataforma que faça POST vira entrega Leeva.

### 2026-09-12 — refino visual do app do motoboy (PWA + nativo)

Mesma pegada do restaurante/admin, adaptada pro mobile.

- **PWA** (`apps/motoboy`): Inter, verde mais nítido (#0c8a5c claro /
  #34c98c escuro), elevação discreta (`--shadow-sm/-raise`, `-pop` só no
  `.offer-card`). Tema: acompanha o celular por padrão, com opção explícita
  claro/escuro em Perfil → "Aparência" (localStorage `leeva-theme`).
- **Tab bar corrigida**: antes usava `<Link className="badge">` sem nenhuma
  lógica de aba ativa — nunca destacava onde você estava. `TabBar.tsx` (novo,
  client) usa `usePathname` + ícones SVG (era só texto).
- **Nativo** (`motoboy-app/theme.ts`): paleta escura realinhada aos mesmos
  tons do PWA. Tipografia (Inter/Space Grotesk) já estava boa, não mexi.
  Só entra no próximo build do APK.

### 2026-09-12 (cont.) — tela Início do motoboy: mapa em destaque (estilo 99/Uber)

A dona mandou print de referência (app de corrida: mapa cheio, pill de
disponibilidade no topo, "procurando rotas" flutuante, ganhos na tela
inicial). Adaptei mantendo só o que é real — sem promoção fake, sem sino de
notificação sem função.

- `LiveMap.tsx` (novo): mosaico de tiles real (CARTO, claro/escuro conforme
  o tema) centrado na posição do próprio motoboy (`navigator.geolocation`),
  mede o próprio tamanho (ResizeObserver). Diferente do RouteMap (2 pontos,
  props fixas) — aqui é 1 ponto, responsivo.
- `StatusToggle.tsx` reescrito: mapa cheio no topo (sangra a tela via margem
  negativa) com avatar + pill "Disponível/Indisponível" flutuando por cima;
  banner "Procurando entregas para você" (online) ou dica (offline).
  Embaixo: ganhos de hoje (real, soma de `driver_earnings`) + entregas hoje.
- Ícone da aba "Status" virou casinha (era um relógio, confundia com
  Histórico).

### 2026-09-13 — mesma tela Início no app nativo

- `LiveMapMini.tsx` (novo, RN): mesma técnica do PWA (mosaico de tiles Carto,
  Image absoluto) — mas pega a própria posição via
  `Location.getCurrentPositionAsync` (não depende do watch do RideContext),
  atualiza a cada 20s. Pino = emoji de moto num círculo verde.
- `HomeScreen.tsx` reescrito: mapa no topo, avatar + pill de disponibilidade
  flutuando por cima (`Pressable`), banner "procurando entregas"/dica.
  Estatísticas (nota, entregas) continuam abaixo — não inventei "ganhos
  hoje" no nativo por falta de endpoint (o PWA tem porque a página já
  carrega esse dado do servidor).
- Versão do app: 1.0.1 → **1.0.2** (versionCode 3).

### 2026-09-14 — correções na tela Início do nativo (feedback com print real)

A dona instalou o APK e mandou print: sobrava um espaço preto vazio embaixo,
o topo (avatar/pill) ficava atrás da barra de status, e a chave Pix só dava
pra cadastrar pelo site.

- `LiveMapMini`: agora mede largura E altura (`onLayout`) e usa `flex: 1` —
  preenche todo o espaço que o pai der, em vez de uma altura fixa de 260.
- `HomeScreen`: mapa em `flex:1` (ocupa o que sobrar), folha inferior com
  `maxHeight: 42%` só pro essencial (avisos + estatísticas) — acaba com o
  vazio. Barra superior ganhou `insets.top` (safe area) pra não ficar atrás
  do relógio/ícones do sistema.
- **Chave Pix agora dá pra cadastrar direto no app** (`PixEditor` em
  PerfilScreen, chips de tipo + campo + salvar — espelha o formulário web).
  Endpoint `/api/pix` já existia e já aceitava a auth do app nativo.
- Pendente pro próximo passo: deixar a tela de oferta/rota mais parecida
  com o iFood (referência que a dona mandou) — não entrou nesta leva pra não
  empilhar mudança de layout sem conseguir ver o resultado antes de buildar.
- v1.0.2 → **1.0.3** (versionCode 4).

## 2026-09-14 — tela de oferta estilo iFood (motoboy-app)

- Confirmado com a dona que v1.0.3 corrigiu os 3 problemas (espaço vazio do
  mapa, barra de status sobrepondo o topo, Pix não salvava pelo app).
- Segui pro item que tinha ficado pendente: deixar a tela de oferta (quando
  chega um pedido) mais parecida com o iFood, usando a referência que ela
  mandou.
- O que mudou: pinos do mapa agora mostram "A" (coleta) e "B" (entrega) em
  vez de bolinhas lisas; cartão de preço flutua sobre o mapa (valor grande +
  km total + valor por km); barra fina no topo da tela esvazia conforme o
  tempo da oferta passa (reforço visual do timer, que continua mostrando os
  segundos também); as paradas de coleta/entrega usam o mesmo par de
  bolinhas A/B do mapa; botão "Aceitar" já mostra o valor da corrida nele.
- v1.0.3 → **1.0.4** (versionCode 5).

## 2026-09-14 — saída pro travamento do iFood: modelo Centralizado

- A dona reportou uma semana travada no ticket 32820575 (homologação do app
  Distribuído LEEVA) e pressa real pra destravar a própria doceria.
- Descoberta: o Portal Desenvolvedor já tem, pra toda conta, dois apps de
  teste auto-gerados — "Teste (D)" Distribuído (o que já estava travado) e
  "Teste (C)" **Centralizado**. Testei o Centralizado com credenciais reais
  (client_credentials) contra a loja de teste — funcionou de primeira: token
  emitido, merchant listado, **sem nenhum bloqueio de homologação**. Ou seja,
  só o modelo Distribuído exige homologação; o Centralizado não.
- Implementado suporte ao modo Centralizado como alternativa por restaurante
  (não substitui o Distribuído, que continua sendo o certo pra escalar pra
  múltiplos restaurantes — Centralizado é 1 app = 1 merchant, não dá pra
  reusar entre lojas). Tela de Integrações agora tem opção "Já tenho um app
  Centralizado meu" pra colar clientId/clientSecret direto, sem passar pelo
  Portal do Parceiro.
- Próximo passo (da dona): criar um app Centralizado de **produção** ligado
  ao CNPJ real da doceria (o testado foi só a loja de sandbox) e colar as
  credenciais na tela de Integrações.
- Ticket 32820575 continua aberto em paralelo — resolve o modelo Distribuído
  pra quando a Leeva escalar pra outros restaurantes.

## 2026-09-14 — pendência: código de confirmação não cobre pedido do iFood

- Implementado código de confirmação de 4 dígitos (anti-fraude do motoboy) —
  funciona bem pra pedido manual/WhatsApp, onde o Leeva tem o telefone real
  do cliente pra mandar o código.
- A dona notou uma lacuna real: pedido do iFood **não** tem esse contato
  disponível (número do cliente é mascarado pelo iFood) e o **próprio iFood
  já tem um código de confirmação de entrega dele** (8 dígitos), dentro do
  app/fluxo deles — separado e incompatível com o nosso.
- Decisão: **não mexer agora** (instrução explícita da dona — "pode deixar
  assim por enquanto"). O código de 4 dígitos do Leeva continua ativo pra
  todo pedido (incluindo os que vierem do iFood digitados manualmente), mas
  sem jeito de entregar esse código ao cliente do iFood — motoboy vai travar
  na confirmação desses casos até resolver isso.
- **Retomar quando o iFood for destravado** (Centralizado de produção ou
  ticket 32820575): decidir então se usa o código de 8 dígitos do próprio
  iFood (mostrar/linkar a tela deles) ou se dá pra pedir o telefone real do
  cliente via API. Até lá, considerar tornar o código do Leeva opcional
  (ou dispensável) quando `source = 'ifood'`.

## 2026-09-14 — saque sob demanda + painel de Caixa

- Implementado: motoboy solicita o repasse quando quiser (não é mais
  fechamento automático diário) — reaproveita toda a estrutura de
  payout_batches/driver_earnings já existente, só troca o gatilho.
  Limite de 1x/dia vem de graça da constraint unique já existente.
  Cron diário desligado (migration 0038, idempotente).
- Nova página /caixa no admin: separa claramente os três donos do
  dinheiro que passa pela mesma conta Asaas — crédito de restaurante
  não usado, saldo de motoboy não sacado, e margem do Leeva (só conta
  entrega concluída — cancelada nunca foi receita, teve o crédito
  estornado). Mostra o valor seguro pra sacar e um formulário pra
  registrar (não executar) o saque — a transferência de verdade
  continua manual, na Asaas.
- Pendente da usuária: aplicar a migration 0038 no SQL Editor; ligar
  ASAAS_PAYOUTS_ENABLED + credenciais reais quando quiser sair do modo
  simulado.

## 2026-09-14 — Bloco 1: status de preparo visível pro motoboy

- Central de Pedidos ganhou botões reais "Marcar em preparo" (pede
  minutos, com padrão configurável) e "Marcar como pronto".
- Decisão de arquitetura: `ready_at` pode ser gravado mesmo com o
  pedido já despachado (status='assigned'), sem tocar no `status` —
  evita que a entrega suma da tela do motoboy. `markReady()` só avança
  o `status` de verdade quando o pedido ainda não tem motoboy.
- Corrigida (achada durante a implementação, não reportada antes) uma
  lacuna real: as consultas de "entrega ativa" do motoboy (nativo e
  PWA) filtravam só por status assigned/picked_up/in_route — não
  cobriam o caso de motoboy já atribuído a um pedido ainda 'preparing'
  ou 'ready' (que passa a ser o normal com o despacho sincronizado do
  Bloco 3, ainda não implementado nesta sessão).
- Badge "Em preparo/Pronto" nas 4 telas relevantes (oferta e entrega
  ativa, nativo + PWA), cálculo centralizado (`computePrepStatus`,
  packages/shared) pro restaurante e o PWA nunca mostrarem coisas
  diferentes do mesmo pedido — nativo tem cópia local (fora do
  workspace npm).
- Migration 0039 pendente de aplicar (SQL Editor).

## 2026-09-14 — CRLV por PDF + aba Carteira separada

- Documento do veículo (CRLV) agora aceita foto OU PDF (até 3,5 MB),
  no app nativo e no PWA. Documento pessoal/selfie continua só foto.
  Backend já aceitava PDF (`api/documents/route.ts`), não precisou
  mudar.
- Nova aba "Carteira" no app nativo (antes o saldo/saque ficava
  misturado com "Ganhos" — separei pra ficar igual ao PWA, que já
  tinha `/pagamentos` como rota própria). Endpoint dedicado
  `api/payouts/history` no PWA serve os dois: saldo disponível,
  histórico de repasses, taxa de transferência.
- "Ganhos" no nativo voltou a ser só histórico de entregas (sem
  saldo/saque), pra não duplicar a mesma informação em dois lugares.

## 2026-09-14 — Bloco 2: tempos de coleta e entrega calculados de verdade

- Cada motoboy candidato a uma oferta já tinha, no motor de despacho
  (`autodispatch.ts`), o tempo até a coleta calculado a partir da
  posição GPS dele no momento — só não estava sendo gravado na oferta
  nem mostrado ao motoboy. Corrigido: a oferta agora grava
  `eta_pickup_min` (coleta, por candidato) e `eta_dropoff_min`
  (entrega, rota real) e os dois aparecem separados e rotulados
  ("~X min até a coleta" / "~Y min até a entrega") no card de oferta,
  nativo e PWA.
- Achei (e corrigi) uma violação de fonte única que já existia: a
  rota de ofertas (`api/offers/route.ts`) recalculava o tempo de
  entrega com uma fórmula genérica (`km / 22 × 60 + 6`), e o app
  nativo/PWA recalculavam o tempo de coleta com outra fórmula ainda
  (`km / 20 × 60 + 2`) — nenhuma das duas usava a duração real de rota
  que o Leeva já calcula (OSRM) quando o pedido é criado
  (`orders.route_duration_min`). Agora tudo lê o valor já calculado
  uma única vez; nada recalcula em camadas diferentes.
- Extraí o fallback (linha reta × 1.3 quando o OSRM falha) para uma
  função só (`legEtaMin`, em `geo.ts`) usada nos dois tempos —
  garante que coleta e entrega usam exatamente a mesma regra de
  fallback, e ficou testável sem precisar simular banco de dados.
- Migration 0040 pendente de aplicar (SQL Editor) — adiciona
  `eta_pickup_min`/`eta_dropoff_min` em `dispatch_attempts`.
- Não avancei pro Bloco 3 ainda — combinado parar aqui pra validar
  esse antes.

## 2026-09-14 — km da coleta e da entrega separados na oferta

- A oferta já mostrava km, mas a perna de entrega mostrava o km TOTAL
  da rota (coleta + entrega somados), não só o trecho até o cliente —
  achei isso ao responder uma pergunta direta da usuária. Adicionei
  `distanceDropoffKm` (rota total menos a perna de coleta) na rota de
  ofertas e troquei nos dois cards. Não se aplica a rota agrupada
  (várias paradas) — aí continua mostrando só o total, que já fazia
  sentido nesse caso.

## 2026-09-14 — Bloco 3: despacho sincronizado com o horário de pronto

- Cada candidato a uma oferta só é chamado dentro de uma janela: tempo
  dele até a coleta + antecedência configurável (`dispatch_lead_minutes`,
  configurável em Configurações do restaurante, padrão 5 min) precisa
  encaixar antes do horário estimado de pronto do pedido. Isso faz o
  motoboy mais longe ser chamado mais cedo que o mais próximo — os dois
  chegam perto da hora do pedido ficar pronto, ninguém espera parado.
- Se o pedido já está pronto (`ready_at`) ou não tem estimativa de
  preparo, despacha na hora, sem essa espera — igual já era antes do
  Bloco 3.
- Decisão de arquitetura: quando NENHUM candidato está na janela ainda
  (só "cedo demais"), isso não conta como tentativa de despacho nem
  aciona o alerta de "sem entregador" — o pedido só aguarda o próximo
  tick do cron (já roda a cada ~30s) até algum candidato entrar na
  janela. Só conta tentativa/falha quando é falta de entregador de
  verdade (offline, no limite, fora do raio).
- Testado com um cenário concreto (`autodispatch.test.ts`, "Bloco 3"):
  pedido em preparo com dois motoboys a distâncias diferentes — o mais
  longe fica elegível na hora, o mais próximo fica bloqueado
  ("cedo demais") até faltar menos tempo pro pedido ficar pronto; mais
  os casos de pedido já pronto e sem estimativa (despacho imediato) e
  de todo mundo ainda cedo (`waitingForTiming`, não conta como falha).
- Isso fecha os 3 blocos do despacho sincronizado combinados nesta
  sessão. Falta a usuária validar os 3 na prática (nenhum foi testado
  por ela ainda) e aplicar as migrations 0036–0040 pendentes.

## 2026-09-14 — km entre paradas da rota agrupada + timer + som na oferta

- Rota agrupada (várias entregas pro mesmo motoboy) já calculava o km
  de cada parada até a anterior (`legKm`, em `grouping-dispatch.ts`) —
  só não estava chegando até a tela do motoboy. Agora aparece: "2ª
  parada · 1,2 km da parada anterior" (a 1ª mostra "da coleta").
- Agrupamento continua 100% automático — o motor de despacho junta
  pedidos próximos do mesmo restaurante na hora de montar a oferta.
  O restaurante NÃO pede agrupamento manualmente; hoje ele só cria
  pedido por pedido, sem opção de montar uma rota com várias paradas
  na mão. Expliquei isso pra usuária em vez de construir uma tela
  nova sem ela ter confirmado que quer esse fluxo manual.
- Tempo pro motoboy aceitar/recusar a oferta: baixei o padrão de 45s
  pra 20s (`offer_timeout_seconds`), como pedido. O relógio/contagem
  regressiva já existia nos dois cards de oferta (nativo e PWA) —
  não precisou de tela nova, só o valor padrão mudou. Continua
  configurável em Configurações (min. 15s).
- Som ao chegar oferta nova: PWA usa um bipe de duas notas gerado por
  Web Audio (sem depender de arquivo de terceiros) tocado junto com a
  vibração já existente. Nativo ganhou `expo-audio` (o app já tinha
  vibração no card, mas nenhum som) + um .wav gerado localmente
  (`scripts/generate-offer-sound.mjs` → `assets/sounds/offer.wav`),
  tocado mesmo com o celular no silencioso — motoboy não pode perder
  oferta por isso. Isso precisa de um novo build do APK pra valer.

## 2026-09-15 — pedido com oferta em aberto não entra mais em grupo novo

- Achei isso respondendo uma pergunta da usuária sobre o timing do
  agrupamento: um pedido cuja oferta já estava com um motoboy (dentro
  da janela de aceitar/recusar) podia ser "puxado" pra dentro de um
  grupo novo formado por um pedido seguinte — a oferta antiga continuava
  aberta pro motoboy original, mas com o pedido já reatribuído a outro
  grupo/motoboy por baixo. Corrigido: agrupamento só pega pedidos que
  ainda NÃO foram ofertados a ninguém (ou cuja oferta anterior já
  expirou/foi recusada). Sem teste automatizado ainda — a lógica de
  agrupamento com banco de dados não tem suíte de testes mockada nesta
  sessão (igual o motor de despacho antes do Bloco 3).

## 2026-09-15 — "corrida extra" pro motoboy que já está em rota perto

- Pergunta da usuária: se um motoboy já aceitou uma corrida e, minutos
  depois, aparece outra perto de onde ele já está indo, isso ficava
  cobrado como entrega solta (preço cheio) — mesmo ele não estando
  fazendo o trajeto do zero. Ela pediu pra cobrar como parada
  incremental de rota agrupada nesse caso, não como solta.
- Implementado: o motor de despacho já sabia identificar quando o
  destino novo cai perto (raio padrão 1,5 km, mesmo da rota agrupada)
  de uma entrega ativa do candidato — só usava isso pra pontuar, não
  pro preço. Agora, se a oferta pra esse candidato sair mais barata
  calculada como parada incremental (mesma fórmula de
  `per_km_grouped` das rotas agrupadas de verdade) do que como entrega
  solta, é esse valor menor que aparece na oferta — nunca aumenta o
  valor, só reduz quando faz sentido.
  Se ele ACEITAR, o pedido é reprecificado pra bater com o que ele viu
  (driver_payout/customer_fee) e a diferença é devolvida como crédito
  pro restaurante — mesma lógica que já existia pra rota agrupada de
  verdade (`applyGroupPlan`), só que aplicada na hora do aceite em vez
  da formação do grupo, porque aqui o pedido nunca chega a ser
  "agrupado" de verdade (o motoboy já tinha aceitado o 1º sozinho).
  Se ele RECUSAR, nada muda no pedido — o próximo candidato é avaliado
  do zero com o preço padrão.
- Teste cobrindo a detecção da "entrega ativa mais próxima" por
  candidato (`autodispatch.test.ts`). O caminho completo do desconto +
  devolução de crédito não tem teste automatizado (precisa mockar
  RPC de crédito e política de planos) — mesma limitação de cobertura
  já registrada pro motor de despacho com banco de dados.

## 2026-09-15 — raio de agrupamento/corrida extra: 1,5 km → 1 km

- Usuária pediu pra apertar o raio padrão pra 1 km. Mudei o padrão do
  código (`DEFAULT_PAYOUT_CONFIG.group_radius_km`, em `payout.ts`) —
  vale tanto pra rota agrupada de verdade quanto pra "corrida extra"
  (são o mesmo campo, "Raio p/ agrupar" na aba Planos do admin).
  IMPORTANTE: se já existir uma linha salva em `payout_policies`
  (global ou por restaurante) com 1,5 km explícito, esse valor salvo
  continua valendo — o padrão do código só entra quando não há nada
  salvo. Pra restaurantes que já têm política salva, precisa reabrir
  a tela de Planos e salvar de novo (ou ajustar direto o campo lá).

## 2026-09-15 — documento reenviado depois de aprovado volta pra revisão

- Usuária pediu: documento enviado pelo motoboy precisa passar por
  análise do admin antes. Isso já acontecia no cadastro inicial
  (self-service nasce 'pending_approval', só o admin aprova). O que
  faltava: se um motoboy JÁ aprovado reenviasse CNH/RG, CRLV ou selfie
  depois (ex: renovou o veículo, corrigiu foto ruim), o documento novo
  substituía o antigo silenciosamente — sem ninguém checar de novo.
- Corrigido: reenviar documento depois de já aprovado volta o cadastro
  pra 'pending_approval' automaticamente — motoboy some da fila de
  despacho (autodispatch já exige approval_status='approved') até o
  admin revisar de novo na mesma fila que já existe. Ele vê um aviso
  na hora ("documento entrou em análise de novo"), nativo e PWA.

## 2026-09-15 — produção quebrada ~12h achada ao investigar sumiço de campo

- Usuária disse que não achou o campo "Antecedência da chamada do
  motoboy" na tela de Configurações — motivo real: o deploy de
  produção do app do motoboy E do restaurante estava falhando desde
  ontem à noite (Bloco 1), não só nesse commit específico. Ver commit
  "fix(build)" — causa raiz era um import de barrel puxando a lib
  web-push (só roda no servidor) pro bundle do navegador. Corrigido e
  confirmado com build local antes de subir. Isso significa que
  praticamente nada do que foi feito nesta sessão desde ontem à noite
  (Blocos 1/2/3, CRLV/Carteira no PWA, corrida extra, etc.) estava de
  fato no ar em produção até agora — só o app nativo (build próprio
  via EAS, não Vercel) recebia as mudanças de verdade.

## 2026-09-15 — taxas saem do restaurante, viram só do admin

- Usuária pediu: restaurante não deve mais mexer em taxa, só o admin.
  Removido da tela de Configurações do restaurante: taxa cobrada do
  cliente, pedido mínimo, frete grátis, máx. tentativas de despacho, e
  a seção inteira "Remuneração do entregador" (por km solta/extra,
  mínimo garantido, bônus de pico). O restaurante só vê esses valores
  como informação (taxa/pedido mínimo/frete grátis), sem poder editar.
  A API `/api/config` do restaurante agora ignora esses campos mesmo
  que alguém tente mandar via requisição direta — sempre preserva o
  valor já salvo.
- Taxa/pedido mínimo/frete grátis viraram editáveis na página de cada
  restaurante no admin (`/restaurantes/[id]`) — único lugar onde dá
  pra mudar agora. Remuneração do motoboy (por km etc.) continua só
  na tela global "Planos" do admin (não criei edição por restaurante
  pra isso ainda — se precisar, é só pedir).

## 2026-09-15 — despacho "natural": sem limite de tentativas

- Antes: depois de N tentativas (configurável, restaurante mexia
  nisso) o pedido virava "sem entregador" e parava de tentar. Usuária
  pediu pra isso ser natural — o Leeva chama quantos motoboys forem
  necessários até alguém aceitar, sem desistir sozinho.
- Implementado: removido o limite. Depois de 3 tentativas sem
  ninguém aceitar, o raio de busca começa a expandir sozinho (até 3x
  o normal) e aparece um aviso pro restaurante ("Poucos entregadores
  na região — expandindo o raio de busca"), sem travar o pedido. O
  aviso some sozinho assim que alguém aceitar.
- Nova opção pro restaurante: pode reforçar o valor pago ao motoboy
  nesse pedido específico (botão "Reforçar valor pro motoboy" na tela
  do pedido, até R$ 100), pra atrair alguém mais rápido — some depois
  que o motoboy aceita (o repasse final já vira o valor exato
  ofertado). Coluna nova `orders.payout_boost` (migration 0041).
- `max_dispatch_attempts` continua existindo no schema (não quis fazer
  migration de remoção) mas não tem mais efeito nenhum — marcado
  @deprecated no tipo.
- Sem teste automatizado pra essa parte (mexe em runDispatchTick, que
  já não tinha cobertura — mesma limitação registrada antes).

## 2026-09-15 — limpeza da tela do restaurante

- Removidos, a pedido da usuária: o bloco "Detalhes técnicos (para o
  seu desenvolvedor)" na aba Integrações (tabela de status de
  integração + endpoints/headers — informação pra dev, não pro dono
  do restaurante usar no dia a dia); e o card "Taxas e remuneração"
  em Configurações (que eu tinha deixado como leitura — ela pediu
  pra tirar de vez, não só travar a edição).

## 2026-09-15 — cadastro de motoboy quebrado (limite de 1 MB do Next.js)

- Usuária tentou se cadastrar como motoboy (`/quero-entregar`) e caiu
  em "Application error: a server-side exception has occurred" —
  bug antigo, não era desta sessão. O formulário manda os documentos
  (CNH/RG + CRLV, até 5 MB cada) direto por Server Action do Next.js,
  que por padrão só aceita até 1 MB no corpo da requisição — qualquer
  foto de documento de celular já estoura isso.
- Corrigido: `experimental.serverActions.bodySizeLimit: '12mb'` em
  `apps/motoboy/next.config.mjs`. Precisa validar em produção depois
  do deploy — usuária vai tentar cadastrar de novo.

## 2026-09-15 — e-mail de aprovação/reprovação de motoboy (Resend)

- Usuária pediu pra avisar por e-mail quando o cadastro for aprovado.
  Não existia nenhum envio de e-mail no sistema até agora — construído
  do zero: `packages/shared/src/services/mailer.ts`, chamando a API
  do Resend direto por fetch (sem SDK, pra não repetir o problema do
  web-push puxando dependência Node-only pro bundle do cliente — bug
  corrigido mais cedo nesta sessão).
- `approveDriver`/`rejectDriver` (drivers.ts) agora buscam o e-mail do
  motoboy (fica no Auth, não na tabela motoboys) e disparam o e-mail
  correspondente — nunca bloqueia a aprovação se o envio falhar.
- Sem a variável `RESEND_API_KEY` configurada, só loga um aviso e
  segue sem enviar — não quebra nada, mas também não manda e-mail de
  verdade até ela configurar.
- PENDENTE DA USUÁRIA: criar conta grátis no Resend, pegar a chave de
  API, e adicionar `RESEND_API_KEY` (e opcionalmente `RESEND_FROM_EMAIL`
  com um remetente verificado) nas variáveis de ambiente do projeto
  **leeva-admin** na Vercel (é lá que roda a aprovação). Sem isso, os
  textos na tela do motoboy prometem um e-mail que ainda não sai.
- Textos atualizados avisando sobre o e-mail: tela "Cadastro em
  análise" do PWA (`OnboardingGate.tsx`) e do nativo (`HomeScreen.tsx`).

## 2026-09-15 — completar cadastro do restaurante (horário, termos, volume)

Pacote grande pedido pela usuária, tudo nesta entrada:

**Chave Pix fora do cadastro do motoboy** — não é mais exigida em
`/quero-entregar`; ele cadastra depois na aba Carteira (o sistema já
tratava chave ausente como "awaiting_pix", não precisou mexer em mais
nada).

**Etapa 3 (config logística) removida do cadastro do restaurante** —
taxa cobrada e raio saíram do onboarding porque taxa já não é mais
editável pelo restaurante (fica no padrão do sistema / admin ajusta
depois). Raio de atendimento volta ao padrão (8km) e o restaurante
ajusta em Configurações se precisar.

**Campo "valor por entrega" faltando no editor de planos do admin** —
a API já aceitava e salvava `per_delivery_price`, mas o formulário em
Planos não tinha o campo pra editar (só existia "margem por entrega").
Adicionado o input que faltava — não inventei nenhum valor, só destravei
a edição do que já existia no banco.

**Horário de funcionamento** — novo (`restaurants.business_hours`,
JSON por dia da semana, sem múltiplos turnos). Função pura
`isRestaurantOpen()` (packages/shared/services/business-hours.ts, BR
= UTC-3 fixo, sem depender de timezone do servidor) decide se está
aberto; usada pra: (1) motor de despacho pular pedido de restaurante
fechado sem contar tentativa nem gerar alerta; (2) bloquear criação
manual de pedido (`/api/orders`) e a API externa (`/api/v1/deliveries`)
fora do expediente, com mensagem clara. Editável no cadastro (nova
etapa 3, com o campo de volume esperado junto) e depois em
Configurações. 8 testes cobrindo a função pura (dentro/fora do
horário, dia fechado, dia sem configurar, virada de noite, 24h).

**Termos de uso do restaurante** — mesmo mecanismo do motoboy,
reaproveitando `terms_versions` (agora com coluna `audience`
'motoboy'/'restaurant' pra não misturar as duas versões — achei e
corrigi de propósito um bug que isso quase causou: a query de
elegibilidade do motoboy em `autodispatch.ts` pegava a versão ativa
mais alta SEM filtrar por audience, o que ia quebrar todo mundo assim
que a versão de restaurante nascesse com número maior). Tabela nova
`restaurant_terms_acceptance` (audit) + `restaurants.terms_accepted_version`.
Bloqueia o painel (`(app)/layout.tsx`, mesmo padrão do gate do
motoboy) até aceitar; texto placeholder
"[TEXTO PROVISÓRIO — substituir pelo texto jurídico definitivo antes
de produção real]"; se sair versão nova, quem aceitou a antiga é
barrado até re-aceitar (mesma lógica de `needsTermsAcceptance`, já
existia pro motoboy).

**Volume esperado de pedidos** — campo numérico livre e opcional
no cadastro (`restaurants.expected_daily_orders`), só informativo,
visível na página do restaurante no admin — nunca aparece de volta
pro restaurante.

Migration 0042 pendente de aplicar no Supabase.

## 2026-09-15 — "esqueci minha senha" (não existia em lugar nenhum)

- Usuária ficou travada tentando entrar no admin (nunca tinha criado
  senha) e descobrimos que **nenhum app tinha fluxo de recuperação de
  senha** — nem admin nem restaurante. Corrigido: tela "Esqueci minha
  senha" em ambos, usando o e-mail de recuperação nativo do Supabase
  (`resetPasswordForEmail` → link → `/auth/callback` → `/redefinir-senha`,
  onde a pessoa digita a senha nova ela mesma — nunca passa por mim).
  Admin não tinha nem `/auth/callback`, criado do zero.
- Achei a causa de `leevacomercial@gmail.com` não logar no restaurante
  mesmo "depois de cadastrado": esse e-mail já existia no Auth (virou
  admin antes), e o cadastro de restaurante recusa e-mail duplicado —
  a tentativa falhava silenciosamente. Resolvido via SQL (cria o
  restaurante + liga esse e-mail como dono, sem duplicar o usuário).

## 2026-09-15 — cadastro de motoboy: câmera não funcionava, CNH virou frente+verso

- Bug relatado: no `/quero-entregar`, tirar foto na hora não enviava
  (só funcionava escolher da galeria). Causa provável: um único
  `<input type=file>` genérico sem `capture` definido tem comportamento
  inconsistente em navegador de celular — o padrão que já funcionava
  bem nas telas de reenvio de documento (pós-aprovação) separa "tirar
  foto" (força câmera, `capture="environment"`) de "escolher arquivo"
  (sem capture, força a galeria/Arquivos) em dois inputs distintos.
  Apliquei o mesmo padrão no cadastro.
- CNH/RG agora pede frente E verso (2 fotos) — coluna nova
  `motoboys.personal_doc_back_path` (migration 0043). Documento vira
  `'personal' | 'personal_back' | 'vehicle' | 'avatar'` em todo lugar
  que lida com isso: upload do cadastro, reenvio pós-aprovação (nativo
  + PWA), fila de aprovação do admin.
- PDF no CRLV do cadastro: já existia no código (`accept` já aceitava
  PDF), mas com o input único de câmera+arquivo ficava difícil de
  achar no celular — resolvido junto com a separação foto/arquivo
  acima (agora tem um botão "escolher arquivo" bem visível).
- Migration 0043 pendente de aplicar.

## 10/10/2026 — modelo novo: só mensalidade + motoboys próprios

O dono decidiu: o Leeva vira app de roteirização/gestão da EQUIPE PRÓPRIA do
estabelecimento, cobrando só mensalidade (plano `mensal`, migration 0049). O
Leeva não mexe em dinheiro de entrega.

- Painel (fleet_mode = 'own'): menu Ao vivo (mapa) · Pedidos · Motoboys ·
  Indicadores · Acerto e financeiro · Integrações · Configurações. Saíram do
  menu: Créditos, Entregadores (rede) e Mapa (o mapa de calor abre por
  Indicadores). Contas antigas da rede mantêm o menu antigo.
- Ao vivo: a equipe aparece SEMPRE no mapa quando online (migration 0051 —
  `record_my_location` grava posição de motoboy own sem entrega, order_id
  NULL), com nome no pino e aba "Motoboys" (livre/em entrega/offline, último
  GPS, WhatsApp). `MapData.team`.
- Onboarding: sem escolha de frota (sempre own) e só planos mensais.
- Nova entrega na frota própria mostra km, quanto o motoboy recebe e a taxa
  do cliente — não fala mais em crédito.
- Integrações: "Colar pedido" (Anota AI e qualquer cardápio) e Open Delivery
  (logística). Ver docs/INTEGRATIONS.md.
- ATENÇÃO: no banco faltavam 0048, 0049 e 0050 (o código de 05–06/10 já
  estava no ar sem elas → GPS não gravava desde então). Junto com a 0051,
  precisam ser aplicadas.

## 11/10/2026 — só frota própria (fim da rede), escalas, despacho no mapa, admin de assinaturas

O dono decidiu: nada de rede Leeva. O Leeva é ferramenta pra equipe PRÓPRIA do
estabelecimento (modelo Foody Delivery, só que melhor) e cobra só mensalidade.

- **Removido** (código; as tabelas ficam no banco como histórico): créditos e
  compra de crédito via Asaas, margem por entrega, carteira/saque Pix do
  motoboy, cadastro aberto "quero entregar", envio de documentos, aprovação de
  motoboy pela plataforma, telas Créditos/Entregadores (painel), Carteira/
  Documentos (PWA e app nativo), Novos motoboys/Repasses/Caixa/Financeiro de
  margem (admin), webhook Asaas e cron de fechamento.
- **Despacho**: só a equipe do próprio restaurante entra no sorteio.
- **Escalas** (migration 0052, `shifts.ts`, tela /escalas): turnos por dia,
  "repetir esta semana na próxima", trava opcional "despachar só pra quem está
  de turno" (`logistics_config.shifts_enforced`). O motoboy vê "Minha escala"
  no app (PWA já; app nativo no próximo APK).
- **Ao vivo**: pedido buscando entregador ganha "Mandar pra…" (despacho manual
  por cima do automático, lista quem está online ordenado por distância).
- **Admin**: "Restaurantes" virou **Clientes** — situação da cobrança (em dia,
  teste, inadimplente, vence em X dias), filtro "cobrar / atenção" e botões
  marcar pago / inadimplente / estender teste / trocar plano / cancelar. A
  cobrança em si é por fora (Pix/boleto).
- **Bug corrigido**: trocar de plano (inclusive no cadastro) marcava a
  assinatura como paga e encerrava o teste grátis. Agora só "marcar como pago"
  ativa. Restaurante novo nasce no plano mensal.
- **Migration 0053**: força `fleet_mode='own'` em todos, tira do ar os
  motoboys da rede (active=false), zera valor por entrega dos planos e tira
  start/pro/business da vitrine (se o mensal existir).
- Precisa aplicar no Supabase, nesta ordem: 0048–0051 (se ainda não), 0052, 0053.
- Scripts de integração de créditos/repasses/cadastro (test-asaas, fase4,
  fase5, fase5c) foram apagados; os outros passaram a usar frota própria
  (não foram rodados — precisam do banco real).
