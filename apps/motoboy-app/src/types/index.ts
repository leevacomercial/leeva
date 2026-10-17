/**
 * Tipos do domínio Leeva usados no app nativo. Espelham o JSON devolvido
 * pelas rotas /api do painel do motoboy (não importados do @leeva/shared
 * porque o app nativo fica fora do workspace npm do monorepo).
 */

export type ApprovalStatus = 'pending_approval' | 'approved' | 'rejected';

export type OrderStatus =
  | 'waiting_dispatch'
  | 'preparing'
  | 'ready'
  | 'assigned'
  | 'picked_up'
  | 'in_route'
  | 'delivered'
  | 'cancelled';

/** Transições que o motoboy dispara. */
export const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  assigned: 'picked_up',
  picked_up: 'in_route',
  in_route: 'delivered',
};

export interface MotoboyMe {
  motoboyId: string;
  fullName: string;
  phone: string | null;
  status: 'offline' | 'available' | 'on_delivery';
  approvalStatus: ApprovalStatus;
  approvalReason: string | null;
  rating: number | null;
  deliveriesCompleted: number;
  deliveriesTotal: number;
  pixKey: string | null;
  pixKeyType: string | null;
  city: string | null;
  avatarUrl?: string | null;
  pushEnabled: boolean;
  /** loja com iFood integrado (módulo Logistics): código do iFood digitado no app */
  ifoodLogistics?: boolean;
  terms: { version: number; content: string } | null;
}

export interface OfferStop {
  seq: number;
  address: string;
  region: string | null;
  payout: number;
  legKm: number | null;
}

export interface Offer {
  offerId: string;
  orderId: string;
  orderNumber: number | null;
  customerName: string;
  address: string;
  region: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pickupName: string | null;
  pickupAddress: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  etaMinutes: number | null;
  etaPickupMinutes: number | null;
  etaDropoffMinutes: number | null;
  expiresAt: string;
  payout: number | null;
  quality: 'excellent' | 'good' | 'acceptable' | 'poor' | null;
  countsForAcceptance: boolean;
  distancePickupKm: number | null;
  distanceDropoffKm: number | null;
  distanceTotalKm: number | null;
  paymentMethod: string;
  paymentStatus: string;
  orderAmount: number;
  notes: string | null;
  grouped: boolean;
  routeStops: OfferStop[] | null;
  /** null = ainda em preparo; preenchido = já pronto pra retirada. */
  readyAt: string | null;
  preparingAt: string | null;
  prepEstimateMinutes: number | null;
  routeTotalKm: number | null;
}

export interface Delivery {
  id: string;
  orderNumber: number | null;
  status: OrderStatus;
  customerName: string;
  customerPhone: string | null;
  dropoffAddress: string;
  dropoffLat: number | null;
  dropoffLng: number | null;
  pickupName: string;
  pickupAddress: string | null;
  pickupPhone?: string | null;
  source?: string;
  ifoodLocator?: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  payout: number | null;
  orderAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  notes: string | null;
  etaMin: number | null;
  etaMax: number | null;
  groupId: string | null;
  groupSequence: number | null;
  /** null = ainda em preparo; preenchido = já pronto pra retirada. */
  readyAt: string | null;
  preparingAt: string | null;
  prepEstimateMinutes: number | null;
  /** chegada estimada nessa parada pela ordem atual da rota (epoch ms) */
  routeEta?: number | null;
  routeDeadline?: number | null;
  /** nessa ordem, passa do tempo prometido ao cliente */
  routeLate?: boolean;
}

/** Resumo da rota do motoboy (todas as entregas ativas, na ordem). */
export interface RouteSummary {
  navigationUrl: string | null;
  totalKm: number;
  lateMinutes: number;
}

export interface HistoricoItem {
  id: string;
  orderNumber: number | null;
  status: 'delivered' | 'cancelled';
  customerName: string;
  address: string;
  payout: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface HistoricoResponse {
  items: HistoricoItem[];
  deliveredCount: number;
  totalEarned: number;
}

export interface Performance {
  reliabilityIndex: number;
  acceptanceRate: number | null;
  completionRate: number | null;
  onTimeRate: number | null;
  rating: number | null;
}
