'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  formatCurrencyBRL,
  type LogisticsConfig,
} from '@leeva/shared';
import { defaultBusinessHours, type BusinessHours } from '@leeva/shared/services/business-hours';
import { apiPost } from '../_lib/client';
import { BusinessHoursEditor } from '../_lib/BusinessHoursEditor';
import { Icon } from '../../_icons/Icon';

type Plan = { code: string; name: string; monthly_price: number; per_delivery_margin: number; features: unknown };
type OwnPayout = { per_km: number; min_payout: number; group_max_stops: number; group_radius_km: number };

export default function ConfigForm({
  isOwner,
  initial,
  currentPlan,
  plans,
}: {
  isOwner: boolean;
  initial: {
    name: string;
    address: string;
    whatsapp: string;
    latitude: number | null;
    longitude: number | null;
    logistics: LogisticsConfig;
    businessHours: BusinessHours | null;
    payout: OwnPayout;
  };
  currentPlan: string;
  plans: Plan[];
}) {
  const router = useRouter();
  const [L, setL] = useState<LogisticsConfig>(initial.logistics);
  const [P, setP] = useState<OwnPayout>(initial.payout);
  const nP = (k: keyof OwnPayout, v: number) => setP((s) => ({ ...s, [k]: v }));
  const bairros = L.customer_fee_by_region ?? [];
  const setBairros = (list: { region: string; fee: number }[]) => setL((s) => ({ ...s, customer_fee_by_region: list }));
  const [hours, setHours] = useState<BusinessHours>(initial.businessHours ?? defaultBusinessHours());
  const [lat, setLat] = useState(initial.latitude != null ? String(initial.latitude) : '');
  const [lng, setLng] = useState(initial.longitude != null ? String(initial.longitude) : '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp ?? '');
  const [pickupBusy, setPickupBusy] = useState(false);
  const [pickupMsg, setPickupMsg] = useState<{ ok?: string; err?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ warnings?: string[]; ok?: boolean; err?: string } | null>(null);

  const nL = (k: keyof LogisticsConfig, v: number) => setL((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await apiPost<{ ok: boolean; warnings: string[] }>('/api/config', {
        latitude: lat ? Number(lat) : undefined,
        longitude: lng ? Number(lng) : undefined,
        logistics: L,
        businessHours: hours,
        whatsapp: whatsapp.trim() || null,
        payout: P,
      });
      setMsg({ ok: true, warnings: r.warnings });
      router.refresh();
    } catch (e) {
      setMsg({ err: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function findPickup() {
    if (address.trim().length < 6) {
      setPickupMsg({ err: 'Digite o endereço completo: rua, número, bairro e cidade.' });
      return;
    }
    setPickupBusy(true);
    setPickupMsg(null);
    try {
      const r = await apiPost<{ latitude: number; longitude: number; label: string | null }>(
        '/api/config/pickup',
        { address: address.trim() },
      );
      setLat(String(r.latitude));
      setLng(String(r.longitude));
      setPickupMsg({ ok: r.label ? `Encontramos: ${r.label}` : 'Endereço localizado no mapa.' });
      router.refresh();
    } catch (e) {
      setPickupMsg({ err: (e as Error).message });
    } finally {
      setPickupBusy(false);
    }
  }

  async function switchPlan(code: string) {
    if (!confirm(`Mudar para o plano ${code}?`)) return;
    try {
      await apiPost('/api/billing', { planCode: code });
      router.refresh();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  const num = (v: number, on: (n: number) => void, step = '0.5') => (
    <input className="input" type="number" step={step} value={v} onChange={(e) => on(Number(e.target.value))} />
  );

  return (
    <>
      <div className="page-head">
        <h1>Configurações</h1>
      </div>

      {!isOwner && <div className="op-alert warning">Apenas o dono do restaurante pode alterar estas configurações.</div>}

      <div className="card">
        <div className="card-title">Endereço do restaurante (ponto de coleta)</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          É daqui que o sistema mede a distância de toda entrega. Precisa estar certo.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ flex: '1 1 320px' }}
            placeholder="Rua, número, bairro, cidade"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!isOwner}
          />
          <button className="btn primary" type="button" onClick={findPickup} disabled={!isOwner || pickupBusy}>
            {pickupBusy ? 'Procurando…' : 'Encontrar no mapa'}
          </button>
        </div>
        {pickupMsg?.ok && <div className="op-alert ok" style={{ marginTop: 8 }}>{pickupMsg.ok}</div>}
        {pickupMsg?.err && <div className="op-alert critical" style={{ marginTop: 8 }}>{pickupMsg.err}</div>}

        <details style={{ marginTop: 10 }}>
          <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>Ajuste manual das coordenadas (avançado)</summary>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input className="input sm" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} disabled={!isOwner} />
            <input className="input sm" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} disabled={!isOwner} />
          </div>
          <p className="muted" style={{ fontSize: 11 }}>
            Salvo junto com o resto da configuração, no botão Salvar no fim da página.
          </p>
        </details>
      </div>

      <div className="card">
        <div className="card-title">WhatsApp do restaurante</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Aparece pro entregador na oferta e na entrega, pra falar direto com você se precisar.
        </p>
        <input
          className="input"
          placeholder="(83) 99999-9999"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          disabled={!isOwner}
        />
      </div>

      {(() => {
        // simulação pra o dono enxergar o efeito: entrega de 5 km
        const km = 5;
        const clientFee = (L.customer_fee ?? 0) + Math.max(0, km - (L.customer_fee_included_km ?? 0)) * (L.customer_fee_per_extra_km ?? 0);
        const driverPay = Math.max(km * P.per_km, P.min_payout);
        return (
          <div className="card">
            <div className="card-title">Suas taxas e o pagamento do motoboy</div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Na frota própria quem define é você. O Leeva só calcula e mostra — o dinheiro é seu e você paga seus motoboys direto
              (o acerto de cada um fica em Financeiro). Pedidos do site ou iFood que já vêm com taxa mantêm a taxa deles.
            </p>
            <div style={{ fontWeight: 600, fontSize: 13, margin: '8px 0 4px' }}>Taxa de entrega cobrada do cliente</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <label>Taxa (R$){num(L.customer_fee, (v) => nL('customer_fee', v))}</label>
              <label>Vale até (km){num(L.customer_fee_included_km ?? 3, (v) => nL('customer_fee_included_km', v), '1')}</label>
              <label>Cada km a mais (R$){num(L.customer_fee_per_extra_km ?? 0, (v) => nL('customer_fee_per_extra_km', v))}</label>
              <label>
                Grátis em pedido acima de (R$)
                <input
                  className="input"
                  type="number"
                  step="1"
                  placeholder="sem frete grátis"
                  value={L.free_delivery_min_order ?? ''}
                  onChange={(e) => setL((s) => ({ ...s, free_delivery_min_order: e.target.value ? Number(e.target.value) : null }))}
                  disabled={!isOwner}
                />
              </label>
            </div>
            <div style={{ fontWeight: 600, fontSize: 13, margin: '14px 0 4px' }}>Taxa por bairro</div>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Bairro cadastrado aqui usa essa taxa no lugar da regra por km. Bairro que não estiver na lista cai na regra de cima.
            </p>
            <div style={{ display: 'grid', gap: 6 }}>
              {bairros.map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input"
                    style={{ flex: 1 }}
                    placeholder="Bairro (ex: Manaíra)"
                    value={b.region}
                    onChange={(e) => setBairros(bairros.map((x, j) => (j === i ? { ...x, region: e.target.value } : x)))}
                    disabled={!isOwner}
                  />
                  <input
                    className="input"
                    style={{ width: 110 }}
                    type="number"
                    step="0.5"
                    placeholder="R$"
                    value={b.fee}
                    onChange={(e) => setBairros(bairros.map((x, j) => (j === i ? { ...x, fee: Number(e.target.value) } : x)))}
                    disabled={!isOwner}
                  />
                  {isOwner && (
                    <button className="btn sm" type="button" onClick={() => setBairros(bairros.filter((_, j) => j !== i))}>
                      Tirar
                    </button>
                  )}
                </div>
              ))}
              {isOwner && (
                <button className="btn sm" type="button" style={{ justifySelf: 'start' }} onClick={() => setBairros([...bairros, { region: '', fee: L.customer_fee ?? 0 }])}>
                  + Adicionar bairro
                </button>
              )}
            </div>

            <div style={{ fontWeight: 600, fontSize: 13, margin: '14px 0 4px' }}>Quanto você paga ao motoboy</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <label>Mínimo por entrega (R$){num(P.min_payout, (v) => nP('min_payout', v))}</label>
              <label>Por km (R$){num(P.per_km, (v) => nP('per_km', v))}</label>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Paga o maior entre os dois. Quer valor fixo por entrega? Coloque R$ 0 no km.
            </p>
            <div style={{ fontWeight: 600, fontSize: 13, margin: '14px 0 4px' }}>Rota</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <label>Tempo prometido ao cliente (min){num(L.delivery_promise_minutes ?? 50, (v) => nL('delivery_promise_minutes', v), '5')}</label>
              <label>Máx. pedidos por saída{num(P.group_max_stops, (v) => nP('group_max_stops', v), '1')}</label>
              <label>Juntar entregas a até (km){num(P.group_radius_km, (v) => nP('group_radius_km', v))}</label>
            </div>
            <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              O Leeva junta pedidos próximos numa saída só e monta a ordem pra ninguém passar do tempo prometido. O motoboy pode mudar a ordem no app.
            </p>
            <div className="op-alert" style={{ marginTop: 8 }}>
              Exemplo, entrega de {km} km: cliente paga <strong>{formatCurrencyBRL(clientFee)}</strong> · você paga ao motoboy{' '}
              <strong>{formatCurrencyBRL(driverPay)}</strong>
            </div>
          </div>
        );
      })()}

      <div className="card">
        <div className="card-title">Logística</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label>Raio de atendimento (km){num(L.service_radius_km, (v) => nL('service_radius_km', v), '1')}</label>
          <label>Tempo de oferta ao entregador (s){num(L.offer_timeout_seconds, (v) => nL('offer_timeout_seconds', v), '5')}</label>
          <label>Tempo padrão de preparo (min){num(L.default_prep_minutes, (v) => nL('default_prep_minutes', v), '1')}</label>
          <label>Antecedência da chamada do motoboy (min){num(L.dispatch_lead_minutes, (v) => nL('dispatch_lead_minutes', v), '0')}</label>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Usado quando você marca um pedido &quot;Em preparo&quot; sem informar um tempo específico.
        </p>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          Com o pedido ainda em preparo, o Leeva chama o motoboy com essa
          folga antes do horário estimado de pronto (considerando o tempo de
          cada um até a coleta) — quem está mais longe é chamado mais cedo.
          Se o pedido já estiver pronto, chama na hora.
        </p>
        <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
          <label><input type="checkbox" checked={L.auto_dispatch_enabled} onChange={(e) => setL((s) => ({ ...s, auto_dispatch_enabled: e.target.checked }))} disabled={!isOwner} /> Despacho automático</label>
          <label><input type="checkbox" checked={L.grouping_enabled} onChange={(e) => setL((s) => ({ ...s, grouping_enabled: e.target.checked }))} disabled={!isOwner} /> Agrupamento de entregas</label>
          <label><input type="checkbox" checked={L.ifood_auto_call ?? true} onChange={(e) => setL((s) => ({ ...s, ifood_auto_call: e.target.checked }))} disabled={!isOwner} /> Chamar entregador automaticamente para pedidos do iFood</label>
          <span className="muted" style={{ fontSize: 12 }}>
            Desligado: cada pedido do iFood aparece no painel e no mapa como “aguardando você chamar”. Você
            escolhe quais enviar para o Leeva — os outros entrega como quiser, sem custo.
          </span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Horário de funcionamento</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Fora desse horário o Leeva não despacha pedidos e novos pedidos não podem ser criados.
        </p>
        <BusinessHoursEditor value={hours} onChange={setHours} disabled={!isOwner} />
      </div>

      {msg?.warnings?.length ? (
        <div className="op-alert warning">
          <div>{msg.warnings.map((w, i) => <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="alert" size={13} /> {w}</div>)}</div>
        </div>
      ) : null}
      {msg?.ok && !msg.warnings?.length && <div className="op-alert ok">Salvo.</div>}
      {msg?.err && <div className="op-alert critical">{msg.err}</div>}

      {isOwner && (
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar configurações'}
        </button>
      )}

      <div className="card" id="plano" style={{ marginTop: 20 }}>
        <div className="card-title">Plano</div>
        {plans.map((p) => (
          <div key={p.code} className="op-alert" style={{ background: p.code === currentPlan ? 'var(--accent-soft)' : 'transparent' }}>
            <div style={{ flex: 1 }}>
              <strong>{p.name}</strong> —{' '}
              {Number(p.per_delivery_margin) === 0 && Number(p.monthly_price) > 0
                ? `${formatCurrencyBRL(p.monthly_price)}/mês, sem taxa por entrega`
                : `${Number(p.monthly_price) > 0 ? `${formatCurrencyBRL(p.monthly_price)}/mês + ` : 'sem mensalidade — '}${formatCurrencyBRL(p.per_delivery_margin)}/entrega (além do valor do entregador)`}
            </div>
            {p.code === currentPlan ? (
              <span className="tag green">atual</span>
            ) : isOwner ? (
              <button className="btn sm" onClick={() => switchPlan(p.code)}>Mudar</button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}
