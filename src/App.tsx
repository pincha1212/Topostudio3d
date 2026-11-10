import React, { useState, useEffect, useCallback } from 'react';
import { TopoState, GridPoint, MarkerPin, MeasurementPath, PresetLocation } from './types/topo';
import { fetchElevationData, generateOBJString, generateSTLString, generateGeoJSONString, generateCSVString } from './services/demService';
import { TopoCanvas3D } from './components/TopoCanvas3D';
import { TopBar } from './components/TopBar';
import { BottomDock } from './components/BottomDock';
import { CartographicOverlay } from './components/CartographicOverlay';
import { Info } from 'lucide-react';

export default function App() {
  const [state, setState] = useState<TopoState>({
    lat: -31.4201,
    lon: -64.1888,
    locationName: "Córdoba, Argentina",
    radiusKm: 50,
    gridSize: 128,
    exaggeration: 2.5,
    palette: 'opentopomap',
    showWireframe: false,
    circularClip: true,

    waterLevel: 0,
    showWater: false,
    showContours: false,
    contourInterval: 50,

    sunElevation: 45,
    sunAzimuth: 135,

    mode: 'view',
    sculptTool: 'raise',
    sculptRadius: 15,
    sculptStrength: 0.5,

    minElev: 0,
    maxElev: 1000,
    centerElev: 450,
  });

  const [elevations, setElevations] = useState<Float32Array | null>(null);
  const [originalElevations, setOriginalElevations] = useState<Float32Array | null>(null);
  const [gridPoints, setGridPoints] = useState<GridPoint[]>([]);
  const [pins, setPins] = useState<MarkerPin[]>([]);
  const [measurementPath, setMeasurementPath] = useState<MeasurementPath | null>(null);

  const [activeTab, setActiveTab] = useState<string>('terrain');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadingText, setLoadingText] = useState<{ title: string; desc: string }>({
    title: 'Obteniendo Topografía 3D',
    desc: 'Descargando datos DEM y procesando superficie...',
  });

  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ lat: number; lon: number; elev: number; slope: number } | null>(null);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  // Load DEM Elevation data when Location or Radius/GridSize changes
  const loadTerrain = useCallback(async (lat: number, lon: number, radiusKm: number, gridSize: number, name: string) => {
    setIsLoading(true);
    setLoadingText({
      title: `Cargando Topografía (${radiusKm} km)`,
      desc: `Procesando matriz DEM para ${name}...`,
    });

    try {
      const data = await fetchElevationData(lat, lon, radiusKm, gridSize);
      setElevations(data.elevations);
      setOriginalElevations(new Float32Array(data.elevations));
      setGridPoints(data.gridPoints);

      setState(prev => ({
        ...prev,
        lat,
        lon,
        locationName: name,
        radiusKm,
        gridSize,
        minElev: data.minElev,
        maxElev: data.maxElev,
        centerElev: data.centerElev,
        waterLevel: Math.round((data.maxElev - data.minElev) * 0.15),
      }));
    } catch (err: any) {
      console.error(err);
      showToast('Error al obtener datos topográficos. Revisa la conexión.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTerrain(state.lat, state.lon, state.radiusKm, state.gridSize, state.locationName);
  }, [state.lat, state.lon, state.radiusKm, state.gridSize]);

  // Geolocation detector
  const handleDetectLocation = async () => {
    setIsLoading(true);
    setLoadingText({
      title: 'Detectando tu Ubicación',
      desc: 'Obteniendo coordenadas GPS...',
    });

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('Sin soporte GPS'));
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 7000,
        });
      });

      const lat = parseFloat(pos.coords.latitude.toFixed(5));
      const lon = parseFloat(pos.coords.longitude.toFixed(5));
      const name = `Mi Ubicación GPS (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
      showToast('Ubicación detectada por GPS correctamente.');
      await loadTerrain(lat, lon, state.radiusKm, state.gridSize, name);
    } catch (err) {
      // Fallback IP location
      try {
        const res = await fetch('https://ipwho.is/');
        const data = await res.json();
        if (data && data.success && data.latitude && data.longitude) {
          const lat = parseFloat(data.latitude.toFixed(5));
          const lon = parseFloat(data.longitude.toFixed(5));
          const name = `${data.city || 'Tu Zona'}, ${data.country || ''}`;
          showToast(`Ubicación aproximada detectada: ${name}`);
          await loadTerrain(lat, lon, state.radiusKm, state.gridSize, name);
          return;
        }
      } catch {}
      setIsLoading(false);
      showToast('No se pudo obtener el GPS. Puedes buscar por nombre de ciudad.');
    }
  };

  // Search location by city name
  const handleSearchCity = async (query: string) => {
    setIsLoading(true);
    setLoadingText({
      title: 'Buscando Lugar',
      desc: `Localizando "${query}"...`,
    });

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
      const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
      const results = await res.json();
      if (results && results.length > 0) {
        const place = results[0];
        const lat = parseFloat(parseFloat(place.lat).toFixed(5));
        const lon = parseFloat(parseFloat(place.lon).toFixed(5));
        const name = place.display_name.split(',').slice(0, 2).join(',');
        showToast(`Ubicación encontrada: ${name}`);
        await loadTerrain(lat, lon, state.radiusKm, state.gridSize, name);
      } else {
        setIsLoading(false);
        showToast('No se encontró esa ubicación. Intenta con otra ciudad.');
      }
    } catch {
      setIsLoading(false);
      showToast('Error de red al buscar el lugar.');
    }
  };

  // Preset location picker
  const handleSelectPreset = (preset: PresetLocation) => {
    showToast(`Cargando preset: ${preset.name}`);
    loadTerrain(preset.lat, preset.lon, preset.defaultRadiusKm, state.gridSize, preset.name);
  };

  // Handle Sculpting Update
  const handleUpdateElevations = (newElevs: Float32Array) => {
    setElevations(newElevs);

    // Recompute min, max, center stats
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < newElevs.length; i++) {
      const e = newElevs[i];
      if (e < min) min = e;
      if (e > max) max = e;
    }
    const centerIdx = Math.floor(state.gridSize / 2) * state.gridSize + Math.floor(state.gridSize / 2);
    setState(prev => ({
      ...prev,
      minElev: Math.round(min),
      maxElev: Math.round(max),
      centerElev: Math.round(newElevs[centerIdx] || (min + max) / 2),
    }));
  };

  // Reset Terrain to Original
  const handleResetTerrain = () => {
    if (originalElevations) {
      setElevations(new Float32Array(originalElevations));
      showToast('Terreno restablecido al estado original.');
    }
  };

  // Add / Remove Pins
  const handleAddPin = (pin: MarkerPin) => {
    setPins(prev => [...prev, pin]);
    showToast(`Pin añadido: ${pin.title}`);
  };

  const handleRemovePin = (id: string) => {
    setPins(prev => prev.filter(p => p.id !== id));
  };

  // Exporters
  const handleExportFormat = (format: 'obj' | 'stl' | 'geojson' | 'csv' | 'png_snap' | 'png_heightmap') => {
    if (!elevations || !gridPoints.length) {
      showToast('No hay terreno disponible para exportar.');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (format === 'obj' || format === 'stl') {
      const size = state.gridSize;
      const total = size * size;
      const positions = new Float32Array(total * 3);
      const radiusMeters = state.radiusKm * 1000;
      const metersPerUnit = radiusMeters / 100;

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const idx = r * size + c;
          const pt = gridPoints[idx];
          const elev = elevations[idx];
          positions[idx * 3] = pt.normX * 100;
          positions[idx * 3 + 1] = Math.max(0, (elev - state.minElev) / metersPerUnit) * state.exaggeration;
          positions[idx * 3 + 2] = pt.normZ * 100;
        }
      }

      const indices: number[] = [];
      for (let r = 0; r < size - 1; r++) {
        for (let c = 0; c < size - 1; c++) {
          const a = r * size + c;
          const b = a + 1;
          const cl = (r + 1) * size + c;
          const d = cl + 1;

          if (state.circularClip) {
            const count =
              (gridPoints[a].insideRadius ? 1 : 0) +
              (gridPoints[b].insideRadius ? 1 : 0) +
              (gridPoints[cl].insideRadius ? 1 : 0) +
              (gridPoints[d].insideRadius ? 1 : 0);
            if (count < 3) continue;
          }
          indices.push(a, cl, b);
          indices.push(b, cl, d);
        }
      }

      const content = format === 'obj' ? generateOBJString(positions, indices, state) : generateSTLString(positions, indices, state);
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `topografia_${state.locationName.replace(/\s+/g, '_')}_${state.radiusKm}km_${timestamp}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
      showToast(`Archivo .${format.toUpperCase()} descargado correctamente.`);
    } else if (format === 'geojson') {
      const jsonStr = generateGeoJSONString(state, elevations, gridPoints, pins, measurementPath);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `topografia_${state.locationName.replace(/\s+/g, '_')}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Archivo GeoJSON descargado.');
    } else if (format === 'csv') {
      const csvStr = generateCSVString(state, elevations, gridPoints);
      const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `matriz_dem_${state.locationName.replace(/\s+/g, '_')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Matriz CSV descargada.');
    }
  };

  // Import File Handler
  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (json.type === 'FeatureCollection' && json.features) {
        let importedPinsCount = 0;
        const newPins: MarkerPin[] = [];
        json.features.forEach((f: any) => {
          if (f.geometry && f.geometry.type === 'Point') {
            const [lon, lat, elev] = f.geometry.coordinates;
            newPins.push({
              id: 'imported_' + Date.now() + Math.random(),
              title: f.properties?.name || 'Pin Importado',
              lat,
              lon,
              elev: elev || state.centerElev,
              color: '#10b981',
              x: 0,
              z: 0,
              notes: f.properties?.notes || 'Importado desde GeoJSON',
            });
            importedPinsCount++;
          }
        });
        setPins(prev => [...prev, ...newPins]);
        showToast(`Importación exitosa: ${importedPinsCount} pines importados desde GeoJSON.`);
      } else {
        showToast('Formato JSON no compatible. Debe ser un FeatureCollection de GeoJSON.');
      }
    } catch {
      showToast('No se pudo procesar el archivo. Asegúrate de que sea GeoJSON o JSON válido.');
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
      {/* 3D WebGL Canvas Viewport */}
      <TopoCanvas3D
        state={state}
        elevations={elevations}
        gridPoints={gridPoints}
        pins={pins}
        measurementPath={measurementPath}
        onUpdateElevations={handleUpdateElevations}
        onAddPin={handleAddPin}
        onUpdateMeasurement={setMeasurementPath}
        onHoverPoint={setHoverInfo}
      />

      {/* Cartographic Compass Rose & Scale Overlay */}
      <CartographicOverlay state={state} />

      {/* Top Navigation Bar */}
      <TopBar
        state={state}
        onDetectLocation={handleDetectLocation}
        onOpenExport={() => setActiveTab('export')}
      />

      {/* Collapsible Bottom Control Dock */}
      <BottomDock
        state={state}
        onChangeState={setState}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onSearchCity={handleSearchCity}
        onSelectPreset={handleSelectPreset}
        onExportFormat={handleExportFormat}
        onImportFile={handleImportFile}
        pins={pins}
        onRemovePin={handleRemovePin}
        measurementPath={measurementPath}
        onClearMeasurement={() => setMeasurementPath(null)}
        hoverInfo={hoverInfo}
        onResetTerrain={handleResetTerrain}
      />

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-2xl shadow-2xl max-w-xs w-full text-center space-y-3">
            <div className="w-10 h-10 border-4 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mx-auto" />
            <h3 className="text-sm font-semibold text-white">{loadingText.title}</h3>
            <p className="text-xs text-slate-400">{loadingText.desc}</p>
          </div>
        </div>
      )}

      {/* Toast Notification Box */}
      {toastMsg && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/95 border border-amber-500/40 text-amber-300 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-bounce">
          <Info className="w-4 h-4 text-amber-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}
