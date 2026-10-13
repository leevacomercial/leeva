'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrencyBRL, type LogisticsConfig } from '@leeva/shared';
import { defaultBusinessHours, type BusinessHours } from '@leeva/shared/services/business-hours';
import { apiPost } from '../_lib/client';
import { BusinessHoursEditor } from '../_lib/BusinessHoursEditor';
import { Icon } from '../../_icons/Icon';

type Plan = { code: string; name: string; monthly_price: number; per_delivery_margin: number; features: unknown };
type OwnPayout = { per_km: number; min_payout: number; group_max_stops: number; group_radius_km: number };
type Bairro = { region: string; fee: number; driver_pay?: number | null };

/**
 * Configurações da loja no modelo atual (equipe própria + mensalidade):
 * a loja, o horário, as TAXAS (por bairro, com o que o cliente paga e o que
 * o motoboy recebe na mesma linha; bairro fora da lista cai na regra por km)
 * e a fila/rota. Sem nada de rede, oferta ou cobrança por entrega.
 */
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
  const nL = (k: keyof LogisticsConfig, v: number) => setL((s) => ({ ...s, [k]: v }));
  const bairros: Bairro[] = L.customer_fee_by_region ?? [];
  const setBairros = (list: Bairro[]) => setL((s) => ({ ...s, customer_fee_by_region: list }));
  const [hours, setHours] = useState<BusinessHours>(initial.businessHours ?? defaultBusinessHours());
  const [lat, setLat] = useState(initial.latitude != null ? String(initial.latitude) : '');
  const [lng, setLng] = useState(initial.longitude != null ? String(initial.longitude) : '');
  const [address, setAddress] = useState(initial.address ?? '');
  const [whatsapp, setWhatsapp] = useState(initial.whatsapp ?? '');
  const [pickupBusy, setPickupBusy] = useState(false);
  const [pickupMsg, setPickupMsg] = useState<{ ok?: string; err?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ warnings?: string[]; ok?: boolean; err?: string } | null>(null);
  const [bulk, setBulk] = useState('');
  const plan = plans.find((p) => p.code === currentPlan);

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
      const r = await apiPost<{ latitude: number; longitude: number; label: string | null }>('/api/config/pickup', {
        address: address.trim(),
      });
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

  /** "Manaíra 8 6" por linha → bairro, cliente paga, motoboy recebe (o último é opcional). */
  function addBulk() {
    const add: Bairro[] = [];
    for (const raw of bulk.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      const m = line.match(/^(.*?)[\s;,\t]+(\d+(?:[.,]\d+)?)(?:[\s;,\t]+(\d+(?:[.,]\d+)?))?\s*$/);
      if (!m) continue;
      const region = m[1]!.replace(/[;,\t-]+$/, '').trim();
      if (!region) continue;
      add.push({
        region,
        fee: Number(m[2]!.replace(',', '.')),
        driver_pay: m[3] ? Number(m[3].replace(',', '.')) : null,
      });
    }
    const known = new Set(bairros.map((b) => b.region.trim().toLowerCase()));
    setBairros([...bairros, ...add.filter((b) => !known.has(b.region.toLowerCase()))]);
    setBulk('');
  }

  const num = (v: number, on: (n: number) => void, step = '0.5') => (
    <input className="input" type="number" step={step} value={v} onChange={(e) => on(Number(e.target.value))} disabled={!isOwner} />
  );

  // exemplo: um bairro da lista (se houver) e uma entrega de 5 km fora da lista
  const km = 5;
  const kmClient = (L.customer_fee ?? 0) + Math.max(0, km - (L.customer_fee_included_km ?? 0)) * (L.customer_fee_per_extra_km ?? 0);
  const kmDriver = Math.max(km * P.per_km, P.min_payout);
  const ex = bairros.find((b) => b.region.trim());

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <div className="sub">Sua loja, horário, taxas de entrega e como a fila funciona.</div>
        </div>
      </div>

      {!isOwner && <div className="op-alert warning">Apenas o dono do restaurante pode alterar estas configurações.</div>}

      {/* 1. LOJA */}
      <div className="card">
        <div className="card-title">Sua loja</div>
        <label style={{ fontSize: 13 }}>Endereço (de onde saem as entregas)</label>
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
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>Ajustar coordenadas na mão (avançado)</summary>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input className="input sm" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} disabled={!isOwner} />
            <input className="input sm" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} disabled={!isOwner} />
          </div>
        </details>
        <label style={{ fontSize: 13, display: 'block', marginTop: 12 }}>WhatsApp da loja (aparece pro motoboy na entrega)</label>
        <input className="input" placeholder="(83) 99999-9999" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} disabled={!isOwner} />
      </div>

      {/* 2. HORÁRIO */}
      <div className="card">
        <div className="card-title">Horário de funcionamento</div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Fora desse horário o Leeva não despacha nem aceita entrega nova.</p>
        <BusinessHoursEditor value={hours} onChange={setHours} disabled={!isOwner} />
      </div>

      {/* 3. TAXAS */}
      <div className="card">
        <div className="card-title">Taxa de entrega e pagamento do motoboy</div>
        <div className="op-alert info" style={{ fontSize: 13, display: 'block' }}>
          <b>Como funciona:</b> quando entra um pedido, o Leeva acha o <b>bairro</b> no endereço.
          <ol style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            <li>Bairro está na sua lista → o cliente paga a taxa do bairro e o motoboy recebe o valor do bairro.</li>
            <li>Bairro não está na lista → vale a regra por distância (km), lá embaixo.</li>
          </ol>
          O valor do motoboy fica gravado no pedido e entra no <b>Acerto</b> de cada um. Pedido do iFood/site que já vem com
          taxa mantém a taxa dele (o motoboy recebe pela sua tabela do mesmo jeito).
        </div>

        <div style={{ fontWeight: 650, fontSize: 14, margin: '14px 0 6px' }}>Por bairro</div>
        <div className="bairro-grid bairro-head">
          <span>Bairro</span>
          <span>Cliente paga</span>
          <span>Motoboy recebe</span>
          <span />
        </div>
        <div style={{ display: 'grid', gap: 6 }}>
          {bairros.map((b, i) => (
            <div key={i} className="bairro-grid">
              <input
                className="input"
                placeholder="Ex.: Manaíra"
                value={b.region}
                onChange={(e) => setBairros(bairros.map((x, j) => (j === i ? { ...x, region: e.target.value } : x)))}
                disabled={!isOwner}
              />
              <input
                className="input"
                type="number"
                step="0.5"
                placeholder="R$"
                value={b.fee}
                onChange={(e) => setBairros(bairros.map((x, j) => (j === i ? { ...x, fee: Number(e.target.value) } : x)))}
                disabled={!isOwner}
              />
              <input
                className="input"
                type="number"
                step="0.5"
                placeholder="pela regra km"
                value={b.driver_pay ?? ''}
                onChange={(e) =>
                  setBairros(bairros.map((x, j) => (j === i ? { ...x, driver_pay: e.target.value === '' ? null : Number(e.target.value) } : x)))
                }
                disabled={!isOwner}
              />
              {isOwner ? (
                <button className="btn sm" type="button" onClick={() => setBairros(bairros.filter((_, j) => j !== i))} title="Tirar bairro">
                  ✕
                </button>
              ) : (
                <span />
              )}
            </div>
          ))}
          {bairros.length === 0 && <div className="muted" style={{ fontSize: 13 }}>Nenhum bairro ainda — tudo pela regra por km.</div>}
        </div>
        {isOwner && (
          <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
            <button
              className="btn sm"
              type="button"
              style={{ justifySelf: 'start' }}
              onClick={() => setBairros([...bairros, { region: '', fee: L.customer_fee ?? 0, driver_pay: null }])}
            >
              + Adicionar bairro
            </button>
            <details>
              <summary className="muted" style={{ fontSize: 12, cursor: 'pointer' }}>Adicionar vários de uma vez</summary>
              <textarea
                className="input"
                rows={4}
                style={{ marginTop: 6 }}
                placeholder={'Um por linha: bairro, cliente paga, motoboy recebe\nManaíra 8 6\nBessa 10 7\nCentro 6'}
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
              />
              <button className="btn sm" type="button" onClick={addBulk} disabled={!bulk.trim()} style={{ marginTop: 6 }}>
                Adicionar à lista
              </button>
            </details>
          </div>
        )}

        <div style={{ fontWeight: 650, fontSize: 14, margin: '18px 0 6px' }}>Bairros fora da lista: regra por distância</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
          <label>Cliente paga (R$){num(L.customer_fee, (v) => nL('customer_fee', v))}</label>
          <label>…até quantos km{num(L.customer_fee_included_km ?? 3, (v) => nL('customer_fee_included_km', v), '1')}</label>
          <label>+ por km a mais (R$){num(L.customer_fee_per_extra_km ?? 0, (v) => nL('customer_fee_per_extra_km', v))}</label>
          <label>Motoboy: mínimo (R$){num(P.min_payout, (v) => nP('min_payout', v))}</label>
          <label>Motoboy: por km (R$){num(P.per_km, (v) => nP('per_km', v))}</label>
          <label>
            Entrega grátis acima de (R$)
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
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          O motoboy recebe o maior entre o mínimo e (km × valor por km). Quer valor fixo? Coloque R$ 0 no km.
        </p>
        <div className="op-alert" style={{ marginTop: 8, display: 'block', fontSize: 13 }}>
          {ex && (
            <div>
              Pedido em <b>{ex.region}</b>: cliente paga <b>{formatCurrencyBRL(ex.fee)}</b> · motoboy recebe{' '}
              <b>{ex.driver_pay != null ? formatCurrencyBRL(ex.driver_pay) : 'pela regra por km'}</b>
            </div>
          )}
          <div>
            Bairro fora da lista, {km} km: cliente paga <b>{formatCurrencyBRL(kmClient)}</b> · motoboy recebe{' '}
            <b>{formatCurrencyBRL(kmDriver)}</b>
          </div>
        </div>
      </div>

      {/* 4. FILA E ROTA */}
      <div className="card">
        <div className="card-title">Fila e rota</div>
        <div style={{ display: 'grid', gap: 6 }}>
          <label>
            <input type="checkbox" checked={L.auto_dispatch_enabled} onChange={(e) => setL((s) => ({ ...s, auto_dispatch_enabled: e.target.checked }))} disabled={!isOwner} />{' '}
            Mandar a entrega sozinho pro primeiro da fila
          </label>
          <span className="muted" style={{ fontSize: 12, marginLeft: 22 }}>
            Desligado: o pedido fica &quot;sem motoboy&quot; até você escolher no Ao vivo.
          </span>
          <label>
            <input type="checkbox" checked={L.grouping_enabled} onChange={(e) => setL((s) => ({ ...s, grouping_enabled: e.target.checked }))} disabled={!isOwner} />{' '}
            Juntar entregas próximas na mesma saída
          </label>
          <label>
            <input type="checkbox" checked={L.ifood_auto_call ?? true} onChange={(e) => setL((s) => ({ ...s, ifood_auto_call: e.target.checked }))} disabled={!isOwner} />{' '}
            Pedidos do iFood entram direto na fila
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginTop: 10 }}>
          <label>Tempo prometido ao cliente (min){num(L.delivery_promise_minutes ?? 50, (v) => nL('delivery_promise_minutes', v), '5')}</label>
          <label>Máx. entregas por saída{num(P.group_max_stops, (v) => nP('group_max_stops', v), '1')}</label>
          <label>Juntar entregas a até (km){num(P.group_radius_km, (v) => nP('group_radius_km', v))}</label>
          <label>Tempo padrão de preparo (min){num(L.default_prep_minutes, (v) => nL('default_prep_minutes', v), '1')}</label>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>
          A rota é montada pra ninguém passar do tempo prometido. O motoboy pode mudar a ordem no app.
        </p>
      </div>

      {msg?.warnings?.length ? (
        <div className="op-alert warning">
          <div>
            {msg.warnings.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Icon name="alert" size={13} /> {w}
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {msg?.ok && !msg.warnings?.length && <div className="op-alert ok">Salvo.</div>}
      {msg?.err && <div className="op-alert critical">{msg.err}</div>}

      {isOwner && (
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? 'Salvando…' : 'Salvar configurações'}
        </button>
      )}

      {plan && (
        <p className="muted" style={{ fontSize: 13, marginTop: 20 }}>
          Seu plano: <b>{plan.name}</b>
          {Number(plan.monthly_price) > 0 ? ` — ${formatCurrencyBRL(plan.monthly_price)}/mês, nada por entrega` : ''}.
        </p>
      )}
    </>
  );
}
