import React from 'react';
import { Mountain, MapPin } from 'lucide-react';
import { TopoState } from '../types/topo';

interface CartographicOverlayProps {
  state: TopoState;
}

export const CartographicOverlay: React.FC<CartographicOverlayProps> = ({ state }) => {
  const halfRadius = Math.round(state.radiusKm / 2);

  return (
    <div className="pointer-events-none select-none">
      {/* Top Right: Cartographic Compass & Elevation Metrics */}
      <div className="fixed top-16 right-3 sm:top-20 sm:right-4 z-20 flex flex-col items-end gap-2">

        {/* Cartographic Stats Badges */}
        <div className="bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-2.5 rounded-2xl shadow-xl space-y-1 text-right text-xs">
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] text-slate-400 font-medium">Cota Mínima:</span>
            <span className="font-mono font-bold text-emerald-400">{state.minElev} m</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] text-slate-400 font-medium">Cota Central:</span>
            <span className="font-mono font-bold text-amber-400">{state.centerElev} m</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] text-slate-400 font-medium">Cota Máxima:</span>
            <span className="font-mono font-bold text-rose-400">{state.maxElev} m</span>
          </div>
        </div>
      </div>

      {/* Bottom Left: Cartographic Scale Bar */}
      <div className="fixed bottom-14 left-3 sm:bottom-16 sm:left-4 z-20 hidden xs:flex flex-col gap-1 bg-slate-900/90 backdrop-blur-md border border-slate-700/80 px-3 py-2 rounded-2xl shadow-xl border-amber-500/30">
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-300">
          <span>0</span>
          <span>{halfRadius} km</span>
          <span>{state.radiusKm} km</span>
        </div>
        {/* Alternating black/amber scale bar */}
        <div className="h-2 w-32 sm:w-40 bg-slate-800 border border-slate-600 rounded flex overflow-hidden">
          <div className="w-1/2 bg-amber-500" />
          <div className="w-1/2 bg-slate-950" />
        </div>
        <div className="text-[9px] text-slate-400 font-mono text-center pt-0.5">
          Escala Cartográfica 1:{(state.radiusKm * 1000).toLocaleString()}
        </div>
      </div>
    </div>
  );
};
