/**
 * Mini-mapa real da corrida — coleta → entrega. Mosaico de tiles OSM
 * (imagens, sem biblioteca de mapa) + traço e pinos sobrepostos. Estático:
 * não dá zoom nem arrasta. Carrega rápido dentro do card de oferta.
 */
'use client';

const TILE = 256;

function project(lat: number, lng: number, z: number) {
  const n = 2 ** z;
  const x = ((lng + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  return { x, y };
}

function pickZoom(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const span = Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));
  if (span <= 0) return 15;
  // ~2,2 tiles cobrem o trajeto, com folga
  const z = Math.log2((360 * 2.2) / (span * 3));
  return Math.max(11, Math.min(16, Math.round(z)));
}

export default function RouteMap({
  pickup,
  dropoff,
  width = 320,
  height = 150,
}: {
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  width?: number;
  height?: number;
}) {
  if (!pickup || !dropoff) {
    return <div className="route-map route-map--empty" style={{ height }} aria-hidden />;
  }

  const z = pickZoom(pickup, dropoff);
  const cLng = (pickup.lng + dropoff.lng) / 2;
  const cLat = (pickup.lat + dropoff.lat) / 2;
  const c = project(cLat, cLng, z);

  // canto superior-esquerdo do mosaico, em pixels globais
  const originX = c.x * TILE - width / 2;
  const originY = c.y * TILE - height / 2;
  const tx0 = Math.floor(originX / TILE);
  const ty0 = Math.floor(originY / TILE);
  const cols = Math.ceil(width / TILE) + 2;
  const rows = Math.ceil(height / TILE) + 2;

  const tiles: { key: string; src: string; left: number; top: number }[] = [];
  const nTiles = 2 ** z;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const tx = tx0 + i;
      const ty = ty0 + j;
      if (ty < 0 || ty >= nTiles) continue;
      const wx = ((tx % nTiles) + nTiles) % nTiles;
      tiles.push({
        key: `${tx}-${ty}`,
        // Esri (sem chave): OSM bloqueia o app e o CARTO passou a exigir API key.
        // Filtro CSS (abaixo) escurece pra combinar com o tema do app.
        src: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${ty}/${wx}`,
        left: tx * TILE - originX,
        top: ty * TILE - originY,
      });
    }
  }

  const toPx = (p: { lat: number; lng: number }) => {
    const q = project(p.lat, p.lng, z);
    return { x: q.x * TILE - originX, y: q.y * TILE - originY };
  };
  const a = toPx(pickup);
  const b = toPx(dropoff);

  return (
    <div className="route-map" style={{ width: '100%', height }} aria-label="Mapa da corrida" role="img">
      <div className="route-map-tiles" style={{ filter: 'invert(1) hue-rotate(180deg) brightness(0.92) contrast(0.9)' }}>
        {tiles.map((t) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={t.key}
            src={t.src}
            alt=""
            width={TILE}
            height={TILE}
            loading="eager"
            style={{ position: 'absolute', left: t.left, top: t.top }}
          />
        ))}
      </div>
      <svg className="route-map-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" />
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 10" opacity="0.9" />
        <g transform={`translate(${a.x} ${a.y})`}>
          <circle r="8" fill="var(--warn)" stroke="#fff" strokeWidth="3" />
        </g>
        <g transform={`translate(${b.x} ${b.y})`}>
          <circle r="8" fill="var(--brand)" stroke="#fff" strokeWidth="3" />
        </g>
      </svg>
      <span className="route-map-attr">© OpenStreetMap</span>
    </div>
  );
}
