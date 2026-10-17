/**
 * Vínculo do restaurante com o iFood (fluxo authorization_code + userCode —
 * ver integrations/ifood-client.ts pro porquê). Estado guardado em
 * `integrations` (provider='ifood'), que já existe pra outras integrações.
 *
 * SEGURANÇA: o dono do restaurante pode ler a própria linha de
 * `integrations` via RLS (é assim que o painel funciona hoje). Por isso o
 * refreshToken e o authorizationCodeVerifier NUNCA vão em texto puro pro
 * banco — ficam cifrados com `encryptSecret`/`decryptSecret` (chave
 * `INTEGRATIONS_ENCRYPTION_KEY`, só no servidor). O que fica em claro no
 * `config` é só status de exibição (userCode, link, merchantIds) — nada
 * que sozinho dá acesso à conta do iFood.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { encryptSecret, decryptSecret } from '../lib/crypto';
import {
  startIfoodAuthorization,
  exchangeIfoodAuthorizationCode,
  refreshIfoodAccessToken,
  getCentralizedIfoodToken,
  listIfoodMerchants,
  IfoodAuthorizationPendingError,
  IfoodApiError,
} from '../integrations/ifood-client';

type DB = SupabaseClient<Database>;

type IfoodConfig = {
  linkStatus?: 'pending' | 'linked' | 'error';
  /** 'centralized' = app próprio do restaurante (client_credentials, sem autorização pelo Portal). Padrão: 'distributed' (app Leeva). */
  mode?: 'distributed' | 'centralized';
  userCode?: string;
  authorizationCodeVerifierEnc?: string; // cifrado
  verificationUrl?: string;
  verificationUrlComplete?: string;
  userCodeExpiresAt?: string;
  refreshTokenEnc?: string; // cifrado
  accessTokenEnc?: string; // cifrado (cache — evita ida ao iFood a cada chamada)
  accessTokenExpiresAt?: string;
  // modo centralizado
  centralizedClientId?: string;
  centralizedClientSecretEnc?: string; // cifrado
  merchantIds?: string[];
  linkedAt?: string;
  lastError?: string;
};

async function getConfig(db: DB, restaurantId: string): Promise<IfoodConfig> {
  const { data } = await db
    .from('integrations')
    .select('config')
    .eq('restaurant_id', restaurantId)
    .eq('provider', 'ifood')
    .maybeSingle();
  return (data?.config as IfoodConfig) ?? {};
}

async function saveConfig(db: DB, restaurantId: string, patch: IfoodConfig, opts: { credentialsSet?: boolean } = {}): Promise<void> {
  const current = await getConfig(db, restaurantId);
  const merged = { ...current, ...patch };
  await db.from('integrations').upsert(
    {
      restaurant_id: restaurantId,
      provider: 'ifood',
      config: merged as unknown as Database['public']['Tables']['integrations']['Insert']['config'],
      credentials_set: opts.credentialsSet ?? merged.linkStatus === 'linked',
      status: 'prepared',
    },
    { onConflict: 'restaurant_id,provider' },
  );
}

/** Estado seguro pra exibir na tela — nunca inclui segredo. */
export type IfoodLinkStatus = {
  linkStatus: 'not_linked' | 'pending' | 'linked' | 'error';
  mode?: 'distributed' | 'centralized';
  userCode?: string;
  verificationUrl?: string;
  verificationUrlComplete?: string;
  userCodeExpiresAt?: string;
  merchantIds?: string[];
  linkedAt?: string;
  lastError?: string;
};

export async function getIfoodLinkStatus(db: DB, restaurantId: string): Promise<IfoodLinkStatus> {
  const c = await getConfig(db, restaurantId);
  return {
    linkStatus: c.linkStatus ?? 'not_linked',
    mode: c.mode,
    userCode: c.userCode,
    verificationUrl: c.verificationUrl,
    verificationUrlComplete: c.verificationUrlComplete,
    userCodeExpiresAt: c.userCodeExpiresAt,
    merchantIds: c.merchantIds,
    linkedAt: c.linkedAt,
    lastError: c.lastError,
  };
}

/**
 * Vínculo direto (modo Centralizado) — o restaurante criou o próprio app no
 * Portal Desenvolvedor do iFood (tipo Centralizado) e cola aqui o
 * clientId/clientSecret gerados lá. Sem userCode, sem autorização pelo
 * Portal do Parceiro: valida na hora buscando um token + a lista de
 * merchants (se falhar, credenciais erradas ou app sem merchant vinculado).
 */
export async function linkIfoodCentralized(
  db: DB,
  restaurantId: string,
  clientId: string,
  clientSecret: string,
): Promise<IfoodLinkStatus> {
  let accessToken: string;
  let expiresIn: number;
  try {
    const tok = await getCentralizedIfoodToken(clientId, clientSecret);
    accessToken = tok.accessToken;
    expiresIn = tok.expiresIn;
  } catch (e) {
    const msg = e instanceof IfoodApiError ? e.message : (e as Error).message;
    await saveConfig(db, restaurantId, { linkStatus: 'error', lastError: msg });
    return { linkStatus: 'error', lastError: msg };
  }

  let merchantIds: string[] = [];
  try {
    merchantIds = (await listIfoodMerchants(accessToken)).map((m) => m.id);
  } catch {
    /* não bloqueia — o próximo poll tenta de novo */
  }

  const [centralizedClientSecretEnc, accessTokenEnc] = await Promise.all([
    encryptSecret(clientSecret),
    encryptSecret(accessToken),
  ]);
  const linkedAt = new Date().toISOString();
  await saveConfig(
    db,
    restaurantId,
    {
      linkStatus: 'linked',
      mode: 'centralized',
      centralizedClientId: clientId,
      centralizedClientSecretEnc,
      accessTokenEnc,
      accessTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      merchantIds,
      linkedAt,
      lastError: undefined,
    },
    { credentialsSet: true },
  );
  return { linkStatus: 'linked', mode: 'centralized', merchantIds, linkedAt };
}

/** Passo 1: gera o userCode e guarda o verifier cifrado. Devolve o que a tela precisa mostrar. */
export async function startIfoodLink(db: DB, restaurantId: string): Promise<IfoodLinkStatus> {
  const auth = await startIfoodAuthorization();
  const authorizationCodeVerifierEnc = await encryptSecret(auth.authorizationCodeVerifier);
  const userCodeExpiresAt = new Date(Date.now() + auth.expiresIn * 1000).toISOString();
  await saveConfig(db, restaurantId, {
    linkStatus: 'pending',
    userCode: auth.userCode,
    authorizationCodeVerifierEnc,
    verificationUrl: auth.verificationUrl,
    verificationUrlComplete: auth.verificationUrlComplete,
    userCodeExpiresAt,
    lastError: undefined,
  });
  return {
    linkStatus: 'pending',
    userCode: auth.userCode,
    verificationUrl: auth.verificationUrl,
    verificationUrlComplete: auth.verificationUrlComplete,
    userCodeExpiresAt,
  };
}

/**
 * Passo 2: tenta trocar o userCode por tokens — só funciona depois que o
 * restaurante autorizou no Portal do Parceiro. Se ainda não autorizou,
 * devolve `{ linkStatus: 'pending' }` (não é erro — a tela deve deixar
 * tentar de novo).
 */
export async function completeIfoodLink(db: DB, restaurantId: string): Promise<IfoodLinkStatus> {
  const c = await getConfig(db, restaurantId);
  if (!c.userCode || !c.authorizationCodeVerifierEnc) {
    return { linkStatus: 'error', lastError: 'nenhum vínculo em andamento — inicie de novo' };
  }
  if (c.userCodeExpiresAt && new Date(c.userCodeExpiresAt).getTime() < Date.now()) {
    await saveConfig(db, restaurantId, { linkStatus: 'error', lastError: 'código expirou — inicie de novo' });
    return { linkStatus: 'error', lastError: 'código expirou — inicie de novo' };
  }

  const verifier = await decryptSecret(c.authorizationCodeVerifierEnc);
  let tokens;
  try {
    tokens = await exchangeIfoodAuthorizationCode(c.userCode, verifier);
  } catch (e) {
    if (e instanceof IfoodAuthorizationPendingError) {
      return { linkStatus: 'pending', userCode: c.userCode, verificationUrl: c.verificationUrl, verificationUrlComplete: c.verificationUrlComplete, userCodeExpiresAt: c.userCodeExpiresAt };
    }
    const msg = e instanceof IfoodApiError ? e.message : (e as Error).message;
    await saveConfig(db, restaurantId, { linkStatus: 'error', lastError: msg });
    return { linkStatus: 'error', lastError: msg };
  }

  const [refreshTokenEnc, accessTokenEnc] = await Promise.all([
    encryptSecret(tokens.refreshToken),
    encryptSecret(tokens.accessToken),
  ]);
  const accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();

  let merchantIds: string[] = [];
  try {
    merchantIds = (await listIfoodMerchants(tokens.accessToken)).map((m) => m.id);
  } catch {
    /* não bloqueia o vínculo — o próximo poll tenta de novo */
  }

  const linkedAt = new Date().toISOString();
  await saveConfig(
    db,
    restaurantId,
    {
      linkStatus: 'linked',
      refreshTokenEnc,
      accessTokenEnc,
      accessTokenExpiresAt,
      merchantIds,
      linkedAt,
      userCode: undefined,
      authorizationCodeVerifierEnc: undefined,
      lastError: undefined,
    },
    { credentialsSet: true },
  );
  return { linkStatus: 'linked', merchantIds, linkedAt };
}

export async function unlinkIfood(db: DB, restaurantId: string): Promise<void> {
  await saveConfig(
    db,
    restaurantId,
    {
      linkStatus: undefined,
      mode: undefined,
      userCode: undefined,
      authorizationCodeVerifierEnc: undefined,
      verificationUrl: undefined,
      verificationUrlComplete: undefined,
      userCodeExpiresAt: undefined,
      refreshTokenEnc: undefined,
      accessTokenEnc: undefined,
      accessTokenExpiresAt: undefined,
      centralizedClientId: undefined,
      centralizedClientSecretEnc: undefined,
      merchantIds: undefined,
      linkedAt: undefined,
      lastError: undefined,
    },
    { credentialsSet: false },
  );
}

export class IfoodNotLinkedError extends Error {
  constructor() {
    super('restaurante não vinculado ao iFood — conclua o vínculo em Integrações');
    this.name = 'IfoodNotLinkedError';
  }
}

/**
 * Access token válido pro restaurante — renova sozinho via refreshToken
 * quando expirado. Lança `IfoodNotLinkedError` se o restaurante nunca
 * vinculou (chamador decide como tratar).
 */
/**
 * Token válido do restaurante. Renova perto de expirar (5 min de folga) e,
 * com `force`, renova na hora — usado quando o iFood responde 401.
 */
export async function getValidIfoodAccessToken(
  db: DB,
  restaurantId: string,
  opts: { force?: boolean } = {},
): Promise<{ token: string; merchantIds: string[] }> {
  const c = await getConfig(db, restaurantId);
  if (c.linkStatus !== 'linked') throw new IfoodNotLinkedError();

  const stillValid =
    !opts.force && c.accessTokenEnc && c.accessTokenExpiresAt && new Date(c.accessTokenExpiresAt).getTime() > Date.now() + 5 * 60_000;
  if (stillValid) {
    return { token: await decryptSecret(c.accessTokenEnc!), merchantIds: c.merchantIds ?? [] };
  }

  if (c.mode === 'centralized') {
    if (!c.centralizedClientId || !c.centralizedClientSecretEnc) throw new IfoodNotLinkedError();
    const clientSecret = await decryptSecret(c.centralizedClientSecretEnc);
    const tok = await getCentralizedIfoodToken(c.centralizedClientId, clientSecret);
    const accessTokenEnc = await encryptSecret(tok.accessToken);
    const accessTokenExpiresAt = new Date(Date.now() + tok.expiresIn * 1000).toISOString();
    await saveConfig(db, restaurantId, { accessTokenEnc, accessTokenExpiresAt });
    return { token: tok.accessToken, merchantIds: c.merchantIds ?? [] };
  }

  if (!c.refreshTokenEnc) throw new IfoodNotLinkedError();
  const refreshToken = await decryptSecret(c.refreshTokenEnc);
  const tokens = await refreshIfoodAccessToken(refreshToken);
  const [refreshTokenEnc, accessTokenEnc] = await Promise.all([
    encryptSecret(tokens.refreshToken),
    encryptSecret(tokens.accessToken),
  ]);
  const accessTokenExpiresAt = new Date(Date.now() + tokens.expiresIn * 1000).toISOString();
  await saveConfig(db, restaurantId, { refreshTokenEnc, accessTokenEnc, accessTokenExpiresAt });
  return { token: tokens.accessToken, merchantIds: c.merchantIds ?? [] };
}
