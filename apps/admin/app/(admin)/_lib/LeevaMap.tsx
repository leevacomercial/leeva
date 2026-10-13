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
};

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
}: {
  markers: MapMarker[];
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
  const markerById = useRef<Map<string, Marker>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadL();
      if (cancelled || !elRef.current || mapRef.current) return;
      const map = L.map(elRef.current, { zoomControl: true, attributionControl: true });
      L.tileLayer(tileUrl, { attribution, maxZoom: 19, subdomains: 'abc' }).addTo(map);
      map.setView(center ? [center.lat, center.lng] : [-7.115, -34.86], 13);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      heatLayerRef.current = L.layerGroup().addTo(map);
      draw(L);
      // o container pode ter ganho altura via CSS depois do init
      setTimeout(() => map.invalidateSize(), 120);
      setTimeout(() => map.invalidateSize(), 500);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      const L = await loadL();
      draw(L);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, heat]);

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
    layer.clearLayers();
    heatLayer.clearLayers();
    markerById.current.clear();

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

    const pts: [number, number][] = [];
    for (const mk of markers) {
      const color = mk.color ?? KIND_COLOR[mk.kind] ?? '#ff5a1f';
      const size = mk.kind === 'restaurant' ? 30 : mk.kind === 'driver' ? 22 : 26;
      const icon = L.divIcon({
        className: 'leeva-pin',
        html: `<div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #0b0c0f;box-shadow:0 2px 6px rgba(0,0,0,.5);${mk.late ? 'outline:3px solid #ef4444;outline-offset:1px;' : ''}display:flex;align-items:center;justify-content:center;">
          <span style="transform:rotate(45deg);font-size:11px;color:#0b0c0f;font-weight:800;">${mk.kind === 'restaurant' ? '🏠' : mk.kind === 'driver' ? '🛵' : ''}</span></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size],
      });
      const marker = L.marker([mk.lat, mk.lng], { icon }).addTo(layer);
      if (mk.popupHtml) marker.bindPopup(mk.popupHtml);
      if (mk.onClick) marker.on('click', mk.onClick);
      markerById.current.set(mk.id, marker);
      pts.push([mk.lat, mk.lng]);
    }

    if (pts.length > 1) {
      map.fitBounds(pts as [number, number][], { padding: [40, 40], maxZoom: 15 });
    } else if (pts.length === 1) {
      map.setView(pts[0]!, 14);
    }
  }

  return <div ref={elRef} className={className} />;
}
