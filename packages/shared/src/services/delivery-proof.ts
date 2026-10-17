/**
 * COMPROVAÇÃO DE ENTREGA — GPS + foto + código de confirmação.
 *
 * O botão "Entreguei" do app do motoboy chama isto com a localização atual,
 * o caminho da foto (já enviada ao storage) e o código de 4 dígitos que o
 * cliente informa (mandado pro cliente quando o pedido é criado). Regras:
 *   - tem GPS e está a <= DELIVERY_PROXIMITY_M do endereço  → confirma ('ok')
 *   - tem GPS e está longe demais                            → BLOQUEIA ('far')
 *   - sem GPS (permissão negada / falhou)                    → confirma, mas
 *     marca 'no_gps' pro restaurante/admin verem
 *   - foto é obrigatória sempre
 *   - código errado (ou pedido sem código gerado)             → BLOQUEIA
 *     ('wrong_code') — é o que garante que o motoboy falou de verdade com o
 *     cliente, não só tirou uma foto qualquer perto do endereço.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { haversineKm } from './geo';
import { advanceOrderStatus } from './orders';
import { isIfoodLogisticsLinked, confirmIfoodLogisticsDelivery } from './ifood-logistics';

type DB = SupabaseClient<Database>;

/** Raio (metros) dentro do qual "Entreguei" é aceito. */
export const DELIVERY_PROXIMITY_M = 150;

export type ConfirmDeliveryInput = {
  orderId: string;
  motoboyId: string;
  lat?: number | null;
  lng?: number | null;
  /** caminho da foto no storage. Opcional só para o app nativo em transição —
   *  o PWA sempre envia. */
  photoPath?: string | null;
  /** código de 4 dígitos que o cliente informa ao motoboy na entrega. */
  confirmationCode?: string | null;
  /** pedido do iFood: motoboy declara que confirmou no link do iFood */
  ifoodConfirmed?: boolean;
};

export type ConfirmDeliveryResult =
  | { ok: true; gpsStatus: 'ok' | 'no_gps'; distanceM: number | null }
  | { ok: false; error: string; code?: 'too_far' | 'no_photo' | 'wrong_code' | 'invalid_state'; distanceM?: number };

export async function confirmDeliveryWithProof(
  db: DB,
  input: ConfirmDeliveryInput,
): Promise<ConfirmDeliveryResult> {
  const { data: order } = await db
    .from('orders')
    .select('id, restaurant_id, motoboy_id, status, latitude, longitude, delivery_confirmation_code, source')
    .eq('id', input.orderId)
    .maybeSingle();
  if (!order || order.motoboy_id !== input.motoboyId) {
    return { ok: false, error: 'essa entrega não é sua', code: 'invalid_state' };
  }
  if (!['picked_up', 'in_route'].includes(order.status)) {
    return { ok: false, error: 'a entrega não está em rota', code: 'invalid_state' };
  }

  // Pedido do iFood: quem valida é o iFood.
  //  - integração (módulo Logistics) ligada: o motoboy digita no app o código
  //    que o cliente passa e o Leeva confere no iFood (verifyDeliveryCode);
  //  - sem integração: o motoboy confirma no link do iFood e declara aqui.
  //  Foto e GPS continuam valendo nos dois casos.
  const isIfood = order.source === 'ifood';
  const ifoodLogistics = isIfood && (await isIfoodLogisticsLinked(db, order.restaurant_id));
  if (isIfood && !ifoodLogistics && !input.ifoodConfirmed) {
    return { ok: false, error: 'Confirme a entrega no link do iFood e marque "Confirmei no iFood".', code: 'wrong_code' };
  }
  const expectedCode = isIfood ? null : (order.delivery_confirmation_code as string | null);
  if (expectedCode) {
    const given = (input.confirmationCode ?? '').trim();
    if (given !== expectedCode) {
      return { ok: false, error: 'Código de confirmação incorreto. Peça o código de novo pro cliente.', code: 'wrong_code' };
    }
  }

  const hasGps =
    input.lat != null &&
    input.lng != null &&
    Number.isFinite(input.lat) &&
    Number.isFinite(input.lng);
  const hasDest = order.latitude != null && order.longitude != null;

  let distanceM: number | null = null;
  let gpsStatus: 'ok' | 'far' | 'no_gps' = 'no_gps';

  if (hasGps && hasDest) {
    const km = haversineKm(
      { latitude: input.lat as number, longitude: input.lng as number },
      { latitude: Number(order.latitude), longitude: Number(order.longitude) },
    );
    distanceM = km == null ? null : Math.round(km * 1000);
    if (distanceM != null && distanceM <= DELIVERY_PROXIMITY_M) gpsStatus = 'ok';
    else gpsStatus = 'far';
  } else if (hasGps && !hasDest) {
    // sem coordenada do destino não dá pra checar — trata como sem GPS
    gpsStatus = 'no_gps';
  }

  if (gpsStatus === 'far') {
    return {
      ok: false,
      error: `Você está a ${distanceM} m do endereço. Chegue mais perto para confirmar a entrega.`,
      code: 'too_far',
      distanceM: distanceM ?? undefined,
    };
  }

  if (ifoodLogistics) {
    const v = await confirmIfoodLogisticsDelivery(db, order.restaurant_id, order.id, input.confirmationCode);
    if (!v.ok) return { ok: false, error: v.error, code: 'wrong_code' };
  }

  await db
    .from('orders')
    .update({
      delivered_lat: hasGps ? (input.lat as number) : null,
      delivered_lng: hasGps ? (input.lng as number) : null,
      delivery_distance_m: distanceM,
      delivery_gps_status: gpsStatus,
      delivery_photo_path: input.photoPath ?? null,
    })
    .eq('id', input.orderId);

  const adv = await advanceOrderStatus(db, input.orderId, 'delivered', {
    actorType: 'motoboy',
    actorId: input.motoboyId,
  });
  if (!adv.ok) return { ok: false, error: adv.error, code: 'invalid_state' };

  return { ok: true, gpsStatus, distanceM };
}
