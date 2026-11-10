import React, { useState } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  Search, 
  Layers, 
  Ruler, 
  Download, 
  Upload, 
  PlusCircle,
  Trash2
} from 'lucide-react';
import { MarkerPin, MeasurementPath, PresetLocation, TerrainPalette, TopoState } from '../types/topo';
import { PRESET_LOCATIONS } from '../constants/presets';

interface BottomDockProps {
  state: TopoState;
  onChangeState: (updater: (prev: TopoState) => TopoState) => void;
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onSearchCity: (query: string) => void;
  onSelectPreset: (preset: PresetLocation) => void;
  onExportFormat: (format: 'obj' | 'stl' | 'geojson' | 'csv' | 'png_snap' | 'png_heightmap') => void;
  onImportFile: (file: File) => void;
  pins: MarkerPin[];
  onRemovePin: (id: string) => void;
  measurementPath: MeasurementPath | null;
  onClearMeasurement: () => void;
  hoverInfo: { lat: number; lon: number; elev: number; slope: number } | null;
  onResetTerrain: () => void;
}

export const BottomDock: React.FC<BottomDockProps> = ({
  state,
  onChangeState,
  activeTab,
  onSelectTab,
  onSearchCity,
  onSelectPreset,
  onExportFormat,
  onImportFile,
  pins,
  onRemovePin,
  measurementPath,
  onClearMeasurement,
  hoverInfo,
}) => {
  const [collapsed, setCollapsed] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      onSearchCity(searchQuery.trim());
    }
  };

  return (
    <div className="fixed bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 z-30 w-[96vw] max-w-[960px] pointer-events-auto transition-all duration-300">
      {/* Collapse / Expand Toggle Tab */}
      <div className="flex justify-center -mb-px">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="bg-slate-900/95 backdrop-blur-md border-t border-x border-slate-700/80 text-slate-300 hover:text-white text-xs font-semibold px-4 py-2 rounded-t-xl shadow-lg flex items-center gap-1.5 cursor-pointer min-h-[38px]"
        >
          {collapsed ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4 text-amber-400" />}
          <span>{collapsed ? 'Mostrar Panel Cartográfico' : 'Ocultar Controles (Vista Limpia)'}</span>
        </button>
      </div>

      {/* Main Dock Container */}
      {!collapsed && (
        <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl p-3 sm:p-4 shadow-2xl space-y-3 sm:space-y-4 max-h-[70vh] sm:max-h-[60vh] overflow-y-auto">
          {/* Sub Navigation Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2 overflow-x-auto">
            <div className="flex gap-1 shrink-0">
              <button
                onClick={() => onSelectTab('terrain')}
                className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${
                  activeTab === 'terrain'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Terreno & Capas</span>
              </button>

              <button
                onClick={() => onSelectTab('gis')}
                className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${
                  activeTab === 'gis'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>Medición GIS ({pins.length})</span>
              </button>

              <button
                onClick={() => onSelectTab('export')}
                className={`px-3 py-2 text-xs font-semibold rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 min-h-[40px] ${
                  activeTab === 'export'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Download className="w-3.5 h-3.5" />
                <span>Archivos & Exportar</span>
              </button>
            </div>

            {/* Hover Inspector Quick Badge */}
            {hoverInfo && (
              <div className="hidden lg:flex items-center gap-3 text-xs font-mono bg-slate-800/90 border border-slate-700/80 px-3 py-1.5 rounded-xl text-slate-300 shrink-0">
                <span className="text-amber-400 font-bold">{hoverInfo.elev} m s.n.m.</span>
                <span className="text-slate-600">|</span>
                <span>Pendiente: {hoverInfo.slope}°</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">{hoverInfo.lat}, {hoverInfo.lon}</span>
              </div>
            )}
          </div>

          {/* TAB 1: Terreno & Capas */}
          {activeTab === 'terrain' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {/* Column 1: Search & Presets */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Buscar Ciudad o Montaña</label>
                  <form onSubmit={handleSearchSubmit} className="flex gap-1.5">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Ej: Mendoza, Aconcagua, Bariloche..."
                      className="flex-1 bg-slate-800/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 min-h-[40px]"
                    />
                    <button
                      type="submit"
                      className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center min-h-[40px]"
                    >
                      <Search className="w-4 h-4" />
                    </button>
                  </form>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Presets Topográficos</label>
                  <select
                    onChange={e => {
                      const found = PRESET_LOCATIONS.find(p => p.name === e.target.value);
                      if (found) onSelectPreset(found);
                    }}
                    className="w-full bg-slate-800/90 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 focus:outline-none cursor-pointer min-h-[40px]"
                  >
                    <option value="">Seleccionar ubicación...</option>
                    {PRESET_LOCATIONS.map(p => (
                      <option key={p.name} value={p.name}>
                        {p.name} ({p.region})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Column 2: Radius & Exaggeration */}
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">Radio de Cobertura</span>
                    <span className="text-amber-400 font-mono font-bold">{state.radiusKm} km</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="150"
                    step="5"
                    value={state.radiusKm}
                    onChange={e => onChangeState(prev => ({ ...prev, radiusKm: parseInt(e.target.value, 10) }))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 font-medium">Exageración Vertical</span>
                    <span className="text-amber-400 font-mono font-bold">{state.exaggeration.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={state.exaggeration}
                    onChange={e => onChangeState(prev => ({ ...prev, exaggeration: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Column 3: Cartographic Palettes & Visual Options */}
              <div className="space-y-3 sm:col-span-2 lg:col-span-1">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Capa Cartográfica / Textura</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: 'opentopomap', label: 'OpenTopoMap' },
                      { id: 'satellite', label: 'Satelital Esri' },
                      { id: 'hypsometric', label: 'Hipsométrico' },
                      { id: 'slope_heatmap', label: 'Mapa Pendientes' },
                      { id: 'cyber', label: 'Radar Cyber' },
                      { id: 'monochrome', label: 'Maqueta Yeso' },
                    ].map(pal => (
                      <button
                        key={pal.id}
                        onClick={() => onChangeState(prev => ({ ...prev, palette: pal.id as TerrainPalette }))}
                        className={`py-2 px-2 rounded-xl text-xs font-medium transition-all cursor-pointer min-h-[38px] ${
                          state.palette === pal.id
                            ? 'bg-amber-500/20 border border-amber-500 text-amber-300 font-bold'
                            : 'bg-slate-800/70 border border-slate-700 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {pal.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-300">Mostrar Curvas / Malla 3D</span>
                  <input
                    type="checkbox"
                    checked={state.showWireframe}
                    onChange={e => onChangeState(prev => ({ ...prev, showWireframe: e.target.checked }))}
                    className="accent-amber-500 cursor-pointer w-4 h-4"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">Recorte Circular Base</span>
                  <input
                    type="checkbox"
                    checked={state.circularClip}
                    onChange={e => onChangeState(prev => ({ ...prev, circularClip: e.target.checked }))}
                    className="accent-amber-500 cursor-pointer w-4 h-4"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Medición GIS & Pines */}
          {activeTab === 'gis' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Pins */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Pines y Marcadores Topográficos</span>
                  <button
                    onClick={() => onChangeState(prev => ({ ...prev, mode: 'pin' }))}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 min-h-[38px] ${
                      state.mode === 'pin'
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Colocar Pin (Clic en 3D)</span>
                  </button>
                </div>

                {pins.length === 0 ? (
                  <p className="text-xs text-slate-500 italic bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-center">
                    No hay pines agregados. Haz clic en "Colocar Pin" y selecciona cualquier punto sobre el modelo 3D.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                    {pins.map(pin => (
                      <div
                        key={pin.id}
                        className="bg-slate-800/80 border border-slate-700/80 p-2.5 rounded-xl text-xs flex items-center justify-between gap-2"
                      >
                        <div>
                          <span className="font-bold text-white block">{pin.title}</span>
                          <span className="text-[11px] text-amber-400 font-mono">
                            Elev: {pin.elev} m | ({pin.lat}, {pin.lon})
                          </span>
                        </div>
                        <button
                          onClick={() => onRemovePin(pin.id)}
                          className="text-slate-400 hover:text-rose-400 p-1.5 cursor-pointer min-h-[36px] min-w-[36px] flex items-center justify-center"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Path Measurement */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">Trazado de Ruta y Desnivel</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => onChangeState(prev => ({ ...prev, mode: 'measure' }))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[38px] ${
                        state.mode === 'measure'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-800 border border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      Trazar Ruta
                    </button>
                    {measurementPath && (
                      <button
                        onClick={onClearMeasurement}
                        className="text-rose-400 hover:bg-rose-500/20 p-1.5 rounded-xl cursor-pointer min-h-[38px] min-w-[38px] flex items-center justify-center"
                        title="Borrar Ruta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {measurementPath ? (
                  <div className="bg-slate-800/80 p-3 rounded-xl border border-slate-700/80 space-y-2 text-xs">
                    <div className="grid grid-cols-3 gap-2 text-center font-mono">
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] text-slate-400 block">Distancia</span>
                        <span className="text-amber-400 font-bold text-xs">
                          {(measurementPath.totalDistanceMeters / 1000).toFixed(2)} km
                        </span>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] text-slate-400 block">Desnivel +</span>
                        <span className="text-emerald-400 font-bold text-xs">
                          +{measurementPath.elevationGainMeters} m
                        </span>
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded-xl border border-slate-700/60">
                        <span className="text-[10px] text-slate-400 block">Desnivel -</span>
                        <span className="text-rose-400 font-bold text-xs">
                          -{measurementPath.elevationLossMeters} m
                        </span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic bg-slate-800/40 p-3 rounded-xl border border-slate-800 text-center">
                    Haz clic en "Trazar Ruta" y selecciona 2 o más puntos en el terreno 3D para calcular distancia y perfil altimétrico.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: Archivos & Exportación */}
          {activeTab === 'export' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Column 1: Export Options */}
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-300">Descargar Malla 3D y Archivos GIS</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onExportFormat('obj')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[44px]"
                  >
                    <Download className="w-4 h-4 text-amber-400" />
                    <span>Malla 3D (.OBJ)</span>
                  </button>

                  <button
                    onClick={() => onExportFormat('stl')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[44px]"
                  >
                    <Download className="w-4 h-4 text-emerald-400" />
                    <span>Impresión 3D (.STL)</span>
                  </button>

                  <button
                    onClick={() => onExportFormat('geojson')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[44px]"
                  >
                    <Download className="w-4 h-4 text-sky-400" />
                    <span>Vectorial (.GeoJSON)</span>
                  </button>

                  <button
                    onClick={() => onExportFormat('csv')}
                    className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 p-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors min-h-[44px]"
                  >
                    <Download className="w-4 h-4 text-indigo-400" />
                    <span>Matriz DEM (.CSV)</span>
                  </button>
                </div>
              </div>

              {/* Column 2: File Import Dropzone */}
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-300">Cargar Archivo GeoJSON o KML</label>
                <div className="relative border-2 border-dashed border-slate-700 hover:border-amber-500 rounded-xl p-4 text-center bg-slate-800/40 transition-colors cursor-pointer min-h-[100px] flex flex-col items-center justify-center">
                  <input
                    type="file"
                    accept=".json,.geojson,.kml"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        onImportFile(e.target.files[0]);
                      }
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-6 h-6 text-amber-400 mb-1" />
                  <p className="text-xs text-slate-300 font-semibold">Seleccionar o arrastrar archivo</p>
                  <p className="text-[10px] text-slate-500">Formatos soportados: .GeoJSON, .KML</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
