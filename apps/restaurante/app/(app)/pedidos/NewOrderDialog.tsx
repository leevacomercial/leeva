'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '../_lib/client';
import PinPicker from '../_lib/PinPicker';
import { Icon } from '../../_icons/Icon';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  formatCurrencyBRL,
  paymentPendingOnDelivery,
  type PaymentMethod,
  type PaymentStatus,
} from '@leeva/shared';

type FeePreview = {
  ok: boolean;
  distanceKm?: number | null;
  driverPayout?: number;
  ownFleet?: boolean;
  customerDeliveryFee?: number;
  bairro?: string | null;
  error?: string;
};

type PastedDraft = {
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  total: number | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  notes: string | null;
  externalId: string | null;
  sourceHint: string | null;
};

type GeoStatus = 'idle' | 'ok' | 'not_found' | 'unavailable';

/**
 * Nova entrega — o restaurante informa o endereço, que é localizado no mapa
 * ANTES de criar. Endereço que não é encontrado não gera pedido. O Leeva
 * calcula a taxa pela distância e mostra antes de confirmar.
 */
export default function NewOrderDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [address, setAddress] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [geoLabel, setGeoLabel] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<GeoStatus>('idle');
  const [geocoding, setGeocoding] = useState(false);
  const [confirmManual, setConfirmManual] = useState(false);
  const [precision, setPrecision] = useState<string | null>(null);
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [pinMoved, setPinMoved] = useState(false);
  const [orderValue, setOrderValue] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('online');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [notes, setNotes] = useState('');
  const [fromIfood, setFromIfood] = useState(false);
  const [ifoodLocator, setIfoodLocator] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [fee, setFee] = useState<FeePreview | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);

  /** "Colar pedido": lê o texto copiado do cardápio e preenche o formulário. */
  async function applyPaste() {
    setPasting(true);
    setPasteMsg(null);
    try {
      const { draft: d } = await apiPost<{ draft: PastedDraft }>('/api/orders/parse-text', { text: pasteText });
      if (d.customerName) setCustomerName(d.customerName);
      if (d.customerPhone) setCustomerPhone(d.customerPhone);
      if (d.address) setAddress(d.address);
      if (d.paymentMethod !== 'unknown') {
        setPaymentMethod(d.paymentMethod);
        setPaymentStatus(d.paymentStatus);
      }
      if (d.total != null) setOrderValue(String(d.total));
      const extra = [d.externalId ? `Pedido ${d.sourceHint ?? ''} #${d.externalId}`.replace('  ', ' ') : null, d.notes]
        .filter(Boolean)
        .join(' · ');
      if (extra) setNotes(extra);
      const missing = [!d.customerName && 'nome', !d.address && 'endereço'].filter(Boolean);
      setPasteMsg(
        missing.length
          ? `Preenchi o que achei. Falta: ${missing.join(' e ')}.`
          : 'Pronto! Confira os dados e clique em "Localizar no mapa".',
      );
      setPasteText('');
    } catch (e) {
      setPasteMsg((e as Error).message);
    } finally {
      setPasting(false);
    }
  }

  const collectOnDelivery = paymentPendingOnDelivery(paymentMethod, paymentStatus);

  // endereço localizado (geocodificado) OU instabilidade + confirmação manual
  const located = geoStatus === 'ok';
  const manualOk = geoStatus === 'unavailable' && confirmManual && !!lat && !!lng;
  const addressReady = located || manualOk;

  // qualquer edição do endereço invalida a localização anterior
  useEffect(() => {
    setGeoStatus('idle');
    setGeoLabel(null);
    setConfirmManual(false);
    setPrecision(null);
    setPinMoved(false);
  }, [address]);

  // pré-visualização da taxa sempre que a localização mudar
  useEffect(() => {
    if (!lat || !lng) {
      setFee(null);
      return;
    }
    let cancelled = false;
    apiGet<FeePreview>(`/api/delivery-fee?latitude=${lat}&longitude=${lng}&address=${encodeURIComponent(address)}`)
      .then((r) => !cancelled && setFee(r))
      .catch(() => !cancelled && setFee(null));
    return () => {
      cancelled = true;
    };
    // endereço muda junto com a localização (geocode), não precisa refazer a cada tecla
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  async function geocode() {
    if (address.trim().length < 5) return;
    setGeocoding(true);
    setGeoLabel(null);
    try {
      const r = await apiGet<{
        ok: boolean;
        latitude?: number;
        longitude?: number;
        label?: string;
        precision?: string;
        pickup?: { lat: number; lng: number } | null;
        error?: string;
      }>(
        `/api/geocode?q=${encodeURIComponent(address)}`,
      );
      if (r.ok && r.latitude != null) {
        setLat(String(r.latitude));
        setLng(String(r.longitude));
        setGeoLabel(r.label ?? 'Endereço localizado');
        setPrecision(r.precision ?? null);
        setPickup(r.pickup ?? null);
        setPinMoved(false);
        setGeoStatus('ok');
      } else {
        setGeoStatus('not_found');
        setGeoLabel(null);
      }
    } catch {
      // falha de rede/serviço — instabilidade, não "endereço errado"
      setGeoStatus('unavailable');
      setGeoLabel(null);
    } finally {
      setGeocoding(false);
    }
  }

  async function submit() {
    if (fromIfood && ifoodLocator.replace(/\D/g, '').length !== 8) {
      setErr('Informe o localizador do iFood (8 números).');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await apiPost('/api/orders', {
        customerName,
        customerPhone: customerPhone || null,
        address,
        latitude: lat ? Number(lat) : null,
        longitude: lng ? Number(lng) : null,
        // o restaurante viu (e pode ter ajustado) o ponto no mapa → coordenada confiável
        addressConfirmed: manualOk || located,
        total: collectOnDelivery && orderValue ? Number(orderValue) : 0,
        paymentMethod,
        paymentStatus,
        notes: notes || null,
        items: [],
        fromIfood,
        ifoodLocator: fromIfood ? ifoodLocator.replace(/\D/g, '') : null,
      });
      onCreated();
    } catch (e) {
      if (e instanceof ApiError && e.code === 'geocoder_unavailable') {
        setGeoStatus('unavailable');
        setErr('O serviço de mapas está instável. Confira o endereço e marque a confirmação abaixo para prosseguir.');
      } else if (e instanceof ApiError && e.code === 'address_not_found') {
        setGeoStatus('not_found');
        setErr('Não conseguimos localizar esse endereço. Revise a rua, o número e o bairro.');
      } else {
        setErr((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0 }}>Nova entrega</h2>
          <button className="btn sm" onClick={onClose}>✕</button>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          O Leeva localiza o endereço, calcula a taxa pela distância e encontra o entregador automaticamente.
        </p>

        <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
          <details className="section" open={!customerName && !address}>
            <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              Colar pedido do cardápio (Anota AI, Goomer, WhatsApp…)
            </summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
              <textarea
                className="input"
                rows={4}
                placeholder="Copie o pedido inteiro no seu cardápio ou no WhatsApp e cole aqui. O Leeva preenche nome, telefone, endereço, valor e pagamento."
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <button type="button" className="btn sm primary" onClick={applyPaste} disabled={pasting || pasteText.trim().length < 10}>
                  {pasting ? 'Lendo…' : 'Preencher com o pedido'}
                </button>
                {pasteMsg && <span className="muted" style={{ fontSize: 12 }}>{pasteMsg}</span>}
              </div>
            </div>
          </details>
          <input className="input" placeholder="Nome do cliente *" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          <input className="input" placeholder="Telefone (WhatsApp) — para o rastreamento" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
          <input className="input" placeholder="Endereço de entrega * (rua, número, bairro)" value={address} onChange={(e) => setAddress(e.target.value)} />

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn sm" onClick={geocode} disabled={geocoding || address.trim().length < 5}>
              {geocoding ? 'Localizando…' : <><Icon name="pin" size={13} /> Localizar no mapa</>}
            </button>
            {located && (
              <span style={{ fontSize: 12, color: 'var(--ok)' }}>✓ {geoLabel}</span>
            )}
          </div>

          {located && lat && lng && (
            <div style={{ display: 'grid', gap: 6 }}>
              {precision !== 'exact' && !pinMoved && (
                <div className="op-alert warning" style={{ marginBottom: 0 }}>
                  Achamos a rua, mas não o número exato. <b>Arraste o pino <Icon name="pin" size={12} /> até a casa do cliente</b> (ou toque no
                  lugar certo do mapa) para a distância e o valor ficarem certos.
                </div>
              )}
              <PinPicker
                lat={Number(lat)}
                lng={Number(lng)}
                pickup={pickup}
                onMove={(la, ln) => {
                  setLat(String(la));
                  setLng(String(ln));
                  setPinMoved(true);
                }}
              />
              <div className="muted" style={{ fontSize: 12 }}>
                {pinMoved ? '✓ Ponto ajustado por você.' : <>Confira se o pino <Icon name="pin" size={12} /> está na casa do cliente. <Icon name="store" size={12} /> é o seu restaurante.</>}
              </div>
            </div>
          )}

          {geoStatus === 'not_found' && (
            <div className="op-alert critical" style={{ marginBottom: 0 }}>
              Não conseguimos localizar esse endereço. Confira a rua, o número e o bairro e tente de novo.
            </div>
          )}

          {geoStatus === 'unavailable' && (
            <div className="op-alert warning" style={{ marginBottom: 0 }}>
              <div>O serviço de mapas está instável agora.</div>
              <div style={{ marginTop: 6 }}>
                Você pode informar a localização manualmente (latitude/longitude) e confirmar:
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="input" placeholder="Latitude" value={lat} onChange={(e) => setLat(e.target.value)} style={{ flex: 1 }} />
                <input className="input" placeholder="Longitude" value={lng} onChange={(e) => setLng(e.target.value)} style={{ flex: 1 }} />
              </div>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, fontSize: 13 }}>
                <input type="checkbox" checked={confirmManual} onChange={(e) => setConfirmManual(e.target.checked)} />
                Confirmo que este endereço e esta localização estão corretos.
              </label>
            </div>
          )}

          {/* pré-visualização da taxa */}
          {/* o Leeva não cobra por entrega — mostra só o que importa pro dono */}
          {fee?.ok && (
            <div className="op-alert info" style={{ marginBottom: 0, fontSize: 13 }}>
              {fee.bairro ? <><b>{fee.bairro}</b> (tabela do bairro) · </> : fee.distanceKm != null && <><b>{fee.distanceKm} km</b> · </>}
              seu motoboy recebe <b>{formatCurrencyBRL(fee.driverPayout ?? 0)}</b>
              {fee.customerDeliveryFee != null && <> · taxa pro cliente pela sua tabela: <b>{formatCurrencyBRL(fee.customerDeliveryFee)}</b></>}
            </div>
          )}


          <div style={{ display: 'flex', gap: 8 }}>
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} style={{ flex: 1 }}>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>Pagamento: {PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>
            <select className="input" value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)} style={{ flex: 1 }}>
              {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((s) => (
                <option key={s} value={s}>{PAYMENT_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>

          {collectOnDelivery && (
            <input
              className="input"
              type="number"
              step="0.01"
              placeholder="Valor a receber do cliente na entrega (R$)"
              value={orderValue}
              onChange={(e) => setOrderValue(e.target.value)}
            />
          )}

          <textarea className="input" placeholder="Observações de entrega" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />

          <label className="row" style={{ gap: 8, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" checked={fromIfood} onChange={(e) => setFromIfood(e.target.checked)} />
            Pedido veio do iFood (lançado manual, enquanto a integração direta não está ligada)
          </label>
          {fromIfood && (
            <input
              className="input"
              inputMode="numeric"
              maxLength={8}
              placeholder="Localizador do iFood (8 números)"
              value={ifoodLocator}
              onChange={(e) => setIfoodLocator(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
          )}

          {err && <div className="op-alert critical">{err}</div>}

          {!addressReady && address.trim().length >= 5 && geoStatus === 'idle' && (
            <div className="muted" style={{ fontSize: 12 }}>
              Clique em “Localizar no mapa” para confirmar o endereço antes de criar.
            </div>
          )}

          <button
            className="btn primary"
            onClick={submit}
            disabled={
              busy ||
              !customerName.trim() ||
              !address.trim() ||
              !addressReady
            }
          >
            {busy
              ? 'Criando…'
              : !addressReady
                  ? 'Localize o endereço primeiro'
                  : 'Criar e buscar entregador'}
          </button>
        </div>
      </div>
    </div>
  );
}
