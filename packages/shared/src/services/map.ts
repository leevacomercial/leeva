/**
 * MapProvider — camada desacoplada de mapa (tiles, geocoding, estático).
 *
 * A rota/distância/ETA continuam no RoutingService (services/routing.ts).
 * Aqui fica o que a INTERFACE do mapa precisa: template de tiles, geocoding
 * (endereço → lat/lng) e URL de mapa estático.
 *
 * Estado:
 *  - OsmMapProvider     → IMPLEMENTADO (tiles OSM + geocoding Nominatim, sem chave)
 *  - MapboxMapProvider  → PREPARADO   (MAPBOX_TOKEN)
 *  - GoogleMapProvider  → PREPARADO   (GOOGLE_MAPS_API_KEY)
 *
 * Nominatim tem rate limit (1 req/s, uso justo). Para produção séria,
 * usar geocoding pago ou instância própria — a interface não muda.
 */
import type { LatLng } from './geo';

export type GeocodeResult = {
  latitude: number;
  longitude: number;
  label: string;
  source: string;
  /**
   * Qualidade da correspondência. `precision`: 'exact' = casa/número,
   * 'street' = logradouro/bairro, 'area' = cidade/região (fraco), 'unknown'.
   * `score` de 0..1 quando o provedor devolve (Nominatim `importance`,
   * Mapbox `relevance`).
   */
  precision: 'exact' | 'street' | 'area' | 'unknown';
  score: number | null;
};

/**
 * Falha de INFRAESTRUTURA do geocoder (rede, timeout, 5xx, rate limit) —
 * distinta de "endereço não encontrado" (que é `null`). Quem chama deve
 * tratar as duas de formas diferentes: não bloquear o restaurante por uma
 * instabilidade de terceiro.
 */
export class GeocoderUnavailableError extends Error {
  constructor(message = 'serviço de geocoding indisponível') {
    super(message);
    this.name = 'GeocoderUnavailableError';
  }
}

export interface MapProvider {
  readonly name: string;
  /** template de tiles para Leaflet, ex: https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png */
  readonly tileUrl: string;
  readonly tileAttribution: string;
  /**
   * Endereço → coordenada. Retorna `null` quando o endereço não existe /
   * não foi encontrado. Lança `GeocoderUnavailableError` quando o serviço
   * falha por instabilidade (não confundir com "não encontrado").
   */
  geocode(address: string, near?: LatLng): Promise<GeocodeResult | null>;
}

/** Nominatim `place_rank` → nossa granularidade. */
function precisionFromNominatim(placeRank: number, addressType?: string): GeocodeResult['precision'] {
  if (addressType === 'house' || addressType === 'building' || placeRank >= 28) return 'exact';
  if (placeRank >= 20) return 'street';
  if (placeRank >= 12) return 'area';
  return 'unknown';
}

class OsmMapProvider implements MapProvider {
  readonly name = 'osm';
  // tile.openstreetmap.org bloqueia o app e o CARTO passou a exigir chave ("API KEY REQUIRED"): Esri, sem chave
  readonly tileUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
  readonly tileAttribution = 'Tiles © Esri';

  async geocode(address: string, near?: LatLng): Promise<GeocodeResult | null> {
    if (!address || address.trim().length < 4) return null;
    let res: Response;
    try {
      const params = new URLSearchParams({
        q: address,
        format: 'jsonv2',
        limit: '1',
        addressdetails: '0',
      });
      if (near) {
        // viewbox pequeno em torno do ponto de referência melhora a precisão
        const d = 0.3;
        params.set('viewbox', `${near.longitude - d},${near.latitude + d},${near.longitude + d},${near.latitude - d}`);
        params.set('bounded', '0');
      }
      res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
        headers: { 'User-Agent': 'Leeva/1.0 (logistica)', 'Accept-Language': 'pt-BR' },
        signal: AbortSignal.timeout(6000),
      });
    } catch (e) {
      // rede caiu / timeout — instabilidade, não "não encontrado"
      throw new GeocoderUnavailableError((e as Error)?.message);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new GeocoderUnavailableError(`nominatim ${res.status}`);
    }
    if (!res.ok) return null;
    let json: { lat: string; lon: string; display_name: string; place_rank?: number; addresstype?: string; importance?: number }[];
    try {
      json = await res.json();
    } catch {
      throw new GeocoderUnavailableError('resposta ilegível do geocoder');
    }
    const hit = json[0];
    if (!hit) return null;
    const placeRank = typeof hit.place_rank === 'number' ? hit.place_rank : 0;
    return {
      latitude: parseFloat(hit.lat),
      longitude: parseFloat(hit.lon),
      label: hit.display_name,
      source: 'nominatim',
      precision: precisionFromNominatim(placeRank, hit.addresstype),
      score: typeof hit.importance === 'number' ? hit.importance : null,
    };
  }
}

class MapboxMapProvider implements MapProvider {
  readonly name = 'mapbox';
  readonly tileUrl = `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/{z}/{x}/{y}?access_token=${process.env.MAPBOX_TOKEN ?? ''}`;
  readonly tileAttribution = '© Mapbox © OpenStreetMap';
  async geocode(address: string, near?: LatLng): Promise<GeocodeResult | null> {
    if (!process.env.MAPBOX_TOKEN) return null;
    let res: Response;
    try {
      const prox = near ? `&proximity=${near.longitude},${near.latitude}` : '';
      res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?limit=1&language=pt${prox}&access_token=${process.env.MAPBOX_TOKEN}`,
        { signal: AbortSignal.timeout(6000) },
      );
    } catch (e) {
      throw new GeocoderUnavailableError((e as Error)?.message);
    }
    if (res.status === 429 || res.status >= 500) throw new GeocoderUnavailableError(`mapbox ${res.status}`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: { center: [number, number]; place_name: string; relevance?: number; place_type?: string[] }[];
    };
    const f = json.features?.[0];
    if (!f) return null;
    const kind = f.place_type?.[0];
    const precision: GeocodeResult['precision'] =
      kind === 'address' ? 'exact' : kind === 'poi' || kind === 'neighborhood' ? 'street' : kind ? 'area' : 'unknown';
    return {
      longitude: f.center[0],
      latitude: f.center[1],
      label: f.place_name,
      source: 'mapbox',
      precision,
      score: typeof f.relevance === 'number' ? f.relevance : null,
    };
  }
}

let cached: MapProvider | null = null;

export function getMapProvider(): MapProvider {
  if (cached) return cached;
  cached = process.env.MAPBOX_TOKEN ? new MapboxMapProvider() : new OsmMapProvider();
  return cached;
}

/** Config do mapa segura para enviar ao cliente (sem segredos). */
export function mapClientConfig() {
  const p = getMapProvider();
  return { provider: p.name, tileUrl: p.tileUrl, attribution: p.tileAttribution };
}

export function __setMapProvider(p: MapProvider | null) {
  cached = p;
}
