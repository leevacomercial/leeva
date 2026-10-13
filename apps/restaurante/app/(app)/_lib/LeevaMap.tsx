'use client';

import { useEffect, useRef } from 'react';
import type { Map as LMap, Marker, LayerGroup } from 'leaflet';
import 'leaflet/dist/leaflet.css';

type L = typeof import('leaflet');
async function loadL(): Promise<L> {
  const mod = (await import('leaflet')) as unknown as { default?: L } & L;
  return (mod.default ?? mod) as L;
}

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  kind: 'restaurant' | 'order' | 'driver';
  color?: string;
  late?: boolean;
  onClick?: () => void;
  popupHtml?: string;
  /** mostra o `label` fixo em cima do pino (ex.: nome do motoboy) */
  showLabel?: boolean;
  /** texto curto DENTRO do pino (ex.: número do pedido) */
  text?: string;
};

/** Linha de rota desenhada no mapa (motoboy → coleta → paradas). */
export type MapLine = { id: string; color: string; points: [number, number][]; dashed?: boolean };

const KIND_COLOR: Record<string, string> = {
  restaurant: '#8fbcff',
  order: '#ff5a1f',
  driver: 'var(--ok)',
};

/**
 * Mapa funcional (Leaflet + OSM). Não decorativo: marcadores reais,
 * clicáveis, com heat opcional. Provedor de tiles vem do MapProvider.
 */
export default function LeevaMap({
  markers,
  tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  attribution = 'Tiles © Esri',
  className = 'leaflet-map ops-map',
  heat,
  center,
  focusId,
  lines,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  tileUrl?: string;
  attribution?: string;
  className?: string;
  heat?: { lat: number; lng: number; weight: number }[];
  center?: { lat: number; lng: number };
  focusId?: string | null;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const heatLayerRef = useRef<LayerGroup | null>(null);
  const linesLayerRef = useRef<LayerGroup | null>(null);
  const markerById = useRef<Map<string, Marker>>(new Map());
  const iconKeyById = useRef<Map<string, string>>(new Map());
  const clickById = useRef<Map<string, () => void>>(new Map());
  const fitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadL();
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer(tileUrl, { attribution, maxZoom: 19, subdomains: 'abcd' }).addTo(map);
      map.setView(center ? [center.lat, center.lng] : [-7.115, -34.86], 13);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      heatLayerRef.current = L.layerGroup().addTo(map);
      linesLayerRef.current = L.layerGroup().addTo(map);
      draw(L);
      // o container pode ter ganho altura via CSS depois do init
      setTimeout(() => map.invalidateSize(), 120);
      setTimeout(() => map.invalidateSize(), 500);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerById.current.clear();
      iconKeyById.current.clear();
      clickById.current.clear();
      fitted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const L = await loadL();
      draw(L);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, heat, lines]);

  useEffect(() => {
    if (!focusId) return;
    const m = markerById.current.get(focusId);
    if (m && mapRef.current) {
      mapRef.current.setView(m.getLatLng(), 15, { animate: true });
      m.openPopup();
    }
  }, [focusId]);

  async function draw(L: L) {
    const map = mapRef.current;
    const layer = layerRef.current;
    const heatLayer = heatLayerRef.current;
    if (!map || !layer || !heatLayer) return;
    heatLayer.clearLayers();

    // rotas: redesenha (são poucas linhas — barato) por baixo dos pinos
    const linesLayer = linesLayerRef.current;
    if (linesLayer) {
      linesLayer.clearLayers();
      for (const ln of lines ?? []) {
        if (ln.points.length < 2) continue;
        L.polyline(ln.points, {
          color: ln.color,
          weight: 4,
          opacity: 0.85,
          dashArray: ln.dashed ? '6 8' : undefined,
          interactive: false,
        }).addTo(linesLayer);
      }
    }

    // heat (círculos translúcidos agregados)
    if (heat?.length) {
      for (const h of heat) {
        L.circle([h.lat, h.lng], {
          radius: 260,
          stroke: false,
          fillColor: '#ff5a1f',
          fillOpacity: Math.min(0.5, 0.12 + h.weight * 0.05),
        }).addTo(heatLayer);
      }
    }

    // Atualiza no lugar (não recria): com GPS ao vivo o entregador só ANDA
    // no mapa — sem piscar, sem fechar o balão aberto, sem reenquadrar.
    const pts: [number, number][] = [];
    const seen = new Set<string>();
    let newFixedPoint = false;
    for (const mk of markers) {
      seen.add(mk.id);
      const color = mk.color ?? KIND_COLOR[mk.kind] ?? '#ff5a1f';
      const size = mk.kind === 'restaurant' ? 30 : mk.kind === 'driver' ? 24 : mk.text ? 30 : 26;
      const inner = mk.kind === 'restaurant' ? '🏠' : mk.kind === 'driver' ? '🛵' : mk.text ? escapeText(mk.text) : '';
      const icon = L.divIcon({
        className: 'leeva-pin',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #0b0c0f;box-shadow:0 2px 6px rgba(0,0,0,.5);${mk.late ? 'outline:3px solid #ef4444;outline-offset:1px;' : ''}display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:${mk.text ? 10 : 11}px;color:${mk.kind === 'order' ? '#fff' : '#0b0c0f'};font-weight:800;letter-spacing:-.02em;">${inner}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      });
      const iconKey = `${mk.kind}|${color}|${size}|${mk.late ? 1 : 0}|${mk.text ?? ''}`;
      let marker = markerById.current.get(mk.id);
      if (!marker) {
        marker = L.marker([mk.lat, mk.lng], { icon }).addTo(layer);
        markerById.current.set(mk.id, marker);
        iconKeyById.current.set(mk.id, iconKey);
        if (mk.kind !== 'driver') newFixedPoint = true;
      } else {
        marker.setLatLng([mk.lat, mk.lng]);
        if (iconKeyById.current.get(mk.id) !== iconKey) {
          marker.setIcon(icon);
          iconKeyById.current.set(mk.id, iconKey);
        }
      }
      if (mk.popupHtml) {
        if (marker.getPopup()) marker.setPopupContent(mk.popupHtml);
        else marker.bindPopup(mk.popupHtml);
      }
      if (mk.showLabel) {
        if (marker.getTooltip()) marker.setTooltipContent(mk.label);
        else marker.bindTooltip(mk.label, { permanent: true, direction: 'top', offset: [0, -size], className: 'leeva-pin-label' });
      } else if (marker.getTooltip()) marker.unbindTooltip();
      // troca só o NOSSO handler (o bindPopup tem o dele no mesmo evento)
      const prevClick = clickById.current.get(mk.id);
      if (prevClick) marker.off('click', prevClick);
      if (mk.onClick) {
        marker.on('click', mk.onClick);
        clickById.current.set(mk.id, mk.onClick);
      } else clickById.current.delete(mk.id);
      pts.push([mk.lat, mk.lng]);
    }
    for (const [id, marker] of markerById.current) {
      if (!seen.has(id)) {
        layer.removeLayer(marker);
        markerById.current.delete(id);
        iconKeyById.current.delete(id);
        clickById.current.delete(id);
      }
    }

    // enquadra na primeira vez e quando aparece pedido novo — não a cada GPS
    if (!fitted.current || newFixedPoint) {
      if (pts.length > 1) {
        map.fitBounds(pts as [number, number][], { padding: [40, 40], maxZoom: 15 });
      } else if (pts.length === 1) {
        map.setView(pts[0]!, 14);
      }
      if (pts.length > 0) fitted.current = true;
    }
  }

  return <div ref={elRef} className={className} />;
}

function escapeText(t: string) {
  return t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}
