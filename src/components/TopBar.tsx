import React from 'react';
import { Mountain, LocateFixed, Download } from 'lucide-react';
import { TopoState } from '../types/topo';

interface TopBarProps {
  state: TopoState;
  onDetectLocation: () => void;
  onOpenExport: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  state,
  onDetectLocation,
  onOpenExport,
}) => {
  return (
    <header className="fixed top-2 left-2 right-2 sm:top-3 sm:left-3 sm:right-3 z-30 pointer-events-auto">
      <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-5 sm:py-3 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl">
        {/* Brand Zone: Mountain Icon + Title + Location Badge */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <div className="p-1.5 sm:p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
            <Mountain className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-bold tracking-tight text-white whitespace-nowrap">
                TopoStudio 3D Pro
              </span>
              <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full whitespace-nowrap">
                Radio {state.radiusKm} km
              </span>
            </div>
            <p className="text-[11px] text-slate-400 truncate max-w-[140px] xs:max-w-[200px] sm:max-w-xs">
              {state.locationName}
            </p>
          </div>
        </div>

        {/* Primary Action Buttons: Usar Mi Ubicación + Exportar 3D */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            onClick={onDetectLocation}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-slate-950 font-bold px-3 py-2 sm:px-4 sm:py-2 rounded-xl text-xs shadow-lg shadow-amber-500/20 transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
            title="Detectar y cargar mi ubicación GPS actual"
          >
            <LocateFixed className="w-4 h-4 shrink-0" />
            <span>Usar Mi Ubicación</span>
          </button>

          <button
            onClick={onOpenExport}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 border border-slate-700 font-medium px-3 py-2 sm:px-4 sm:py-2 rounded-xl text-xs transition-all cursor-pointer whitespace-nowrap shrink-0 min-h-[40px]"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Exportar 3D</span>
          </button>
        </div>
      </div>
    </header>
  );
};
