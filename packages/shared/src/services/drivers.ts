/**
 * MOTOBOYS — termos de uso e a regra única de "pode ficar online?".
 *
 * O motoboy é cadastrado pelo próprio estabelecimento (tela Motoboys) e
 * ativa a conta pelo convite. Antes de ficar online a 1ª vez, aceita os termos.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

type DB = SupabaseClient<Database>;
export type ApprovalStatus = Database['public']['Enums']['driver_approval_status'];

// ---------------------------------------------------------------------------
// TERMOS DE USO
// ---------------------------------------------------------------------------
export async function getActiveTerms(
  db: DB,
  audience: 'motoboy' | 'restaurant' = 'motoboy',
): Promise<{ version: number; content: string } | null> {
  const { data } = await db
    .from('terms_versions')
    .select('version, content')
    .eq('active', true)
    .eq('audience', audience)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? { version: data.version, content: data.content } : null;
}

/** true se o motoboy ainda precisa aceitar (nunca aceitou ou versão nova saiu). */
export function needsTermsAcceptance(termsAcceptedVersion: number | null, activeVersion: number): boolean {
  return termsAcceptedVersion == null || termsAcceptedVersion < activeVersion;
}

export async function acceptTerms(
  db: DB,
  motoboyId: string,
  version: number,
  ip?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const { error: aErr } = await db
    .from('driver_terms_acceptance')
    .upsert({ motoboy_id: motoboyId, terms_version: version, ip: ip ?? null }, { onConflict: 'motoboy_id,terms_version' });
  if (aErr) return { ok: false, error: 'não foi possível registrar o aceite' };
  await db.from('motoboys').update({ terms_accepted_version: version }).eq('id', motoboyId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// GATE — pode ficar online / receber ofertas?
// ---------------------------------------------------------------------------
export type DriverGate =
  | { ok: true }
  | { ok: false; reason: 'pending_approval' | 'rejected' | 'blocked' | 'terms'; message: string; termsVersion?: number };

export async function checkDriverGate(db: DB, motoboyId: string): Promise<DriverGate> {
  const { data: m } = await db
    .from('motoboys')
    .select('approval_status, approval_reason, blocked, blocked_reason, terms_accepted_version')
    .eq('id', motoboyId)
    .maybeSingle();
  if (!m) return { ok: false, reason: 'rejected', message: 'cadastro não encontrado' };
  if (m.blocked) return { ok: false, reason: 'blocked', message: m.blocked_reason || 'conta pausada — fale com o estabelecimento' };
  if (m.approval_status === 'pending_approval')
    return { ok: false, reason: 'pending_approval', message: 'Sua conta ainda não foi liberada — fale com o estabelecimento.' };
  if (m.approval_status === 'rejected')
    return { ok: false, reason: 'rejected', message: m.approval_reason || 'Conta bloqueada — fale com o estabelecimento.' };

  const terms = await getActiveTerms(db);
  if (terms && needsTermsAcceptance(m.terms_accepted_version, terms.version))
    return { ok: false, reason: 'terms', message: 'Aceite os termos de uso para continuar.', termsVersion: terms.version };

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Arquivos privados (URL assinada de curta duração)
// ---------------------------------------------------------------------------
export async function signDoc(db: DB, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await db.storage.from('driver-documents').createSignedUrl(path, 3 * 24 * 3600);
  return data?.signedUrl ?? null;
}
