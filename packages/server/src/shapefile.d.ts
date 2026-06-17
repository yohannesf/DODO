// Minimal ambient types for `shapefile` (no upstream/@types package). Only the
// surface used by services/shapefile.ts (spec §16.6). Avoids `any`.
declare module 'shapefile' {
  export interface ShapefileGeometry {
    type: string;
    coordinates: unknown;
  }
  export interface ShapefileFeature {
    type: 'Feature';
    geometry: ShapefileGeometry | null;
    properties: Record<string, unknown> | null;
  }
  export interface ShapefileFeatureCollection {
    type: 'FeatureCollection';
    features: ShapefileFeature[];
  }
  export function read(
    shp: ArrayBuffer | Uint8Array | string,
    dbf?: ArrayBuffer | Uint8Array | string,
  ): Promise<ShapefileFeatureCollection>;
}
