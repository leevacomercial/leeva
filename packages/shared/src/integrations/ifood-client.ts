/**
 * Cliente OAuth + polling da API do iFood (Merchant API v1.0).
 *
 * O app do Leeva é um **App Distribuído** (um app, muitos restaurantes —
 * não um app interno de um único merchant). Apps distribuídos NÃO usam
 * `client_credentials` — usam o fluxo **authorization_code com userCode**
 * (parecido com o "device code" do OAuth 2.0, RFC 8628):
 *
 *   1. startIfoodAuthorization()      → POST /oauth/userCode
 *        devolve um `userCode` (curto, exibido pro dono do restaurante) +
 *        um `authorizationCodeVerifier` (segredo, fica só no servidor) +
 *        um link do Portal do Parceiro.
 *   2. O dono do restaurante abre o link, loga no Portal do Parceiro
 *      (portal.ifood.com.br) com a conta do MERCHANT dele, e autoriza o
 *      app do Leeva a acessar aquele merchant.
 *   3. exchangeIfoodAuthorizationCode(userCode, verifier) → POST /oauth/token
 *        só funciona DEPOIS do passo 2. Devolve accessToken + refreshToken
 *        (o refreshToken é o que importa — de longa duração, guardado).
 *   4. refreshIfoodAccessToken(refreshToken) → renova o accessToken quando
 *      expira, sem precisar repetir o passo 1-2.
 *
 * Depois de autenticado, o resto é igual pra qualquer app iFood: buscar
 * eventos por polling, confirmar, buscar o pedido (ver services/ifood-sync.ts
 * e services/ifood-link.ts, que guardam o estado por restaurante).
 */

export class IfoodApiError extends Error {
  status?: number;
  body?: unknown;
  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = 'IfoodApiError';
    this.status = status;
    this.body = body;
  }
}

const BASE = 'https://merchant-api.ifood.com.br';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new IfoodApiError(`${name} não configurada`);
  return v;
}

async function postForm(path: string, params: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (e) {
    throw new IfoodApiError(`iFood: falha de rede em ${path} (${(e as Error).message})`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// 1. Iniciar o vínculo — gera o código que o dono do restaurante vai usar.
// ---------------------------------------------------------------------------

export type IfoodUserCode = {
  userCode: string;
  /** SEGREDO — nunca expor ao cliente/navegador. Guardar cifrado. */
  authorizationCodeVerifier: string;
  verificationUrl: string;
  verificationUrlComplete: string;
  /** segundos até o userCode expirar (o restaurante precisa autorizar antes disso) */
  expiresIn: number;
};

export async function startIfoodAuthorization(): Promise<IfoodUserCode> {
  const clientId = requireEnv('IFOOD_CLIENT_ID');
  const { status, json } = await postForm('/authentication/v1.0/oauth/userCode', { clientId });
  if (status !== 200 && status !== 201) {
    throw new IfoodApiError(`gerar código de vínculo falhou (${status})`, status, json);
  }
  const userCode = json.userCode as string | undefined;
  const authorizationCodeVerifier = json.authorizationCodeVerifier as string | undefined;
  if (!userCode || !authorizationCodeVerifier) {
    throw new IfoodApiError('resposta sem userCode/authorizationCodeVerifier', status, json);
  }
  return {
    userCode,
    authorizationCodeVerifier,
    verificationUrl: (json.verificationUrl as string) ?? 'https://portal.ifood.com.br/apps/link',
    verificationUrlComplete: (json.verificationUrlComplete as string) ?? '',
    expiresIn: Number(json.expiresIn ?? 600),
  };
}

// ---------------------------------------------------------------------------
// 2. Trocar o userCode (depois que o restaurante autorizou) por tokens.
// ---------------------------------------------------------------------------

export type IfoodTokenSet = { accessToken: string; refreshToken: string; expiresIn: number };

/** `AUTHORIZATION_PENDING` = o restaurante ainda não concluiu a autorização no Portal. */
export class IfoodAuthorizationPendingError extends IfoodApiError {
  constructor(body?: unknown) {
    super('o restaurante ainda não concluiu a autorização no Portal do Parceiro', 400, body);
    this.name = 'IfoodAuthorizationPendingError';
  }
}

export async function exchangeIfoodAuthorizationCode(
  userCode: string,
  authorizationCodeVerifier: string,
): Promise<IfoodTokenSet> {
  const clientId = requireEnv('IFOOD_CLIENT_ID');
  const clientSecret = requireEnv('IFOOD_CLIENT_SECRET');
  const { status, json } = await postForm('/authentication/v1.0/oauth/token', {
    grantType: 'authorization_code',
    clientId,
    clientSecret,
    authorizationCode: userCode,
    authorizationCodeVerifier,
  });
  if (status !== 200) {
    const code = (json?.error as { code?: string } | undefined)?.code ?? '';
    if (/pending|not.?authoriz|not.?found/i.test(String(code) + JSON.stringify(json))) {
      throw new IfoodAuthorizationPendingError(json);
    }
    throw new IfoodApiError(`troca do código de autorização falhou (${status})`, status, json);
  }
  const accessToken = (json.accessToken ?? json.access_token) as string | undefined;
  const refreshToken = (json.refreshToken ?? json.refresh_token) as string | undefined;
  if (!accessToken || !refreshToken) {
    throw new IfoodApiError('resposta sem accessToken/refreshToken', status, json);
  }
  return { accessToken, refreshToken, expiresIn: Number(json.expiresIn ?? json.expires_in ?? 21_600) };
}

// ---------------------------------------------------------------------------
// 3. Renovar o accessToken usando o refreshToken guardado.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Apps CENTRALIZADOS (1 app = 1 merchant) — usam client_credentials direto,
// sem o passo de autorização pelo Portal do Parceiro. Cada restaurante que
// quiser esse modo precisa criar o próprio app Centralizado no Portal
// Desenvolvedor do iFood e colar o clientId/clientSecret gerados lá.
// ---------------------------------------------------------------------------

export async function getCentralizedIfoodToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { status, json } = await postForm('/authentication/v1.0/oauth/token', {
    grantType: 'client_credentials',
    clientId,
    clientSecret,
  });
  if (status !== 200) {
    throw new IfoodApiError(`autenticação do app centralizado falhou (${status})`, status, json);
  }
  const accessToken = (json.accessToken ?? json.access_token) as string | undefined;
  if (!accessToken) throw new IfoodApiError('resposta sem accessToken', status, json);
  return { accessToken, expiresIn: Number(json.expiresIn ?? json.expires_in ?? 21_600) };
}

export async function refreshIfoodAccessToken(refreshToken: string): Promise<IfoodTokenSet> {
  const clientId = requireEnv('IFOOD_CLIENT_ID');
  const clientSecret = requireEnv('IFOOD_CLIENT_SECRET');
  const { status, json } = await postForm('/authentication/v1.0/oauth/token', {
    grantType: 'refresh_token',
    clientId,
    clientSecret,
    refreshToken,
  });
  if (status !== 200) throw new IfoodApiError(`renovação do token falhou (${status})`, status, json);
  const accessToken = (json.accessToken ?? json.access_token) as string | undefined;
  // o iFood pode rotacionar o refresh token a cada renovação — se não vier um novo, mantém o mesmo.
  const newRefreshToken = ((json.refreshToken ?? json.refresh_token) as string | undefined) ?? refreshToken;
  if (!accessToken) throw new IfoodApiError('resposta de renovação sem accessToken', status, json);
  return { accessToken, refreshToken: newRefreshToken, expiresIn: Number(json.expiresIn ?? json.expires_in ?? 21_600) };
}

// ---------------------------------------------------------------------------
// API de pedidos — usa o accessToken de um restaurante já vinculado.
// ---------------------------------------------------------------------------

export type IfoodMerchant = { id: string; name?: string; corporateName?: string };

export async function listIfoodMerchants(token: string): Promise<IfoodMerchant[]> {
  const res = await fetch(`${BASE}/merchant/v1.0/merchants`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => []);
  if (!res.ok) throw new IfoodApiError(`listar merchants falhou (${res.status})`, res.status, json);
  return (Array.isArray(json) ? json : []) as IfoodMerchant[];
}

export type IfoodPollEvent = {
  id: string;
  code: string;
  fullCode?: string;
  orderId?: string;
  merchantId?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

/** GET /events:polling — 204 (sem corpo) quando não há evento novo. */
export async function pollIfoodEvents(token: string, merchantIds?: string[]): Promise<IfoodPollEvent[]> {
  const params = new URLSearchParams();
  if (merchantIds?.length) params.set('merchants', merchantIds.join(','));
  const qs = params.toString();
  const res = await fetch(`${BASE}/order/v1.0/events:polling${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204) return [];
  const json = await res.json().catch(() => []);
  if (!res.ok) throw new IfoodApiError(`polling de eventos falhou (${res.status})`, res.status, json);
  return (Array.isArray(json) ? json : []) as IfoodPollEvent[];
}

/** POST /events/acknowledgment — obrigatório, senão o iFood reenvia os mesmos eventos. */
export async function acknowledgeIfoodEvents(token: string, eventIds: string[]): Promise<void> {
  if (!eventIds.length) return;
  const res = await fetch(`${BASE}/order/v1.0/events/acknowledgment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(eventIds.map((id) => ({ id }))),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok && res.status !== 202) {
    const body = await res.json().catch(() => null);
    throw new IfoodApiError(`acknowledgment falhou (${res.status})`, res.status, body);
  }
}

/** GET /orders/{id} — payload completo, no formato que IFoodOrderProvider.parse() espera. */
export async function getIfoodOrder(token: string, orderId: string): Promise<unknown> {
  const res = await fetch(`${BASE}/order/v1.0/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new IfoodApiError(`buscar pedido ${orderId} falhou (${res.status})`, res.status, json);
  return json;
}

/** Código de evento que indica um pedido novo chegando. */
export const IFOOD_EVENT_NEW_ORDER = 'PLC';
/** Pedido concluído (entregue) no iFood. */
export const IFOOD_EVENT_CONCLUDED = 'CON';
/** Pedido cancelado no iFood. */
export const IFOOD_EVENT_CANCELLED = 'CAN';

// ---------------------------------------------------------------------------
// MÓDULO MERCHANT (homologação): loja, disponibilidade, pausas e horário.
// Tudo em /merchant/v1.0/merchants/{merchantId}/…
// ---------------------------------------------------------------------------

async function merchantReq<T>(
  token: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}/merchant/v1.0/merchants${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 204 || res.status === 202) return null as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (json as { message?: string; error?: { message?: string } } | null)?.message ?? (json as { error?: { message?: string } } | null)?.error?.message;
    throw new IfoodApiError(`iFood ${method} ${path} falhou (${res.status})${msg ? `: ${msg}` : ''}`, res.status, json);
  }
  return json as T;
}

/** Detalhes completos da loja (nome, razão social, endereço, operações…). */
export function getIfoodMerchant(token: string, merchantId: string) {
  return merchantReq<Record<string, unknown>>(token, 'GET', `/${merchantId}`);
}

export type IfoodMerchantStatus = {
  operation?: string;
  salesChannel?: string;
  available?: boolean;
  state?: string; // OK | WARNING | CLOSED | ERROR
  message?: { title?: string; subtitle?: string; description?: string } | null;
  validations?: { id?: string; code?: string; state?: string; message?: { title?: string; subtitle?: string } }[];
  reopenable?: unknown;
};

/** Disponibilidade da loja (aberta/fechada e por quê), por operação/canal. */
export async function getIfoodMerchantStatus(token: string, merchantId: string): Promise<IfoodMerchantStatus[]> {
  const r = await merchantReq<IfoodMerchantStatus[] | IfoodMerchantStatus>(token, 'GET', `/${merchantId}/status`);
  return Array.isArray(r) ? r : r ? [r] : [];
}

export type IfoodInterruption = { id: string; description?: string; start: string; end: string };

export async function listIfoodInterruptions(token: string, merchantId: string): Promise<IfoodInterruption[]> {
  const r = await merchantReq<IfoodInterruption[]>(token, 'GET', `/${merchantId}/interruptions`);
  return Array.isArray(r) ? r : [];
}

/** Cria uma pausa. start/end em ISO com fuso (ex.: 2026-10-13T14:00:00-03:00); máx. 7 dias. */
export function createIfoodInterruption(
  token: string,
  merchantId: string,
  input: { description: string; start: string; end: string },
) {
  return merchantReq<IfoodInterruption>(token, 'POST', `/${merchantId}/interruptions`, {
    description: input.description.slice(0, 255),
    start: input.start,
    end: input.end,
  });
}

export async function deleteIfoodInterruption(token: string, merchantId: string, interruptionId: string): Promise<void> {
  try {
    await merchantReq(token, 'DELETE', `/${merchantId}/interruptions/${interruptionId}`);
  } catch (e) {
    if (e instanceof IfoodApiError && e.status === 404) return; // já não existe
    throw e;
  }
}

export type IfoodDay = 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
export type IfoodShift = { id?: string; dayOfWeek: IfoodDay; start: string; duration: number };

/** Horário configurado. O iFood devolve [{ storeId, shifts: [...] }] (aceita também { shifts }). */
export async function getIfoodOpeningHours(token: string, merchantId: string): Promise<IfoodShift[]> {
  const r = await merchantReq<unknown>(token, 'GET', `/${merchantId}/opening-hours`);
  const list = Array.isArray(r) ? r : r ? [r] : [];
  const out: IfoodShift[] = [];
  for (const c of list as { shifts?: IfoodShift[]; dayOfWeek?: IfoodDay }[]) {
    if (Array.isArray(c?.shifts)) out.push(...c.shifts);
    else if (c?.dayOfWeek) out.push(c as unknown as IfoodShift);
  }
  return out;
}

/** Substitui TODOS os turnos da loja (start "HH:MM:SS", duration em minutos). */
export function putIfoodOpeningHours(token: string, merchantId: string, shifts: IfoodShift[]) {
  return merchantReq<unknown>(token, 'PUT', `/${merchantId}/opening-hours`, {
    storeId: merchantId,
    shifts: shifts.map((s) => ({ dayOfWeek: s.dayOfWeek, start: s.start, duration: s.duration })),
  });
}
