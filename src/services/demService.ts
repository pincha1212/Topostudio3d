import { GridPoint, MarkerPin, MeasurementPath, TerrainPalette, TopoState } from '../types/topo';

export const SCENE_SCALE = 100; // Visual radius in 3D units

export function generateGridCoordinates(centerLat: number, centerLon: number, radiusKm: number, size: number): GridPoint[] {
  const points: GridPoint[] = [];
  const latDegPerKm = 1 / 110.574;
  const lonDegPerKm = 1 / (111.320 * Math.cos(centerLat * Math.PI / 180));

  for (let row = 0; row < size; row++) {
    const normZ = (row / (size - 1)) * 2 - 1; // -1 (North) to +1 (South)
    const distNorthKm = -normZ * radiusKm;
    const lat = centerLat + (distNorthKm * latDegPerKm);

    for (let col = 0; col < size; col++) {
      const normX = (col / (size - 1)) * 2 - 1; // -1 (West) to +1 (East)
      const distEastKm = normX * radiusKm;
      const lon = centerLon + (distEastKm * lonDegPerKm);
      const distFromCenterKm = Math.sqrt(distEastKm * distEastKm + distNorthKm * distNorthKm);

      points.push({
        lat,
        lon,
        normX,
        normZ,
        distKm: distFromCenterKm,
        insideRadius: distFromCenterKm <= radiusKm
      });
    }
  }
  return points;
}

export function latLonToTileFraction(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * n;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n;
  return { x, y };
}

export function loadImageCORS(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Fetch elevation data from AWS Terrarium SRTM tiles
export async function fetchElevationData(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  size: number
): Promise<{ elevations: Float32Array; gridPoints: GridPoint[]; minElev: number; maxElev: number; centerElev: number }> {
  const grid = generateGridCoordinates(centerLat, centerLon, radiusKm, size);
  const totalPoints = grid.length;
  const elevations = new Float32Array(totalPoints);

  let zoom = 11;
  if (radiusKm <= 20) zoom = 12;
  else if (radiusKm > 90) zoom = 10;

  const latDegPerKm = 1 / 110.574;
  const lonDegPerKm = 1 / (111.320 * Math.cos(centerLat * Math.PI / 180));

  const northLat = centerLat + radiusKm * latDegPerKm;
  const southLat = centerLat - radiusKm * latDegPerKm;
  const westLon = centerLon - radiusKm * lonDegPerKm;
  const eastLon = centerLon + radiusKm * lonDegPerKm;

  const topLeft = latLonToTileFraction(northLat, westLon, zoom);
  const bottomRight = latLonToTileFraction(southLat, eastLon, zoom);

  const minTx = Math.floor(topLeft.x);
  const maxTx = Math.floor(bottomRight.x);
  const minTy = Math.floor(topLeft.y);
  const maxTy = Math.floor(bottomRight.y);

  const tileSize = 256;
  const width = Math.max(1, maxTx - minTx + 1) * tileSize;
  const height = Math.max(1, maxTy - minTy + 1) * tileSize;

  const demCanvas = document.createElement('canvas');
  demCanvas.width = width;
  demCanvas.height = height;
  const ctx = demCanvas.getContext('2d', { willReadFrequently: true });

  let loadedTiles = 0;
  if (ctx) {
    const tilePromises: Promise<void>[] = [];
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${tx}/${ty}.png`;
        tilePromises.push(
          loadImageCORS(url).then(img => {
            if (img) {
              ctx.drawImage(img, (tx - minTx) * tileSize, (ty - minTy) * tileSize);
              loadedTiles++;
            }
          })
        );
      }
    }

    await Promise.all(tilePromises);
  }

  if (loadedTiles > 0 && ctx) {
    const imgData = ctx.getImageData(0, 0, width, height);
    const pixels = imgData.data;
    let validSamples = 0;

    for (let i = 0; i < totalPoints; i++) {
      const pt = grid[i];
      const tf = latLonToTileFraction(pt.lat, pt.lon, zoom);
      const cx = Math.min(width - 1, Math.max(0, Math.round((tf.x - minTx) * tileSize)));
      const cy = Math.min(height - 1, Math.max(0, Math.round((tf.y - minTy) * tileSize)));

      let peakElev = -Infinity;
      let foundPixel = false;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const px = Math.min(width - 1, Math.max(0, cx + dx));
          const py = Math.min(height - 1, Math.max(0, cy + dy));
          const idx = (py * width + px) * 4;
          const a = pixels[idx + 3];
          if (a > 0) {
            const elevMeters = (pixels[idx] * 256 + pixels[idx + 1] + pixels[idx + 2] / 256) - 32768;
            if (elevMeters > peakElev) peakElev = elevMeters;
            foundPixel = true;
          }
        }
      }

      if (foundPixel) {
        elevations[i] = Math.max(-500, peakElev);
        validSamples++;
      }
    }

    if (validSamples < totalPoints * 0.2) {
      generateProceduralElevations(grid, elevations);
    }
  } else {
    generateProceduralElevations(grid, elevations);
  }

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < totalPoints; i++) {
    const e = elevations[i];
    if (e < min) min = e;
    if (e > max) max = e;
  }

  const centerIdx = Math.floor(size / 2) * size + Math.floor(size / 2);
  const minElev = min === Infinity ? 0 : Math.round(min);
  const maxElev = max === -Infinity ? 500 : Math.round(max);
  const centerElev = Math.round(elevations[centerIdx] || (minElev + maxElev) / 2);

  return { elevations, gridPoints: grid, minElev, maxElev, centerElev };
}

function generateProceduralElevations(grid: GridPoint[], elevations: Float32Array) {
  for (let i = 0; i < grid.length; i++) {
    const pt = grid[i];
    const n1 = Math.sin(pt.lat * 22) * Math.cos(pt.lon * 22) * 520;
    const n2 = Math.sin(pt.lat * 45 + 1.2) * Math.sin(pt.lon * 45) * 210;
    const n3 = Math.cos(pt.normX * 3.14) * Math.cos(pt.normZ * 3.14) * 300;
    elevations[i] = Math.max(10, Math.round(650 + n1 + n2 + n3));
  }
}

// Fetch map visual texture canvas
export async function fetchMapTextureCanvas(
  centerLat: number,
  centerLon: number,
  radiusKm: number,
  palette: TerrainPalette
): Promise<HTMLCanvasElement | null> {
  if (palette === 'hypsometric' || palette === 'cyber' || palette === 'monochrome' || palette === 'slope_heatmap') {
    return null; // Drawn procedurally via vertex colors or custom shader
  }

  try {
    let zoom = 11;
    if (radiusKm <= 15) zoom = 13;
    else if (radiusKm <= 35) zoom = 12;
    else if (radiusKm <= 75) zoom = 11;
    else zoom = 10;

    const latDegPerKm = 1 / 110.574;
    const lonDegPerKm = 1 / (111.320 * Math.cos(centerLat * Math.PI / 180));

    const northLat = centerLat + radiusKm * latDegPerKm;
    const southLat = centerLat - radiusKm * latDegPerKm;
    const westLon = centerLon - radiusKm * lonDegPerKm;
    const eastLon = centerLon + radiusKm * lonDegPerKm;

    const topLeft = latLonToTileFraction(northLat, westLon, zoom);
    const bottomRight = latLonToTileFraction(southLat, eastLon, zoom);

    const minTx = Math.floor(topLeft.x);
    const maxTx = Math.floor(bottomRight.x);
    const minTy = Math.floor(topLeft.y);
    const maxTy = Math.floor(bottomRight.y);

    const tileSize = 256;
    const tilesX = Math.max(1, maxTx - minTx + 1);
    const tilesY = Math.max(1, maxTy - minTy + 1);

    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = tilesX * tileSize;
    fullCanvas.height = tilesY * tileSize;
    const fctx = fullCanvas.getContext('2d');
    if (!fctx) return null;

    fctx.fillStyle = '#0f172a';
    fctx.fillRect(0, 0, fullCanvas.width, fullCanvas.height);

    const subdomains = ['a', 'b', 'c'];
    const promises: Promise<void>[] = [];

    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        let url = '';
        if (palette === 'satellite') {
          // Esri World Imagery
          url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        } else if (palette === 'osm') {
          // OpenStreetMap
          const sub = subdomains[(tx + ty) % subdomains.length];
          url = `https://${sub}.tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`;
        } else {
          // OpenTopoMap
          const sub = subdomains[(tx + ty) % subdomains.length];
          url = `https://${sub}.tile.opentopomap.org/${zoom}/${tx}/${ty}.png`;
        }

        promises.push(
          loadImageCORS(url).then(img => {
            if (img) {
              fctx.drawImage(img, (tx - minTx) * tileSize, (ty - minTy) * tileSize);
            }
          })
        );
      }
    }

    await Promise.all(promises);

    const cropX = (topLeft.x - minTx) * tileSize;
    const cropY = (topLeft.y - minTy) * tileSize;
    const cropW = Math.max(1, (bottomRight.x - topLeft.x) * tileSize);
    const cropH = Math.max(1, (bottomRight.y - topLeft.y) * tileSize);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = 1024;
    outCanvas.height = 1024;
    const octx = outCanvas.getContext('2d');
    if (octx) {
      octx.drawImage(fullCanvas, cropX, cropY, cropW, cropH, 0, 0, 1024, 1024);
    }
    return outCanvas;
  } catch (err) {
    console.warn("Failed to fetch map texture tiles:", err);
    return null;
  }
}

// Exporters
export function generateOBJString(positions: Float32Array, indices: number[], state: TopoState): string {
  let str = `# TopoStudio 3D Pro - OBJ Mesh Export\n`;
  str += `# Region: ${state.locationName} (${state.lat.toFixed(4)}, ${state.lon.toFixed(4)})\n`;
  str += `# Radius: ${state.radiusKm} km | Exaggeration: ${state.exaggeration}x\n`;
  str += `o TerrainMesh_${state.radiusKm}km\n\n`;

  const count = positions.length / 3;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3].toFixed(4);
    const y = positions[i * 3 + 1].toFixed(4);
    const z = positions[i * 3 + 2].toFixed(4);
    str += `v ${x} ${y} ${z}\n`;
  }

  str += `\n`;
  for (let i = 0; i < indices.length; i += 3) {
    str += `f ${indices[i] + 1} ${indices[i + 1] + 1} ${indices[i + 2] + 1}\n`;
  }
  return str;
}

export function generateSTLString(positions: Float32Array, indices: number[], state: TopoState): string {
  let str = `solid Terrain_${state.radiusKm}km\n`;
  for (let i = 0; i < indices.length; i += 3) {
    const i1 = indices[i] * 3;
    const i2 = indices[i + 1] * 3;
    const i3 = indices[i + 2] * 3;

    // Normal calculation
    const ax = positions[i1], ay = positions[i1 + 1], az = positions[i1 + 2];
    const bx = positions[i2], by = positions[i2 + 1], bz = positions[i2 + 2];
    const cx = positions[i3], cy = positions[i3 + 1], cz = positions[i3 + 2];

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = (uy * vz - uz * vy).toFixed(4);
    const ny = (uz * vx - ux * vz).toFixed(4);
    const nz = (ux * vy - uy * vx).toFixed(4);

    str += `  facet normal ${nx} ${ny} ${nz}\n`;
    str += `    outer loop\n`;
    str += `      vertex ${ax.toFixed(4)} ${ay.toFixed(4)} ${az.toFixed(4)}\n`;
    str += `      vertex ${bx.toFixed(4)} ${by.toFixed(4)} ${bz.toFixed(4)}\n`;
    str += `      vertex ${cx.toFixed(4)} ${cy.toFixed(4)} ${cz.toFixed(4)}\n`;
    str += `    endloop\n`;
    str += `  endfacet\n`;
  }
  str += `endsolid Terrain_${state.radiusKm}km\n`;
  return str;
}

export function generateGeoJSONString(
  state: TopoState,
  elevations: Float32Array,
  gridPoints: GridPoint[],
  pins: MarkerPin[],
  measurement?: MeasurementPath | null
): string {
  const features: any[] = [];

  // Center feature
  features.push({
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [state.lon, state.lat, state.centerElev]
    },
    properties: {
      name: state.locationName,
      type: "CenterPoint",
      radiusKm: state.radiusKm,
      minElevationMeters: state.minElev,
      maxElevationMeters: state.maxElev,
      waterLevelMeters: state.minElev + state.waterLevel
    }
  });

  // Pins
  pins.forEach(pin => {
    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [pin.lon, pin.lat, pin.elev]
      },
      properties: {
        id: pin.id,
        name: pin.title,
        notes: pin.notes || '',
        elevationMeters: pin.elev,
        type: "MarkerPin"
      }
    });
  });

  // Measurement path
  if (measurement && measurement.points.length > 1) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: measurement.points.map(pt => [pt.lon, pt.lat, pt.elev])
      },
      properties: {
        type: "MeasurementPath",
        totalDistanceMeters: Math.round(measurement.totalDistanceMeters),
        elevationGainMeters: Math.round(measurement.elevationGainMeters),
        elevationLossMeters: Math.round(measurement.elevationLossMeters)
      }
    });
  }

  const geojson = {
    type: "FeatureCollection",
    properties: {
      generator: "TopoStudio 3D Pro",
      timestamp: new Date().toISOString(),
      location: state.locationName,
      centerLat: state.lat,
      centerLon: state.lon,
      radiusKm: state.radiusKm
    },
    features
  };

  return JSON.stringify(geojson, null, 2);
}

export function generateCSVString(state: TopoState, elevations: Float32Array, gridPoints: GridPoint[]): string {
  let csv = `Latitud,Longitud,Elevacion_Meters,Distancia_Centro_KM,En_Radio\n`;
  for (let i = 0; i < gridPoints.length; i++) {
    const pt = gridPoints[i];
    const elev = elevations[i].toFixed(2);
    csv += `${pt.lat.toFixed(5)},${pt.lon.toFixed(5)},${elev},${pt.distKm.toFixed(2)},${pt.insideRadius ? 1 : 0}\n`;
  }
  return csv;
}
