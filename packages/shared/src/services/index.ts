// Camada de serviços / casos de uso do Leeva.
// Todos recebem um SupabaseClient<Database> por parâmetro (injeção de
// dependência) — não criam cliente próprio, ficam testáveis e agnósticos
// de ambiente.

export * from './geo';
export * from './routing';
export * from './dispatch';
export * from './grouping';
export * from './eta';
export * from './events';
export * from './notifications';
export * from './alerts';
export * from './analytics';
export * from './situation';
export * from './orders';
export * from './tracking';
export * from './webhooks';
export * from './ifood-sync';
export * from './ifood-link';
// Fase 3 — produto comercial
export * from './autodispatch';
export * from './payout';
export * from './prep-status';
export * from './billing';
export * from './map';
export * from './address';
export * from './heatmap';
export * from './finance';
export * from './mapdata';
// Fase 3.5 — go-live, admin, reputação
export * from './reputation';
export * from './ratelimit';
export * from './observability';
export * from './platform';
export * from './apikeys';
export * from './driver-prefs';
export * from './delivery-proof';
export * from './drivers';
export * from './push';
export * from './mailer';
export * from './chat';
export * from './business-hours';
export * from './restaurant-terms';
export * from './notify-driver';
export * from './grouping-dispatch';
// Frota própria / roteirização (modelo mensal)
export * from './route-optimizer';
export * from './motoboy-route';
export * from './shifts';
export * from './ifood-logistics';
