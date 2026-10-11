/**
 * notifyDriver — ponto único para avisar o motoboy de algo.
 *
 * Sempre grava a versão in-app (linha em `notifications`, recipient = motoboyId)
 * e, se o motoboy tiver Web Push autorizado, dispara o push também.
 * Nunca lança.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { sendPushToMotoboy, type PushPayload } from './push';

type DB = SupabaseClient<Database>;

export type DriverNotifyKind = 'offer' | 'offer_cancelled' | 'generic';

const ROUTE_BY_KIND: Record<DriverNotifyKind, string> = {
  offer: '/status',
  offer_cancelled: '/status',
  generic: '/status',
};

export async function notifyDriver(
  db: DB,
  args: {
    motoboyId: string;
    restaurantId?: string | null;
    orderId?: string | null;
    kind: DriverNotifyKind;
    title: string;
    body: string;
    url?: string;
    urgent?: boolean;
    data?: Record<string, unknown>;
    /** pula o in-app (ex.: autodispatch já gravou a linha) */
    skipInApp?: boolean;
  },
): Promise<{ inApp: boolean; push: Awaited<ReturnType<typeof sendPushToMotoboy>> | null }> {
  let inApp = false;
  // a linha in-app exige restaurant_id (NOT NULL). Avisos de plataforma
  // (repasse) não têm um restaurante único → só push, sem in-app.
  if (!args.skipInApp && args.restaurantId) {
    try {
      const { error } = await db.from('notifications').insert({
        restaurant_id: args.restaurantId,
        order_id: args.orderId ?? null,
        channel: 'in_app',
        recipient_type: 'motoboy',
        recipient: args.motoboyId,
        template: `motoboy.${args.kind}`,
        title: args.title,
        body: args.body,
        status: 'sent',
        sent_at: new Date().toISOString(),
        data: (args.data ?? {}) as Database['public']['Tables']['notifications']['Insert']['data'],
      });
      inApp = !error;
    } catch {
      /* ignora */
    }
  }

  let push: Awaited<ReturnType<typeof sendPushToMotoboy>> | null = null;
  try {
    const { data: m } = await db.from('motoboys').select('push_enabled').eq('id', args.motoboyId).maybeSingle();
    if (m?.push_enabled) {
      const payload: PushPayload = {
        title: args.title,
        body: args.body,
        url: args.url ?? ROUTE_BY_KIND[args.kind],
        tag: args.kind,
        urgent: args.urgent ?? args.kind === 'offer',
        data: args.data,
      };
      push = await sendPushToMotoboy(db, args.motoboyId, payload);
    }
  } catch {
    /* ignora */
  }
  return { inApp, push };
}
