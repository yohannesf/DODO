// Shapefile → GeoJSON conversion + feature helpers (spec §16.6, ADR 006).
import { read, type ShapefileFeatureCollection } from 'shapefile';
import type { Geometry } from '@dodo/shared';

export type { ShapefileFeatureCollection };

function toArrayBuffer(u: Uint8Array): ArrayBuffer {
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}

export async function shapefileToGeoJson(
  shp: Uint8Array,
  dbf?: Uint8Array,
): Promise<ShapefileFeatureCollection> {
  return read(toArrayBuffer(shp), dbf ? toArrayBuffer(dbf) : undefined);
}

/** Best-effort display name: a name-like property, else the first string. */
export function featureName(
  props: Record<string, unknown> | null,
  index: number,
): string {
  if (props) {
    const keys = Object.keys(props);
    const nameKey =
      keys.find((k) => /name/i.test(k)) ?? keys.find((k) => typeof props[k] === 'string');
    if (nameKey && props[nameKey] != null) return String(props[nameKey]).slice(0, 230);
  }
  return `Feature ${index + 1}`;
}

export function featureGeometry(geometry: unknown): Geometry | null {
  return (geometry as Geometry | null) ?? null;
}
