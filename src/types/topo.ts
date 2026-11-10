export type TerrainPalette = 
  | 'opentopomap' 
  | 'satellite' 
  | 'osm' 
  | 'hypsometric' 
  | 'cyber' 
  | 'monochrome' 
  | 'slope_heatmap';

export type InteractionMode = 'view' | 'sculpt' | 'measure' | 'pin';

export type SculptTool = 'raise' | 'lower' | 'flatten' | 'smooth' | 'noise';

export interface GridPoint {
  lat: number;
  lon: number;
  normX: number;
  normZ: number;
  distKm: number;
  insideRadius: boolean;
}

export interface MarkerPin {
  id: string;
  lat: number;
  lon: number;
  elev: number;
  title: string;
  notes?: string;
  color: string;
  x: number;
  z: number;
}

export interface ProfilePoint {
  x: number;
  z: number;
  distMeters: number;
  lat: number;
  lon: number;
  elev: number;
}

export interface MeasurementPath {
  points: ProfilePoint[];
  totalDistanceMeters: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  maxElevMeters: number;
  minElevMeters: number;
}

export interface PresetLocation {
  name: string;
  lat: number;
  lon: number;
  region: string;
  defaultRadiusKm: number;
  description: string;
}

export interface TopoState {
  lat: number;
  lon: number;
  locationName: string;
  radiusKm: number;
  gridSize: number; // 64, 128, 256
  exaggeration: number;
  palette: TerrainPalette;
  showWireframe: boolean;
  circularClip: boolean;
  
  // Water & Contours
  waterLevel: number; // relative meters above min elevation
  showWater: boolean;
  showContours: boolean;
  contourInterval: number; // e.g. 50 meters
  
  // Lighting
  sunElevation: number; // 0 to 90 degrees
  sunAzimuth: number; // 0 to 360 degrees

  // Sculpting
  mode: InteractionMode;
  sculptTool: SculptTool;
  sculptRadius: number;
  sculptStrength: number;
  targetFlattenElev?: number;

  // Stats
  minElev: number;
  maxElev: number;
  centerElev: number;
}


