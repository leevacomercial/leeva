/**
 * Mapa "onde eu estou" — mosaico de tiles reais (OSM/CARTO) centrado na
 * posição atual do entregador. Mesma técnica do RouteMap (imagens, sem
 * biblioteca de mapa), mas de um ponto só e ocupando a largura do container.
 * Client-side: mede o próprio tamanho e escuta o GPS do navegador.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

const TILE = 256;
const ZOOM = 16;

function project(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

export default function LiveMap({ height = 340 }: { height?: number }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const compute = () => setDark(document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && mq.matches));
    compute();
    mq.addEventListener('change', compute);
    return () => mq.removeEventListener('change', compute);
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, maximumAge: 15000, timeout: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  if (!pos || !width) {
    return (
      <div ref={wrapRef} className="route-map route-map--empty" style={{ height }} aria-hidden />
    );
  }

  const z = ZOOM;
  const c = project(pos.lat, pos.lng, z);
  const originX = c.x * TILE - width / 2;
  const originY = c.y * TILE - height / 2;
  const tx0 = Math.floor(originX / TILE);
  const ty0 = Math.floor(originY / TILE);
  const cols = Math.ceil(width / TILE) + 2;
  const rows = Math.ceil(height / TILE) + 2;
  const nTiles = 2 ** z;

  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const tx = tx0 + i;
      const ty = ty0 + j;
      if (ty < 0 || ty >= nTiles) continue;
      const wx = ((tx % nTiles) + nTiles) % nTiles;
      tiles.push({
        key: `${tx}-${ty}`,
        // Esri (sem chave): OSM bloqueia o app e o CARTO passou a exigir API key.
        src: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${ty}/${wx}`,
        left: tx * TILE - originX,
        top: ty * TILE - originY,
      });
    }
  }

  return (
    <div ref={wrapRef} className="route-map" style={{ width: '100%', height }} aria-label="Sua localização no mapa" role="img">
      <div className="route-map-tiles" style={dark ? { filter: 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9)' } : undefined}>
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={t.key} src={t.src} alt="" width={TILE} height={TILE} loading="eager" style={{ position: 'absolute', left: t.left, top: t.top }} />
        ))}
      </div>
      <div className="live-map-pin" aria-hidden>
        <span className="live-map-pin-pulse" />
        <span className="live-map-pin-dot">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="17.5" r="2" />
            <circle cx="18" cy="17.5" r="2" />
            <path d="M8 17.5h6.5l1.8-5.2H15M17.5 9l-1-3H12m-3.7 8.5c-.3-1.8-1.4-2.8-3.1-2.8" />
          </svg>
        </span>
      </div>
      <span className="route-map-attr">© OpenStreetMap</span>
    </div>
  );
}
